/**
 * Service API — Import de menu par IA.
 *
 * IMPORTANT — upload des photos :
 * L'upload multipart via Axios/FormData échoue en « Network Error » sur
 * React Native (le fichier n'est pas correctement lu, la requête avorte
 * avant d'atteindre le serveur). On utilise donc `expo-file-system`
 * (`uploadAsync`) qui gère le multipart nativement et de façon fiable.
 * Les requêtes JSON (lecture, draft, apply...) continuent de passer par
 * `apiClient` — elles, fonctionnent parfaitement.
 *
 * Les photos sont redimensionnées avant upload (côté long 1568 px) : upload
 * plus rapide sur réseau mobile et coût API réduit côté backend.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
// Depuis le SDK 54, l'API d'upload d'expo-file-system a été déplacée dans le
// sous-module `legacy` (le module racine a été réécrit sans `uploadAsync`).
// `expo-file-system/legacy` expose l'API stable : uploadAsync + les enums.
import {
  uploadAsync,
  FileSystemUploadType,
} from 'expo-file-system/legacy';

import { apiClient } from '@/services/api';
import secureStorage from '@/utils/secureStorage';
import type {
  ApplyResponse,
  MenuScanJob,
  MenuScanJobListItem,
  ScanBrandingData,
  ScanExtractedData,
} from '@/types/menuScan';

// Côté long max des photos envoyées. Au-delà, le modèle de vision
// redimensionne de toute façon : inutile d'uploader plus lourd.
const MAX_IMAGE_EDGE = 1568;
const JPEG_COMPRESSION = 0.85;

const BASE_PATH = '/api/v1/menu-ai/jobs';

/** Base URL de l'API, sans slash final. */
function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/$/, '');
}

/** Récupère le token d'accès depuis le stockage sécurisé. */
async function getAccessToken(): Promise<string | null> {
  return (
    (await secureStorage.getItem('access_token')) ||
    (await secureStorage.getItem('auth_token')) ||
    (await secureStorage.getItem('token'))
  );
}

/**
 * Redimensionne une photo pour l'upload.
 * En cas d'échec du redimensionnement, renvoie l'URI d'origine (non bloquant).
 */
async function resizeForUpload(uri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_EDGE } }],
      { compress: JPEG_COMPRESSION, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
}

/** Extrait un message d'erreur lisible d'une erreur normalisée par apiClient. */
function errorMessage(error: any, fallback: string): string {
  if (error?.details) {
    const d = error.details;
    const firstFieldError =
      d.non_field_errors?.[0] ||
      d.images?.[0] ||
      d.restaurant?.[0] ||
      d.target_languages?.[0];
    if (firstFieldError) return String(firstFieldError);
  }
  return error?.message || fallback;
}

