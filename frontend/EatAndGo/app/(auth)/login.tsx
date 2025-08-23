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
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

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
      // Use email directly as expected by the API
      await login({
        username: formData.email.trim().toLowerCase(),
        password: formData.password,
      });
      // Navigation handled by AuthContext
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

  // ✅ STYLES RESPONSIVES OPTIMISÉS
  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background.primary,
    },
    
    header: {
      height: getSpacing(280, 320, 360),
      justifyContent: 'flex-end' as const,
      paddingBottom: getSpacing(SPACING.xl, SPACING.xxl),
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
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
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    logo: {
      width: getSpacing(64, 80, 96),
      height: getSpacing(64, 80, 96),
      borderRadius: RADIUS.lg,
      backgroundColor: COLORS.text.white,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
      // Ajout d'une ombre subtile
      shadowColor: COLORS.text.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    
    welcomeText: {
      fontSize: getFontSize(32, 36, 40),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.white,
      textAlign: 'center' as const,
      marginBottom: SPACING.sm,
    },
    
    subtitleText: {
      fontSize: getFontSize(16, 18, 20),
      color: COLORS.text.white,
      textAlign: 'center' as const,
      opacity: 0.9,
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
    
    formTitle: {
      fontSize: getFontSize(24, 28, 32),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    socialSection: {
      marginVertical: getSpacing(SPACING.lg, SPACING.xl),
      gap: SPACING.md,
    },
    
    socialButton: {
      backgroundColor: COLORS.surface.secondary,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    
    divider: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginVertical: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: COLORS.border.light,
    },
    
    dividerText: {
      fontSize: TYPOGRAPHY.fontSize.sm,
      color: COLORS.text.tertiary,
      paddingHorizontal: SPACING.md,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    inputContainer: {
      gap: SPACING.md,
    },
    
    forgotPassword: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.primary,
      textAlign: 'center' as const,
      marginTop: SPACING.md,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    submitButton: {
      marginTop: getSpacing(SPACING.xl, SPACING.xxl),
    },
    
    footer: {
      paddingVertical: getSpacing(SPACING.lg, SPACING.xl),
      alignItems: 'center' as const,
    },
    
    registerLink: {
      fontSize: getFontSize(14, 16, 18),
      color: COLORS.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      textAlign: 'center' as const,
    },
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* ✅ HEADER AVEC GRADIENT MODERNE */}
      <View style={styles.header}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primary_light]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Ionicons 
              name="restaurant" 
              size={getSpacing(32, 40, 48)} 
              color={COLORS.primary} 
            />
          </View>
          
          <Text style={styles.welcomeText}>Eat&Go</Text>
          <Text style={styles.subtitleText}>
            Commandez en toute simplicité
          </Text>
        </View>
      </View>

      {/* ✅ CONTENT SCROLLABLE RESPONSIVE */}
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
            <Text style={styles.formTitle}>Connexion</Text>
            
            {/* ✅ SOCIAL LOGIN SECTION */}
            <View style={styles.socialSection}>
              <Button
                title="Continuer avec Google"
                variant="outline"
                leftIcon={
                  <Ionicons name="logo-google" size={20} color={COLORS.text.primary} />
                }
                onPress={handleGoogleLogin}
                style={styles.socialButton}
                fullWidth
              />
              
              <Button
                title="Continuer avec Apple"
                variant="outline"
                leftIcon={
                  <Ionicons name="logo-apple" size={20} color={COLORS.text.primary} />
                }
                onPress={handleAppleLogin}
                style={styles.socialButton}
                fullWidth
              />
            </View>

            {/* ✅ DIVIDER */}
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

          {/* ✅ FOOTER RESPONSIVE */}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}