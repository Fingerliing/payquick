/**
 * Route Universal Links / App Links : /t/<table_code>
 *
 * Cette route est ouverte automatiquement quand un utilisateur scanne un QR
 * code de table (qui pointe vers https://api.eatquicker.fr/t/<code>/) ET
 * que l'application EatQuickeR est installée sur son téléphone.
 *
 * Configuration requise :
 *  - app.json → ios.associatedDomains: ["applinks:api.eatquicker.fr"]
 *  - app.json → android.intentFilters avec autoVerify=true et pathPrefix=/t/
 *  - Backend → /.well-known/apple-app-site-association et
 *              /.well-known/assetlinks.json correctement servis
 *
 * Comportement :
 *  1. Récupère le code de table depuis l'URL
 *  2. Valide le code via l'API scan_table (endpoint public, pas d'auth)
 *  3. Si valide → redirige vers /menu/client/<restaurantId> avec params
 *  4. Si invalide → affiche un message d'erreur avec retour à l'accueil
 *
 * Format du code : R<restaurant_id>T<table_number_padded> (ex: R12T005)
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/services/api';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@/utils/designSystem';

interface ScanTableResponse {
  success: boolean;
  restaurant: {
    id: number;
    name: string;
    description?: string;
    cuisine?: string;
    rating?: number;
    image_url?: string | null;
  };
  table: {
    id: string | number;
    number: string;
    code: string;
  };
}

export default function DeepLinkTableScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);
  // Ref pour éviter la double exécution (StrictMode dev / hot reload)
  const hasResolved = useRef(false);

  useEffect(() => {
    if (hasResolved.current) return;
    hasResolved.current = true;

    const code = (params.code || '').trim();

    if (!code) {
      setError('Aucun code de table fourni.');
      return;
    }

    // Validation rapide du format avant l'appel API.
    // Format attendu : R<id>T<num> (ex: R12T005). On reste tolérant pour
    // ne pas bloquer d'éventuels formats futurs côté backend.
    const looksLikeTableCode = /^R\d+T\d+$/i.test(code);

    resolveTable(code, looksLikeTableCode);
  }, [params.code]);

  const resolveTable = async (code: string, looksLikeTableCode: boolean) => {
    try {
      console.log('🔗 Deep link reçu — code de table :', code);

      // L'endpoint scan_table accepte n'importe quel format, le backend
      // renverra 404 si invalide.
      const response = await apiClient.get<ScanTableResponse>(
        `api/v1/orders/scan_table/${encodeURIComponent(code)}/`
      );

      const data = (response as any).data ?? response;

      if (!data?.success || !data?.restaurant?.id) {
        throw new Error('Réponse API invalide');
      }

      console.log('✅ Table résolue, redirection vers le menu :', data.restaurant.id);

      // Redirection vers le menu client.
      // `replace` au lieu de `push` pour ne pas laisser la route /t/<code>
      // dans la pile de navigation (sinon le bouton retour reviendrait ici).
      router.replace({
        pathname: `/menu/client/${data.restaurant.id}` as any,
        params: {
          code,
          restaurantId: String(data.restaurant.id),
          tableNumber: data.table?.number || '',
          fromQR: '1',
        },
      });
    } catch (err: any) {
      console.error('❌ Erreur résolution deep link :', err);

      // Message d'erreur adapté selon le statut HTTP / le format
      const status = err?.response?.status ?? err?.status;
      if (status === 404 || !looksLikeTableCode) {
        setError(
          'Ce QR code ne correspond à aucune table active. Vérifiez le QR code ou demandez de l\'aide au personnel du restaurant.'
        );
      } else if (status === 400) {
        setError(
          'Ce restaurant n\'accepte pas de commandes actuellement. Réessayez plus tard.'
        );
      } else {
        setError(
          'Impossible de se connecter au serveur. Vérifiez votre connexion internet et réessayez.'
        );
      }
    }
  };

  const handleGoHome = () => {
    router.replace('/' as any);
  };

  // ─── Render : état d'erreur ─────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={COLORS.error || '#DC2626'}
            style={styles.icon}
          />
          <Text style={styles.errorTitle}>QR code invalide</Text>
          <Text style={styles.errorMessage}>{error}</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleGoHome}
            activeOpacity={0.8}
          >
            <Ionicons name="home-outline" size={20} color={COLORS.text.inverse} />
            <Text style={styles.primaryButtonText}>Retour à l'accueil</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Render : état de chargement (par défaut) ───────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingTitle}>Connexion à votre table…</Text>
        <Text style={styles.loadingSubtitle}>
          Récupération du menu en cours
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  loadingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    minWidth: 280,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 3,
      },
    }),
  },
  loadingTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg.mobile,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: TYPOGRAPHY.fontSize.sm.mobile,
    color: COLORS.text.secondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    maxWidth: 380,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 3,
      },
    }),
  },
  icon: {
    marginBottom: SPACING.md,
  },
  errorTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl.mobile,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: TYPOGRAPHY.fontSize.base.mobile,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    minWidth: 220,
  },
  primaryButtonText: {
    color: COLORS.text.inverse,
    fontSize: TYPOGRAPHY.fontSize.base.mobile,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});
