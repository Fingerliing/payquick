import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { RestaurateurProfile } from '@/types/user';
import { stripeService } from '@/services/stripeService';
import { StripeCommissionInfo } from './StripeCommissionInfo';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

interface StripeAccountStatusProps {
  onStatusChange?: (isValidated: boolean) => void;
  showActions?: boolean;
  compact?: boolean;
}

interface StripeAccountData {
  status: 'no_account' | 'account_exists' | 'validated';
  has_validated_profile: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
  };
}

type StatusKind = 'validated' | 'inProgress' | 'notStarted';

interface StatusInfo {
  kind: StatusKind;
  color: string;
  backgroundColor: string;
  borderColor: string;
  icon: 'check-circle' | 'schedule' | 'error-outline';
  title: string;
  description: string;
  actionText: string | null;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function StripeAccountStatus({
  onStatusChange,
  showActions = true,
  compact = false,
}: StripeAccountStatusProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  const {
    user,
    createStripeAccount,
    getStripeAccountStatus,
    createStripeOnboardingLink,
    refreshUser,
    isRestaurateur,
  } = useAuth();

  const [account, setAccount] = useState<StripeAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commissionAccepted, setCommissionAccepted] = useState(false);
  const [showCommissionInfo, setShowCommissionInfo] = useState(false);

  // Remplace Alert.alert natif → AlertWithAction inline (convention projet)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────
  const getRestaurateurProfile = (): RestaurateurProfile | null => {
    if (!user || !isRestaurateur) return null;
    if (user.profile?.type === 'restaurateur') {
      return user.profile as RestaurateurProfile;
    }
    return null;
  };

