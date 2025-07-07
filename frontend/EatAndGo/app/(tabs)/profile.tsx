import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de se déconnecter');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: 'person-outline',
      title: 'Modifier le profil',
      onPress: () => {/* Naviguer vers édition profil */},
    },
    {
      icon: 'notifications-outline',
      title: 'Notifications',
      onPress: () => {/* Naviguer vers paramètres notifications */},
    },
    {
      icon: 'card-outline',
      title: 'Moyens de paiement',
      onPress: () => {/* Naviguer vers moyens de paiement */},
    },
    {
      icon: 'help-circle-outline',
      title: 'Aide et support',
      onPress: () => {/* Naviguer vers aide */},
    },
    {
      icon: 'information-circle-outline',
      title: 'À propos',
      onPress: () => {/* Naviguer vers à propos */},
    },
  ];

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const profileHeaderStyle: ViewStyle = {
    alignItems: 'center',
    paddingVertical: 24,
  };

  const avatarStyle: ViewStyle = {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  };

  const nameStyle: TextStyle = {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  };

  const emailStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
  };

  const menuItemStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  };

  const menuItemTextStyle: TextStyle = {
    fontSize: 16,
    color: '#111827',
    marginLeft: 12,
    flex: 1,
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <View style={containerStyle}>
      <Header title="Profil" />
      
      <ScrollView>
        <Card style={{ margin: 16 }}>
          <View style={profileHeaderStyle}>
            <View style={avatarStyle}>
              <Text style={{ fontSize: 24, fontWeight: '600', color: '#FFFFFF' }}>
                {user ? getInitials(user.firstName, user.lastName) : 'U'}
              </Text>
            </View>
            <Text style={nameStyle}>
              {user ? `${user.firstName} ${user.lastName}` : 'Utilisateur'}
            </Text>
            <Text style={emailStyle}>{user?.email}</Text>
          </View>
        </Card>

        <Card style={{ margin: 16 }}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                menuItemStyle,
                index === menuItems.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon as any} size={24} color="#6B7280" />
              <Text style={menuItemTextStyle}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </TouchableOpacity>
          ))}
        </Card>

        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Button
            title="Déconnexion"
            onPress={handleLogout}
            loading={isLoggingOut}
            variant="secondary"
            fullWidth
          />
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
            Eat&Go v1.0.0
          </Text>
        </View>
      </ScrollView> 
    </View>
  );
}