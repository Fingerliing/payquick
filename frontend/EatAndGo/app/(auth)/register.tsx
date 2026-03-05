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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert as CustomAlert } from '@/components/ui/Alert';
import { legalService } from '@/services/legalService';
import { API_BASE_URL } from '@/constants/config';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

const APP_LOGO = require('@/assets/images/logo.png');
const { width: screenWidth } = Dimensions.get('window');
const API_URL = `${API_BASE_URL}/api/v1`;

// Gradient bleu charte : nuit → principal (cohérent avec verify-phone)
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

  // Raccourci responsive numérique
  const sp = (token: { mobile: number; tablet: number; desktop: number }): number =>
    getResponsiveValue(token, screenType);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    let hasTermsError = false;

    const email = formData.username.trim();
    if (!email) {
      newErrors.username = 'Email requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.username = 'Format d\'email invalide';
    }

    if (!formData.password) {
      newErrors.password = 'Mot de passe requis';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Minimum 8 caractères';
    }

    if (!formData.nom.trim()) {
      newErrors.nom = 'Nom requis';
    }

    if (formData.role === 'client') {
      if (!formData.telephone.trim()) {
        newErrors.telephone = 'Numéro de téléphone requis';
      } else if (!/^(\+33|0)[1-9](\d{8})$/.test(formData.telephone.replace(/\s/g, ''))) {
        newErrors.telephone = 'Format invalide (ex: +33612345678)';
      }
    } else {
      if (!formData.siret.trim()) {
        newErrors.siret = 'SIRET requis';
      } else if (!/^\d{14}$/.test(formData.siret.replace(/\s/g, ''))) {
        newErrors.siret = 'Le SIRET doit contenir 14 chiffres';
      }
    }

    if (!acceptedTerms) {
      hasTermsError = true;
      setTermsError('Vous devez accepter les conditions générales');
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
      if (msg) setCustomAlert({ variant: 'error', title: 'Erreur', message: String(msg) });
    } else {
      setCustomAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Une erreur est survenue lors de l\'inscription',
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

      // Consentement légal (best-effort)
      try {
        await legalService.recordConsent({
          terms_version: '1.0.0',
          privacy_version: '1.0.0',
          consent_date: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Consentement légal ignoré :', e);
      }

      router.push({
        pathname: '/(auth)/verify-phone',
        params: {
          registration_id: data.registration_id,
          phone_last4:     data.phone_number ?? '',
          expires_in:      String(data.expires_in ?? 600),
        },
      });
    } catch (error: any) {
      handleRegistrationError(error);
    } finally {
      setLoading(false);
    }
  }, [formData, validateForm]);

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
      backgroundColor: COLORS.surface,           // '#FFFFFF'
      borderRadius:    BORDER_RADIUS['3xl'],      // 20
      padding:         sp(SPACING.xl),
      ...SHADOWS.card,
    },
    formTitle: {
      fontSize:     sp(TYPOGRAPHY.fontSize.xl),   // 20/22/24
      fontWeight:   TYPOGRAPHY.fontWeight.bold,
      color:        COLORS.text.primary,          // '#111827'
      marginBottom: sp(SPACING.lg),
      textAlign:    'center',
    },
    alertStyle: {
      marginBottom: sp(SPACING.md),
    },

    // Sélecteur de rôle
    roleSelector: {
      marginBottom: sp(SPACING.lg),
    },
    roleSelectorLabel: {
      fontSize:     sp(TYPOGRAPHY.fontSize.sm),
      fontWeight:   TYPOGRAPHY.fontWeight.medium,
      color:        COLORS.text.secondary,        // '#6B7280'
      marginBottom: sp(SPACING.sm),
    },
    roleButtons: {
      flexDirection: 'row',
      gap: sp(SPACING.sm),
    },
    roleButton: {
      flex:            1,
      paddingVertical: sp(SPACING.sm),
      borderRadius:    BORDER_RADIUS.xl,          // 12
      borderWidth:     1.5,
      borderColor:     COLORS.border.default,     // '#E5E7EB'
      alignItems:      'center',
      backgroundColor: COLORS.background,         // '#F9FAFB'
    },
    roleButtonActive: {
      borderColor:     COLORS.primary,
      backgroundColor: COLORS.variants.primary[50], // '#F0F3FF'
    },
    roleButtonText: {
      fontSize:   sp(TYPOGRAPHY.fontSize.sm),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color:      COLORS.text.light,              // '#9CA3AF'
    },
    roleButtonTextActive: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color:      COLORS.primary,                 // '#1E2A78'
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
      borderRadius:    BORDER_RADIUS.sm,          // 4
      borderWidth:     1.5,
      borderColor:     COLORS.border.dark,        // '#D1D5DB'
      alignItems:      'center',
      justifyContent:  'center',
      marginTop:       1,
      flexShrink:      0,
    },
    checkboxChecked: {
      backgroundColor: COLORS.primary,
      borderColor:     COLORS.primary,
    },
    termsText: {
      flex:       1,
      fontSize:   sp(TYPOGRAPHY.fontSize.sm),
      color:      COLORS.text.secondary,
      lineHeight: sp(TYPOGRAPHY.fontSize.sm) * TYPOGRAPHY.lineHeight.relaxed,
    },
    termsLink: {
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color:      COLORS.primary,
    },
    termsError: {
      fontSize:    sp(TYPOGRAPHY.fontSize.xs),
      color:       COLORS.error,                 // '#EF4444'
      marginBottom: sp(SPACING.sm),
      marginLeft:  30,
    },

    // Bandeau info SMS
    smsInfoBanner: {
      flexDirection:   'row',
      alignItems:      'center',
      backgroundColor: COLORS.variants.primary[50],  // '#F0F3FF'
      borderRadius:    BORDER_RADIUS.xl,             // 12
      padding:         sp(SPACING.md),
      gap:             sp(SPACING.sm),
      marginTop:       sp(SPACING.md),
      marginBottom:    sp(SPACING.lg),
      borderLeftWidth: 3,
      borderLeftColor: COLORS.secondary,             // or '#D4AF37'
    },
    smsInfoText: {
      flex:       1,
      fontSize:   sp(TYPOGRAPHY.fontSize.sm),
      color:      COLORS.text.secondary,
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
      color:    COLORS.text.light,
    },
    loginLinkBold: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color:      COLORS.primary,
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={GRADIENT}
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
              <Text style={styles.logoTagline}>Commandez à table</Text>
            </View>

            {/* Card */}
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Créer un compte</Text>

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
                <Text style={styles.roleSelectorLabel}>Je suis :</Text>
                <View style={styles.roleButtons}>
                  {(['client', 'restaurateur'] as const).map(role => (
                    <Pressable
                      key={role}
                      style={[styles.roleButton, formData.role === role && styles.roleButtonActive]}
                      onPress={() => handleRoleChange(role)}
                    >
                      <Text style={[styles.roleButtonText, formData.role === role && styles.roleButtonTextActive]}>
                        {role === 'client' ? 'Client' : 'Restaurateur'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Champs */}
              <View style={styles.inputContainer}>
                <Input
                  label="Email"
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
                  label="Nom complet"
                  placeholder="Dupont Jean"
                  value={formData.nom}
                  onChangeText={updateFormData('nom')}
                  error={errors.nom}
                  scrollRef={scrollViewRef}
                />

                <View style={styles.passwordContainer}>
                  <Input
                    label="Mot de passe"
                    placeholder="Minimum 8 caractères"
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
                      color={COLORS.text.light}
                    />
                  </TouchableOpacity>
                </View>

                {formData.role === 'client' && (
                  <Input
                    label="Numéro de téléphone"
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
                    label="Numéro SIRET"
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
              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => { setAcceptedTerms(p => !p); setTermsError(undefined); }}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                  {acceptedTerms && (
                    <Ionicons name="checkmark" size={14} color={COLORS.text.inverse} />
                  )}
                </View>
                <Text style={styles.termsText}>
                  J'accepte les{' '}
                  <Text style={styles.termsLink}>conditions générales d'utilisation</Text>
                  {' '}et la{' '}
                  <Text style={styles.termsLink}>politique de confidentialité</Text>
                </Text>
              </TouchableOpacity>
              {termsError && <Text style={styles.termsError}>{termsError}</Text>}

              {/* Bandeau SMS */}
              <View style={styles.smsInfoBanner}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={COLORS.secondary}
                />
                <Text style={styles.smsInfoText}>
                  Un SMS de vérification sera envoyé à votre numéro de téléphone.
                </Text>
              </View>

              {/* Soumettre */}
              <Button
                title="Continuer →"
                onPress={handleSubmit}
                disabled={loading}
                loading={loading}
                style={styles.submitButton}
              />

              {/* Lien connexion */}
              <TouchableOpacity
                style={styles.loginLink}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={styles.loginLinkText}>
                  Déjà un compte ?{' '}
                  <Text style={styles.loginLinkBold}>Se connecter</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}