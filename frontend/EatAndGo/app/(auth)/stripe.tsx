import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { stripeService } from '@/services/stripeService';

// Récupération des dimensions d'écran
const { width, height } = Dimensions.get('window');

// Détection du type d'appareil
const isTablet = width >= 768;
const isSmallScreen = width < 360;

// Couleurs de l'application
const COLORS = {
  primary: '#1E2A78',
  secondary: '#FFC845',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  white: '#FFFFFF',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    500: '#6B7280',
    700: '#374151',
    900: '#111827',
  },
};

// Configuration responsive
const getResponsiveStyles = () => {
  const baseSize = isTablet ? 1.3 : isSmallScreen ? 0.9 : 1;
  
  return {
    container: {
      paddingHorizontal: isTablet ? width * 0.15 : isSmallScreen ? 16 : 20,
      paddingVertical: isTablet ? 40 : isSmallScreen ? 20 : 30,
    },
    content: {
      maxWidth: isTablet ? 500 : width - 40,
      width: '100%' as const,
    },
    title: {
      fontSize: (isTablet ? 32 : isSmallScreen ? 22 : 26) * baseSize,
    },
    message: {
      fontSize: (isTablet ? 18 : isSmallScreen ? 14 : 16) * baseSize,
      lineHeight: (isTablet ? 26 : isSmallScreen ? 20 : 24) * baseSize,
    },
    button: {
      height: isTablet ? 54 : isSmallScreen ? 44 : 48,
      paddingHorizontal: isTablet ? 32 : 20,
    },
    buttonText: {
      fontSize: (isTablet ? 18 : isSmallScreen ? 14 : 16) * baseSize,
    },
    icon: {
      fontSize: (isTablet ? 64 : isSmallScreen ? 40 : 48) * baseSize,
    },
    spacing: {
      small: isTablet ? 16 : isSmallScreen ? 8 : 12,
      medium: isTablet ? 24 : isSmallScreen ? 16 : 20,
      large: isTablet ? 32 : isSmallScreen ? 24 : 28,
    },
  };
};

