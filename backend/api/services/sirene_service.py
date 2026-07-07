# -*- coding: utf-8 -*-
"""
Service SIRENE — Enrichissement d'un établissement à partir de son SIRET.

Emplacement : backend/api/services/sirene_service.py

Pipeline en deux étapes (l'API Sirene ne renvoie PAS de coordonnées GPS) :

  1. INSEE Sirene v3.11
     GET https://api.insee.fr/api-sirene/3.11/siret/{siret}
     Auth : header `X-INSEE-Api-Key-Integration: <clé>`
     → raison sociale, enseigne, adresse, code APE/NAF, état administratif.

  2. Base Adresse Nationale (BAN) — gratuite, sans clé
     GET https://api-adresse.data.gouv.fr/search/?q=<adresse>&postcode=<cp>
     → latitude / longitude (géocodage de l'adresse Sirene).

IMPORTANT (migration mars 2025) :
  L'INSEE a migré vers le portail `portail-api.insee.fr`. L'ancien flux OAuth2
  (token bearer renouvelable) est obsolète. La variable d'environnement
  `SIRENE_API_TOKEN` doit désormais contenir la **clé d'API à durée illimitée**
  générée sur le nouveau portail, envoyée dans le header
  `X-INSEE-Api-Key-Integration`.

Aucune donnée sensible n'est exposée dans les réponses API : en cas d'échec, le
service renvoie None / (None, None) et logge via `logger.exception`.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, asdict
from datetime import date
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Constantes ───────────────────────────────────────────────────────────────
INSEE_SIRET_URL = "https://api.insee.fr/api-sirene/3.11/siret/{siret}"
BAN_SEARCH_URL = "https://api-adresse.data.gouv.fr/search/"

# Timeouts courts : ces appels sont synchrones dans le flux "ajout restaurant".
INSEE_TIMEOUT = 8
BAN_TIMEOUT = 6

# Codes APE/NAF de la restauration (pour signaler un SIRET hors périmètre).
# 56.10A/B/C restauration, 56.21Z traiteur, 56.29A/B autres, 56.30Z débits de boissons.
RESTAURATION_APE_PREFIXES = ("56.10", "56.21", "56.29", "56.30", "5610", "5621", "5629", "5630")


@dataclass
class SireneResult:
    """Résultat normalisé prêt à pré-remplir un formulaire restaurant."""
    siret: str
    siren: str
    raison_sociale: str
    enseigne: str
    address: str
    zip_code: str
    city: str
    ape_code: str
    is_active_insee: bool          # établissement ouvert (état administratif 'A')
    is_diffusible: bool            # statutDiffusion == 'O' (sinon données masquées)
    is_restauration: bool          # APE dans le périmètre restauration
    latitude: Optional[float]      # géocodé via BAN (peut être None)
    longitude: Optional[float]
    geocoding_score: Optional[float]

    def to_dict(self) -> dict:
        return asdict(self)


class SireneService:
    """Client SIRENE + géocodage. Sans état — instanciable ou via le singleton."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "SIRENE_API_TOKEN", "") or ""

    # ── Public ───────────────────────────────────────────────────────────────
    def enrich_from_siret(self, siret: str) -> Optional[SireneResult]:
        """
        Enrichit un SIRET : appel INSEE puis géocodage BAN.

        Retourne un `SireneResult` ou None si le SIRET est introuvable / invalide
        ou si l'API INSEE est indisponible.
        """
        siret = self._normalize_siret(siret)
        if not siret:
            return None

        etablissement = self._fetch_etablissement(siret)
        if etablissement is None:
            return None

        parsed = self._parse_etablissement(siret, etablissement)
        if parsed is None:
            return None

        # Géocodage best-effort : l'absence de coordonnées n'invalide pas le résultat.
        lat, lon, score = self._geocode(parsed.address, parsed.zip_code, parsed.city)
        parsed.latitude = lat
        parsed.longitude = lon
        parsed.geocoding_score = score
        return parsed

    # ── INSEE ────────────────────────────────────────────────────────────────
    def _fetch_etablissement(self, siret: str) -> Optional[dict]:
        if not self.api_key:
            logger.error("SIRENE_API_TOKEN absent : impossible d'interroger l'API Sirene.")
            return None

        url = INSEE_SIRET_URL.format(siret=siret)
        headers = {
            "X-INSEE-Api-Key-Integration": self.api_key,
            "Accept": "application/json",
        }
        # `date` = aujourd'hui → période établissement en vigueur.
        params = {"date": date.today().isoformat()}

        try:
            resp = requests.get(url, headers=headers, params=params, timeout=INSEE_TIMEOUT)
        except requests.exceptions.Timeout:
            logger.warning("Timeout INSEE Sirene pour le SIRET %s", siret)
            return None
        except requests.exceptions.RequestException:
            logger.exception("Erreur réseau INSEE Sirene pour le SIRET %s", siret)
            return None

        if resp.status_code == 404:
            logger.info("SIRET introuvable côté INSEE : %s", siret)
            return None
        if resp.status_code == 429:
            logger.warning("Quota INSEE Sirene atteint (429) pour le SIRET %s", siret)
            return None
        if resp.status_code != 200:
            logger.warning("Réponse INSEE inattendue (%s) pour le SIRET %s", resp.status_code, siret)
            return None

        try:
            payload = resp.json()
        except ValueError:
            logger.exception("Réponse INSEE non-JSON pour le SIRET %s", siret)
            return None

        return payload.get("etablissement")

    def _parse_etablissement(self, siret: str, etab: dict) -> Optional[SireneResult]:
        try:
            unite = etab.get("uniteLegale", {}) or {}
            adresse = etab.get("adresseEtablissement", {}) or {}

            statut_diffusion = etab.get("statutDiffusionEtablissement", "O")
            is_diffusible = statut_diffusion == "O"

            # État administratif : dernière période en vigueur (dateFin == null).
            etat = self._current_etat_administratif(etab)
            is_active = etat == "A"

            raison_sociale = self._build_raison_sociale(unite)
            enseigne = (
                etab.get("periodesEtablissement", [{}])[0].get("enseigne1Etablissement")
                or ""
            ).strip()

            ape_code = (unite.get("activitePrincipaleUniteLegale") or "").strip()
            is_restauration = ape_code.replace(".", "").startswith(
                tuple(p.replace(".", "") for p in RESTAURATION_APE_PREFIXES)
            )

            address = self._build_address(adresse)
            zip_code = (adresse.get("codePostalEtablissement") or "").strip()
            city = (adresse.get("libelleCommuneEtablissement") or "").strip()

            return SireneResult(
                siret=siret,
                siren=(etab.get("siren") or "").strip(),
                raison_sociale=raison_sociale,
                enseigne=enseigne,
                address=address,
                zip_code=zip_code,
                city=city,
                ape_code=ape_code,
                is_active_insee=is_active,
                is_diffusible=is_diffusible,
                is_restauration=is_restauration,
                latitude=None,
                longitude=None,
                geocoding_score=None,
            )
        except Exception:
            logger.exception("Erreur de parsing de l'établissement INSEE pour %s", siret)
            return None

    @staticmethod
    def _current_etat_administratif(etab: dict) -> str:
        periodes = etab.get("periodesEtablissement") or []
        for p in periodes:
            if p.get("dateFin") is None:
                return p.get("etatAdministratifEtablissement") or ""
        # Repli : première période retournée (l'API les trie du + récent au + ancien).
        if periodes:
            return periodes[0].get("etatAdministratifEtablissement") or ""
        return ""

    @staticmethod
    def _build_raison_sociale(unite: dict) -> str:
        # Personne morale : dénomination. Personne physique (ex. auto-entrepreneur) :
        # nom + prénom usuel.
        denom = (unite.get("denominationUniteLegale") or "").strip()
        if denom:
            return denom
        nom = (unite.get("nomUniteLegale") or "").strip()
        prenom = (unite.get("prenomUsuelUniteLegale") or "").strip()
        full = f"{prenom} {nom}".strip()
        return full

    @staticmethod
    def _build_address(adresse: dict) -> str:
        parts = [
            (adresse.get("numeroVoieEtablissement") or "").strip(),
            (adresse.get("typeVoieEtablissement") or "").strip(),
            (adresse.get("libelleVoieEtablissement") or "").strip(),
        ]
        return re.sub(r"\s+", " ", " ".join(p for p in parts if p)).strip()

    # ── Géocodage BAN ────────────────────────────────────────────────────────
    def _geocode(self, address: str, zip_code: str, city: str):
        query = " ".join(p for p in [address, city] if p).strip()
        if not query:
            return None, None, None

        params = {"q": query, "limit": 1}
        if zip_code:
            params["postcode"] = zip_code

        try:
            resp = requests.get(BAN_SEARCH_URL, params=params, timeout=BAN_TIMEOUT)
        except requests.exceptions.RequestException:
            logger.exception("Erreur réseau BAN pour '%s'", query)
            return None, None, None

        if resp.status_code != 200:
            logger.warning("Réponse BAN inattendue (%s) pour '%s'", resp.status_code, query)
            return None, None, None

        try:
            features = resp.json().get("features") or []
        except ValueError:
            logger.exception("Réponse BAN non-JSON pour '%s'", query)
            return None, None, None

        if not features:
            return None, None, None

        feat = features[0]
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        score = (feat.get("properties") or {}).get("score")
        if len(coords) == 2:
            lon, lat = coords[0], coords[1]  # BAN renvoie [lon, lat]
            return float(lat), float(lon), score
        return None, None, None

    # ── Utilitaires ──────────────────────────────────────────────────────────
    @staticmethod
    def _normalize_siret(siret: str) -> Optional[str]:
        if not siret:
            return None
        cleaned = re.sub(r"\s+", "", str(siret))
        if not cleaned.isdigit() or len(cleaned) != 14:
            return None
        return cleaned


# Singleton pratique (cf. sms_service / notification_service).
sirene_service = SireneService()
