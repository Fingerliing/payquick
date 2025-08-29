import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
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
    router.push('/stripe');
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Support',
      'Besoin d\'aide ? Contactez-nous à support@eatandgo.com',
      [{ text: 'OK' }]
    );
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
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  statusContainer: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    flex: 1,
  },
  actionContainer: {
    width: '100%',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 8,
    width: '100%',
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
});