export default function Stripe() {
  const navigation = useNavigation();
  const [status, setStatus] = useState<'checking' | 'waiting' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('Vérification de votre compte Stripe...');
  
  const responsiveStyles = getResponsiveStyles();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Attendre un peu pour laisser le temps au webhook
        setTimeout(async () => {
          try {
            const accountStatus = await stripeService.getAccountStatus();
            
            if (accountStatus.has_validated_profile) {
              setStatus('success');
              setMessage('Votre compte Stripe a été validé avec succès !');
            } else {
              setStatus('waiting');
              setMessage('Configuration en cours. Cela peut prendre quelques minutes...');
            }
          } catch (error) {
            setStatus('error');
            setMessage('Erreur lors de la vérification du statut de votre compte.');
          }
        }, 3000);
      } catch (error) {
        setStatus('error');
        setMessage('Erreur lors de la vérification.');
      }
    };

    checkStatus();
  }, []);

  const handleContinue = () => {
    navigation.navigate('Dashboard' as never);
  };

  const handleRetry = async () => {
    setStatus('checking');
    setMessage('Nouvelle vérification...');
    
    try {
      const accountStatus = await stripeService.getAccountStatus();
      
      if (accountStatus.has_validated_profile) {
        setStatus('success');
        setMessage('Votre compte Stripe a été validé avec succès !');
      } else if (accountStatus.status === 'account_exists') {
        // Recréer un lien d'onboarding
        const onboardingLink = await stripeService.createOnboardingLink();
        await stripeService.openStripeOnboarding(onboardingLink.onboarding_url);
      } else {
        setStatus('error');
        setMessage('Compte Stripe non trouvé. Veuillez recommencer l\'inscription.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Erreur lors de la vérification.');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'checking':
        return <ActivityIndicator size={isTablet ? "large" : "small"} color={COLORS.primary} />;
      case 'waiting':
        return <Text style={[styles.icon, { fontSize: responsiveStyles.icon.fontSize }]}>⏳</Text>;
      case 'success':
        return <Text style={[styles.icon, { fontSize: responsiveStyles.icon.fontSize }]}>✅</Text>;
      case 'error':
        return <Text style={[styles.icon, { fontSize: responsiveStyles.icon.fontSize }]}>❌</Text>;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return COLORS.success;
      case 'error':
        return COLORS.error;
      case 'waiting':
        return COLORS.warning;
      default:
        return COLORS.gray[500];
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'checking':
        return 'Vérification en cours...';
      case 'waiting':
        return 'Configuration en attente';
      case 'success':
        return 'Compte validé !';
      case 'error':
        return 'Erreur de validation';
      default:
        return '';
    }
  };

  return (
    <ScrollView 
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.container, responsiveStyles.container]}>
        <View style={[styles.content, responsiveStyles.content]}>
          {/* Icône de statut */}
          <View style={[styles.iconContainer, { marginBottom: responsiveStyles.spacing.large }]}>
            {getStatusIcon()}
          </View>

          {/* Titre de statut */}
          <Text style={[
            styles.title, 
            { 
              color: getStatusColor(),
              fontSize: responsiveStyles.title.fontSize,
              marginBottom: responsiveStyles.spacing.medium,
            }
          ]}>
            {getStatusTitle()}
          </Text>

          {/* Message principal */}
          <Text style={[
            styles.message,
            {
              fontSize: responsiveStyles.message.fontSize,
              lineHeight: responsiveStyles.message.lineHeight,
              marginBottom: responsiveStyles.spacing.medium,
            }
          ]}>
            {message}
          </Text>

          {/* Message de succès détaillé */}
          {status === 'success' && (
            <Text style={[
              styles.successDetail,
              { 
                fontSize: responsiveStyles.message.fontSize * 0.9,
                marginBottom: responsiveStyles.spacing.large,
              }
            ]}>
              Vous pouvez maintenant activer vos restaurants et commencer à recevoir des commandes.
            </Text>
          )}

          {/* Boutons d'action */}
          <View style={[styles.buttonContainer, { marginTop: responsiveStyles.spacing.medium }]}>
            {status === 'success' || status === 'waiting' ? (
              <TouchableOpacity 
                style={[
                  styles.primaryButton,
                  {
                    height: responsiveStyles.button.height,
                    paddingHorizontal: responsiveStyles.button.paddingHorizontal,
                  }
                ]} 
                onPress={handleContinue}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.primaryButtonText,
                  { fontSize: responsiveStyles.buttonText.fontSize }
                ]}>
                  Continuer vers le tableau de bord
                </Text>
              </TouchableOpacity>
            ) : status === 'error' ? (
              <>
                <TouchableOpacity 
                  style={[
                    styles.primaryButton,
                    {
                      height: responsiveStyles.button.height,
                      paddingHorizontal: responsiveStyles.button.paddingHorizontal,
                      marginBottom: responsiveStyles.spacing.small,
                    }
                  ]} 
                  onPress={handleRetry}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.primaryButtonText,
                    { fontSize: responsiveStyles.buttonText.fontSize }
                  ]}>
                    Réessayer
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.secondaryButton,
                    {
                      height: responsiveStyles.button.height,
                      paddingHorizontal: responsiveStyles.button.paddingHorizontal,
                    }
                  ]} 
                  onPress={handleContinue}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.secondaryButtonText,
                    { fontSize: responsiveStyles.buttonText.fontSize }
                  ]}>
                    Continuer sans Stripe
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: COLORS.white,
    borderRadius: isTablet ? 20 : 16,
    padding: isTablet ? 40 : 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { 
      width: 0, 
      height: isTablet ? 8 : 4,
    },
    shadowOpacity: isTablet ? 0.15 : 0.1,
    shadowRadius: isTablet ? 12 : 8,
    elevation: isTablet ? 8 : 4,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    }),
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: isTablet ? 100 : 80,
    height: isTablet ? 100 : 80,
    borderRadius: isTablet ? 50 : 40,
    backgroundColor: COLORS.gray[100],
  },
  icon: {
    textAlign: 'center',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  message: {
    textAlign: 'center',
    color: COLORS.gray[700],
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  successDetail: {
    textAlign: 'center',
    color: COLORS.success,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    ...(Platform.OS === 'web' && {
      boxShadow: `0 2px 8px ${COLORS.primary}30`,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  primaryButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderWidth: 2,
    borderColor: COLORS.gray[300],
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  secondaryButtonText: {
    color: COLORS.gray[700],
    fontWeight: '600',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
});