import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

export default function ClientProfileScreen() {
  const { user, logout, isClient } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnexion', style: 'destructive', onPress: logout }
      ]
    );
  };

  if (!isClient || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Profil" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Accès réservé aux clients</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header title="Profil" />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Informations utilisateur */}
        <Card style={{ marginBottom: 16 }}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#FF6B35',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 12,
            }}>
              <Text style={{ fontSize: 32, color: '#fff', fontWeight: 'bold' }}>
                {user.first_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4 }}>
              {user.first_name}
            </Text>
            <Text style={{ fontSize: 14, color: '#666' }}>
              {user.email}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{
              backgroundColor: '#E8F5E8',
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 12,
            }}>
              <Text style={{ fontSize: 12, color: '#059669', fontWeight: '500' }}>
                ✅ Client vérifié
              </Text>
            </View>
          </View>
        </Card>

        {/* Actions */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 16 }}>
            Actions
          </Text>

          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#f0f0f0',
            }}
            onPress={() => router.push('/(client)/orders')}
          >
            <Ionicons name="receipt-outline" size={20} color="#666" />
            <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 12 }}>
              Mes commandes
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </Pressable>

          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#f0f0f0',
            }}
            onPress={() => router.push('/(client)/browse')}
          >
            <Ionicons name="heart-outline" size={20} color="#666" />
            <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 12 }}>
              Restaurants favoris
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </Pressable>

          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
            }}
            onPress={() => {/* Navigation vers paramètres */}}
          >
            <Ionicons name="settings-outline" size={20} color="#666" />
            <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 12 }}>
              Paramètres
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </Pressable>
        </Card>

        {/* Support */}
        <Card style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 16 }}>
            Support
          </Text>

          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#f0f0f0',
            }}
          >
            <Ionicons name="help-circle-outline" size={20} color="#666" />
            <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 12 }}>
              Aide et FAQ
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </Pressable>

          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
            }}
          >
            <Ionicons name="mail-outline" size={20} color="#666" />
            <Text style={{ flex: 1, fontSize: 16, color: '#333', marginLeft: 12 }}>
              Nous contacter
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </Pressable>
        </Card>

        {/* Déconnexion */}
        <Button
          title="Se déconnecter"
          onPress={handleLogout}
          variant="destructive"
          fullWidth
          leftIcon={<Ionicons name="log-out-outline" size={16} color="#FF3B30" />}
          textStyle={{ 
            color: '#FF3B30',
            fontWeight: '600' 
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}