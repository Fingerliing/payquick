import React, { useRef, useState } from 'react';
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

export default function LoginScreen() {
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  });
  const passwordRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const updateField = (field: keyof LoginFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Effacer l'erreur du champ quand l'utilisateur commence à taper
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    // Utiliser la méthode de validation intégrée
    const validation = ValidationUtils.validateUserLogin({
      username: formData.username.trim().toLowerCase(),
      password: formData.password,
    });

    setErrors(validation.errors);
    return validation.isValid;
  };

  const handleLogin = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      
      // Préparer les données pour l'API
      const loginData = {
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
      };

      await login(loginData);
      
      // Succès - redirection vers l'app principale
      router.replace('/(tabs)');
      
    } catch (error: any) {
      console.error('Erreur de connexion:', error);
      
      // Gestion des erreurs spécifiques
      let errorMessage = 'Identifiants incorrects';
      
      if (error.response?.status === 401) {
        errorMessage = 'Email ou mot de passe incorrect';
      } else if (error.response?.status === 400) {
        errorMessage = 'Données de connexion invalides';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Erreur serveur, veuillez réessayer plus tard';
      } else if (error.message && error.message !== 'Network Error') {
        errorMessage = error.message;
      } else if (error.message === 'Network Error') {
        errorMessage = 'Problème de connexion réseau';
      }
      
      Alert.alert('Erreur de connexion', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Styles
  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const contentStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  };

  const titleStyle: TextStyle = {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  };

  const subtitleStyle: TextStyle = {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 40,
  };

  const linkStyle: TextStyle = {
    color: '#3B82F6',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
  };

  const forgotPasswordStyle: TextStyle = {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  };

  const dividerContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  };

  const dividerLineStyle: ViewStyle = {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  };

  const dividerTextStyle: TextStyle = {
    marginHorizontal: 16,
    color: '#9CA3AF',
    fontSize: 14,
  };

  return (
    <KeyboardAvoidingView 
      style={containerStyle} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card>
          {/* En-tête */}
          <Text style={titleStyle}>Eat&Go</Text>
          <Text style={subtitleStyle}>Connectez-vous à votre compte</Text>

          {/* Formulaire de connexion */}
          <Input
            ref={usernameRef}
            label="Email"
            placeholder="votre@email.com"
            value={formData.username}
            onChangeText={(value) => updateField('username', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            leftIcon="mail-outline"
            error={errors.username}
            returnKeyType="next"
          />

          <Input
            ref={passwordRef}
            label="Mot de passe"
            placeholder="••••••••"
            value={formData.password}
            onChangeText={(value) => updateField('password', value)}
            secureTextEntry
            leftIcon="lock-closed-outline"
            error={errors.password}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {/* Mot de passe oublié */}
          <TouchableOpacity 
            onPress={() => router.push('/(auth)/forgot-password' as any)}
            disabled={isLoading}
          >
            <Text style={forgotPasswordStyle}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          {/* Bouton de connexion */}
          <Button
            title="Se connecter"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading}
            fullWidth
            style={{ marginTop: 24 }}
          />

          {/* Divider */}
          <View style={dividerContainerStyle}>
            <View style={dividerLineStyle} />
            <Text style={dividerTextStyle}>ou</Text>
            <View style={dividerLineStyle} />
          </View>

          {/* Lien vers l'inscription */}
          <TouchableOpacity 
            onPress={() => router.push('/(auth)/register')}
            disabled={isLoading}
          >
            <Text style={linkStyle}>Pas encore de compte ? S'inscrire</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}