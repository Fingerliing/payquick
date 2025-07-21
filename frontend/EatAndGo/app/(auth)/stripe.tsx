import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { stripeService } from '@/services/stripeService';

export default function Stripe() {
  const navigation = useNavigation();
  const [status, setStatus] = useState<'checking' | 'waiting' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('Vérification de votre compte Stripe...');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Attendre un peu pour laisser le temps au webhook
        setTimeout(async () => {
          try {
            const accountStatus = await stripeService.getAccountStatus();
            
            if (accountStatus.has_validated_profile) {
              setStatus('success');
              setMessage('Votre compte Stripe a été validé avec succès !');
            } else {
              setStatus('waiting');
              setMessage('Configuration en cours. Cela peut prendre quelques minutes...');
            }
          } catch (error) {
            setStatus('error');
            setMessage('Erreur lors de la vérification du statut de votre compte.');
          }
        }, 3000);
      } catch (error) {
        setStatus('error');
        setMessage('Erreur lors de la vérification.');
      }
    };

    checkStatus();
  }, []);

  const handleContinue = () => {
    navigation.navigate('Dashboard' as never);
  };

  const handleRetry = async () => {
    setStatus('checking');
    setMessage('Nouvelle vérification...');
    
    try {
      const accountStatus = await stripeService.getAccountStatus();
      
      if (accountStatus.has_validated_profile) {
        setStatus('success');
        setMessage('Votre compte Stripe a été validé avec succès !');
      } else if (accountStatus.status === 'account_exists') {
        // Recréer un lien d'onboarding
        const onboardingLink = await stripeService.createOnboardingLink();
        await stripeService.openStripeOnboarding(onboardingLink.onboarding_url);
      } else {
        setStatus('error');
        setMessage('Compte Stripe non trouvé. Veuillez recommencer l\'inscription.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Erreur lors de la vérification.');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'checking':
        return <ActivityIndicator size="large" color="#4f46e5" />;
      case 'waiting':
        return <Text style={styles.icon}>⏳</Text>;
      case 'success':
        return <Text style={styles.icon}>✅</Text>;
      case 'error':
        return <Text style={styles.icon}>❌</Text>;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return '#10b981';
      case 'error':
        return '#ef4444';
      case 'waiting':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {getStatusIcon()}
        </View>

        <Text style={[styles.title, { color: getStatusColor() }]}>
          {status === 'checking' && 'Vérification en cours...'}
          {status === 'waiting' && 'Configuration en attente'}
          {status === 'success' && 'Compte validé !'}
          {status === 'error' && 'Erreur de validation'}
        </Text>

        <Text style={styles.message}>{message}</Text>

        {status === 'success' && (
          <Text style={styles.successDetail}>
            Vous pouvez maintenant activer vos restaurants et commencer à recevoir des commandes.
          </Text>
        )}

        <View style={styles.buttonContainer}>
          {status === 'success' || status === 'waiting' ? (
            <TouchableOpacity style={styles.button} onPress={handleContinue}>
              <Text style={styles.buttonText}>
                Continuer vers le tableau de bord
              </Text>
            </TouchableOpacity>
          ) : status === 'error' ? (
            <>
              <TouchableOpacity style={styles.button} onPress={handleRetry}>
                <Text style={styles.buttonText}>Réessayer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleContinue}>
                <Text style={styles.secondaryButtonText}>
                  Continuer sans Stripe
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
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