import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { SystemBars } from 'react-native-edge-to-edge';
import { useAuth } from '@/contexts/AuthContext';
import { ApiClient } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';
import { Alert as CustomAlert } from '@/components/ui/Alert';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/utils/designSystem';
import { HeaderActionsBar } from '@/components/common/HeaderActions';
import { quickAuthService } from '@/services/quickAuthService';

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

  // ── Reconnexion 1-clic (biométrie + identifiants mémorisés) ──────────────
  // `rememberMe` : choix opt-in de mémoriser les identifiants après login.
  // `hasQuickAuth` : des identifiants sont déjà mémorisés → on affiche le bouton.
  // `savedEmail` : email mémorisé, affiché sous le bouton de reconnexion rapide.
  const [rememberMe, setRememberMe] = useState(false);
  const [hasQuickAuth, setHasQuickAuth] = useState(false);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);

  // ÉTAT POUR L'ALERTE PERSONNALISÉE
  const [customAlert, setCustomAlert] = useState<{
    variant?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);
  
  const { login, googleLogin, appleLogin } = useAuth();

  // ─── Guideline 4.8 (Apple) ────────────────────────────────────────────
  // Sign in with Apple est désormais réellement implémenté
  // (expo-apple-authentication → /api/v1/auth/apple/), en alternative
  // équivalente à Google Sign-In : Google est donc réactivé sur iOS.
  // Le bouton Apple n'est rendu que si le device le supporte (jamais sur
  // Android, ni sans l'entitlement applesignin dans le build).
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleSignInAvailable)
      .catch(() => setAppleSignInAvailable(false));
  }, []);
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
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

  // ── Initialisation reconnexion rapide ────────────────────────────────────
  // Au montage : détecte des identifiants mémorisés, pré-remplit l'email et
  // pré-coche "Se souvenir de moi" pour ne pas perdre le réglage au re-login.
  useEffect(() => {
    (async () => {
      try {
        const enabled = await quickAuthService.isEnabled();
        setHasQuickAuth(enabled);
        setRememberMe(enabled);
        const email = await quickAuthService.getSavedEmail();
        if (email) {
          setSavedEmail(email);
          // Ne pré-remplit que si le champ est encore vide (évite d'écraser une
          // saisie en cours après un remontage).
          setFormData(prev => (prev.email ? prev : { ...prev, email }));
        }
      } catch (e) {
        console.warn('⚠️ Init reconnexion rapide échouée:', e);
      }
    })();
  }, []);

  // VALIDATION
  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<LoginFormData> = {};
    
    // Email validation
    const email = formData.email.trim();
    if (!email) {
      newErrors.email = t('auth.validation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('auth.validation.emailInvalid');
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.password = t('auth.validation.passwordRequired');
    } else if (formData.password.length < 6) {
      newErrors.password = t('auth.validation.passwordMinLength', { min: 6 });
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.email, formData.password, t]);

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
      setErrors(prev => ({ ...prev, email: t('auth.validation.noAccountEmail') }));
      show('error', t('auth.alerts.accountNotFound.title'), t('auth.alerts.accountNotFound.message'));
      return;
    }

    if (
      status === 401 || status === 400 ||
      code === 'INVALID_PASSWORD' || code === 'INVALID_CREDENTIALS' ||
      /no.*active.*account|identifiant.*invalide|invalid.*credential|wrong.*password|invalid.*password|bad.*credentials|mot.*de.*passe.*(incorrect|invalide|erron)|donn.*es.*invalide|erreur.*lors.*connexion/.test(serverMessage)
    ) {
      setErrors(prev => ({ ...prev, email: ' ', password: ' ' }));
      show('error', t('auth.alerts.invalidCredentials.title'), t('auth.alerts.invalidCredentials.message'));
      return;
    }

    if (
      status === 403 ||
      code === 'ACCOUNT_DISABLED' ||
      /compte.*d.sactiv|account.*disabled|acc.s.*refus|permissions.*insuffisantes|profil.*restaurateur.*doit/.test(serverMessage)
    ) {
      show('warning', t('auth.alerts.accessDenied.title'), t('auth.alerts.accessDenied.message'));
      return;
    }

    if (
      status === 429 ||
      code === 'RATE_LIMITED' ||
      /trop.*tentatives|too.*many.*requests|rate.*limit/.test(serverMessage)
    ) {
      show('warning', t('auth.alerts.tooManyAttempts.title'), t('auth.alerts.tooManyAttempts.message'));
      return;
    }

    if (
      code === 'ERR_NETWORK' ||
      code === 'NETWORK_ERROR' ||
      /network.*error|connexion.*impossible|failed.*fetch|r.seau.*indisponible/.test(serverMessage)
    ) {
      show('warning', t('auth.alerts.networkError.title'), t('auth.alerts.networkError.message'));
      return;
    }

    if (
      (typeof status === 'number' && status >= 500) ||
      /erreur.*serveur|service.*indisponible|server.*error|internal.*error/.test(serverMessage)
    ) {
      show('error', t('auth.alerts.serviceUnavailable.title'), t('auth.alerts.serviceUnavailable.message'));
      return;
    }

    show('error', t('auth.alerts.genericError.title'), error?.response?.data?.detail || error?.response?.data?.message || error?.message || t('auth.alerts.genericError.message'));
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

      // ── Mémorisation des identifiants pour la reconnexion 1-clic ─────────
      // Opt-in via "Se souvenir de moi". Stockage Keychain/Keystore
      // (expo-secure-store), lecture future protégée par gate biométrique.
      // Best-effort : un échec de stockage ne doit pas casser le login.
      try {
        if (rememberMe) {
          await quickAuthService.saveCredentials(
            formData.email.trim().toLowerCase(),
            formData.password,
          );
        } else {
          await quickAuthService.clearCredentials();
        }
      } catch (storageError) {
        console.warn('⚠️ Mémorisation des identifiants échouée:', storageError);
      }

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
  }, [formData, login, validateForm, returnTo, rememberMe]);

  // RECONNEXION 1-CLIC — gate biométrique puis login avec identifiants mémorisés
  const handleQuickReconnect = useCallback(async () => {
    setErrors({});
    setLoading(true);
    try {
      const creds = await quickAuthService.quickReconnect();
      // null = annulation utilisateur / biométrie échouée / pas d'identifiants.
      // On reste silencieux : l'utilisateur peut saisir manuellement en dessous.
      if (!creds) return;

      await login({ username: creds.email, password: creds.password });

      // Même override de navigation que handleSubmit si on vient d'un AuthGate.
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
      // Identifiants mémorisés devenus invalides (mot de passe changé côté serveur)
      // → on purge pour ne pas reproposer un 1-clic voué à l'échec.
      const status = error?.response?.status ?? error?.status;
      if (status === 401 || status === 400) {
        await quickAuthService.clearCredentials();
        setHasQuickAuth(false);
        setSavedEmail(null);
        setRememberMe(false);
      }
      handleLoginError(error);
    } finally {
      setLoading(false);
    }
  }, [login, returnTo]);

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
          title: t('auth.alerts.googlePlayUnavailable.title'),
          message: t('auth.alerts.googlePlayUnavailable.message'),
        });
        return;
      }

      setCustomAlert({
        variant: 'error',
        title: t('auth.alerts.googleLoginFailed.title'),
        message: error?.message || t('auth.alerts.genericError.message'),
      });
    } finally {
      setLoading(false);
    }
  }, [googleLogin, returnTo]);

  const handleAppleLogin = useCallback(async () => {
    setLoading(true);
    setErrors({});
    try {
      await appleLogin();

      // ── Override de la navigation si `returnTo` est présent ────────────
      // appleLogin() appelle navigateByRole() (comme login/googleLogin).
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
      // Annulation utilisateur → silencieux (feuille Apple fermée)
      const isCancelled =
        error?.code === 'CANCELLED' ||
        /annul|cancel/i.test(String(error?.message ?? ''));
      if (isCancelled) {
        return;
      }

      setCustomAlert({
        variant: 'error',
        title: t('auth.alerts.appleLoginFailed.title'),
        message: t('auth.alerts.appleLoginFailed.message'),
      });
    } finally {
      setLoading(false);
    }
  }, [appleLogin, returnTo]);

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
        title: t('auth.alerts.sessionExpired.title'),
        message: t('auth.alerts.sessionExpired.message'),
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
      backgroundColor: colors.background,
    },
    
    contentContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    
    header: {
      height: insets.top + getSpacing(
        Math.min(screenHeight * 0.22, 180),
        Math.min(screenHeight * 0.24, 200),
        Math.min(screenHeight * 0.24, 200)
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

    // Boutons thème + langue, ancrés en haut à droite du header (au-dessus du dégradé)
    headerActions: {
      position: 'absolute' as const,
      top: insets.top + getSpacing(SPACING.sm, SPACING.md),
      right: getSpacing(SPACING.lg, SPACING.xl),
      zIndex: 10,
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

    headerSlogan: {
      fontSize: getFontSize(12, 13, 14),
      fontStyle: 'italic' as const,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.secondary,
      textAlign: 'center' as const,
      marginTop: getSpacing(SPACING.sm, SPACING.md),
      letterSpacing: 0.3,
      textShadowColor: 'rgba(0, 0, 0, 0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
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
      color: colors.text.primary,
      textAlign: 'center' as const,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    socialSection: {
      marginVertical: getSpacing(SPACING.md, SPACING.lg),
      gap: SPACING.sm,
    },
    
    socialButton: {
      // Couleurs gérées par le variant "outline" du Button (theme-aware).
      // On ne force plus le fond/bordure ici pour suivre light/dark.
    },
    
    divider: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginVertical: getSpacing(SPACING.md, SPACING.lg),
    },
    
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border.default,
    },
    
    dividerText: {
      fontSize: TYPOGRAPHY.fontSize.sm,
      color: colors.text.secondary,
      paddingHorizontal: SPACING.md,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      backgroundColor: 'transparent',
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

    // Reconnexion 1-clic
    quickAuthSection: {
      marginBottom: getSpacing(SPACING.sm, SPACING.md),
      gap: SPACING.xs,
    },
    quickAuthEmail: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center' as const,
      marginTop: SPACING.xs,
    },

    // Case "Se souvenir de moi"
    rememberRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginTop: SPACING.sm,
      alignSelf: 'flex-start' as const,
      paddingVertical: SPACING.xs,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border.default,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: 'transparent',
    },
    checkboxChecked: {
      backgroundColor: COLORS.secondary,
      borderColor: COLORS.secondary,
    },
    rememberText: {
      fontSize: getFontSize(14, 15, 16),
      color: colors.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    submitButton: {
      // Fond/ombre gérés par le variant "primary" du Button (theme-aware).
      marginTop: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    footer: {
      paddingVertical: getSpacing(SPACING.lg, SPACING.xl),
      paddingBottom: Math.max(insets.bottom, getSpacing(SPACING.lg, SPACING.xl)),
      alignItems: 'center' as const,
      backgroundColor: colors.background,
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
      color: colors.text.primary,
      lineHeight: 18,
    },
  } as const;

  return (
    <View style={styles.container}>
      {/*
        Barres système séparées : le header est navy dans les 2 modes
        → status bar toujours en icônes claires ; le bas de l'écran est
        colors.background → la nav bar suit le thème.
      */}
      <SystemBars
        style={{ statusBar: 'light', navigationBar: isDark ? 'light' : 'dark' }}
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
          colors={isDark
            ? ['#0E1330', '#161E47', '#1E2A78']
            : ['#1E2A78', '#2D3E8F', '#3B4BA3']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {/* Motifs décoratifs */}
        <View style={styles.headerPattern} />
        <View style={styles.headerPattern2} />

        {/* Switch thème + langue, comme sur les espaces client / restaurant */}
        <View style={styles.headerActions}>
          <HeaderActionsBar />
        </View>

        {/* Contenu centré */}
        <View style={styles.headerContent}>
          <View style={styles.logoImageContainer}>
            <Image 
              source={APP_LOGO}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.headerTitle}>{t('auth.welcomeTitle')}</Text>
          <Text style={styles.headerSubtitle}>{t('auth.welcomeSubtitle')}</Text>
          <Text style={styles.headerSlogan}>{t('auth.slogan')}</Text>
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
              <Text style={styles.formTitle}>{t('auth.loginTitle')}</Text>

              {/* Bandeau d'info si on revient d'un AuthGate (returnTo défini) */}
              {returnTo && (
                <View style={styles.returnToBanner}>
                  <Ionicons name="information-circle" size={18} color={COLORS.secondary} />
                  <Text style={styles.returnToBannerText}>
                    {t('auth.resumeOrderPrompt')}
                  </Text>
                </View>
              )}
              
              {/* RECONNEXION 1-CLIC — visible uniquement si identifiants mémorisés */}
              {hasQuickAuth && (
                <View style={styles.quickAuthSection}>
                  <Button
                    title={t('auth.reconnect')}
                    onPress={handleQuickReconnect}
                    loading={loading}
                    disabled={loading}
                    variant="primary"
                    size={isSmallScreen ? 'sm' : (isMobile ? 'md' : 'lg')}
                    fullWidth
                    leftIcon={
                      <Ionicons name="finger-print" size={20} color={COLORS.text.inverse} />
                    }
                  />
                  {savedEmail && (
                    <Text style={styles.quickAuthEmail} numberOfLines={1}>
                      {savedEmail}
                    </Text>
                  )}
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>{t('auth.useAnotherAccount')}</Text>
                    <View style={styles.dividerLine} />
                  </View>
                </View>
              )}

              {/* SOCIAL LOGIN SECTION */}
              <View style={styles.socialSection}>
                <Button
                  title={t('auth.continueWithGoogle')}
                  variant="outline"
                  leftIcon={
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                  }
                  onPress={handleGoogleLogin}
                  style={styles.socialButton}
                  fullWidth
                />

                {/* Sign in with Apple — bouton officiel (HIG), rendu
                    uniquement si le device le supporte (Guideline 4.8) */}
                {appleSignInAvailable && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={
                      isDark
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    }
                    cornerRadius={8}
                    style={{ width: '100%', height: 48 }}
                    onPress={handleAppleLogin}
                  />
                )}
              </View>

              {/* DIVIDER */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('common.or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* FORMULAIRE */}
              <View style={styles.inputContainer}>
                <Input
                  label={t('auth.email')}
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
                  label={t('auth.password')}
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

              {/* SE SOUVENIR DE MOI — opt-in pour la reconnexion 1-clic */}
              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRememberMe(prev => !prev)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && (
                    <Ionicons name="checkmark" size={14} color={COLORS.text.inverse} />
                  )}
                </View>
                <Text style={styles.rememberText}>{t('auth.rememberMe')}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={handleForgotPassword}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotPassword}>
                  {t('auth.forgotPassword')}
                </Text>
              </TouchableOpacity>

              {/* BOUTON DE CONNEXION */}
              <Button
                title={t('auth.signIn')}
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
                {`${t('auth.noAccount')} ${t('auth.signUp')}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}