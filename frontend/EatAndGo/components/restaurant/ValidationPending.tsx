import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

interface ValidationStatus {
  needsValidation: boolean;
  message: string;
  canCreateRestaurant: boolean;
  stripeVerified?: boolean;
  isActive?: boolean;
}

interface ValidationPendingProps {
  validationStatus: ValidationStatus;
}

export const ValidationPending: React.FC<ValidationPendingProps> = ({
  validationStatus
}) => {
  const { user } = useAuth();
  
  const handleStripeSetup = () => {
    router.push('/(auth)/stripe');
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:contact@eatquicker.fr?subject=Aide%20validation%20profil%20restaurateur');
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="schedule" size={64} color="#F59E0B" />
      </View>
      
      <Text style={styles.title}>Profil en cours de validation</Text>
      
      <Text style={styles.message}>
        {validationStatus.message}
      </Text>

      <View style={styles.statusContainer}>
        <View style={styles.statusItem}>
          <MaterialIcons 
            name={validationStatus.stripeVerified ? "check-circle" : "schedule"} 
            size={20} 
            color={validationStatus.stripeVerified ? "#10B981" : "#F59E0B"} 
          />
          <Text style={styles.statusText}>
            Configuration Stripe {validationStatus.stripeVerified ? 'complétée' : 'en cours'}
          </Text>
        </View>
        
        <View style={styles.statusItem}>
          <MaterialIcons 
            name={validationStatus.isActive ? "check-circle" : "schedule"} 
            size={20} 
            color={validationStatus.isActive ? "#10B981" : "#F59E0B"} 
          />
          <Text style={styles.statusText}>
            Profil {validationStatus.isActive ? 'activé' : 'en attente d\'activation'}
          </Text>
        </View>
      </View>

      <View style={styles.actionContainer}>
        {!validationStatus.stripeVerified && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleStripeSetup}>
            <MaterialIcons name="payment" size={20} color="white" />
            <Text style={styles.primaryButtonText}>Configurer Stripe</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.secondaryButton} onPress={handleContactSupport}>
          <MaterialIcons name="help-outline" size={20} color="#6B7280" />
          <Text style={styles.secondaryButtonText}>Contacter le support</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoContainer}>
        <MaterialIcons name="info-outline" size={16} color="#6B7280" />
        <Text style={styles.infoText}>
          La validation de votre profil peut prendre 1 à 3 jours ouvrés après la finalisation de votre configuration Stripe.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  statusContainer: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 15,
    color: '#374151',
  },
  actionContainer: {
    width: '100%',
    gap: 10,
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
    lineHeight: 18,
  },
});