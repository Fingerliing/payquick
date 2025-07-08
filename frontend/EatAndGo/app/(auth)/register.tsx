import React, { useState } from 'react';
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
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { RoleSelector } from '@/components/ui/RoleSelector';
import { ValidationUtils } from '@/utils/validators';

interface RegisterFormData {
  username: string; // Email qui servira de username
  password: string;
  confirmPassword: string; // Pour validation côté client
  nom: string;
  role: 'client' | 'restaurateur';
  telephone: string;
  siret: string; // Seulement pour les restaurateurs
}

interface FormErrors {
  [key: string]: string;
}

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

  const updateField = (field: keyof RegisterFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Effacer l'erreur du champ quand l'utilisateur commence à taper
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateSiret = (siret: string): boolean => {
    return ValidationUtils.validateSiret(siret);
  };

  const validateForm = (): boolean => {
    // Utiliser la méthode de validation intégrée
    const validation = ValidationUtils.validateUserRegistration({
      username: formData.username.trim().toLowerCase(),
      password: formData.password,
      nom: formData.nom.trim(),
      role: formData.role,
      telephone: formData.telephone.replace(/\s/g, ''),
      siret: formData.siret.replace(/\s/g, '')
    });

    // Ajouter la validation de confirmation de mot de passe
    const newErrors = { ...validation.errors };
    if (!ValidationUtils.isRequired(formData.confirmPassword)) {
      newErrors.confirmPassword = 'Veuillez confirmer votre mot de passe';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    setErrors(newErrors);
    return validation.isValid && !newErrors.confirmPassword;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      Alert.alert('Erreur de validation', 'Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    try {
      setIsLoading(true);
      
      // Préparer les données selon le format attendu par le backend
      const registerData = {
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
        nom: formData.nom.trim(),
        role: formData.role,
        telephone: formData.telephone.replace(/\s/g, ''),
        ...(formData.role === 'restaurateur' && { siret: formData.siret.replace(/\s/g, '') })
      };

      await register(registerData);
      
      // Succès - message personnalisé selon le rôle
      const roleMessage = formData.role === 'client' 
        ? 'Votre compte client a été créé avec succès !' 
        : 'Votre compte restaurateur a été créé avec succès !';
      
      Alert.alert(
        'Inscription réussie !', 
        roleMessage,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
      
    } catch (error: any) {
      console.error('Erreur d\'inscription:', error);
      
      // Gestion des erreurs spécifiques du backend
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
  };

  // Styles
  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  };

  const titleStyle: TextStyle = {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  };

  const subtitleStyle: TextStyle = {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  };

  const linkStyle: TextStyle = {
    color: '#3B82F6',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
  };

  const passwordHintStyle: TextStyle = {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 8,
  };

  const roleDescriptionStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  };

  return (
    <KeyboardAvoidingView 
      style={containerStyle} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView 
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={titleStyle}>Créer un compte</Text>
          <Text style={subtitleStyle}>Rejoignez PayQuick aujourd'hui</Text>

          {/* Sélecteur de rôle */}
          <RoleSelector
            selectedRole={formData.role}
            onRoleChange={(role) => updateField('role', role)}
            style={{ marginBottom: 16 }}
          />

          <Text style={roleDescriptionStyle}>
            {formData.role === 'client' 
              ? 'Commandez vos plats préférés en quelques clics'
              : 'Gérez votre restaurant et développez votre activité'
            }
          </Text>

          {/* Nom complet */}
          <Input
            label="Nom complet *"
            placeholder="Jean Dupont"
            value={formData.nom}
            onChangeText={(value) => updateField('nom', value)}
            error={errors.nom}
            autoCapitalize="words"
            returnKeyType="next"
            leftIcon="person-outline"
          />

          {/* Email */}
          <Input
            label="Email *"
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

          {/* Téléphone */}
          <Input
            label="Téléphone"
            placeholder="+33 6 12 34 56 78"
            value={formData.telephone}
            onChangeText={(value) => updateField('telephone', value)}
            keyboardType="phone-pad"
            leftIcon="call-outline"
            error={errors.telephone}
            returnKeyType="next"
          />

          {/* SIRET - seulement pour les restaurateurs */}
          {formData.role === 'restaurateur' && (
            <Input
              label="SIRET *"
              placeholder="12345678901234"
              value={formData.siret}
              onChangeText={(value) => updateField('siret', value)}
              keyboardType="numeric"
              leftIcon="business-outline"
              error={errors.siret}
              returnKeyType="next"
              helperText="Numéro d'identification de votre entreprise (14 chiffres)"
            />
          )}

          {/* Mot de passe */}
          <Input
            label="Mot de passe *"
            placeholder="••••••••"
            value={formData.password}
            onChangeText={(value) => updateField('password', value)}
            secureTextEntry
            leftIcon="lock-closed-outline"
            error={errors.password}
            returnKeyType="next"
          />
          <Text style={passwordHintStyle}>
            Le mot de passe doit contenir au moins 8 caractères avec majuscules, minuscules et chiffres
          </Text>

          {/* Confirmation mot de passe */}
          <Input
            label="Confirmer le mot de passe *"
            placeholder="••••••••"
            value={formData.confirmPassword}
            onChangeText={(value) => updateField('confirmPassword', value)}
            secureTextEntry
            leftIcon="lock-closed-outline"
            error={errors.confirmPassword}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          {/* Bouton d'inscription */}
          <Button
            title={`S'inscrire comme ${formData.role}`}
            onPress={handleRegister}
            loading={isLoading}
            disabled={isLoading}
            fullWidth
            style={{ marginTop: 16 }}
          />

          {/* Lien vers la connexion */}
          <TouchableOpacity 
            onPress={() => router.push('/(auth)/login')}
            disabled={isLoading}
          >
            <Text style={linkStyle}>Déjà un compte ? Se connecter</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}