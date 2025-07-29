import React from 'react';
import { View, Text, TouchableOpacity, StatusBar, ViewStyle, TextStyle, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: string;
  rightIcon?: string;
  rightBadge?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  backgroundColor?: string;
  style?: ViewStyle;
  // Nouvelles props pour la déconnexion
  showLogout?: boolean;
  logoutPosition?: 'left' | 'right';
  onLogoutComplete?: () => void;
  customLogoutIcon?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  backgroundColor = '#FFFFFF',
  style,
  showLogout = false,
  logoutPosition = 'right',
  onLogoutComplete,
  customLogoutIcon = 'log-out-outline',
}) => {
  const insets = useSafeAreaInsets();
  const { logout, isLoading } = useAuth();

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
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      Alert.alert(
        'Erreur',
        'Une erreur s\'est produite lors de la déconnexion.',
        [{ text: 'OK' }]
      );
    }
  };

  const headerStyle: ViewStyle = {
    backgroundColor,
    paddingTop: insets.top,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...style,
  };

  const titleContainerStyle: ViewStyle = {
    flex: 1,
    alignItems: 'center',
  };

  const titleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  };

  const subtitleStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 2,
  };

  const iconButtonStyle: ViewStyle = {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  };

  const getIconColor = (bgColor: string) => {
    // Détermine la couleur d'icône en fonction du fond
    if (bgColor === '#FFFFFF' || bgColor === '#F9FAFB') {
      return '#111827';
    }
    return '#FFFFFF';
  };

  // Détermine quelle icône et action utiliser pour la gauche
  const getLeftIconAndAction = () => {
    if (showLogout && logoutPosition === 'left') {
      return {
        icon: customLogoutIcon,
        action: handleLogout,
        disabled: isLoading,
      };
    }
    return {
      icon: leftIcon,
      action: onLeftPress,
      disabled: false,
    };
  };

  // Détermine quelle icône et action utiliser pour la droite
  const getRightIconAndAction = () => {
    if (showLogout && logoutPosition === 'right') {
      return {
        icon: customLogoutIcon,
        action: handleLogout,
        disabled: isLoading,
      };
    }
    return {
      icon: rightIcon,
      action: onRightPress,
      disabled: false,
    };
  };

  const leftConfig = getLeftIconAndAction();
  const rightConfig = getRightIconAndAction();

  return (
    <>
      <StatusBar 
        barStyle={backgroundColor === '#FFFFFF' ? 'dark-content' : 'light-content'} 
        backgroundColor={backgroundColor} 
      />
      <View style={headerStyle}>
        <View style={iconButtonStyle}>
          {leftConfig.icon && leftConfig.action && (
            <TouchableOpacity 
              onPress={leftConfig.action}
              disabled={leftConfig.disabled}
              style={{ opacity: leftConfig.disabled ? 0.5 : 1 }}
            >
              <Ionicons 
                name={leftConfig.icon as any} 
                size={24} 
                color={getIconColor(backgroundColor)} 
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={titleContainerStyle}>
          <Text style={[titleStyle, { color: getIconColor(backgroundColor) }]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[subtitleStyle, { color: backgroundColor === '#FFFFFF' ? '#6B7280' : '#D1D5DB' }]}>
              {subtitle}
            </Text>
          )}
        </View>

        <View style={iconButtonStyle}>
          {rightConfig.icon && rightConfig.action && (
            <TouchableOpacity 
              onPress={rightConfig.action}
              disabled={rightConfig.disabled}
              style={{ opacity: rightConfig.disabled ? 0.5 : 1 }}
            >
              <Ionicons 
                name={rightConfig.icon as any} 
                size={24} 
                color={getIconColor(backgroundColor)} 
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );
};