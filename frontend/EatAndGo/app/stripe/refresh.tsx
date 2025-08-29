import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { stripeService } from '@/services/stripeService';

export default function StripeRefreshScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const createNewLink = async () => {
      try {
        const response = await stripeService.createOnboardingLink();
        const opened = await stripeService.openStripeOnboarding(response.onboarding_url);
        
        if (!opened) {
          setError('Impossible d\'ouvrir le lien Stripe');
          setLoading(false);
        }
      } catch (error: any) {
        setError('Erreur lors de la création du lien Stripe');
        setLoading(false);
      }
    };

    createNewLink();
  }, []);

  const handleBackToApp = () => {
    router.replace('/(restaurant)');
  };

  const handleRetry = () => {
    setLoading(true);
    setError('');
    
    const createNewLink = async () => {
      try {
        const response = await stripeService.createOnboardingLink();
        const opened = await stripeService.openStripeOnboarding(response.onboarding_url);
        
        if (!opened) {
          setError('Impossible d\'ouvrir le lien Stripe');
          setLoading(false);
        }
      } catch (error: any) {
        setError('Erreur lors de la création du lien Stripe');
        setLoading(false);
      }
    };

    createNewLink();
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Card>
          <View style={styles.content}>
            <Text style={[styles.icon, styles.errorIcon]}>❌</Text>
            <Text style={[styles.title, styles.errorTitle]}>Erreur</Text>
            <Text style={styles.message}>{error}</Text>
            
            <Button
              title="Réessayer"
              onPress={handleRetry}
              fullWidth
              style={{ marginBottom: 12 }}
            />
            
            <Button
              title="Retour à l'application"
              onPress={handleBackToApp}
              variant="outline"
              fullWidth
            />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#3B82F6" style={styles.icon} />
          <Text style={styles.title}>Redirection...</Text>
          <Text style={styles.message}>
            Vous allez être redirigé vers Stripe pour continuer la configuration de votre compte.
          </Text>
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