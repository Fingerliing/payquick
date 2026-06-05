import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { ApiClient } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';
import { Alert as CustomAlert } from '@/components/ui/Alert';

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

  // ÉTAT POUR L'ALERTE PERSONNALISÉE
  const [customAlert, setCustomAlert] = useState<{
    variant?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);
  
  const { login, googleLogin } = useAuth();
  const { isMobile, isTablet, isSmallScreen, getSpacing, getFontSize, getResponsiveValue } = useResponsive();
  const insets = useSafeAreaInsets();

  // ── Paramètres d'URL ─────────────────────────────────────────────────────
  // - `reason=session_expired` : déclenche l'alerte de session expirée
  // - `returnTo=<path>` : chemin vers lequel rediriger après connexion réussie.
  //   Utilisé par AuthGateModal pour ramener l'utilisateur au checkout (ou
  //   tout autre écran à l'origine du gate d'authentification).
  const params = useLocalSearchParams<{ reason?: string; returnTo?: string }>();
  const returnTo =
    typeof params.returnTo === 'string' && params.returnTo.trim().length > 0
      ? params.returnTo
      : null;

  // ✅ Empêche handleSessionExpired de rediriger quand on est déjà sur login
  useEffect(() => {
    ApiClient._isOnLoginPage = true;
    return () => { ApiClient._isOnLoginPage = false; };
  }, []);

  // VALIDATION
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

  const handleLoginError = (error: any) => {
    console.error('Login error:', error);

    const status = error?.response?.status ?? error?.status;
    const code = error?.response?.data?.code ?? error?.code;
    const serverMessage = String(
      error?.response?.data?.detail ??
      error?.response?.data?.message ??
      error?.message ??
      ''
    ).toLowerCase();

    const show = (variant: 'success' | 'error' | 'warning' | 'info', title: string, msg: string) =>
      setCustomAlert({ variant, title, message: msg });

    if (
      status === 404 ||
      code === 'USER_NOT_FOUND' ||
      /user.*not.*found|no.*user|aucun.*utilisateur|unknown.*user|ressource.*non.*trouv|no.*account.*found/.test(serverMessage)
    ) {
      setErrors(prev => ({ ...prev, email: 'Aucun compte avec cet email' }));
      show('error', 'Compte introuvable', 'Aucun compte associé à cet email.');
      return;
    }

    if (
      status === 401 || status === 400 ||
      code === 'INVALID_PASSWORD' || code === 'INVALID_CREDENTIALS' ||
      /no.*active.*account|identifiant.*invalide|invalid.*credential|wrong.*password|invalid.*password|bad.*credentials|mot.*de.*passe.*(incorrect|invalide|erron)|donn.*es.*invalide|erreur.*lors.*connexion/.test(serverMessage)
    ) {
      setErrors(prev => ({ ...prev, email: ' ', password: ' ' }));
      show('error', 'Identifiants invalides', 'Email ou mot de passe incorrect. Veuillez réessayer.');
      return;
    }

    if (
      status === 403 ||
      code === 'ACCOUNT_DISABLED' ||
      /compte.*d.sactiv|account.*disabled|acc.s.*refus|permissions.*insuffisantes|profil.*restaurateur.*doit/.test(serverMessage)
    ) {
      show('warning', 'Accès refusé', 'Votre compte n\'est pas autorisé à se connecter. Contactez le support.');
      return;
    }

    if (
      status === 429 ||
      code === 'RATE_LIMITED' ||
      /trop.*tentatives|too.*many.*requests|rate.*limit/.test(serverMessage)
    ) {
      show('warning', 'Trop de tentatives', 'Trop de tentatives de connexion. Réessayez dans quelques instants.');
      return;
    }

    if (
      code === 'ERR_NETWORK' ||
      code === 'NETWORK_ERROR' ||
      /network.*error|connexion.*impossible|failed.*fetch|r.seau.*indisponible/.test(serverMessage)
    ) {
      show('warning', 'Erreur de connexion', 'Vérifiez votre connexion internet et réessayez.');
      return;
    }

    if (
      (typeof status === 'number' && status >= 500) ||
      /erreur.*serveur|service.*indisponible|server.*error|internal.*error/.test(serverMessage)
    ) {
      show('error', 'Service indisponible', 'Le service est temporairement indisponible. Réessayez plus tard.');
      return;
    }

    show('error', 'Erreur de connexion', error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Une erreur est survenue. Veuillez réessayer.');
  };

  // SOUMISSION AVEC FEEDBACK
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    
    setErrors({});
    setLoading(true);
    try {
      await login({
        username: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      // ── Override de la navigation par défaut si `returnTo` est présent ──
      // AuthContext.login() appelle navigateByRole() qui redirige vers
      // /(client) ou /(restaurant). Si l'utilisateur arrive du flow QR
      // → AuthGateModal → login, on doit le ramener à son écran d'origine
      // (typiquement /order/checkout). Notre router.replace s'exécute APRÈS
      // celui de navigateByRole et l'écrase.
      if (returnTo) {
        // Petit délai pour laisser navigateByRole se terminer, évite un flicker
        setTimeout(() => {
          try {
            router.replace(returnTo as any);
          } catch (navError) {
            console.warn('⚠️ Redirection returnTo échouée, fallback:', navError);
          }
        }, 50);
      }
    } catch (error: any) {
      handleLoginError(error);
    } finally {
      setLoading(false);
    }
  }, [formData, login, validateForm, returnTo]);

  // HELPERS
  const updateFormData = useCallback((field: keyof LoginFormData) => 
    (value: string) => setFormData(prev => ({ ...prev, [field]: value }))
  , []);

  const clearFieldError = useCallback((field: keyof LoginFormData) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  // SOCIAL LOGIN HANDLERS
  const handleGoogleLogin = useCallback(async () => {
    setLoading(true);
    setErrors({});
    try {
      await googleLogin();

      // ── Override de la navigation si `returnTo` est présent ────────────
      // googleLogin() appelle navigateByRole() (comme login). Si on vient
      // d'un AuthGate (flow QR → checkout), on doit ramener l'utilisateur
      // à son écran d'origine après la navigation par défaut.
      if (returnTo) {
        setTimeout(() => {
          try {
            router.replace(returnTo as any);
          } catch (navError) {
            console.warn('⚠️ Redirection returnTo échouée, fallback:', navError);
          }
        }, 50);
      }
    } catch (error: any) {
      // Annulation utilisateur → silencieux (l'utilisateur a fermé la modal Google)
      const isCancelled =
        error?.code === 'CANCELLED' ||
        /annul|cancel/i.test(String(error?.message ?? ''));
      if (isCancelled) {
        return;
      }

      // Erreur Play Services (Android sans Google Play installé)
      if (error?.code === 'PLAY_SERVICES_UNAVAILABLE') {
        setCustomAlert({
          variant: 'warning',
          title: 'Google Play indisponible',
          message: 'Google Play Services n\'est pas disponible sur cet appareil.',
        });
        return;
      }

      setCustomAlert({
        variant: 'error',
        title: 'Connexion Google impossible',
        message: error?.message || 'Une erreur est survenue. Veuillez réessayer.',
      });
    } finally {
      setLoading(false);
    }
  }, [googleLogin, returnTo]);

  const handleAppleLogin = useCallback(() => {
    setCustomAlert({
      variant: 'info',
      title: 'Bientôt disponible',
      message: 'La connexion Apple sera disponible prochainement',
    });
  }, []);

  // MOT DE PASSE OUBLIÉ — navigation vers le flux de réinitialisation
  // L'email pré-rempli (s'il y en a un) est passé en param pour gagner du temps
  const handleForgotPassword = useCallback(() => {
    const email = formData.email.trim().toLowerCase();
    router.push({
      pathname: '/(auth)/forgot-password',
      params: email ? { email } : {},
    });
  }, [formData.email]);


  // ✅ Afficher l'alerte "session expirée" une seule fois puis nettoyer le param
  useEffect(() => {
    if (params.reason === 'session_expired') {
      setCustomAlert({
        variant: 'warning',
        title: 'Session expirée',
        message: 'Votre session a expiré. Veuillez vous reconnecter.',
      });
      // Nettoyer le param pour éviter les re-triggers au remontage
      // (returnTo est conservé pour qu'il survive au nettoyage de `reason`)
      router.setParams({ reason: undefined });
    }
  }, [params.reason]);

  // STYLES RESPONSIVES
  const styles = {
    container: {
      flex: 1,
      backgroundColor: '#F9FAFB',
    },
    
    contentContainer: {
      flex: 1,
      backgroundColor: '#F9FAFB',
    },
    
    header: {
      height: insets.top + getSpacing(
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
      top: insets.top + getSpacing(SPACING.md, SPACING.lg),
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
      paddingTop: insets.top + getSpacing(SPACING.md, SPACING.lg),
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
      overflow: 'hidden' as const,
    },
    logoImage: {
      width: '100%' as const,
      height: '100%' as const,
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

    // Positionnement pratique pour afficher l'alerte en haut du contenu
    alertWrapper: {
      position: 'absolute' as const,
      left: 16,
      right: 16,
      top: Math.max(insets.top, 12) + 8,
      zIndex: 50,
    },

    // Bandeau d'information si l'utilisateur arrive d'un AuthGate
    returnToBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      backgroundColor: 'rgba(212, 175, 55, 0.12)',
      borderLeftWidth: 3,
      borderLeftColor: COLORS.secondary,
      padding: 12,
      borderRadius: 8,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    returnToBannerText: {
      flex: 1,
      fontSize: 13,
      color: COLORS.text.primary,
      lineHeight: 18,
    },
  } as const;

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="#1E2A78" 
        translucent={false}
      />

      {/* AFFICHE L'ALERTE PERSONNALISÉE */}
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

        {/* Contenu centré */}
        <View style={styles.headerContent}>
          <View style={styles.logoImageContainer}>
            <Image 
              source={APP_LOGO}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.headerTitle}>Ravis de vous voir</Text>
          <Text style={styles.headerSubtitle}>Connectez-vous pour continuer</Text>
        </View>
      </View>

      {/* CONTENT CONTAINER AVEC KEYBOARD AVOIDING */}
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

              {/* Bandeau d'info si on revient d'un AuthGate (returnTo défini) */}
              {returnTo && (
                <View style={styles.returnToBanner}>
                  <Ionicons name="information-circle" size={18} color={COLORS.secondary} />
                  <Text style={styles.returnToBannerText}>
                    Connectez-vous pour reprendre votre commande là où vous l'aviez laissée.
                  </Text>
                </View>
              )}
              
              {/* SOCIAL LOGIN SECTION */}
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

              {/* DIVIDER */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ou</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* FORMULAIRE */}
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
                onPress={handleForgotPassword}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotPassword}>
                  Mot de passe oublié ?
                </Text>
              </TouchableOpacity>

              {/* BOUTON DE CONNEXION */}
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

          {/* FOOTER */}
          <View style={styles.footer}>
            <TouchableOpacity 
              onPress={() => router.push({
                pathname: '/(auth)/register' as any,
                // Propager returnTo : si l'utilisateur n'a pas de compte
                // et passe par "S'inscrire", il doit revenir au même endroit
                // après création de compte.
                params: returnTo ? { returnTo } : {},
              })}
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