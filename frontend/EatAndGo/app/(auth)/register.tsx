import React, { useState, useCallback, useRef } from 'react';
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
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert as CustomAlert } from '@/components/ui/Alert';
import { API_BASE_URL } from '@/constants/config';
import { useTranslation } from 'react-i18next';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
  useAppTheme,
} from '@/utils/designSystem';

const APP_LOGO = require('@/assets/images/logo.png');
const { width: screenWidth } = Dimensions.get('window');
const API_URL = `${API_BASE_URL}/api/v1`;

// Gradient bleu charte : nuit → principal (cohérent avec verify-email)
const GRADIENT: [string, string, string] = [
  COLORS.variants.primary[900], // '#0D1629'
  COLORS.variants.primary[700], // '#15204E'
  COLORS.primary,               // '#1E2A78'
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface RegisterFormData {
  username:  string;
  password:  string;
  nom:       string;
  role:      'client' | 'restaurateur';
  telephone: string;
  siret:     string;
}

interface FormErrors {
  username?:  string;
  password?:  string;
  nom?:       string;
  telephone?: string;
  siret?:     string;
}

// ─── Composant ────────────────────────────────────────────────────────────────
export default function RegisterScreen() {
  const [formData, setFormData] = useState<RegisterFormData>({
    username: '', password: '', nom: '', role: 'client', telephone: '', siret: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [errors, setErrors]             = useState<FormErrors>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError]     = useState<string | undefined>(undefined);
  const [customAlert, setCustomAlert]   = useState<{
    variant?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  const insets     = useSafeAreaInsets();
  const screenType = useScreenType();
  const scrollViewRef = useRef<ScrollView>(null);
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  // Dégradé : navy de marque en clair, bleu nuit profond en dark.
  const gradientColors = (isDark
    ? ['#070B18', '#0F1528', '#161D33']
    : GRADIENT) as [string, string, string];

  // ── Paramètre `returnTo` ───────────────────────────────────────────────────
  // Si l'utilisateur arrive depuis un AuthGateModal (parcours QR → menu →
  // checkout → "Créer un compte"), on doit le ramener à son écran d'origine
  // une fois la vérification email terminée. On propage simplement à
  // verify-email qui appellera router.replace(returnTo) après succès.
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo =
    typeof params.returnTo === 'string' && params.returnTo.trim().length > 0
      ? params.returnTo
      : null;

  // Raccourci responsive numérique
  const sp = (token: { mobile: number; tablet: number; desktop: number }): number =>
    getResponsiveValue(token, screenType);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    let hasTermsError = false;

    const email = formData.username.trim();
    if (!email) {
      newErrors.username = t('auth.register.errors.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.username = t('errors.invalidEmail');
    }

    if (!formData.password) {
      newErrors.password = t('auth.register.errors.passwordRequired');
    } else if (formData.password.length < 8) {
      newErrors.password = t('auth.register.errors.passwordMin');
    }

    if (!formData.nom.trim()) {
      newErrors.nom = t('auth.register.errors.nameRequired');
    }

    if (formData.role === 'client') {
      if (!formData.telephone.trim()) {
        newErrors.telephone = t('auth.register.errors.phoneRequired');
      } else if (!/^(\+33|0)[1-9](\d{8})$/.test(formData.telephone.replace(/\s/g, ''))) {
        newErrors.telephone = t('auth.register.errors.phoneInvalid');
      }
    } else {
      if (!formData.siret.trim()) {
        newErrors.siret = t('auth.register.errors.siretRequired');
      } else if (!/^\d{14}$/.test(formData.siret.replace(/\s/g, ''))) {
        newErrors.siret = t('auth.register.errors.siretInvalid');
      }
    }

    if (!acceptedTerms) {
      hasTermsError = true;
      setTermsError(t('auth.register.errors.acceptTerms'));
    } else {
      setTermsError(undefined);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && !hasTermsError;
  }, [formData, acceptedTerms]);

  // ── Gestion erreurs backend ────────────────────────────────────────────────
  const handleRegistrationError = (error: any) => {
    const backendErrors = error?.response?.data;
    if (backendErrors && typeof backendErrors === 'object') {
      const newErrors: FormErrors = {};
      if (backendErrors.username)  newErrors.username  = [backendErrors.username].flat()[0];
      if (backendErrors.siret)     newErrors.siret     = [backendErrors.siret].flat()[0];
      if (backendErrors.telephone) newErrors.telephone = [backendErrors.telephone].flat()[0];
      setErrors(newErrors);
      const msg = backendErrors.error || backendErrors.non_field_errors?.[0] || backendErrors.detail;
      if (msg) setCustomAlert({ variant: 'error', title: t('common.error'), message: String(msg) });
    } else {
      setCustomAlert({
        variant: 'error',
        title: t('common.error'),
        message: error?.message || t('auth.register.errors.generic'),
      });
    }
  };

  // ── Soumission (étape 1 : initiate) ───────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    setLoading(true);
    setCustomAlert(null);
    try {
      const payload = {
        username:  formData.username.trim().toLowerCase(),
        password:  formData.password,
        nom:       formData.nom.trim(),
        role:      formData.role,
        telephone: formData.role === 'client' ? formData.telephone.trim() : '',
        siret:     formData.role === 'restaurateur' ? formData.siret.trim() : '',
      };

      const response = await fetch(`${API_URL}/auth/register/initiate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        const err = new Error(data.error || data.message || 'Erreur lors de l\'inscription');
        (err as any).response = { status: response.status, data };
        handleRegistrationError(err);
        return;
      }

      // Le consentement légal est enregistré à l'étape 2 (verify-email),
      // une fois le compte créé et le token JWT disponible.

      router.push({
        pathname: '/(auth)/verify-email',
        params: {
          registration_id: data.registration_id,
          email_masked:    data.email ?? '',
          expires_in:      String(data.expires_in ?? 600),
          // Propager returnTo pour redirection post-vérification
          ...(returnTo ? { returnTo } : {}),
        },
      });
    } catch (error: any) {
      handleRegistrationError(error);
    } finally {
      setLoading(false);
    }
  }, [formData, validateForm, returnTo]);

  // ── Helpers formulaire ─────────────────────────────────────────────────────
  const updateFormData = useCallback(
    (field: keyof RegisterFormData) => (value: string) => {
      setFormData(prev => ({ ...prev, [field]: value }));
      if (errors[field as keyof FormErrors]) {
        setErrors(prev => ({ ...prev, [field]: undefined }));
      }
    },
    [errors],
  );

  const handleRoleChange = useCallback((newRole: 'client' | 'restaurateur') => {
    setFormData(prev => ({
      ...prev,
      role:      newRole,
      telephone: newRole === 'restaurateur' ? '' : prev.telephone,
      siret:     newRole === 'client'       ? '' : prev.siret,
    }));
  }, []);

  // ── Styles (design system uniquement) ─────────────────────────────────────
  const styles = StyleSheet.create({
    gradient:  { flex: 1 },
    container: { flex: 1 },

    contentContainer: {
      flex: 1,
      paddingTop:    insets.top,
      paddingBottom: insets.bottom,
    },
    scrollViewContainer: {
      flexGrow: 1,
      paddingHorizontal: sp(SPACING.container),
      paddingVertical:   sp(SPACING['2xl']),
    },

    // Logo
    logoContainer: {
      alignItems:    'center',
      marginBottom:  sp(SPACING.xl),
      paddingTop:    sp(SPACING.md),
    },
    logoHalo: {
      width:           screenWidth * 0.26,
      height:          screenWidth * 0.26,
      borderRadius:    screenWidth * 0.13,
      backgroundColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth:     1,
      borderColor:     `${COLORS.secondary}50`,
      alignItems:      'center',
      justifyContent:  'center',
      marginBottom:    sp(SPACING.md),
      shadowColor:     COLORS.secondary,
      shadowOffset:    { width: 0, height: 0 },
      shadowOpacity:   0.35,
      shadowRadius:    24,
      elevation:       8,
    },
    logoBadge: {
      width:           screenWidth * 0.20,
      height:          screenWidth * 0.20,
      borderRadius:    screenWidth * 0.10,
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
      borderWidth:     1.5,
      borderColor:     'rgba(255, 255, 255, 0.25)',
      alignItems:      'center',
      justifyContent:  'center',
      overflow:        'hidden',
    },
    logo: {
      width:  screenWidth * 0.20,
      height: screenWidth * 0.20,
    },
    logoTagline: {
      fontSize:      sp(TYPOGRAPHY.fontSize.sm),
      fontWeight:    TYPOGRAPHY.fontWeight.medium,
      color:         COLORS.secondary,             // or de la charte
      letterSpacing: 2,
      textTransform: 'uppercase',
    },

    // Card formulaire
    formCard: {
      backgroundColor: colors.surface,
      borderRadius:    BORDER_RADIUS['3xl'],
      padding:         sp(SPACING.xl),
      ...SHADOWS.card,
    },
    formTitle: {
      fontSize:     sp(TYPOGRAPHY.fontSize.xl),
      fontWeight:   TYPOGRAPHY.fontWeight.bold,
      color:        colors.text.primary,
      marginBottom: sp(SPACING.lg),
      textAlign:    'center',
    },
    alertStyle: {
      marginBottom: sp(SPACING.md),
    },

    // Bandeau d'info si on revient d'un AuthGate
    returnToBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(212, 175, 55, 0.12)',
      borderLeftWidth: 3,
      borderLeftColor: colors.secondary,
      padding: sp(SPACING.sm),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: sp(SPACING.md),
    },
    returnToBannerText: {
      flex: 1,
      fontSize: sp(TYPOGRAPHY.fontSize.xs),
      color: colors.text.primary,
      lineHeight: sp(TYPOGRAPHY.fontSize.xs) * TYPOGRAPHY.lineHeight.relaxed,
    },

    // Sélecteur de rôle
    roleSelector: {
      marginBottom: sp(SPACING.lg),
    },
    roleSelectorLabel: {
      fontSize:     sp(TYPOGRAPHY.fontSize.sm),
      fontWeight:   TYPOGRAPHY.fontWeight.medium,
      color:        colors.text.secondary,
      marginBottom: sp(SPACING.sm),
    },
    roleButtons: {
      flexDirection: 'row',
      gap: sp(SPACING.sm),
    },
    roleButton: {
      flex:            1,
      paddingVertical: sp(SPACING.sm),
      borderRadius:    BORDER_RADIUS.xl,
      borderWidth:     1.5,
      borderColor:     colors.border.default,
      alignItems:      'center',
      backgroundColor: colors.background,
    },
    roleButtonActive: {
      borderColor:     colors.primary,
      backgroundColor: colors.variants.primary[50],
    },
    roleButtonText: {
      fontSize:   sp(TYPOGRAPHY.fontSize.sm),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color:      colors.text.light,
    },
    roleButtonTextActive: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color:      colors.primary,
    },

    // Inputs
    inputContainer: {
      gap:          sp(SPACING.xs),
      marginBottom: sp(SPACING.md),
    },
    passwordContainer: {
      position: 'relative',
    },
    passwordToggle: {
      position: 'absolute',
      right:    12,
      top:      38,
      padding:  4,
    },
    passwordHintRow: {
      flexDirection: 'row',
      alignItems:    'flex-start',
      gap:           4,
      marginTop:     4,
      paddingHorizontal: 2,
    },
    passwordHintText: {
      flex:       1,
      fontSize:   sp(TYPOGRAPHY.fontSize.xs),
      color:      colors.text.light,
      lineHeight: sp(TYPOGRAPHY.fontSize.xs) * TYPOGRAPHY.lineHeight.relaxed,
    },

    // CGU
    termsRow: {
      flexDirection: 'row',
      alignItems:    'flex-start',
      gap:           sp(SPACING.sm),
      marginBottom:  sp(SPACING.xs),
    },
    checkbox: {
      width:           20,
      height:          20,
      borderRadius:    BORDER_RADIUS.sm,
      borderWidth:     1.5,
      borderColor:     colors.border.dark,
      alignItems:      'center',
      justifyContent:  'center',
      marginTop:       1,
      flexShrink:      0,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor:     colors.primary,
    },
    termsText: {
      flex:       1,
      fontSize:   sp(TYPOGRAPHY.fontSize.sm),
      color:      colors.text.secondary,
      lineHeight: sp(TYPOGRAPHY.fontSize.sm) * TYPOGRAPHY.lineHeight.relaxed,
    },
    termsLink: {
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color:      colors.primary,
    },
    termsError: {
      fontSize:    sp(TYPOGRAPHY.fontSize.xs),
      color:       colors.error,
      marginBottom: sp(SPACING.sm),
      marginLeft:  30,
    },

    // Bandeau info SMS
    smsInfoBanner: {
      flexDirection:   'row',
      alignItems:      'center',
      backgroundColor: colors.variants.primary[50],
      borderRadius:    BORDER_RADIUS.xl,
      padding:         sp(SPACING.md),
      gap:             sp(SPACING.sm),
      marginTop:       sp(SPACING.md),
      marginBottom:    sp(SPACING.lg),
      borderLeftWidth: 3,
      borderLeftColor: colors.secondary,
    },
    smsInfoText: {
      flex:       1,
      fontSize:   sp(TYPOGRAPHY.fontSize.sm),
      color:      colors.text.secondary,
      lineHeight: sp(TYPOGRAPHY.fontSize.sm) * TYPOGRAPHY.lineHeight.relaxed,
    },

    // Bouton & lien bas
    submitButton: {
      marginBottom: sp(SPACING.md),
    },
    loginLink: {
      alignItems: 'center',
    },
    loginLinkText: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color:    colors.text.light,
    },
    loginLinkBold: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color:      colors.primary,
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={gradientColors}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.contentContainer}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollViewContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Logo */}
            <View style={styles.logoContainer}>
              {/* Halo extérieur doré */}
              <View style={styles.logoHalo}>
                {/* Badge intérieur givré */}
                <View style={styles.logoBadge}>
                  <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
                </View>
              </View>
              {/* Tagline */}
              <Text style={styles.logoTagline}>{t('auth.register.tagline')}</Text>
            </View>

            {/* Card */}
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{t('auth.register.title')}</Text>

              {/* Bandeau d'info si on vient d'un AuthGate (returnTo défini) */}
              {returnTo && (
                <View style={styles.returnToBanner}>
                  <Ionicons name="information-circle" size={16} color={colors.secondary} />
                  <Text style={styles.returnToBannerText}>
                    {t('auth.register.returnToBanner')}
                  </Text>
                </View>
              )}

              {customAlert && (
                <CustomAlert
                  variant={customAlert.variant}
                  title={customAlert.title}
                  message={customAlert.message}
                  onDismiss={() => setCustomAlert(null)}
                  style={styles.alertStyle}
                />
              )}

              {/* Sélecteur de rôle */}
              <View style={styles.roleSelector}>
                <Text style={styles.roleSelectorLabel}>{t('auth.register.iAm')}</Text>
                <View style={styles.roleButtons}>
                  {(['client', 'restaurateur'] as const).map(role => (
                    <Pressable
                      key={role}
                      style={[styles.roleButton, formData.role === role && styles.roleButtonActive]}
                      onPress={() => handleRoleChange(role)}
                    >
                      <Text style={[styles.roleButtonText, formData.role === role && styles.roleButtonTextActive]}>
                        {role === 'client' ? t('auth.register.roleClient') : t('auth.register.roleRestaurateur')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Champs */}
              <View style={styles.inputContainer}>
                <Input
                  label={t('auth.email')}
                  placeholder="votre@email.com"
                  value={formData.username}
                  onChangeText={updateFormData('username')}
                  error={errors.username}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  scrollRef={scrollViewRef}
                />

                <Input
                  label={t('auth.register.fullName')}
                  placeholder="Dupont Jean"
                  value={formData.nom}
                  onChangeText={updateFormData('nom')}
                  error={errors.nom}
                  scrollRef={scrollViewRef}
                />

                <View style={styles.passwordContainer}>
                  <Input
                    label={t('auth.password')}
                    placeholder="••••••••"
                    value={formData.password}
                    onChangeText={updateFormData('password')}
                    error={errors.password}
                    secureTextEntry={!showPassword}
                    scrollRef={scrollViewRef}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(p => !p)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.text.light}
                    />
                  </TouchableOpacity>
                  {!errors.password && (
                    <View style={styles.passwordHintRow}>
                      <Ionicons name="information-circle-outline" size={13} color={colors.text.light} />
                      <Text style={styles.passwordHintText}>
                        {t('auth.passwordHint')}
                      </Text>
                    </View>
                  )}
                </View>

                {formData.role === 'client' && (
                  <Input
                    label={t('auth.phone')}
                    placeholder="+33 6 12 34 56 78"
                    value={formData.telephone}
                    onChangeText={updateFormData('telephone')}
                    error={errors.telephone}
                    keyboardType="phone-pad"
                    scrollRef={scrollViewRef}
                  />
                )}

                {formData.role === 'restaurateur' && (
                  <Input
                    label={t('auth.register.siret')}
                    placeholder="12345678901234"
                    value={formData.siret}
                    onChangeText={updateFormData('siret')}
                    error={errors.siret}
                    keyboardType="number-pad"
                    maxLength={14}
                    scrollRef={scrollViewRef}
                  />
                )}
              </View>

              {/* CGU */}
              <View style={styles.termsRow}>
                <TouchableOpacity
                  onPress={() => { setAcceptedTerms(p => !p); setTermsError(undefined); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                    {acceptedTerms && (
                      <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={styles.termsText}>
                  {t('auth.register.termsPrefix')}{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={() => router.push('/(legal)/terms')}
                  >
                    {t('auth.register.termsCgu')}
                  </Text>
                  {' '}{t('auth.register.termsAnd')}{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={() => router.push('/(legal)/privacy')}
                  >
                    {t('auth.register.termsPrivacy')}
                  </Text>
                </Text>
              </View>
              {termsError && <Text style={styles.termsError}>{termsError}</Text>}

              {/* Bandeau info email */}
              <View style={styles.smsInfoBanner}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={colors.secondary}
                />
                <Text style={styles.smsInfoText}>
                  {t('auth.register.emailCodeInfo')}
                </Text>
              </View>

              {/* Soumettre */}
              <Button
                title={`${t('common.continue')} →`}
                onPress={handleSubmit}
                disabled={loading}
                loading={loading}
                style={styles.submitButton}
              />

              {/* Lien connexion */}
              <TouchableOpacity
                style={styles.loginLink}
                onPress={() => router.push({
                  pathname: '/(auth)/login' as any,
                  // Propager returnTo : si l'utilisateur a finalement un compte
                  // et passe par "Se connecter", il doit revenir au même endroit.
                  params: returnTo ? { returnTo } : {},
                })}
              >
                <Text style={styles.loginLinkText}>
                  {t('auth.alreadyHaveAccount')}{' '}
                  <Text style={styles.loginLinkBold}>{t('auth.signIn')}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}