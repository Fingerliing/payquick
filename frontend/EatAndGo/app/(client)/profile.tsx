import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useClientOrders } from '@/hooks/client/useClientOrders';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { DownloadMyDataButton } from '@/components/legal/DownloadMyDataButton';
import { AlertWithAction } from '@/components/ui/Alert';

export default function ClientProfileScreen() {
  const { user, logout, isClient } = useAuth();
  const { width } = useWindowDimensions();
  const { orders, isLoading: ordersLoading, fetchOrders } = useClientOrders();

  const [totalOrders, setTotalOrders] = useState(0);
  const favoriteRestaurants = 3; // Hardcodé
  const averageRating = 4.8; // Hardcodé
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);

  useEffect(() => {
    if (orders) setTotalOrders(orders.length);
  }, [orders]);

  useEffect(() => {
    if (isClient && user) fetchOrders();
  }, [isClient, user]);

  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;

  // ⚠️ on ne déclenche plus Alert.alert(), on affiche le composant custom
  const handleLogout = () => {
    setShowLogoutAlert(true);
  };

  const ActionItem = ({
    icon,
    title,
    onPress,
    isLast = false,
    badge,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    onPress: () => void;
    isLast?: boolean;
    badge?: string;
  }) => (
    <Pressable
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: '#E5E7EB',
        minHeight: 48,
      }}
      onPress={onPress}
    >
      <View style={{ marginRight: 16, width: 24, alignItems: 'center' }}>
        <Ionicons name={icon} size={20} color="#6B7280" />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            color: '#111827',
            fontWeight: '500',
          }}
        >
          {title}
        </Text>
        {badge && (
          <View
            style={{
              backgroundColor: '#FFC845',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 10,
              marginLeft: 8,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: '#1E2A78',
              }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </Pressable>
  );

  if (!isClient || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Profil" />
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Ionicons
            name="person-circle-outline"
            size={80}
            color="#9CA3AF"
            style={{ marginBottom: 24 }}
          />
          <Text
            style={{
              fontSize: 16,
              color: '#6B7280',
              textAlign: 'center',
              marginBottom: 32,
              lineHeight: 22,
            }}
          >
            Connectez-vous pour accéder à votre profil et gérer vos préférences
          </Text>
          <Button
            title="Se connecter"
            onPress={() => router.replace('/(auth)/login')}
            variant="primary"
            fullWidth
            style={{ maxWidth: 320 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header title="Profil" />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View
          style={{
            padding: isMobile ? 16 : 24,
            maxWidth: 800,
            alignSelf: 'center',
            width: '100%',
          }}
        >
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
            {/* Colonne principale */}
            <View style={{ flex: isMobile ? 1 : 2 }}>
              <Card
                style={{
                  marginBottom: 20,
                  padding: 24,
                  alignItems: 'center',
                }}
              >
                {/* Avatar */}
                <View
                  style={{
                    width: isMobile ? 100 : 120,
                    height: isMobile ? 100 : 120,
                    borderRadius: isMobile ? 50 : 60,
                    backgroundColor: '#1E2A78',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: 16,
                    borderWidth: 3,
                    borderColor: '#FFC845',
                    shadowColor: '#1E2A78',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                    elevation: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: isMobile ? 40 : 48,
                      color: '#FFFFFF',
                      fontWeight: '700',
                    }}
                  >
                    {user.first_name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>

                {/* Nom */}
                <Text
                  style={{
                    fontSize: isMobile ? 24 : 28,
                    fontWeight: '700',
                    color: '#111827',
                    marginBottom: 4,
                    textAlign: 'center',
                  }}
                >
                  {user.first_name || 'Utilisateur'}
                </Text>

                {/* Email */}
                <Text
                  style={{
                    fontSize: isMobile ? 16 : 18,
                    color: '#6B7280',
                    marginBottom: 16,
                    textAlign: 'center',
                  }}
                >
                  {user.email}
                </Text>

                {/* Badge vérifié */}
                <View
                  style={{
                    backgroundColor: '#10B981' + '20',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 20,
                    borderWidth: 1,
                    borderColor: '#10B981' + '30',
                  }}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#10B981',
                      fontWeight: '600',
                    }}
                  >
                    Client vérifié
                  </Text>
                </View>

                {/* Stats */}
                <View
                  style={{
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? 12 : 16,
                    width: '100%',
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#F9FAFB',
                      padding: 16,
                      borderRadius: 8,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 24,
                        fontWeight: '800',
                        color: '#1E2A78',
                        marginBottom: 4,
                      }}
                    >
                      {ordersLoading ? '...' : totalOrders}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: '#6B7280',
                        fontWeight: '500',
                      }}
                    >
                      Commandes
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#F9FAFB',
                      padding: 16,
                      borderRadius: 8,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 24,
                        fontWeight: '800',
                        color: '#1E2A78',
                        marginBottom: 4,
                      }}
                    >
                      {favoriteRestaurants}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: '#6B7280',
                        fontWeight: '500',
                      }}
                    >
                      Favoris
                    </Text>
                  </View>

                  {!isMobile && (
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: '#F9FAFB',
                        padding: 16,
                        borderRadius: 8,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 24,
                          fontWeight: '800',
                          color: '#1E2A78',
                          marginBottom: 4,
                        }}
                      >
                        ★ {averageRating}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: '#6B7280',
                          fontWeight: '500',
                        }}
                      >
                        Note
                      </Text>
                    </View>
                  )}
                </View>
              </Card>

              {/* Actions principales */}
              <Card style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: '#111827',
                    marginBottom: 16,
                    paddingHorizontal: 12,
                  }}
                >
                  Mes actions
                </Text>

                <ActionItem
                  icon="receipt-outline"
                  title="Mes commandes"
                  onPress={() => router.push('/(client)/orders')}
                  badge={totalOrders > 0 ? totalOrders.toString() : undefined}
                />

                <ActionItem
                  icon="card-outline"
                  title="Moyens de paiement"
                  onPress={() => console.log('Paiement')}
                />

                <ActionItem
                  icon="notifications-outline"
                  title="Notifications"
                  onPress={() => console.log('Notifications')}
                />

                <ActionItem
                  icon="settings-outline"
                  title="Paramètres"
                  onPress={() => console.log('Paramètres')}
                  isLast
                />
              </Card>
            </View>

            {/* Colonne secondaire */}
            <View style={{ flex: isMobile ? 1 : 1 }}>
              {/* Support */}
              <Card style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: '#111827',
                    marginBottom: 16,
                    paddingHorizontal: 12,
                  }}
                >
                  Support
                </Text>

                <ActionItem
                  icon="help-circle-outline"
                  title="Aide et FAQ"
                  onPress={() => console.log('Aide')}
                />

                <ActionItem
                  icon="chatbubble-outline"
                  title="Chat en direct"
                  onPress={() => console.log('Chat')}
                  badge="24/7"
                />

                <ActionItem
                  icon="star-outline"
                  title="Évaluer l'app"
                  onPress={() => console.log('Rating')}
                />

                <ActionItem
                  icon="mail-outline"
                  title="Nous contacter"
                  onPress={() => console.log('Contact')}
                  isLast
                />
              </Card>

              {/* Données personnelles */}
              <Card style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: '#111827',
                    marginBottom: 16,
                    paddingHorizontal: 12,
                  }}
                >
                  Mes données personnelles
                </Text>
                <View style={{ paddingHorizontal: 12 }}>
                  <DownloadMyDataButton />
                </View>
              </Card>

              {/* Informations */}
              <Card style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: '#111827',
                    marginBottom: 16,
                    paddingHorizontal: 12,
                  }}
                >
                  Informations
                </Text>

                <ActionItem
                  icon="document-text-outline"
                  title="Conditions d'utilisation"
                  onPress={() => router.push('/(legal)/terms')}
                />

                <ActionItem
                  icon="shield-outline"
                  title="Politique de confidentialité"
                  onPress={() => router.push('/(legal)/privacy')}
                />

                <ActionItem
                  icon="information-circle-outline"
                  title="À propos"
                  onPress={() => console.log('À propos')}
                  isLast
                />
              </Card>

              {/* Déconnexion */}
              <Button
                title="Se déconnecter"
                onPress={handleLogout}
                variant="destructive"
                fullWidth
                style={{ minHeight: 48 }}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 💬 Alert personnalisée */}
      {showLogoutAlert && (
        <View
          style={{
            position: 'absolute',
            bottom: 30,
            left: 20,
            right: 20,
          }}
        >
          <AlertWithAction
            variant="warning"
            title="Déconnexion"
            message="Êtes-vous sûr de vouloir vous déconnecter ?"
            onDismiss={() => setShowLogoutAlert(false)}
            autoDismiss={false}
            primaryButton={{
              text: 'Déconnexion',
              onPress: () => {
                logout();
                setShowLogoutAlert(false);
              },
              variant: 'danger',
            }}
            secondaryButton={{
              text: 'Annuler',
              onPress: () => setShowLogoutAlert(false),
            }}
          />
        </View>
      )}

      <LegalFooter />
    </SafeAreaView>
  );
}
