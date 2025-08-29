import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { RestaurateurProfile } from '@/types/user';

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

export default function StripeAccountStatus({ 
  onStatusChange, 
  showActions = true, 
  compact = false 
}: StripeAccountStatusProps) {
  const { 
    user, 
    createStripeAccount, 
    getStripeAccountStatus, 
    createStripeOnboardingLink,
    refreshUser,
    isRestaurateur 
  } = useAuth();
  
  const [account, setAccount] = useState<StripeAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper pour accéder au profil restaurateur de manière sécurisée
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
  }, [isRestaurateur]);

  const fetchAccountStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const accountStatus = await getStripeAccountStatus();
      setAccount(accountStatus);
      onStatusChange?.(accountStatus.has_validated_profile);
    } catch (error: any) {
      console.error('Erreur récupération statut Stripe:', error);
      setError(error.message || 'Erreur lors de la récupération du statut');
      
      // Fallback basé sur les données utilisateur
      const restaurateurProfile = getRestaurateurProfile();
      if (restaurateurProfile) {
        const fallbackStatus: StripeAccountData = {
          status: restaurateurProfile.stripe_account_id ? 'account_exists' : 'no_account',
          has_validated_profile: restaurateurProfile.stripe_verified || user?.roles?.has_validated_profile || false,
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
    
    try {
      if (!account || account.status === 'no_account') {
        // Créer un nouveau compte Stripe
        const stripeAccount = await createStripeAccount();
        
        if (stripeAccount.onboarding_url) {
          Alert.alert(
            'Redirection vers Stripe',
            'Vous allez être redirigé vers Stripe pour configurer votre compte de paiement.',
            [
              { text: 'Annuler', style: 'cancel' },
              { 
                text: 'Continuer', 
                onPress: () => {
                  console.log('Onboarding URL:', stripeAccount.onboarding_url);
                  // Mettre à jour le statut local
                  setAccount(prev => ({
                    ...prev,
                    status: 'account_exists',
                    has_validated_profile: false
                  } as StripeAccountData));
                }
              }
            ]
          );
        }
      } else {
        // Créer un nouveau lien d'onboarding pour un compte existant
        const response = await createStripeOnboardingLink();
        
        if (response.onboarding_url) {
          Alert.alert(
            'Continuer la configuration',
            'Vous allez être redirigé vers Stripe pour finaliser votre configuration.',
            [
              { text: 'Annuler', style: 'cancel' },
              { 
                text: 'Continuer', 
                onPress: () => {
                  console.log('Onboarding URL:', response.onboarding_url);
                }
              }
            ]
          );
        }
      }
      
      // Rafraîchir les données utilisateur après l'action
      await refreshUser();
      await fetchAccountStatus();
      
    } catch (error: any) {
      console.error('Erreur configuration Stripe:', error);
      setError(error.message || 'Erreur lors de la configuration du compte Stripe');
      Alert.alert('Erreur', error.message || 'Erreur lors de la configuration');
    } finally {
      setActionLoading(false);
    }
  };

  const refreshStatus = async () => {
    await Promise.all([
      refreshUser(),
      fetchAccountStatus()
    ]);
  };

  // Ne pas afficher le composant si l'utilisateur n'est pas restaurateur
  if (!isRestaurateur) {
    return null;
  }

  if (loading && !account) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text style={styles.loadingText}>Vérification du statut...</Text>
        </View>
      </View>
    );
  }

  const getStatusInfo = () => {
    const restaurateurProfile = getRestaurateurProfile();
    const isValidated = account?.has_validated_profile || user?.roles?.has_validated_profile || restaurateurProfile?.stripe_verified;
    
    if (isValidated) {
      return {
        color: '#10B981',
        backgroundColor: '#D1FAE5',
        borderColor: '#10B981',
        icon: 'check-circle' as const,
        title: 'Compte validé',
        description: 'Votre compte Stripe est validé et prêt à recevoir des paiements.',
        actionText: null,
      };
    } else if (account?.status === 'account_exists' || restaurateurProfile?.stripe_account_id) {
      return {
        color: '#F59E0B',
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
        icon: 'schedule' as const,
        title: 'Configuration en cours',
        description: 'Votre compte Stripe existe mais nécessite une finalisation.',
        actionText: 'Continuer la configuration',
      };
    } else {
      return {
        color: '#EF4444',
        backgroundColor: '#FEE2E2',
        borderColor: '#EF4444',
        icon: 'error-outline' as const,
        title: 'Configuration requise',
        description: 'Vous devez configurer votre compte Stripe pour recevoir des paiements.',
        actionText: 'Configurer Stripe',
      };
    }
  };

  const statusInfo = getStatusInfo();

  if (compact) {
    return (
      <View style={[styles.compactContainer, { borderLeftColor: statusInfo.borderColor }]}>
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
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <MaterialIcons name="arrow-forward" size={16} color="#3B82F6" />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Compte Stripe</Text>
        <TouchableOpacity onPress={refreshStatus} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <MaterialIcons name="warning" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

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
            <MaterialIcons name="celebration" size={16} color="#059669" style={{ marginRight: 4 }} />
            <Text style={styles.successText}>
              Vous pouvez maintenant activer vos restaurants et commencer à recevoir des commandes.
            </Text>
          </View>
        ) : showActions && statusInfo.actionText && (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[styles.actionButton, actionLoading && styles.actionButtonDisabled]}
              onPress={handleSetupAccount}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="launch" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonText}>
                    {statusInfo.actionText}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {account?.requirements?.currently_due && account.requirements.currently_due.length > 0 && (
              <View style={styles.requirementsContainer}>
                <Text style={styles.requirementsTitle}>Documents requis :</Text>
                {account.requirements.currently_due.slice(0, 3).map((req: string, index: number) => (
                  <Text key={index} style={styles.requirementItem}>
                    • {req.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                ))}
                {account.requirements.currently_due.length > 3 && (
                  <Text style={styles.requirementItem}>
                    • Et {account.requirements.currently_due.length - 3} autre(s)...
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Informations complémentaires */}
      {account?.status === 'account_exists' && !account.has_validated_profile && (
        <View style={styles.infoContainer}>
          <MaterialIcons name="info-outline" size={16} color="#6B7280" />
          <Text style={styles.infoText}>
            La validation de votre compte peut prendre 1 à 3 jours ouvrés après soumission de tous les documents requis.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  containerCompact: {
    padding: 12,
    marginVertical: 2,
  },
  compactContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  compactButton: {
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  refreshButton: {
    padding: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  errorText: {
    marginLeft: 8,
    color: '#DC2626',
    fontSize: 14,
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 8,
    color: '#6B7280',
  },
  statusCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusDescription: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  successInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 6,
  },
  successText: {
    fontSize: 14,
    color: '#059669',
    flex: 1,
  },
  actionContainer: {
    marginTop: 8,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  requirementsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 8,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  requirementItem: {
    fontSize: 12,
    color: '#92400E',
    marginLeft: 8,
    marginBottom: 2,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
});