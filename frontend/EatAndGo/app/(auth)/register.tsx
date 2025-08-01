import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
  TextStyle,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ValidationUtils } from '@/utils/validators';
import { stripeService } from '@/services/stripeService';

interface RegisterFormData {
  username: string;
  password: string;
  confirmPassword: string;
  nom: string;
  role: 'client' | 'restaurateur';
  telephone: string;
  siret: string;
}

interface FormErrors {
  [key: string]: string;
}
const stripeInfoStyles = {
  container: {
    flexDirection: 'row',
    backgroundColor: '#EBF8FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  } as ViewStyle,
  
  iconContainer: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  
  icon: {
    fontSize: 20,
  } as TextStyle,
  
  content: {
    flex: 1,
  } as ViewStyle,
  
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  } as TextStyle,
  
  description: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 16,
  } as TextStyle,
};
const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  } as ViewStyle,
  
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  } as ViewStyle,
  
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  } as TextStyle,
  
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  } as TextStyle,
  
  link: {
    color: '#3B82F6',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
  } as TextStyle,
  
  passwordHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 8,
  } as TextStyle,
  
  roleSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  } as ViewStyle,
  
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  } as ViewStyle,
  
  roleButtonActive: {
    backgroundColor: '#3B82F6',
  } as ViewStyle,
  
  roleButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  } as TextStyle,
  
  roleButtonTextActive: {
    color: '#FFFFFF',
  } as TextStyle,
};