export const menuScanService = {
  /**
   * Crée un job d'import : upload des photos + langues cibles.
   * Le backend lance immédiatement le pipeline IA en tâche de fond.
   *
   * Upload via `expo-file-system` : une requête multipart par photo n'est
   * pas possible (toutes les photos vont dans le même job), on envoie donc
   * toutes les images dans une seule requête multipart construite par
   * `uploadAsync`. `uploadAsync` accepte UN fichier par appel via `fieldName`,
   * donc pour plusieurs pages on procède en deux temps :
   *   1. POST initial avec la 1re photo -> crée le job, renvoie son id.
   *   2. Les photos suivantes sont ajoutées au job via `addImage`.
   * Si une seule photo : un seul appel suffit.
   *
   * @param restaurantId     Identifiant du restaurant.
   * @param photoUris        URIs locales des photos, dans l'ordre des pages.
   * @param targetLanguages  Codes ISO des langues cibles (hors 'fr').
   * @param menuId           Menu cible (optionnel) : celui depuis lequel
   *                         l'import est lancé. Sinon, le backend applique au
   *                         premier menu du restaurant.
   */
  async createJob(
    restaurantId: string,
    photoUris: string[],
    targetLanguages: string[],
    menuId?: string,
  ): Promise<MenuScanJob> {
    if (photoUris.length === 0) {
      throw new Error('Ajoutez au moins une photo de votre carte.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error("Session expirée. Reconnectez-vous.");
    }

    // Redimensionnement de toutes les photos (séquentiel : pics mémoire).
    const resized: string[] = [];
    for (let i = 0; i < photoUris.length; i += 1) {
      resized.push(await resizeForUpload(photoUris[i]));
    }

    // ── 1. Création du job avec la première photo ──────────────────────────
    // uploadAsync envoie un vrai multipart natif : le champ fichier est
    // `images`, les champs texte passent par `parameters`.
    const createParams: Record<string, string> = {
      restaurant: String(restaurantId),
    };
    // Menu cible (optionnel) : celui depuis lequel l'import est lancé.
    if (menuId) {
      createParams.menu = String(menuId);
    }
    // Les langues : l'API attend des clés répétées `target_languages`.
    // uploadAsync ne gère qu'une valeur par clé -> on envoie une liste CSV
    // que le backend sait aussi parser (cf. note d'intégration backend).
    if (targetLanguages.length > 0) {
      createParams.target_languages = targetLanguages.join(',');
    }

    // Le type de retour d'`uploadAsync` est inféré (le type nommé n'est
    // pas exporté de façon stable selon la version d'expo-file-system).
    let result: Awaited<ReturnType<typeof uploadAsync>>;
    try {
      result = await uploadAsync(
        `${apiBaseUrl()}${BASE_PATH}/`,
        resized[0],
        {
          httpMethod: 'POST',
          uploadType: FileSystemUploadType.MULTIPART,
          fieldName: 'images',
          mimeType: 'image/jpeg',
          parameters: createParams,
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    } catch (e: any) {
      throw new Error(
        e?.message || "Échec de l'envoi de la photo. Vérifiez votre connexion.",
      );
    }

    if (result.status < 200 || result.status >= 300) {
      let detail = `Erreur ${result.status}`;
      try {
        const parsed = JSON.parse(result.body);
        detail =
          parsed.detail ||
          parsed.non_field_errors?.[0] ||
          parsed.images?.[0] ||
          parsed.restaurant?.[0] ||
          detail;
      } catch {
        /* corps non-JSON : message générique conservé */
      }
      throw new Error(detail);
    }

    const job: MenuScanJob = JSON.parse(result.body);

    // ── 2. Pages suivantes : ajoutées au job une à une ─────────────────────
    for (let i = 1; i < resized.length; i += 1) {
      try {
        await this.addImage(job.id, resized[i], i + 1, token);
      } catch (e) {
        // Une page en échec ne doit pas annuler tout l'import : on log et
        // on continue. Le restaurateur verra les pages manquantes à la
        // relecture et pourra relancer.
        console.warn(`[menuScan] Page ${i + 1} non envoyée :`, e);
      }
    }

    // ── 3. Toutes les photos sont uploadées -> démarrage du pipeline ───────
    // L'upload mobile envoie une photo par requête ; le backend attend ce
    // signal explicite pour ne pas analyser une carte incomplète.
    try {
      const started = await apiClient.post(`${BASE_PATH}/${job.id}/start/`);
      return started as MenuScanJob;
    } catch (error: any) {
      throw new Error(
        errorMessage(error, "L'analyse n'a pas pu démarrer. Réessayez."),
      );
    }
  },

  /**
   * Ajoute une photo supplémentaire à un job existant (pages 2+).
   * @internal Utilisé par createJob pour les menus multi-pages.
   */
  async addImage(
    jobId: string,
    photoUri: string,
    pageOrder: number,
    token?: string,
  ): Promise<void> {
    const authToken = token || (await getAccessToken());
    if (!authToken) throw new Error('Session expirée.');

    const result = await uploadAsync(
      `${apiBaseUrl()}${BASE_PATH}/${jobId}/add-image/`,
      photoUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'image',
        mimeType: 'image/jpeg',
        parameters: { order: String(pageOrder) },
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Ajout de la page ${pageOrder} : erreur ${result.status}`);
    }
  },

  /** Liste les imports du restaurateur, éventuellement filtrés par restaurant. */
  async listJobs(restaurantId?: string): Promise<MenuScanJobListItem[]> {
    const params = restaurantId ? { restaurant: restaurantId } : undefined;
    const data = await apiClient.get(`${BASE_PATH}/`, { params });
    if (Array.isArray(data)) return data;
    return data?.results ?? [];
  },

  /** Récupère le détail complet d'un job (statut + brouillon). */
  async getJob(jobId: string): Promise<MenuScanJob> {
    return apiClient.get(`${BASE_PATH}/${jobId}/`);
  },

  /**
   * Met à jour le brouillon corrigé par le restaurateur.
   * Autorisé uniquement tant que le job est au statut `ready`.
   */
  async updateDraft(
    jobId: string,
    payload: {
      extracted_data?: ScanExtractedData;
      branding_data?: ScanBrandingData;
    },
  ): Promise<MenuScanJob> {
    try {
      return await apiClient.patch(`${BASE_PATH}/${jobId}/draft/`, payload);
    } catch (error: any) {
      throw new Error(errorMessage(error, 'Échec de la sauvegarde du brouillon.'));
    }
  },

  /** Matérialise le brouillon en menu réel (catégories, plats, charte). */
  async applyJob(jobId: string): Promise<ApplyResponse> {
    try {
      return await apiClient.post(`${BASE_PATH}/${jobId}/apply/`);
    } catch (error: any) {
      throw new Error(errorMessage(error, "L'application du menu a échoué."));
    }
  },

  /** Relance un import en échec. */
  async retryJob(jobId: string): Promise<MenuScanJob> {
    try {
      return await apiClient.post(`${BASE_PATH}/${jobId}/retry/`);
    } catch (error: any) {
      throw new Error(errorMessage(error, 'La relance a échoué.'));
    }
  },

  /** Supprime un import. */
  async deleteJob(jobId: string): Promise<void> {
    await apiClient.delete(`${BASE_PATH}/${jobId}/`);
  },
};

export default menuScanService;