// app/(auth)/register.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { COLORS, TYPOGRAPHY, SPACING } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

interface RegisterFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterScreen() {
  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<RegisterFormData>>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const { register } = useAuth();
  const { isMobile, isTablet, getSpacing, getFontSize } = useResponsive();

  // ✅ VALIDATION COMPLÈTE AMÉLIORÉE
  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<RegisterFormData> = {};
    
    // Validation prénom
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Prénom requis';
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = 'Minimum 2 caractères';
    }
    
    // Validation nom
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Nom requis';
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = 'Minimum 2 caractères';
    }
    
    // Validation email
    const email = formData.email.trim();
    if (!email) {
      newErrors.email = 'Email requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Format d\'email invalide';
    }
    
    // Validation mot de passe
    if (!formData.password) {
      newErrors.password = 'Mot de passe requis';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Minimum 8 caractères';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Doit contenir majuscule, minuscule et chiffre';
    }
    
    // Validation confirmation mot de passe
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirmation requise';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && acceptedTerms;
  }, [formData, acceptedTerms]);

  // ✅ GESTION DES ERREURS AMÉLIORÉE
  const handleRegistrationError = (error: any) => {
    console.error('Registration error:', error);
    
    if (error.message?.includes('email')) {
      setErrors({ email: 'Cette adresse email est déjà utilisée' });
    } else if (error.message?.includes('network')) {
      Alert.alert('Erreur de connexion', 'Vérifiez votre connexion internet');
    } else {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue lors de l\'inscription');
    }
  };

  // ✅ SOUMISSION AVEC VALIDATION RENFORCÉE
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      if (!acceptedTerms) {
        Alert.alert('Conditions d\'utilisation', 'Veuillez accepter les conditions d\'utilisation pour continuer');
      }
      return;
    }
    
    setLoading(true);
    try {
      await register({
        username: formData.email.trim().toLowerCase(),
        password: formData.password,
        nom: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        role: 'client',
        telephone: '',
      });
      // Navigation handled by AuthContext
    } catch (error: any) {
      handleRegistrationError(error);
    } finally {
      setLoading(false);
    }
  }, [formData, register, validateForm, acceptedTerms]);

  // ✅ HELPERS POUR FORMULAIRE
  const updateFormData = useCallback((field: keyof RegisterFormData) => 
    (value: string) => setFormData(prev => ({ ...prev, [field]: value }))
  , []);

  const clearFieldError = useCallback((field: keyof RegisterFormData) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  // ✅ GESTION DES CONDITIONS
  const handleTermsPress = useCallback(() => {
    Alert.alert('Conditions d\'utilisation', 'Les conditions d\'utilisation seront bientôt disponibles');
  }, []);

  const handlePrivacyPress = useCallback(() => {
    Alert.alert('Politique de confidentialité', 'La politique de confidentialité sera bientôt disponible');
  }, []);

  // ✅ VALIDATION EN TEMPS RÉEL
  const isFormValid = formData.firstName.trim() && 
                     formData.lastName.trim() && 
                     formData.email.trim() && 
                     formData.password && 
                     formData.confirmPassword && 
                     acceptedTerms;

  // ✅ STYLES RESPONSIVES OPTIMISÉS
  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background.primary,
    },
    
    header: {
      height: getSpacing(200, 240, 280),
      justifyContent: 'flex-end' as const,
      paddingBottom: getSpacing(SPACING.lg, SPACING.xl),
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    headerGradient: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    
    backButton: {
      position: 'absolute' as const,
      top: getSpacing(50, 60, 70),
      left: getSpacing(SPACING.lg, SPACING.xl),
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      shadowColor: COLORS.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    
    headerTitle: {
      fontSize: getFontSize(28, 32, 36),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.white,
      textAlign: 'center' as const,
    },
    
    headerSubtitle: {
      fontSize: getFontSize(16, 18, 20),
      color: COLORS.text.white,
      textAlign: 'center' as const,
      opacity: 0.9,
      marginTop: SPACING.sm,
    },
    
    content: {
      flex: 1,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingTop: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    formCard: {
      maxWidth: isTablet ? 480 : undefined,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    
    nameRow: {
      flexDirection: isMobile ? 'column' as const : 'row' as const,
      gap: isMobile ? 0 : SPACING.md,
      marginBottom: isMobile ? 0 : SPACING.md,
    },
    
    nameInput: {
      flex: isMobile ? undefined : 1,
    },
    
    inputContainer: {
      gap: SPACING.md,
    },
    
    termsContainer: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginVertical: getSpacing(SPACING.lg, SPACING.xl),
      paddingHorizontal: SPACING.xs,
    },
    
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: acceptedTerms ? COLORS.primary : COLORS.border.medium,
      backgroundColor: acceptedTerms ? COLORS.primary : 'transparent',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: SPACING.md,
      marginTop: 2,
    },
    
    termsText: {
      flex: 1,
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
      lineHeight: 20,
    },
    
    termsLink: {
      color: COLORS.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    submitButton: {
      marginTop: getSpacing(SPACING.md, SPACING.lg),
    },
    
    footer: {
      paddingVertical: getSpacing(SPACING.lg, SPACING.xl),
      alignItems: 'center' as const,
    },
    
    loginLink: {
      fontSize: getFontSize(14, 16, 18),
      color: COLORS.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      textAlign: 'center' as const,
    },
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* ✅ HEADER AVEC BOUTON RETOUR */}
      <View style={styles.header}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primary_light]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text.white} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Créer un compte</Text>
        <Text style={styles.headerSubtitle}>
          Rejoignez la communauté Eat&Go
        </Text>
      </View>

      {/* ✅ FORMULAIRE D'INSCRIPTION AMÉLIORÉ */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Card style={styles.formCard} variant="elevated" padding="xl">
            {/* ✅ NOMS SUR UNE LIGNE EN TABLETTE */}
            <View style={styles.nameRow}>
              <Input
                label="Prénom"
                placeholder="Jean"
                value={formData.firstName}
                onChangeText={(text) => {
                  updateFormData('firstName')(text);
                  clearFieldError('firstName');
                }}
                error={errors.firstName}
                leftIcon="person-outline"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                style={styles.nameInput}
                required
              />
              
              <Input
                label="Nom"
                placeholder="Dupont"
                value={formData.lastName}
                onChangeText={(text) => {
                  updateFormData('lastName')(text);
                  clearFieldError('lastName');
                }}
                error={errors.lastName}
                leftIcon="person-outline"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                style={styles.nameInput}
                required
              />
            </View>

            <View style={styles.inputContainer}>
              <Input
                label="Email"
                placeholder="votre@email.com"
                value={formData.email}
                onChangeText={(text) => {
                  updateFormData('email')(text);
                  clearFieldError('email');
                }}
                error={errors.email}
                leftIcon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="next"
                required
              />

              <Input
                label="Mot de passe"
                placeholder="••••••••"
                value={formData.password}
                onChangeText={(text) => {
                  updateFormData('password')(text);
                  clearFieldError('password');
                }}
                error={errors.password}
                leftIcon="lock-closed-outline"
                rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowPassword(!showPassword)}
                secureTextEntry={!showPassword}
                helperText="8 caractères min, avec majuscule, minuscule et chiffre"
                returnKeyType="next"
                required
              />

              <Input
                label="Confirmer le mot de passe"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChangeText={(text) => {
                  updateFormData('confirmPassword')(text);
                  clearFieldError('confirmPassword');
                }}
                error={errors.confirmPassword}
                leftIcon="lock-closed-outline"
                rightIcon={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowConfirmPassword(!showConfirmPassword)}
                secureTextEntry={!showConfirmPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                required
              />
            </View>

            {/* ✅ CHECKBOX TERMS AMÉLIORÉ */}
            <View style={styles.termsContainer}>
              <TouchableOpacity 
                style={styles.checkbox}
                onPress={() => setAcceptedTerms(!acceptedTerms)}
                activeOpacity={0.7}
              >
                {acceptedTerms && (
                  <Ionicons name="checkmark" size={12} color={COLORS.text.white} />
                )}
              </TouchableOpacity>
              
              <Text style={styles.termsText}>
                J'accepte les{' '}
                <Text style={styles.termsLink} onPress={handleTermsPress}>
                  conditions d'utilisation
                </Text>
                {' '}et la{' '}
                <Text style={styles.termsLink} onPress={handlePrivacyPress}>
                  politique de confidentialité
                </Text>
              </Text>
            </View>

            {/* ✅ BOUTON D'INSCRIPTION AMÉLIORÉ */}
            <Button
              title="Créer mon compte"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || !isFormValid}
              variant="primary"
              size="lg"
              fullWidth
              style={styles.submitButton}
            />
          </Card>

          {/* ✅ LIEN VERS CONNEXION */}
          <View style={styles.footer}>
            <TouchableOpacity 
              onPress={() => router.push('/(auth)/login')}
              activeOpacity={0.7}
            >
              <Text style={styles.loginLink}>
                Déjà un compte ? Se connecter
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}