  useEffect(() => {
    if (isRestaurateur) {
      fetchAccountStatus();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestaurateur]);

  const fetchAccountStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      const accountStatus = await getStripeAccountStatus();
      setAccount(accountStatus);
      onStatusChange?.(accountStatus.has_validated_profile);
    } catch (err: any) {
      console.error('Erreur récupération statut Stripe:', err);
      setError(err?.message || t('stripeAccount.errors.fetch'));

      // Fallback basé sur le profil utilisateur
      const restaurateurProfile = getRestaurateurProfile();
      if (restaurateurProfile) {
        const fallbackStatus: StripeAccountData = {
          status: restaurateurProfile.stripe_account_id ? 'account_exists' : 'no_account',
          has_validated_profile:
            restaurateurProfile.stripe_verified ||
            user?.roles?.has_validated_profile ||
            false,
        };
        setAccount(fallbackStatus);
        onStatusChange?.(fallbackStatus.has_validated_profile);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetupAccount = async () => {
    setActionLoading(true);
    setError(null);

    if (!commissionAccepted) {
      setShowCommissionInfo(true);
      setActionLoading(false);
      return;
    }

    try {
      if (!account || account.status === 'no_account') {
        // Créer un nouveau compte Stripe
        const stripeAccount = await createStripeAccount();

        if (stripeAccount.onboarding_url) {
          setConfirmDialog({
            title: t('stripeAccount.redirectDialog.title'),
            message: t('stripeAccount.redirectDialog.message'),
            onConfirm: () => {
              stripeService.openStripeOnboarding(stripeAccount.onboarding_url);
              setAccount((prev) => ({
                ...prev,
                status: 'account_exists',
                has_validated_profile: false,
              } as StripeAccountData));
              setConfirmDialog(null);
            },
          });
        }
      } else {
        // Nouveau lien d'onboarding pour compte existant
        const response = await createStripeOnboardingLink();

        if (response.onboarding_url) {
          setConfirmDialog({
            title: t('stripeAccount.continueDialog.title'),
            message: t('stripeAccount.continueDialog.message'),
            onConfirm: () => {
              stripeService.openStripeOnboarding(response.onboarding_url);
              setConfirmDialog(null);
            },
          });
        }
      }

      // Rafraîchir après l'action
      await refreshUser();
      await fetchAccountStatus();
    } catch (err: any) {
      console.error('Erreur configuration Stripe:', err);
      setError(err?.message || t('stripeAccount.errors.setup'));
    } finally {
      setActionLoading(false);
    }
  };

  const refreshStatus = async () => {
    await Promise.all([refreshUser(), fetchAccountStatus()]);
  };

  // Ne pas rendre si non-restaurateur
  if (!isRestaurateur) {
    return null;
  }

  if (loading && !account) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.info} />
          <Text style={styles.loadingText}>{t('stripeAccount.checking')}</Text>
        </View>
      </View>
    );
  }

  // ── Status info (theme-aware, palette stable cross-thème) ────────────
  const getStatusInfo = (): StatusInfo => {
    const restaurateurProfile = getRestaurateurProfile();
    const isValidated =
      account?.has_validated_profile ||
      user?.roles?.has_validated_profile ||
      restaurateurProfile?.stripe_verified;

    if (isValidated) {
      return {
        kind: 'validated',
        color: colors.success,
        // Pastel adapté au thème (dark : teinté sombre)
        backgroundColor: isDark
          ? 'rgba(16, 185, 129, 0.12)'
          : '#D1FAE5',
        borderColor: colors.success,
        icon: 'check-circle',
        title: t('stripeAccount.validated.title'),
        description: t('stripeAccount.validated.description'),
        actionText: null,
      };
    }

    if (
      account?.status === 'account_exists' ||
      restaurateurProfile?.stripe_account_id
    ) {
      return {
        kind: 'inProgress',
        color: colors.warning,
        backgroundColor: isDark
          ? 'rgba(245, 158, 11, 0.12)'
          : '#FEF3C7',
        borderColor: colors.warning,
        icon: 'schedule',
        title: t('stripeAccount.inProgress.title'),
        description: t('stripeAccount.inProgress.description'),
        actionText: t('stripeAccount.inProgress.action'),
      };
    }

    return {
      kind: 'notStarted',
      color: colors.error,
      backgroundColor: isDark
        ? 'rgba(239, 68, 68, 0.12)'
        : '#FEE2E2',
      borderColor: colors.error,
      icon: 'error-outline',
      title: t('stripeAccount.notStarted.title'),
      description: t('stripeAccount.notStarted.description'),
      actionText: t('stripeAccount.notStarted.action'),
    };
  };

  const statusInfo = getStatusInfo();

  // ── Format requirement Stripe (locale-agnostic) ──────────────────────
  const formatRequirement = (req: string): string =>
    req.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  // ── Mode compact ─────────────────────────────────────────────────────
  if (compact) {
    return (
      <View
        style={[styles.compactContainer, { borderLeftColor: statusInfo.borderColor }]}
      >
        <View style={styles.compactContent}>
          <MaterialIcons name={statusInfo.icon} size={20} color={statusInfo.color} />
          <Text style={[styles.compactTitle, { color: statusInfo.color }]}>
            {statusInfo.title}
          </Text>
        </View>
        {showActions && statusInfo.actionText && (
          <TouchableOpacity
            onPress={handleSetupAccount}
            style={styles.compactButton}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color={colors.info} />
            ) : (
              <MaterialIcons name="arrow-forward" size={16} color={colors.info} />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Mode complet ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Confirmation dialog inline (remplace Alert.alert) */}
      {confirmDialog && (
        <View style={styles.dialogWrapper}>
          <AlertWithAction
            variant="info"
            title={confirmDialog.title}
            message={confirmDialog.message}
            primaryButton={{
              text: t('common.continue'),
              onPress: confirmDialog.onConfirm,
            }}
            secondaryButton={{
              text: t('common.cancel'),
              onPress: () => setConfirmDialog(null),
            }}
          />
        </View>
      )}

      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('stripeAccount.title')}</Text>
        <TouchableOpacity onPress={refreshStatus} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Erreur inline */}
      {error && (
        <View style={styles.errorWrapper}>
          <InlineAlert
            variant="error"
            message={error}
            onDismiss={() => setError(null)}
          />
        </View>
      )}

      {/* Carte de statut */}
      <View style={[styles.statusCard, { backgroundColor: statusInfo.backgroundColor }]}>
        <View style={styles.statusHeader}>
          <MaterialIcons name={statusInfo.icon} size={24} color={statusInfo.color} />
          <Text style={[styles.statusTitle, { color: statusInfo.color }]}>
            {statusInfo.title}
          </Text>
        </View>

        <Text style={[styles.statusDescription, { color: statusInfo.color }]}>
          {statusInfo.description}
        </Text>

        {account?.has_validated_profile ? (
          <View style={styles.successInfo}>
            <MaterialIcons
              name="celebration"
              size={16}
              color={colors.success}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.successText}>
              {t('stripeAccount.validated.successMessage')}
            </Text>
          </View>
        ) : (
          showActions && statusInfo.actionText && (
            <View style={styles.actionContainer}>
              {showCommissionInfo ? (
                <StripeCommissionInfo
                  showAcceptButton
                  isAccepted={commissionAccepted}
                  onAccept={() => {
                    setCommissionAccepted(true);
                    setShowCommissionInfo(false);
                    // Relancer l'onboarding après acceptation
                    handleSetupAccount();
                  }}
                />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    actionLoading && styles.actionButtonDisabled,
                  ]}
                  onPress={handleSetupAccount}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color={colors.text.inverse} />
                  ) : (
                    <>
                      <MaterialIcons
                        name="launch"
                        size={16}
                        color={colors.text.inverse}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.actionButtonText}>
                        {statusInfo.actionText}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {account?.requirements?.currently_due &&
                account.requirements.currently_due.length > 0 && (
                  <View style={styles.requirementsContainer}>
                    <Text style={styles.requirementsTitle}>
                      {t('stripeAccount.requirements.title')}
                    </Text>
                    {account.requirements.currently_due
                      .slice(0, 3)
                      .map((req, index) => (
                        <Text key={index} style={styles.requirementItem}>
                          • {formatRequirement(req)}
                        </Text>
                      ))}
                    {account.requirements.currently_due.length > 3 && (
                      <Text style={styles.requirementItem}>
                        •{' '}
                        {t('stripeAccount.requirements.othersCount', {
                          count: account.requirements.currently_due.length - 3,
                        })}
                      </Text>
                    )}
                  </View>
                )}
            </View>
          )
        )}
      </View>

      {/* Info complémentaire — délai de validation */}
      {account?.status === 'account_exists' && !account.has_validated_profile && (
        <View style={styles.infoContainer}>
          <MaterialIcons
            name="info-outline"
            size={16}
            color={colors.text.secondary}
          />
          <Text style={styles.infoText}>{t('stripeAccount.infoDelay')}</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================

const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.md, screenType),
      marginVertical: 4,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.card,
    },
    containerCompact: {
      padding: 12,
      marginVertical: 2,
    },

    // Mode compact
    compactContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      marginVertical: 4,
      borderLeftWidth: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...shadows.sm,
    },
    compactContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    compactTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      marginLeft: 8,
    },
    compactButton: {
      padding: 8,
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    refreshButton: {
      padding: 8,
    },

    // Wrappers pour alertes inline
    dialogWrapper: {
      marginBottom: 12,
    },
    errorWrapper: {
      marginBottom: 12,
    },

    // Loading
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 20,
    },
    loadingText: {
      marginLeft: 8,
      color: colors.text.secondary,
    },

    // Status card
    statusCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    statusTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      marginLeft: 8,
    },
    statusDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      marginBottom: 12,
      lineHeight: 20,
    },

    // Success
    successInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      padding: 8,
      backgroundColor: isDark
        ? 'rgba(16, 185, 129, 0.18)'
        : 'rgba(16, 185, 129, 0.10)',
      borderRadius: 6,
    },
    successText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: isDark ? '#A7F3D0' : '#059669',
    },

    // Actions
    actionContainer: {
      marginTop: 8,
    },
    actionButton: {
      backgroundColor: colors.info,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
    },
    actionButtonDisabled: {
      backgroundColor: colors.text.light,
    },
    actionButtonText: {
      color: colors.text.inverse,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    // Requirements
    requirementsContainer: {
      marginTop: 12,
      padding: 12,
      backgroundColor: isDark
        ? 'rgba(251, 191, 36, 0.12)'
        : 'rgba(251, 191, 36, 0.10)',
      borderRadius: BORDER_RADIUS.md,
    },
    requirementsTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: isDark ? '#FBBF24' : '#92400E',
      marginBottom: 4,
    },
    requirementItem: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: isDark ? '#FBBF24' : '#92400E',
      marginLeft: 8,
      marginBottom: 2,
    },

    // Info bas de carte
    infoContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark
        ? 'rgba(59, 130, 246, 0.12)'
        : 'rgba(59, 130, 246, 0.08)',
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
    },
    infoText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      marginLeft: 8,
      lineHeight: 16,
    },
  });
};