import React, { useRef, useState, useCallback } from 'react';
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

interface LoginFormData {
  username: string; // Email qui sert de username
  password: string;
}

interface FormErrors {
  [key: string]: string;
}

// Styles constants
const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  } as ViewStyle,
  
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  } as ViewStyle,
  
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  } as TextStyle,
  
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 40,
  } as TextStyle,
  
  link: {
    color: '#3B82F6',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
  } as TextStyle,
  
  forgotPassword: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  } as TextStyle,
  
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  } as ViewStyle,
  
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  } as ViewStyle,
  
  dividerText: {
    marginHorizontal: 16,
    color: '#9CA3AF',
    fontSize: 14,
  } as TextStyle,
  
  buttonStyle: {
    marginTop: 24,
  } as ViewStyle,
} as const;

export default function LoginScreen() {
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  
  // Refs pour la navigation
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // Gestionnaire de champs optimisé
  const updateField = useCallback((field: keyof LoginFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Effacer l'erreur du champ quand l'utilisateur tape
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  // Validation côté client
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    
    // Validation email
    if (!formData.username.trim()) {
      newErrors.username = 'L\'email est requis';
    } else if (!ValidationUtils.isEmail(formData.username.trim())) {
      newErrors.username = 'Format d\'email invalide';
    }
    
    // Validation mot de passe
    if (!formData.password) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Le mot de passe doit contenir au moins 6 caractères';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Gestionnaire de connexion
  const handleLogin = useCallback(async () => {
    if (!validateForm()) {
      Alert.alert('Erreur de validation', 'Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    try {
      setIsLoading(true);
      
      // Préparer les données pour l'API (format attendu par le backend)
      const loginData = {
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
      };

      console.log('Tentative de connexion avec:', { username: loginData.username });

      // Appel à l'API via le contexte Auth
      await login(loginData);
      
      console.log('Connexion réussie, redirection...');
      
      // Succès - redirection automatique gérée par le contexte
      // Le contexte va sauvegarder les tokens et mettre à jour l'état
      
    } catch (error: any) {
      console.error('Erreur de connexion:', error);
      
      // Gestion des erreurs spécifiques du backend
      let errorMessage = 'Une erreur est survenue lors de la connexion';
      
      if (error.response?.data) {
        const backendErrors = error.response.data;
        
        // Gestion des erreurs backend Django
        if (backendErrors.non_field_errors) {
          errorMessage = Array.isArray(backendErrors.non_field_errors) 
            ? backendErrors.non_field_errors[0] 
            : backendErrors.non_field_errors;
        } else if (backendErrors.username) {
          errorMessage = Array.isArray(backendErrors.username) 
            ? backendErrors.username[0] 
            : backendErrors.username;
        } else if (backendErrors.password) {
          errorMessage = Array.isArray(backendErrors.password) 
            ? backendErrors.password[0] 
            : backendErrors.password;
        } else if (backendErrors.message) {
          errorMessage = backendErrors.message;
        } else if (backendErrors.detail) {
          errorMessage = backendErrors.detail;
        }
      } else if (error.response?.status === 401) {
        errorMessage = 'Email ou mot de passe incorrect';
      } else if (error.response?.status === 400) {
        errorMessage = 'Données de connexion invalides';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Erreur serveur, veuillez réessayer plus tard';
      } else if (error.message === 'Network Error') {
        errorMessage = 'Problème de connexion réseau. Vérifiez votre connexion internet.';
      } else if (error.message && error.message !== 'Network Error') {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur de connexion', errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [formData, validateForm, login]);

  // Navigation vers le champ suivant
  const focusPassword = useCallback(() => {
    passwordRef.current?.focus();
  }, []);

  // Navigation vers l'inscription
  const handleGoToRegister = useCallback(() => {
    router.push('/(auth)/register');
  }, []);

  // Navigation vers mot de passe oublié
  const handleForgotPassword = useCallback(() => {
    router.push('/(auth)/forgot-password' as any);
  }, []);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card>
          {/* En-tête */}
          <Text style={styles.title}>Eat&Go</Text>
          <Text style={styles.subtitle}>Connectez-vous à votre compte</Text>

          {/* Formulaire de connexion */}
          <Input
            ref={usernameRef}
            label="Email *"
            placeholder="votre@email.com"
            value={formData.username}
            onChangeText={(value) => updateField('username', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            leftIcon="mail-outline"
            error={errors.username}
            returnKeyType="next"
            onSubmitEditing={focusPassword}
            editable={!isLoading}
          />

          <Input
            ref={passwordRef}
            label="Mot de passe *"
            placeholder="••••••••"
            value={formData.password}
            onChangeText={(value) => updateField('password', value)}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            leftIcon="lock-closed-outline"
            error={errors.password}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            editable={!isLoading}
          />

          {/* Mot de passe oublié */}
          <TouchableOpacity 
            onPress={handleForgotPassword}
            disabled={isLoading}
          >
            <Text style={styles.forgotPassword}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          {/* Bouton de connexion */}
          <Button
            title="Se connecter"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading}
            fullWidth
            style={styles.buttonStyle}
          />

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Lien vers l'inscription */}
          <TouchableOpacity 
            onPress={handleGoToRegister}
            disabled={isLoading}
          >
            <Text style={styles.link}>Pas encore de compte ? S'inscrire</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}