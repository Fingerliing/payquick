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
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { COLORS, TYPOGRAPHY, SPACING } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

const APP_LOGO = require('@/assets/images/logo.png');
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
  const insets = useSafeAreaInsets();

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

  // ✅ STYLES ALIGNÉS AVEC LOGIN
  const styles = {
    container: {
      flex: 1,
      backgroundColor: '#F9FAFB',
      paddingTop: insets.top,
    },
    
    contentContainer: {
      flex: 1,
      backgroundColor: '#F9FAFB',
    },
    
    header: {
      height: getSpacing(
        Math.min(screenHeight * 0.2, 160), // Mobile - aligné avec login
        Math.min(screenHeight * 0.18, 140), // Tablette
        Math.min(screenHeight * 0.15, 120)  // Grande tablette
      ),
      justifyContent: 'center' as const,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      position: 'relative' as const,
      backgroundColor: '#1E2A78',
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
      top: getSpacing(20, 25, 30),
      left: getSpacing(SPACING.lg, SPACING.xl),
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 2,
    },
    
    logoContainer: {
      alignItems: 'center' as const,
      zIndex: 1,
    },
    
    logoImageContainer: {
      width: getSpacing(60, 70, 80),
      height: getSpacing(60, 70, 80),
      borderRadius: getSpacing(30, 35, 40),
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 2,
      borderColor: '#FFC845',
    },
    
    logoImage: {
      width: getSpacing(40, 46, 52),
      height: getSpacing(40, 46, 52),
      borderRadius: getSpacing(20, 23, 26),
    },
    
    logoFallback: {
      width: getSpacing(40, 46, 52),
      height: getSpacing(40, 46, 52),
      borderRadius: getSpacing(20, 23, 26),
      backgroundColor: '#1E2A78',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    scrollViewContainer: {
      flexGrow: 1,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingTop: getSpacing(SPACING.md, SPACING.lg),
    },
    
    formCard: {
      maxWidth: isTablet ? 480 : undefined,
      alignSelf: 'center' as const,
      width: '100%' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    formTitle: {
      fontSize: getFontSize(22, 26, 30),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: '#1E2A78',
      textAlign: 'center' as const,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    nameRow: {
      flexDirection: isMobile ? 'column' as const : 'row' as const,
      gap: isMobile ? getSpacing(SPACING.sm, SPACING.md) : SPACING.md,
      marginBottom: getSpacing(SPACING.sm, SPACING.md),
    },
    
    nameInput: {
      flex: isMobile ? undefined : 1,
    },
    
    inputContainer: {
      gap: getSpacing(SPACING.sm, SPACING.md),
    },
    
    termsContainer: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginVertical: getSpacing(SPACING.md, SPACING.lg),
      paddingHorizontal: SPACING.xs,
    },
    
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: acceptedTerms ? '#1E2A78' : '#D1D5DB',
      backgroundColor: acceptedTerms ? '#1E2A78' : 'transparent',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: SPACING.md,
      marginTop: 2,
    },
    
    termsText: {
      flex: 1,
      fontSize: getFontSize(14, 15, 16),
      color: '#6B7280',
      lineHeight: 20,
    },
    
    termsLink: {
      color: '#FFC845',
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    
    submitButton: {
      marginTop: getSpacing(SPACING.lg, SPACING.xl),
      backgroundColor: '#1E2A78',
      shadowColor: '#1E2A78',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    
    footer: {
      paddingVertical: getSpacing(SPACING.lg, SPACING.xl),
      paddingBottom: Math.max(insets.bottom, getSpacing(SPACING.lg, SPACING.xl)),
      alignItems: 'center' as const,
      backgroundColor: '#F9FAFB',
    },
    
    loginLink: {
      fontSize: getFontSize(15, 16, 18),
      color: '#FFC845',
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      textAlign: 'center' as const,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    
    keyboardAvoid: {
      flex: 1,
    },
  };

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="#1E2A78" 
        translucent={false}
      />
      
      {/* ✅ HEADER AVEC GRADIENT BLEU ET LOGO (ALIGNÉ AVEC LOGIN) */}
      <View style={styles.header}>
        <LinearGradient
          colors={['#1E2A78', '#2563EB', '#3B82F6']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.logoContainer}>
          <View style={styles.logoImageContainer}>
            <Image 
              source={APP_LOGO}
              style={styles.logoImage}
              resizeMode="contain"
              onError={() => {
                console.log('Logo loading failed, using fallback');
              }}
            />
          </View>
        </View>
      </View>

      {/* ✅ CONTENT CONTAINER AVEC KEYBOARD AVOIDING */}
      <KeyboardAvoidingView 
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.contentContainer}>
          <ScrollView 
            contentContainerStyle={styles.scrollViewContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Card style={styles.formCard} variant="elevated" padding="xl">
              <Text style={styles.formTitle}>Créer un compte</Text>
              
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
                    <Ionicons name="checkmark" size={12} color="#FFFFFF" />
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
          </ScrollView>

          {/* ✅ FOOTER TOUJOURS VISIBLE AVEC SAFE AREA */}
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
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}