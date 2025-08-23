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
  const { isMobile, isTablet, getSpacing, getFontSize } = useResponsive();
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
    
    if (error.message?.includes('401')) {
      setErrors({ email: 'Email ou mot de passe incorrect' });
    } else if (error.message?.includes('network')) {
      Alert.alert('Erreur de connexion', 'Vérifiez votre connexion internet');
    } else {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue');
    }
  };

  // ✅ SOUMISSION AVEC FEEDBACK AMÉLIORÉ
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    
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
        Math.min(screenHeight * 0.2, 160), // Mobile - réduit significativement
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
      color: '#FFC845',
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
      
      {/* ✅ HEADER AVEC GRADIENT BLEU ET LOGO UNIQUEMENT */}
      <View style={styles.header}>
        <LinearGradient
          colors={['#1E2A78', '#2563EB', '#3B82F6']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
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
                size="lg"
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