import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS, RADIUS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';
import { legalService } from '@/services/legalService';
import { Alert as CustomAlert } from '@/components/ui/Alert';
import { ValidationUtils } from '@/utils/validators';

const APP_LOGO = require('@/assets/images/logo.png');
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Types correspondant au backend Django
interface RegisterFormData {
  username: string; // Email utilisé comme username
  password: string;
  nom: string; // Nom complet
  role: 'client' | 'restaurateur';
  telephone: string; // Pour les clients
  siret: string; // Pour les restaurateurs
}

interface FormErrors {
  username?: string;
  password?: string;
  nom?: string;
  telephone?: string;
  siret?: string;
  general?: string;
}

export default function RegisterScreen() {
  const [formData, setFormData] = useState<RegisterFormData>({
    username: '',
    password: '',
    nom: '',
    role: 'client',
    telephone: '',
    siret: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | undefined>(undefined);

  // ✅ état pour l'alerte personnalisée
  const [customAlert, setCustomAlert] = useState<{
    variant?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);
  
  const { register, login } = useAuth();
  const { isMobile, isTablet, isSmallScreen, getSpacing, getFontSize, getResponsiveValue } = useResponsive();
  const insets = useSafeAreaInsets();

  // Validation selon les règles Django
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    let hasTermsError = false;
  
    // Validation email (username)
    const email = formData.username.trim();
    if (!email) {
      newErrors.username = 'Email requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.username = 'Format d\'email invalide';
    }
  
    // Validation nom (minimum 2 caractères)
    if (!formData.nom.trim()) {
      newErrors.nom = 'Nom requis';
    } else if (formData.nom.trim().length < 2) {
      newErrors.nom = 'Minimum 2 caractères';
    }
  
    // Validation mot de passe renforcée
    if (!formData.password) {
      newErrors.password = 'Mot de passe requis';
    } else {
      const passwordValidation = ValidationUtils.isStrongPassword(formData.password, {
        username: formData.username.trim(),
        nom: formData.nom.trim(),
      });
      if (!passwordValidation.isValid) {
        newErrors.password = passwordValidation.errors[0]; // Affiche la première erreur
      }
    }
  
    // Validation selon le rôle
    if (formData.role === 'client') {
      if (!formData.telephone.trim()) {
        newErrors.telephone = 'Téléphone requis pour les clients';
      }
    } else if (formData.role === 'restaurateur') {
      if (!formData.siret.trim()) {
        newErrors.siret = 'SIRET requis pour les restaurateurs';
      } else if (!/^\d{14}$/.test(formData.siret.trim())) {
        newErrors.siret = 'SIRET doit contenir exactement 14 chiffres';
      }
    }
  
    // Validation de l'acceptation des conditions (obligatoire)
    if (!acceptedTerms) {
      hasTermsError = true;
      setTermsError('Vous devez accepter les conditions pour vous inscrire');
    } else {
      setTermsError(undefined);
    }
  
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && !hasTermsError;
  }, [formData, acceptedTerms]);
  
  const handleRegistrationError = (error: any) => {
    console.error('Registration error:', error);
    
    if (error.response?.data) {
      const backendErrors = error.response.data;
      const newErrors: FormErrors = {};
      
      // Mapper les erreurs du backend
      if (backendErrors.username) {
        newErrors.username = Array.isArray(backendErrors.username) 
          ? backendErrors.username[0] 
          : backendErrors.username;
      }
      if (backendErrors.siret) {
        newErrors.siret = Array.isArray(backendErrors.siret) 
          ? backendErrors.siret[0] 
          : backendErrors.siret;
      }
      if (backendErrors.telephone) {
        newErrors.telephone = Array.isArray(backendErrors.telephone) 
          ? backendErrors.telephone[0] 
          : backendErrors.telephone;
      }
      
      setErrors(newErrors);

      // Message général si fourni
      if (backendErrors.non_field_errors || backendErrors.detail) {
        setCustomAlert({
          variant: 'error',
          title: 'Erreur',
          message: String(backendErrors.non_field_errors?.[0] || backendErrors.detail),
        });
      }
    } else {
      setCustomAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Une erreur est survenue lors de l\'inscription',
      });
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
  
    setLoading(true);
    try {  
      await register({
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
        nom: formData.nom.trim(),
        role: formData.role,
        telephone: formData.role === 'client' ? formData.telephone.trim() : '',
        siret: formData.role === 'restaurateur' ? formData.siret.trim() : '',
      });

      await login({
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
      });

      // Enregistrer le consentement légal
      try {
        await legalService.recordConsent({
          terms_version: '1.0.0',
          privacy_version: '1.0.0',
          consent_date: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Erreur lors de l\'enregistrement du consentement:', error);
      }

      router.replace('/');
    } catch (error: any) {
      handleRegistrationError(error);
    } finally {
      setLoading(false);
    }
  }, [formData, register, login, validateForm]);
  const updateFormData = useCallback((field: keyof RegisterFormData) => 
    (value: string) => {
      setFormData(prev => ({ ...prev, [field]: value }));
      // Clear error when user starts typing
      if (errors[field as keyof FormErrors]) {
        setErrors(prev => ({ ...prev, [field]: undefined }));
      }
    }
  , [errors]);

  const handleRoleChange = useCallback((newRole: 'client' | 'restaurateur') => {
    setFormData(prev => ({ 
      ...prev, 
      role: newRole,
      // Clear role-specific fields when switching
      telephone: newRole === 'restaurateur' ? '' : prev.telephone,
      siret: newRole === 'client' ? '' : prev.siret,
    }));
    // Clear role-specific errors
    setErrors(prev => ({ ...prev, telephone: undefined, siret: undefined }));
  }, []);

  const isFormValid = formData.username.trim() &&
                      formData.nom.trim() &&
                      formData.password &&
                      ((formData.role === 'client' && formData.telephone.trim()) ||
                      (formData.role === 'restaurateur' && formData.siret.trim()));

  // Utilisation du système responsive existant
  const headerHeight = getResponsiveValue(
    screenHeight < 700 ? 160 : Math.min(screenHeight * 0.22, 200),
    Math.min(screenHeight * 0.30, 280),
    Math.min(screenHeight * 0.30, 280)
  );

  // Réduction fine des paddings sur mobile
  const roleButtonVPadMobile = isSmallScreen ? SPACING.xs : SPACING.sm;
  const roleButtonHPadMobile = isSmallScreen ? SPACING.md : SPACING.lg;

  // Styles avec votre système de design
  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
      paddingTop: insets.top,
    },
    
    contentContainer: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    
    header: {
      height: headerHeight,
      position: 'relative' as const,
      overflow: 'hidden' as const,
    },
    
    headerGradient: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    
    headerPattern: {
      position: 'absolute' as const,
      right: getResponsiveValue(-40, -50, -60),
      top: getResponsiveValue(-20, -25, -30),
      width: getResponsiveValue(120, 150, 180),
      height: getResponsiveValue(120, 150, 180),
      borderRadius: getResponsiveValue(60, 75, 90),
      backgroundColor: 'rgba(212, 175, 55, 0.1)',
      transform: [{ rotate: '45deg' }],
    },
    
    headerPattern2: {
      position: 'absolute' as const,
      left: getResponsiveValue(-40, -50, -60),
      bottom: getResponsiveValue(-30, -35, -40),
      width: getResponsiveValue(100, 120, 140),
      height: getResponsiveValue(100, 120, 140),
      borderRadius: getResponsiveValue(50, 60, 70),
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      transform: [{ rotate: '30deg' }],
    },
    
    backButton: {
      position: 'absolute' as const,
      top: getSpacing(SPACING.md, SPACING.lg),
      left: getSpacing(SPACING.lg, SPACING.xl),
      width: 44,
      height: 44,
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 10,
      shadowColor: 'rgba(0, 0, 0, 0.2)',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 3,
    },
    
    headerContent: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingTop: getSpacing(SPACING.md, SPACING.lg),
      zIndex: 1,
    },
    
    logoContainer: {
      alignItems: 'center' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    logoImageContainer: {
      width: getResponsiveValue(64, 72, 80),
      height: getResponsiveValue(64, 72, 80),
      borderRadius: RADIUS.full,
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 2,
      borderColor: COLORS.secondary,
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    
    logoImage: {
      width: getResponsiveValue(40, 44, 48),
      height: getResponsiveValue(40, 44, 48),
      borderRadius: RADIUS.full,
    },
    
    headerTitle: {
      fontSize: getFontSize(TYPOGRAPHY.fontSize['2xl'], TYPOGRAPHY.fontSize['3xl'], TYPOGRAPHY.fontSize['4xl']),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.inverse,
      textAlign: 'center' as const,
      marginBottom: getSpacing(SPACING.xs, SPACING.sm),
      textShadowColor: 'rgba(0, 0, 0, 0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    
    headerSubtitle: {
      fontSize: getFontSize(TYPOGRAPHY.fontSize.sm, TYPOGRAPHY.fontSize.base),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center' as const,
      paddingHorizontal: getSpacing(SPACING.sm, SPACING.md),
    },
    
    scrollViewContainer: {
      flexGrow: 1,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingTop: getSpacing(SPACING.lg, SPACING.xl),
      paddingBottom: getSpacing(SPACING.xl, SPACING.xxl),
    },
    
    formCard: {
      maxWidth: getResponsiveValue(undefined, 480, 520),
      alignSelf: 'center' as const,
      width: '100%' as const,
      borderRadius: RADIUS.card,
      backgroundColor: COLORS.surface.primary,
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 8,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      padding: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    formTitle: {
      fontSize: getFontSize(TYPOGRAPHY.fontSize.xl, TYPOGRAPHY.fontSize['2xl']),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      textAlign: 'center' as const,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    roleSelector: {
      marginBottom: getSpacing(SPACING.xl, SPACING.xxl),
    },
    
    roleSelectorLabel: {
      fontSize: getFontSize(TYPOGRAPHY.fontSize.lg, TYPOGRAPHY.fontSize.xl),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.primary,
      textAlign: 'center' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    roleButtons: {
      flexDirection: 'row' as const,
      backgroundColor: COLORS.neutral[100],
      borderRadius: RADIUS.lg,
      padding: 4,
      gap: 4,
    },
    
    roleButton: {
      flex: 1,
      paddingVertical: getSpacing(roleButtonVPadMobile, SPACING.lg),
      paddingHorizontal: getSpacing(roleButtonHPadMobile, SPACING.xl),
      minHeight: getResponsiveValue(40, 50, 50),
      borderRadius: getResponsiveValue(RADIUS.sm, RADIUS.md, RADIUS.md),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    roleButtonText: {
      fontSize: getFontSize(TYPOGRAPHY.fontSize.sm, TYPOGRAPHY.fontSize.lg),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.secondary,
    },
    
    roleButtonActive: {
      backgroundColor: COLORS.primary,
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    
    roleButtonTextActive: {
      color: COLORS.text.inverse,
    },
    
    inputContainer: {
      gap: getSpacing(SPACING.md, SPACING.lg),
    },
    
    termsContainer: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginVertical: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: RADIUS.sm,
      borderWidth: 2,
      borderColor: acceptedTerms ? COLORS.primary : COLORS.border.medium,
      backgroundColor: acceptedTerms ? COLORS.primary : 'transparent',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getSpacing(SPACING.sm, SPACING.md),
      marginTop: 2,
    },
    
    termsText: {
      flex: 1,
      fontSize: getFontSize(TYPOGRAPHY.fontSize.sm, TYPOGRAPHY.fontSize.base),
      color: COLORS.text.secondary,
      lineHeight: 20,
    },
    
    termsLink: {
      color: COLORS.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    
    submitButton: {
      marginTop: getSpacing(SPACING.xl, SPACING.xxl),
      backgroundColor: COLORS.primary,
      borderRadius: RADIUS.button,
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    
    footer: {
      paddingVertical: getSpacing(SPACING.lg, SPACING.xl),
      paddingBottom: Math.max(insets.bottom + getSpacing(SPACING.sm), getSpacing(SPACING.lg)),
      alignItems: 'center' as const,
      backgroundColor: COLORS.background,
    },
    
    loginLink: {
      fontSize: getFontSize(TYPOGRAPHY.fontSize.base, TYPOGRAPHY.fontSize.lg),
      color: COLORS.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      textAlign: 'center' as const,
      paddingVertical: getSpacing(SPACING.md, SPACING.lg),
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    keyboardAvoid: {
      flex: 1,
    },

    // Positionnement de l'alerte en overlay en haut de l'écran
    alertWrapper: {
      position: 'absolute' as const,
      left: 16,
      right: 16,
      top: Math.max(insets.top, 12) + 8,
      zIndex: 50,
    },
  } as const;

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="#1E2A78" 
        translucent={false}
      />

      {/* ✅ Alerte personnalisée */}
      {customAlert && (
        <View style={styles.alertWrapper}>
          <CustomAlert
            variant={customAlert.variant}
            title={customAlert.title}
            message={customAlert.message}
            onDismiss={() => setCustomAlert(null)}
            autoDismiss
          />
        </View>
      )}
      
      {/* Header élégant avec motifs décoratifs */}
      <View style={styles.header}>
        <LinearGradient
          colors={['#1E2A78', '#2D3E8F', '#3B4BA3']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        {/* Motifs décoratifs */}
        <View style={styles.headerPattern} />
        <View style={styles.headerPattern2} />
        
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <View style={styles.logoImageContainer}>
              <Image 
                source={APP_LOGO}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.headerTitle}>Rejoignez-nous</Text>
          <Text style={styles.headerSubtitle}>Créez votre compte en quelques clics</Text>
        </View>
      </View>

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
            <View style={styles.formCard}>
                <Text style={styles.formTitle}>Créer un compte</Text>
                
                {/* Sélecteur de rôle élégant */}
                <View style={styles.roleSelector}>
                  <Text style={styles.roleSelectorLabel}>Je suis :</Text>
                  <View style={styles.roleButtons}>
                    <Pressable
                      style={[
                        styles.roleButton,
                        formData.role === 'client' && styles.roleButtonActive
                      ]}
                      onPress={() => handleRoleChange('client')}
                    >
                      <Text style={[
                        styles.roleButtonText,
                        formData.role === 'client' && styles.roleButtonTextActive
                      ]}>
                        Client
                      </Text>
                    </Pressable>
                    
                    <Pressable
                      style={[
                        styles.roleButton,
                        formData.role === 'restaurateur' && styles.roleButtonActive
                      ]}
                      onPress={() => handleRoleChange('restaurateur')}
                    >
                      <Text style={[
                        styles.roleButtonText,
                        formData.role === 'restaurateur' && styles.roleButtonTextActive
                      ]}>
                        Restaurateur
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Input
                    label="Email"
                    placeholder="votre@email.com"
                    value={formData.username}
                    onChangeText={updateFormData('username')}
                    error={errors.username}
                    leftIcon="mail-outline"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    returnKeyType="next"
                    required
                  />

                  <Input
                    label="Nom complet"
                    placeholder="Jean Dupont"
                    value={formData.nom}
                    onChangeText={updateFormData('nom')}
                    error={errors.nom}
                    leftIcon="person-outline"
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                    required
                  />

                  <Input
                    label="Mot de passe"
                    placeholder="••••••••"
                    value={formData.password}
                    onChangeText={updateFormData('password')}
                    error={errors.password}
                    leftIcon="lock-closed-outline"
                    rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
                    onRightIconPress={() => setShowPassword(!showPassword)}
                    secureTextEntry={!showPassword}
                    helperText={"Minimum 10 caractères\nUne majuscule et une minuscule\nUn chiffre\nUn caractère spécial (!@#$%...)\nDifférent de votre adresse email"}
                    returnKeyType="next"
                    required
                  />

                  {/* Champs conditionnels selon le rôle */}
                  {formData.role === 'client' && (
                    <Input
                      label="Téléphone"
                      placeholder="06 12 34 56 78"
                      value={formData.telephone}
                      onChangeText={updateFormData('telephone')}
                      error={errors.telephone}
                      leftIcon="call-outline"
                      keyboardType="phone-pad"
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                      required
                    />
                  )}

                  {formData.role === 'restaurateur' && (
                    <Input
                      label="SIRET"
                      placeholder="12345678901234"
                      value={formData.siret}
                      onChangeText={updateFormData('siret')}
                      error={errors.siret}
                      leftIcon="business-outline"
                      keyboardType="number-pad"
                      helperText="14 chiffres exactement"
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                      required
                    />
                  )}
                </View>

                {/* Checkbox des conditions */}
                <View>
                  <TouchableOpacity
                    style={styles.termsContainer}
                    onPress={() => {
                      setAcceptedTerms(!acceptedTerms);
                      if (!acceptedTerms) setTermsError(undefined);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      styles.checkbox,
                      termsError ? { borderColor: COLORS.error || '#E53E3E' } : {}
                    ]}>
                      {acceptedTerms && (
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      )}
                    </View>

                    <Text style={styles.termsText}>
                      J'accepte les{' '}
                      <Text
                        style={styles.termsLink}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push('/(legal)/terms');
                        }}
                      >
                        conditions d'utilisation
                      </Text>
                      {' '}et la{' '}
                      <Text
                        style={styles.termsLink}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push('/(legal)/privacy');
                        }}
                      >
                        politique de confidentialité
                      </Text>
                      {' '}<Text style={{ color: COLORS.error || '#E53E3E' }}>*</Text>
                    </Text>
                  </TouchableOpacity>

                  {termsError && (
                    <Text style={{
                      color: COLORS.error || '#E53E3E',
                      fontSize: 12,
                      marginTop: -8,
                      marginBottom: 4,
                      marginLeft: 32,
                    }}>
                      {termsError}
                    </Text>
                  )}
                </View>

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
              </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity 
              onPress={() => router.push('/(auth)/login')}
              activeOpacity={0.8}
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