export default function RegisterScreen() {
  const [formData, setFormData] = useState<RegisterFormData>({
    username: '',
    password: '',
    confirmPassword: '',
    nom: '',
    role: 'client',
    telephone: '',
    siret: '',
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const usernameRef = useRef<TextInput>(null);
  const nomRef = useRef<TextInput>(null);
  const telephoneRef = useRef<TextInput>(null);
  const siretRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // Gestionnaire simple
  const updateField = useCallback((field: keyof RegisterFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  const validateForm = useCallback((): boolean => {
    const validation = ValidationUtils.validateUserRegistration({
      username: formData.username.trim().toLowerCase(),
      password: formData.password,
      nom: formData.nom.trim(),
      role: formData.role,
      telephone: formData.telephone.replace(/\s/g, ''),
      siret: formData.siret.replace(/\s/g, '')
    });

    const newErrors = { ...validation.errors };
    if (!ValidationUtils.isRequired(formData.confirmPassword)) {
      newErrors.confirmPassword = 'Veuillez confirmer votre mot de passe';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    setErrors(newErrors);
    return validation.isValid && !newErrors.confirmPassword;
  }, [formData]);

  const handleRegister = useCallback(async () => {
    if (!validateForm()) {
      Alert.alert('Erreur de validation', 'Veuillez corriger les erreurs dans le formulaire');
      return;
    }
  
    try {
      setIsLoading(true);
      
      const registerData = {
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
        nom: formData.nom.trim(),
        role: formData.role,
        telephone: formData.telephone.replace(/\s/g, ''),
        ...(formData.role === 'restaurateur' && { siret: formData.siret.replace(/\s/g, '') })
      };
  
      await register(registerData);
      
      // Si c'est un restaurateur, proposer la configuration Stripe
      if (formData.role === 'restaurateur') {
        Alert.alert(
          'Inscription réussie !', 
          'Votre compte restaurateur a été créé avec succès ! 🎉\n\nSouhaitez-vous configurer votre compte Stripe maintenant pour pouvoir recevoir des paiements ?',
          [
            { 
              text: 'Plus tard', 
              style: 'cancel',
              onPress: () => router.replace('/(restaurant)') 
            },
            { 
              text: 'Configurer Stripe', 
              onPress: () => handleStripeOnboarding() 
            }
          ]
        );
      } else {
        // Client normal
        Alert.alert(
          'Inscription réussie !', 
          'Votre compte client a été créé avec succès ! Bienvenue sur Eat&Go ! 🎉',
          [{ text: 'OK', onPress: () => router.replace('/(client)') }]
        );
      }
      
    } catch (error: any) {
      console.error('Erreur d\'inscription:', error);
      
      let errorMessage = 'Une erreur est survenue lors de l\'inscription';
      
      if (error.response?.data) {
        const backendErrors = error.response.data;
        
        if (backendErrors.username) {
          errorMessage = Array.isArray(backendErrors.username) 
            ? backendErrors.username[0] 
            : backendErrors.username;
        } else if (backendErrors.password) {
          errorMessage = Array.isArray(backendErrors.password) 
            ? backendErrors.password.join(', ') 
            : backendErrors.password;
        } else if (backendErrors.non_field_errors) {
          errorMessage = Array.isArray(backendErrors.non_field_errors) 
            ? backendErrors.non_field_errors[0] 
            : backendErrors.non_field_errors;
        } else if (backendErrors.message) {
          errorMessage = backendErrors.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur d\'inscription', errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [formData, validateForm, register]);
  
  const handleStripeOnboarding = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const stripeAccount = await stripeService.createAccount();
      
      // Ouvrir l'URL Stripe dans le navigateur
      const opened = await stripeService.openStripeOnboarding(stripeAccount.onboarding_url);
      
      if (opened) {
        // Rediriger vers un écran d'attente
        router.replace('./stripe');
      } else {
        Alert.alert(
          'Erreur',
          'Impossible d\'ouvrir Stripe. Vous pourrez configurer votre compte plus tard depuis votre profil.',
          [{ text: 'OK', onPress: () => router.replace('/(restaurant)') }]
        );
      }
    } catch (error: any) {
      console.error('Erreur Stripe:', error);
      Alert.alert(
        'Erreur Stripe',
        'Erreur lors de la configuration du compte Stripe. Vous pourrez le configurer plus tard depuis votre profil.',
        [{ text: 'OK', onPress: () => router.replace('/(restaurant)') }]
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const buttonTitle = useMemo(() => {
    return `S'inscrire comme ${formData.role}`;
  }, [formData.role]);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.subtitle}>Rejoignez Eat&Go aujourd'hui</Text>

          {/* Sélecteur de rôle SIMPLE - inline */}
          <View style={styles.roleSelector}>
            <TouchableOpacity
              style={[styles.roleButton, formData.role === 'client' && styles.roleButtonActive]}
              onPress={() => updateField('role', 'client')}
            >
              <Text style={[styles.roleButtonText, formData.role === 'client' && styles.roleButtonTextActive]}>
                Client
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, formData.role === 'restaurateur' && styles.roleButtonActive]}
              onPress={() => updateField('role', 'restaurateur')}
            >
              <Text style={[styles.roleButtonText, formData.role === 'restaurateur' && styles.roleButtonTextActive]}>
                Restaurateur
              </Text>
            </TouchableOpacity>
          </View>

          {/* INPUTS avec icônes */}
          <Input
            ref={nomRef}
            label="Nom complet *"
            placeholder="Jean Dupont"
            value={formData.nom}
            onChangeText={(value) => updateField('nom', value)}
            error={errors.nom}
            autoCapitalize="words"
            returnKeyType="next"
            leftIcon="person-outline"
          />

          <Input
            label="Email *"
            ref={usernameRef}
            placeholder="votre@email.com"
            value={formData.username}
            onChangeText={(value) => updateField('username', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.username}
            returnKeyType="next"
            leftIcon="mail-outline"
          />

          <Input
            ref={telephoneRef}
            label="Téléphone"
            placeholder="+33 6 12 34 56 78"
            value={formData.telephone}
            onChangeText={(value) => updateField('telephone', value)}
            keyboardType="phone-pad"
            error={errors.telephone}
            returnKeyType="next"
            leftIcon="call-outline"
          />

        {formData.role === 'restaurateur' && (
          <>
            <Input
              ref={siretRef}
              label="SIRET *"
              placeholder="12345678901234"
              value={formData.siret}
              onChangeText={(value) => updateField('siret', value)}
              keyboardType="numeric"
              error={errors.siret}
              helperText="Numéro d'identification de votre entreprise (14 chiffres)"
              maxLength={14}
              returnKeyType="next"
              leftIcon="business-outline"
            />
          
            <View style={stripeInfoStyles.container}>
              <View style={stripeInfoStyles.iconContainer}>
                <Text style={stripeInfoStyles.icon}>💳</Text>
              </View>
              <View style={stripeInfoStyles.content}>
                <Text style={stripeInfoStyles.title}>Configuration Stripe</Text>
                <Text style={stripeInfoStyles.description}>
                  Après votre inscription, vous pourrez configurer votre compte Stripe pour recevoir les paiements de vos clients en toute sécurité.
                </Text>
              </View>
            </View>
          </>
        )}


          <Input
            ref={passwordRef}
            label="Mot de passe *"
            placeholder="••••••••"
            value={formData.password}
            onChangeText={(value) => updateField('password', value)}
            secureTextEntry={true}
            error={errors.password}
            returnKeyType="next"
            leftIcon="lock-closed-outline"
          />
          <Text style={styles.passwordHint}>
            Le mot de passe doit contenir au moins 8 caractères avec majuscules, minuscules et chiffres
          </Text>

          <Input
            ref={confirmPasswordRef}
            label="Confirmer le mot de passe *"
            placeholder="••••••••"
            value={formData.confirmPassword}
            onChangeText={(value) => updateField('confirmPassword', value)}
            secureTextEntry={true}
            error={errors.confirmPassword}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
            leftIcon="lock-closed-outline"
          />

          <Button
            title={buttonTitle}
            onPress={handleRegister}
            loading={isLoading}
            disabled={isLoading}
            fullWidth
            style={{ marginTop: 16 }}
          />

          <TouchableOpacity 
            onPress={() => router.push('/(auth)/login')}
            disabled={isLoading}
          >
            <Text style={styles.link}>Déjà un compte ? Se connecter</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}