import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { stripeService } from '@/services/stripeService';

export default function StripeOnboardingScreen() {
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
    router.replace('/(tabs)');
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
        return <ActivityIndicator size="large" color="#3B82F6" />;
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
        return '#10B981';
      case 'error':
        return '#EF4444';
      case 'waiting':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  return (
    <View style={styles.container}>
      <Card>
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
              <Button
                title="Continuer vers l'application"
                onPress={handleContinue}
                fullWidth
              />
            ) : status === 'error' ? (
              <>
                <Button
                  title="Réessayer"
                  onPress={handleRetry}
                  fullWidth
                  style={{ marginBottom: 12 }}
                />
                <Button
                  title="Continuer sans Stripe"
                  onPress={handleContinue}
                  variant="outline"
                  fullWidth
                />
              </>
            ) : null}
          </View>
        </View>
      </Card>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 20,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 24,
    textAlign: 'center',
  },
  successIcon: {
    color: '#10B981',
  },
  errorIcon: {
    color: '#EF4444',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  successTitle: {
    color: '#10B981',
  },
  errorTitle: {
    color: '#EF4444',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#6B7280',
    marginBottom: 32,
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
});