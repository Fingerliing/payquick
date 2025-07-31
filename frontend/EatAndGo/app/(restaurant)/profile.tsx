import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext'; // Utilise VOTRE AuthContext
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import StripeAccountStatus from '@/components/stripe/StripeAccountStatus';

export default function ProfileScreen() {
  const { user, logout, isRestaurateur } = useAuth(); // Utilise vos utilitaires
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

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const words = name.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const getPhone = () => {
    if (user?.profile?.type === 'client') {
      return (user.profile as any).phone;
    }
    if (user?.profile?.type === 'restaurateur') {
      return (user.profile as any).telephone;
    }
    return null;
  };

  const getSiret = () => {
    if (user?.profile?.type === 'restaurateur') {
      return (user.profile as any).siret;
    }
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header title="Profil" />
      
      <ScrollView>
        {/* Carte profil principal */}
        <Card style={{ margin: 16 }}>
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#3B82F6',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 12,
            }}>
              <Text style={{ fontSize: 24, fontWeight: '600', color: '#FFFFFF' }}>
                {getInitials(user?.first_name || 'U')}
              </Text>
            </View>
            <Text style={{
              fontSize: 20,
              fontWeight: '600',
              color: '#111827',
              marginBottom: 4,
            }}>
              {user?.first_name || 'Utilisateur'}
            </Text>
            <Text style={{
              fontSize: 14,
              color: '#6B7280',
              marginBottom: 4,
            }}>{user?.email}</Text>
            {user?.role && (
              <Text style={{
                fontSize: 12,
                color: '#3B82F6',
                fontWeight: '500',
                backgroundColor: '#EBF8FF',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
              }}>
                {user.role === 'restaurateur' ? '👨‍🍳 Restaurateur' : '👤 Client'}
              </Text>
            )}
          </View>
        </Card>

        {/* Section Stripe pour les restaurateurs */}
        {isRestaurateur && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <StripeAccountStatus />
          </View>
        )}

        {/* Informations détaillées */}
        <Card style={{ margin: 16 }}>
          <View style={{ padding: 16 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#111827',
              marginBottom: 12,
            }}>
              Informations du compte
            </Text>

            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: '#F3F4F6',
            }}>
              <Text style={{ fontSize: 14, color: '#6B7280' }}>Email</Text>
              <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>
                {user?.email}
              </Text>
            </View>

            {getPhone() && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: '#F3F4F6',
              }}>
                <Text style={{ fontSize: 14, color: '#6B7280' }}>Téléphone</Text>
                <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>
                  {getPhone()}
                </Text>
              </View>
            )}

            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: '#F3F4F6',
            }}>
              <Text style={{ fontSize: 14, color: '#6B7280' }}>Type de compte</Text>
              <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>
                {user?.role === 'restaurateur' ? 'Restaurateur' : 'Client'}
              </Text>
            </View>

            {getSiret() && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
              }}>
                <Text style={{ fontSize: 14, color: '#6B7280' }}>SIRET</Text>
                <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>
                  {getSiret()}
                </Text>
              </View>
            )}

            {isRestaurateur && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
              }}>
                <Text style={{ fontSize: 14, color: '#6B7280' }}>Statut Stripe</Text>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: user?.roles?.has_validated_profile ? '#10B981' : '#F59E0B'
                }}>
                  {user?.roles?.has_validated_profile ? '✅ Validé' : '⚠️ En attente'}
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Bouton de déconnexion */}
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
