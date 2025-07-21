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

export default function StripeSuccessScreen() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkAccountStatus = async () => {
      try {
        const accountStatus = await stripeService.getAccountStatus();
        
        if (accountStatus.has_validated_profile) {
          setStatus('success');
          setMessage('Votre compte Stripe a été validé avec succès ! Vous pouvez maintenant recevoir des paiements.');
        } else {
          setStatus('error');
          setMessage('Votre compte Stripe n\'est pas encore validé. Cela peut prendre quelques minutes.');
        }
      } catch (error) {
        setStatus('error');
        setMessage('Erreur lors de la vérification du statut de votre compte.');
      }
    };

    checkAccountStatus();
  }, []);

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.content}>
          {status === 'loading' && (
            <>
              <ActivityIndicator size="large" color="#3B82F6" style={styles.icon} />
              <Text style={styles.title}>Vérification en cours...</Text>
            </>
          )}
          
          {status === 'success' && (
            <>
              <Text style={[styles.icon, styles.successIcon]}>✅</Text>
              <Text style={[styles.title, styles.successTitle]}>Compte validé !</Text>
            </>
          )}
          
          {status === 'error' && (
            <>
              <Text style={[styles.icon, styles.errorIcon]}>⚠️</Text>
              <Text style={[styles.title, styles.errorTitle]}>Validation en attente</Text>
            </>
          )}

          <Text style={styles.message}>{message}</Text>

          {status !== 'loading' && (
            <Button
              title="Continuer vers l'application"
              onPress={handleContinue}
              fullWidth
            />
          )}
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