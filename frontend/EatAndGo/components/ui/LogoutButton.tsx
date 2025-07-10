import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  Alert, 
  View,
  ActivityIndicator 
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

interface LogoutButtonProps {
  style?: any;
  textStyle?: any;
  showIcon?: boolean;
  showText?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'minimal';
  size?: 'small' | 'medium' | 'large';
  onLogoutComplete?: () => void;
}

export default function LogoutButton({
  style,
  textStyle,
  showIcon = true,
  showText = true,
  variant = 'danger',
  size = 'medium',
  onLogoutComplete
}: LogoutButtonProps) {
  const { logout, isLoading } = useAuth();
  const navigation = useNavigation();

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: performLogout,
        },
      ],
      { cancelable: true }
    );
  };

  const performLogout = async () => {
    try {
      await logout();
      onLogoutComplete?.();
      // La navigation sera gérée par votre stack navigator
      // en détectant que l'utilisateur n'est plus authentifié
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      Alert.alert(
        'Erreur',
        'Une erreur s\'est produite lors de la déconnexion.',
        [{ text: 'OK' }]
      );
    }
  };

  const getButtonStyle = () => {
    const baseStyle = [styles.button, styles[size]];
    
    switch (variant) {
      case 'primary':
        return [...baseStyle, styles.primaryButton];
      case 'secondary':
        return [...baseStyle, styles.secondaryButton];
      case 'danger':
        return [...baseStyle, styles.dangerButton];
      case 'minimal':
        return [...baseStyle, styles.minimalButton];
      default:
        return [...baseStyle, styles.dangerButton];
    }
  };

  const getTextStyle = () => {
    const baseStyle = [styles.buttonText, styles[`${size}Text`]];
    
    switch (variant) {
      case 'primary':
        return [...baseStyle, styles.primaryText];
      case 'secondary':
        return [...baseStyle, styles.secondaryText];
      case 'danger':
        return [...baseStyle, styles.dangerText];
      case 'minimal':
        return [...baseStyle, styles.minimalText];
      default:
        return [...baseStyle, styles.dangerText];
    }
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={handleLogout}
      disabled={isLoading}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator 
          size="small" 
          color={variant === 'minimal' ? '#DC2626' : '#FFFFFF'} 
        />
      ) : (
        <View style={styles.buttonContent}>
          {showIcon && (
            <Ionicons
              name="log-out-outline"
              size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
              color={variant === 'minimal' ? '#DC2626' : '#FFFFFF'}
              style={showText ? { marginRight: 8 } : {}}
            />
          )}
          {showText && (
            <Text style={[getTextStyle(), textStyle]}>
              Se déconnecter
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
  
  // Sizes
  small: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  medium: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  large: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  
  // Text sizes
  smallText: {
    fontSize: 12,
  },
  mediumText: {
    fontSize: 14,
  },
  largeText: {
    fontSize: 16,
  },
  
  // Variants
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    backgroundColor: '#6B7280',
  },
  dangerButton: {
    backgroundColor: '#DC2626',
  },
  minimalButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  
  // Text colors
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#FFFFFF',
  },
  dangerText: {
    color: '#FFFFFF',
  },
  minimalText: {
    color: '#DC2626',
  },
});