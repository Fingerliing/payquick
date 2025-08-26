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
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

const APP_LOGO = require('@/assets/images/logo.png');
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface LoginFormData {
  email: string;
  password: string;
}

export default function LoginScreen() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<LoginFormData>>({});
  
  const { login } = useAuth();
  const { isMobile, isTablet, isSmallScreen, getSpacing, getFontSize, getResponsiveValue } = useResponsive();
  const insets = useSafeAreaInsets();

  // ✅ VALIDATION AMÉLIORÉE
  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<LoginFormData> = {};
    
    // Email validation
    const email = formData.email.trim();
    if (!email) {
      newErrors.email = 'Email requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Format d\'email invalide';
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.password = 'Mot de passe requis';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Minimum 6 caractères';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.email, formData.password]);

  // ✅ GESTION DES ERREURS AMÉLIORÉE
  const handleLoginError = (error: any) => {
    console.error('Login error:', error);
  
    const status = error?.response?.status ?? error?.status;
    const code = error?.response?.data?.code ?? error?.code;
    const serverMessage = String(
      error?.response?.data?.message ?? error?.message ?? ''
    ).toLowerCase();
  
    const show = (title: string, msg: string) => Alert.alert(title, msg);
  
    // 👤 Aucun utilisateur avec cet email
    if (
      status === 404 ||
      code === 'USER_NOT_FOUND' ||
      /user.*not.*found|no.*user|aucun.*utilisateur|unknown.*user/.test(serverMessage)
    ) {
      setErrors(prev => ({ ...prev, email: 'Aucun utilisateur avec cet email' }));
      show('Email inconnu', 'Aucun utilisateur avec cet email');
      return;
    }
  
    // 🔒 Mauvais mot de passe
    if (
      status === 401 || status === 400 ||
      code === 'INVALID_PASSWORD' || code === 'INVALID_CREDENTIALS' ||
      /wrong.*password|invalid.*password|bad.*credentials|mot.*de.*passe.*(incorrect|invalide|erron)/.test(serverMessage)
    ) {
      setErrors(prev => ({ ...prev, password: 'Mot de passe incorrect' }));
      show('Mot de passe incorrect', 'Veuillez vérifier votre mot de passe.');
      return;
    }
  
    // ⏱️ Trop de tentatives
    if (status === 429 || code === 'RATE_LIMITED') {
      show('Trop de tentatives', 'Réessayez dans quelques instants.');
      return;
    }
  
    // 🌐 Problème réseau
    if (serverMessage.includes('network') || code === 'ERR_NETWORK') {
      show('Erreur de connexion', 'Vérifiez votre connexion internet.');
      return;
    }
  
    // 🛠️ Erreur serveur
    if (typeof status === 'number' && status >= 500) {
      show('Service indisponible', 'Réessayez plus tard.');
      return;
    }
  
    // 🧩 Cas non mappé
    show('Erreur', error?.response?.data?.message || error?.message || 'Une erreur est survenue');
  };

  // ✅ SOUMISSION AVEC FEEDBACK AMÉLIORÉ
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    
    setErrors({});
    setLoading(true);
    try {
      await login({
        username: formData.email.trim().toLowerCase(),
        password: formData.password,
      });
    } catch (error: any) {
      handleLoginError(error);
    } finally {
      setLoading(false);
    }
  }, [formData, login, validateForm]);

  // ✅ HELPERS POUR FORMULAIRE
  const updateFormData = useCallback((field: keyof LoginFormData) => 
    (value: string) => setFormData(prev => ({ ...prev, [field]: value }))
  , []);

  const clearFieldError = useCallback((field: keyof LoginFormData) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  // ✅ SOCIAL LOGIN HANDLERS
  const handleGoogleLogin = useCallback(() => {
    Alert.alert('Bientôt disponible', 'La connexion Google sera disponible prochainement');
  }, []);

  const handleAppleLogin = useCallback(() => {
    Alert.alert('Bientôt disponible', 'La connexion Apple sera disponible prochainement');
  }, []);

  // ✅ STYLES RESPONSIVES OPTIMISÉS AVEC SAFE AREA
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
        Math.min(screenHeight * 0.20, 160),
        Math.min(screenHeight * 0.22, 180),
        Math.min(screenHeight * 0.22, 180)
      ),
      position: 'relative' as const,
      overflow: 'hidden' as const,
    },
    headerGradient: {
      position: 'absolute' as const,
      left: 0, right: 0, top: 0, bottom: 0,
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
    
    logoFallback: {
      width: getSpacing(40, 46, 52),
      height: getSpacing(40, 46, 52),
      borderRadius: getSpacing(20, 23, 26),
      backgroundColor: '#1E2A78',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
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
    
    socialSection: {
      marginVertical: getSpacing(SPACING.md, SPACING.lg),
      gap: SPACING.sm,
    },
    
    socialButton: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1.5,
      borderColor: '#E5E7EB',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    
    divider: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginVertical: getSpacing(SPACING.md, SPACING.lg),
    },
    
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: '#E5E7EB',
    },
    
    dividerText: {
      fontSize: TYPOGRAPHY.fontSize.sm,
      color: '#6B7280',
      paddingHorizontal: SPACING.md,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      backgroundColor: '#F9FAFB',
    },
    
    inputContainer: {
      gap: getSpacing(SPACING.sm, SPACING.md),
    },
    
    forgotPassword: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.secondary,
      textAlign: 'center' as const,
      marginTop: SPACING.sm,
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
    
    registerLink: {
      fontSize: getFontSize(15, 16, 18),
      color: COLORS.secondary,
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
      
      {/* HEADER AVEC LOGO */}
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

        {/* Back (optionnel) */}
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Contenu centré */}
        <View style={styles.headerContent}>
          <View style={styles.logoImageContainer}>
            <View style={styles.logoImageContainer}>
              <Image 
                source={APP_LOGO}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.headerTitle}>Ravis de vous voir</Text>
          <Text style={styles.headerSubtitle}>Connectez-vous pour continuer</Text>
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
              <Text style={styles.formTitle}>Connexion</Text>
              
              {/* ✅ SOCIAL LOGIN SECTION */}
              <View style={styles.socialSection}>
                <Button
                  title="Continuer avec Google"
                  variant="outline"
                  leftIcon={
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                  }
                  onPress={handleGoogleLogin}
                  style={styles.socialButton}
                  fullWidth
                />
                
                {Platform.OS === 'ios' && (
                  <Button
                    title="Continuer avec Apple"
                    variant="outline"
                    leftIcon={
                      <Ionicons name="logo-apple" size={20} color="#000000" />
                    }
                    onPress={handleAppleLogin}
                    style={styles.socialButton}
                    fullWidth
                  />
                )}
              </View>

              {/* ✅ DIVIDER AMÉLIORÉ */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ou</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* ✅ FORMULAIRE AMÉLIORÉ */}
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
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  required
                />
              </View>

              <TouchableOpacity 
                onPress={() => Alert.alert('Récupération', 'Fonctionnalité bientôt disponible')}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotPassword}>
                  Mot de passe oublié ?
                </Text>
              </TouchableOpacity>

              {/* ✅ BOUTON DE CONNEXION AMÉLIORÉ */}
              <Button
                title="Se connecter"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading || !formData.email.trim() || !formData.password}
                variant="primary"
                size={isSmallScreen ? 'sm' : (isMobile ? 'md' : 'lg')}
                fullWidth
                style={styles.submitButton}
              />
            </Card>
          </ScrollView>

          {/* ✅ FOOTER TOUJOURS VISIBLE AVEC SAFE AREA */}
          <View style={styles.footer}>
            <TouchableOpacity 
              onPress={() => router.push('/(auth)/register')}
              activeOpacity={0.7}
            >
              <Text style={styles.registerLink}>
                Pas encore de compte ? S'inscrire
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}