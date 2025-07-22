import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { stripeService, StripeAccount } from '@/services/stripeService';

interface StripeAccountStatusProps {
  onStatusChange?: (status: StripeAccount) => void;
}

export default function StripeAccountStatus({ onStatusChange }: StripeAccountStatusProps) {
  const [account, setAccount] = useState<StripeAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchAccountStatus();
  }, []);

  const fetchAccountStatus = async () => {
    try {
      const accountStatus = await stripeService.getAccountStatus();
      setAccount(accountStatus);
      onStatusChange?.(accountStatus);
    } catch (error: any) {
      console.error('Erreur récupération statut:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupAccount = async () => {
    setActionLoading(true);
    try {
      if (account?.status === 'no_account') {
        const stripeAccount = await stripeService.createAccount();
        const opened = await stripeService.openStripeOnboarding(stripeAccount.onboarding_url);
        
        if (!opened) {
          Alert.alert('Erreur', 'Impossible d\'ouvrir Stripe. Vérifiez votre connexion.');
        }
      } else {
        const response = await stripeService.createOnboardingLink();
        console.log("Lien onboarding reçu:", response);
        const opened = await stripeService.openStripeOnboarding(response.onboarding_url);
        
        if (!opened) {
          Alert.alert('Erreur', 'Impossible d\'ouvrir Stripe. Vérifiez votre connexion.');
        }
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Erreur lors de la configuration du compte Stripe');
    } finally {
      setActionLoading(false);
    }
  };

  const refreshStatus = async () => {
    setLoading(true);
    await fetchAccountStatus();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#4f46e5" />
          <Text style={styles.loadingText}>Vérification du statut...</Text>
        </View>
      </View>
    );
  }

  const getStatusInfo = () => {
    if (account?.has_validated_profile) {
      return {
        color: '#10b981',
        backgroundColor: '#d1fae5',
        icon: '✅',
        title: 'Compte validé',
        description: 'Votre compte Stripe est validé et prêt à recevoir des paiements !',
      };
    } else if (account?.status === 'account_exists') {
      return {
        color: '#f59e0b',
        backgroundColor: '#fef3c7',
        icon: '⚠️',
        title: 'Configuration en cours',
        description: 'Votre compte Stripe existe mais n\'est pas encore validé.',
      };
    } else {
      return {
        color: '#ef4444',
        backgroundColor: '#fee2e2',
        icon: '❌',
        title: 'Non configuré',
        description: 'Vous devez configurer votre compte Stripe pour recevoir des paiements.',
      };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Compte Stripe</Text>
        <TouchableOpacity onPress={refreshStatus} style={styles.refreshButton}>
          <Text style={styles.refreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.statusCard, { backgroundColor: statusInfo.backgroundColor }]}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusIcon}>{statusInfo.icon}</Text>
          <Text style={[styles.statusTitle, { color: statusInfo.color }]}>
            {statusInfo.title}
          </Text>
        </View>
        <Text style={[styles.statusDescription, { color: statusInfo.color }]}>
          {statusInfo.description}
        </Text>

        {account?.has_validated_profile ? (
          <View style={styles.successInfo}>
            <Text style={styles.successText}>
              🎉 Vous pouvez maintenant activer vos restaurants et commencer à recevoir des commandes.
            </Text>
          </View>
        ) : (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[styles.actionButton, actionLoading && styles.actionButtonDisabled]}
              onPress={handleSetupAccount}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {account?.status === 'no_account' ? 'Configurer Stripe' : 'Continuer la configuration'}
                </Text>
              )}
            </TouchableOpacity>

            {account?.requirements && account.requirements.currently_due && account.requirements.currently_due.length > 0 && (
              <View style={styles.requirementsContainer}>
                <Text style={styles.requirementsTitle}>Documents requis :</Text>
                {account.requirements.currently_due.map((req: string, index: number) => (
                  <Text key={index} style={styles.requirementItem}>• {req}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    color: '#1f2937',
  },
  refreshButton: {
    padding: 8,
  },
  refreshText: {
    fontSize: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 8,
    color: '#6b7280',
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
  statusIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusDescription: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  successInfo: {
    marginTop: 8,
  },
  successText: {
    fontSize: 14,
    color: '#059669',
    fontStyle: 'italic',
  },
  actionContainer: {
    marginTop: 8,
  },
  actionButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#9ca3af',
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
    color: '#92400e',
    marginBottom: 4,
  },
  requirementItem: {
    fontSize: 12,
    color: '#92400e',
    marginLeft: 8,
  },
  // Styles pour StripeOnboardingScreen
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 24,
  },
  successDetail: {
    fontSize: 14,
    textAlign: 'center',
    color: '#059669',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
  button: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryButtonText: {
    color: '#6b7280',
    fontSize: 16,
  },
});