import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ViewStyle,
  TextStyle,
  ImageStyle,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { RestaurantHoursUtils } from '@/utils/restaurantHours';
import { ManualOverrideManager } from '@/components/restaurant/ManualOverrideManager';

// Types de cuisine pour l'affichage localisé
const CUISINE_LABELS = {
  'french': 'Française',
  'italian': 'Italienne',
  'asian': 'Asiatique',
  'mexican': 'Mexicaine',
  'indian': 'Indienne',
  'american': 'Américaine',
  'mediterranean': 'Méditerranéenne',
  'japanese': 'Japonaise',
  'chinese': 'Chinoise',
  'thai': 'Thaïlandaise',
  'other': 'Autre',
};

const DAYS_FR = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 
  'Jeudi', 'Vendredi', 'Samedi'
];

interface RestaurantStats {
  total_orders: number;
  active_orders: number;
  total_tables: number;
  active_menus: number;
}

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentRestaurant, loadRestaurant, updateRestaurant, isLoading } = useRestaurant();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<RestaurantStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (id) {
      loadRestaurant(id);
      loadStats();
    }
  }, [id]);

  const loadStats = async () => {
    if (!id) return;
    
    setLoadingStats(true);
    try {
      const mockStats: RestaurantStats = {
        total_orders: 156,
        active_orders: 3,
        total_tables: 12,
        active_menus: 2,
      };
      setStats(mockStats);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Nouvelle fonction de gestion du statut avec prise en compte des horaires
  const handleQuickToggleStatus = async () => {
    if (!currentRestaurant) return;

    // Si le restaurant est fermé manuellement, proposer la réouverture
    if (currentRestaurant.isManuallyOverridden) {
      Alert.alert(
        'Restaurant fermé temporairement',
        `Le restaurant est actuellement fermé pour: ${currentRestaurant.manualOverrideReason}\n\nVoulez-vous le réouvrir ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Réouvrir',
            onPress: async () => {
              try {
                await updateRestaurant(currentRestaurant.id, {
                  isManuallyOverridden: false,
                  manualOverrideReason: undefined,
                  manualOverrideUntil: undefined,
                });
                Alert.alert('Succès', 'Restaurant réouvert selon vos horaires normaux');
              } catch (error) {
                Alert.alert('Erreur', 'Impossible de réouvrir le restaurant');
              }
            },
          },
        ]
      );
      return;
    }

    // Calculer si le restaurant devrait être ouvert selon les horaires
    const shouldBeOpen = RestaurantHoursUtils.isRestaurantOpen(currentRestaurant);
    const status = RestaurantHoursUtils.getRestaurantStatus(currentRestaurant);

    if (shouldBeOpen) {
      // Restaurant ouvert selon horaires -> proposer fermeture temporaire
      Alert.alert(
        'Fermer temporairement ?',
        'Votre restaurant est actuellement ouvert selon vos horaires.\n\nVoulez-vous le fermer temporairement (ex: pause, urgence) ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Fermer temporairement',
            style: 'destructive',
            onPress: () => showManualCloseOptions()
          }
        ]
      );
    } else {
      // Restaurant fermé selon horaires -> informer et proposer ouverture exceptionnelle
      Alert.alert(
        'Restaurant fermé selon vos horaires',
        `${status.status}\n\nVoulez-vous l'ouvrir exceptionnellement maintenant ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Ouvrir exceptionnellement',
            onPress: () => showExceptionalOpenOptions()
          }
        ]
      );
    }
  };

  const showManualCloseOptions = () => {
    Alert.alert(
      'Fermeture temporaire',
      'Choisissez la durée',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: '30 minutes',
          onPress: () => applyManualOverride('Fermeture temporaire', 0.5)
        },
        {
          text: '1 heure',
          onPress: () => applyManualOverride('Fermeture temporaire', 1/24)
        },
        {
          text: '2 heures',
          onPress: () => applyManualOverride('Fermeture temporaire', 2/24)
        },
        {
          text: 'Reste de la journée',
          onPress: () => applyManualOverride('Fermeture temporaire', 1)
        }
      ]
    );
  };

  const showExceptionalOpenOptions = () => {
    // Première Alert pour choisir le type d'ouverture
    Alert.alert(
      'Ouverture exceptionnelle',
      'Comment souhaitez-vous ouvrir ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Durée fixe',
          onPress: () => showDurationOptions()
        },
        {
          text: 'Jusqu\'à l\'heure normale',
          onPress: () => applyExceptionalOpen(null)
        }
      ]
    );
  };

  const showDurationOptions = () => {
    Alert.alert(
      'Durée d\'ouverture',
      'Choisissez la durée',
      [
        { text: 'Retour', onPress: () => showExceptionalOpenOptions() },
        {
          text: '30 minutes',
          onPress: () => applyExceptionalOpen(0.5/24)
        },
        {
          text: '1 heure',
          onPress: () => applyExceptionalOpen(1/24)
        },
        {
          text: '2 heures',
          onPress: () => applyExceptionalOpen(2/24)
        }
      ]
    );
  };

  const applyManualOverride = async (reason: string, durationInDays: number | null) => {
    if (!currentRestaurant) return;

    try {
      let overrideUntil = null;
      let durationText = '';

      if (durationInDays !== null) {
        const until = new Date();
        
        if (durationInDays >= 1) {
          // Durée en jours entiers
          until.setDate(until.getDate() + Math.floor(durationInDays));
          const days = Math.floor(durationInDays);
          durationText = days === 1 ? '1 jour' : `${days} jours`;
        } else {
          // Durée en heures/minutes
          const totalMinutes = Math.floor(durationInDays * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          
          until.setTime(until.getTime() + (totalMinutes * 60 * 1000));
          
          if (hours > 0) {
            durationText = hours === 1 ? '1 heure' : `${hours} heures`;
            if (minutes > 0) {
              durationText += ` ${minutes}min`;
            }
          } else {
            durationText = `${minutes} minutes`;
          }
        }
        
        overrideUntil = until.toISOString();
      } else {
        durationText = 'jusqu\'à nouvel ordre';
      }

      await updateRestaurant(currentRestaurant.id, {
        isManuallyOverridden: true,
        manualOverrideReason: reason,
        manualOverrideUntil: overrideUntil,
      });

      const message = overrideUntil ? 
        `Restaurant fermé ${durationText}.\n\nRéouverture prévue le ${new Date(overrideUntil).toLocaleString('fr-FR')}` :
        `Restaurant fermé ${durationText}.`;

      Alert.alert('Fermeture activée', message);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de fermer le restaurant');
    }
  };

  const applyExceptionalOpen = async (durationInDays: number | null) => {
    if (!currentRestaurant) return;

    try {
      // Pour une ouverture exceptionnelle, on pourrait avoir une logique différente
      // Ici, on va juste s'assurer que le restaurant n'est pas en override
      await updateRestaurant(currentRestaurant.id, {
        isManuallyOverridden: false,
        manualOverrideReason: undefined,
        manualOverrideUntil: undefined,
      });

      Alert.alert(
        'Ouverture exceptionnelle activée',
        'Votre restaurant est maintenant ouvert. N\'oubliez pas de le refermer si nécessaire.'
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le restaurant');
    }
  };

  const onRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      await Promise.all([
        loadRestaurant(id),
        loadStats()
      ]);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de rafraîchir les données');
    } finally {
      setRefreshing(false);
    }
  };
  
  const safeNumber = (value: any, defaultValue: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  const formatRating = (rating: any): string => {
    const num = safeNumber(rating, 0);
    return num.toFixed(1);
  };

  if (isLoading && !currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Restaurant" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement du restaurant..." />
      </View>
    );
  }

  if (!currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Restaurant" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="restaurant-outline" size={64} color="#D1D5DB" />
          <Text style={{ fontSize: 18, color: '#6B7280', marginTop: 16, textAlign: 'center' }}>
            Restaurant non trouvé
          </Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="outline"
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    );
  }

  // Calculer le statut actuel avec les nouvelles fonctions
  const restaurantStatus = RestaurantHoursUtils.getRestaurantStatus(currentRestaurant);
  const isCurrentlyOpen = restaurantStatus.isOpen;

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const imageContainerStyle: ViewStyle = {
    position: 'relative',
    height: 250,
    backgroundColor: '#F3F4F6',
  };

  const imageStyle: ImageStyle = {
    width: '100%',
    height: '100%',
  };

  const imageOverlayStyle: ViewStyle = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  };

  const titleStyle: TextStyle = {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  };

  const subtitleOverlayStyle: TextStyle = {
    fontSize: 14,
    color: '#F3F4F6',
  };

  const sectionTitleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  };

  const infoRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  };

  const infoTextStyle: TextStyle = {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    flex: 1,
  };

  const statusBadgeStyle = (isActive: boolean): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isActive ? '#D1FAE5' : '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  });

  const statusTextStyle = (isActive: boolean): TextStyle => ({
    fontSize: 12,
    fontWeight: '600',
    color: isActive ? '#065F46' : '#991B1B',
    marginLeft: 4,
  });

  const ratingStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  };

  const statCardStyle: ViewStyle = {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  };

  const statNumberStyle: TextStyle = {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  };

  const statLabelStyle: TextStyle = {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  };

  const actionButtonStyle: ViewStyle = {
    marginBottom: 12,
  };

  const getCuisineLabel = (cuisine: string): string => {
    return CUISINE_LABELS[cuisine as keyof typeof CUISINE_LABELS] || cuisine;
  };

  const getPriceRangeDisplay = (priceRange: number): string => {
    return '€'.repeat(Math.max(1, Math.min(4, priceRange)));
  };

  console.log('Restaurant image:', currentRestaurant.image);
  console.log('Fallback URL:', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop');

  return (
    <View style={containerStyle}>
      <Header 
        title="Restaurant"
        leftIcon="arrow-back"
        rightIcon="create-outline"
        onLeftPress={() => router.back()}
        onRightPress={() => router.push(`/restaurant/edit/${currentRestaurant.id}`)}
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Image avec overlay */}
        <View style={imageContainerStyle}>
          <Image
            source={{ 
              uri: currentRestaurant.image || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=400&h=250&q=80'
            }}
            style={imageStyle}
            resizeMode="cover"
          />
          <View style={imageOverlayStyle}>
            <Text style={titleStyle}>{currentRestaurant.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={subtitleOverlayStyle}>
                {getCuisineLabel(currentRestaurant.cuisine)} • {getPriceRangeDisplay(currentRestaurant.priceRange)}
              </Text>
              <View style={ratingStyle}>
                <Ionicons name="star" size={14} color="#D97706" />
                <Text style={{ color: '#D97706', fontWeight: '500', marginLeft: 4, fontSize: 12 }}>
                  {formatRating(currentRestaurant.rating)}

                </Text>
                <Text style={{ color: '#D97706', fontSize: 10, marginLeft: 2 }}>
                  ({safeNumber(currentRestaurant.reviewCount, 0)})
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Statut détaillé avec horaires */}
        <Card style={{ margin: 16, backgroundColor: isCurrentlyOpen ? '#F0FDF4' : '#FEF2F2' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons 
              name={isCurrentlyOpen ? "checkmark-circle" : "close-circle"} 
              size={24} 
              color={isCurrentlyOpen ? "#16A34A" : "#DC2626"} 
            />
            <Text style={{
              fontSize: 18,
              fontWeight: '600',
              color: isCurrentlyOpen ? "#16A34A" : "#DC2626",
              marginLeft: 8,
            }}>
              {restaurantStatus.status}
            </Text>
          </View>

          {currentRestaurant.isManuallyOverridden && (
            <View style={{
              backgroundColor: '#FEF3C7',
              padding: 8,
              borderRadius: 6,
              marginBottom: 8,
            }}>
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '500' }}>
                ⚠️ Fermeture manuelle active
              </Text>
            </View>
          )}

          <Button
            title={
              currentRestaurant.isManuallyOverridden 
                ? "Gérer la fermeture" 
                : isCurrentlyOpen 
                  ? "Fermer temporairement" 
                  : "Ouvrir exceptionnellement"
            }
            onPress={handleQuickToggleStatus}
            variant={isCurrentlyOpen ? "secondary" : "primary"}
            leftIcon={
              currentRestaurant.isManuallyOverridden 
                ? "settings-outline" 
                : isCurrentlyOpen 
                  ? "pause-circle-outline" 
                  : "play-circle-outline"
            }
            fullWidth
          />
        </Card>

        {/* Statistiques rapides */}
        {stats && (
          <Card style={{ margin: 16, paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={statCardStyle}>
                <Text style={statNumberStyle}>{stats.total_orders}</Text>
                <Text style={statLabelStyle}>Commandes{'\n'}totales</Text>
              </View>
              <View style={statCardStyle}>
                <Text style={[statNumberStyle, { color: stats.active_orders > 0 ? '#EF4444' : '#6B7280' }]}>
                  {stats.active_orders}
                </Text>
                <Text style={statLabelStyle}>Commandes{'\n'}actives</Text>
              </View>
              <View style={statCardStyle}>
                <Text style={statNumberStyle}>{stats.total_tables}</Text>
                <Text style={statLabelStyle}>Tables{'\n'}disponibles</Text>
              </View>
              <View style={statCardStyle}>
                <Text style={statNumberStyle}>{stats.active_menus}</Text>
                <Text style={statLabelStyle}>Menus{'\n'}actifs</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Horaires d'ouverture */}
        <Card style={{ margin: 16 }}>
          <Text style={sectionTitleStyle}>Horaires d'ouverture</Text>
          
          {Array.isArray(currentRestaurant.openingHours) && currentRestaurant.openingHours.map((day) => (
            <View key={day.dayOfWeek} style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 8,
              borderBottomWidth: day.dayOfWeek === 6 ? 0 : 1,
              borderBottomColor: '#F3F4F6',
            }}>
              <Text style={{
                fontSize: 14,
                fontWeight: '500',
                color: '#374151',
                width: 80,
              }}>
                {DAYS_FR[day.dayOfWeek]}
              </Text>
              
              {day.isClosed ? (
                <Text style={{
                  fontSize: 14,
                  color: '#9CA3AF',
                  fontStyle: 'italic',
                }}>
                  Fermé
                </Text>
              ) : (
                <Text style={{
                  fontSize: 14,
                  color: '#374151',
                }}>
                  {day.openTime} - {day.closeTime}
                </Text>
              )}
            </View>
          ))}

          <Button
            title="Modifier les horaires"
            onPress={() => router.push(`/restaurant/hours/${currentRestaurant.id}` as any)}
            variant="outline"
            leftIcon="time-outline"
            fullWidth
            style={{ marginTop: 12 }}
          />
        </Card>

        {/* Gestion de la fermeture manuelle */}
        <ManualOverrideManager
          restaurant={currentRestaurant}
          onUpdate={(data) => updateRestaurant(currentRestaurant.id, data)}
        />

        {/* Informations détaillées */}
        <Card style={{ margin: 16 }}>
          <Text style={sectionTitleStyle}>Informations</Text>
          
          {currentRestaurant.description && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 20 }}>
                {currentRestaurant.description}
              </Text>
            </View>
          )}

          <View style={infoRowStyle}>
            <Ionicons name="location" size={20} color="#6B7280" />
            <Text style={infoTextStyle}>
              {currentRestaurant.address}
              {'\n'}{currentRestaurant.zipCode} {currentRestaurant.city}
              {currentRestaurant.country !== 'France' && `, ${currentRestaurant.country}`}
            </Text>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="call" size={20} color="#6B7280" />
            <Text style={infoTextStyle}>{currentRestaurant.phone}</Text>
            <TouchableOpacity
              onPress={() => {/* Appeler le restaurant */}}
              style={{ marginLeft: 8 }}
            >
              <Ionicons name="call-outline" size={18} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="mail" size={20} color="#6B7280" />
            <Text style={infoTextStyle}>{currentRestaurant.email}</Text>
            <TouchableOpacity
              onPress={() => {/* Envoyer email */}}
              style={{ marginLeft: 8 }}
            >
              <Ionicons name="mail-outline" size={18} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          {currentRestaurant.website && (
            <View style={infoRowStyle}>
              <Ionicons name="globe" size={20} color="#6B7280" />
              <Text style={infoTextStyle}>{currentRestaurant.website}</Text>
              <TouchableOpacity
                onPress={() => {/* Ouvrir site web */}}
                style={{ marginLeft: 8 }}
              >
                <Ionicons name="open-outline" size={18} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Actions rapides */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={[sectionTitleStyle, { marginBottom: 16 }]}>Actions</Text>

          <Button
            title="Gérer les menus"
            onPress={() => router.push(`/menu/${currentRestaurant.id}` as any)}
            variant="outline"
            leftIcon="restaurant-outline"
            fullWidth
            style={actionButtonStyle}
          />

          <Button
            title="Gérer les tables"
            onPress={() => router.push(`/tables/${currentRestaurant.id}` as any)}
            variant="outline"
            leftIcon="grid-outline"
            fullWidth
            style={actionButtonStyle}
          />

          <Button
            title="Voir les commandes"
            onPress={() => router.push(`/orders/${currentRestaurant.id}` as any)}
            variant="outline"
            leftIcon="receipt-outline"
            fullWidth
            style={actionButtonStyle}
          />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              title="Statistiques"
              onPress={() => router.push(`/stats/${currentRestaurant.id}` as any)}
              variant="outline"
              leftIcon="analytics-outline"
              style={{ flex: 1 }}
            />
            
            <Button
              title="Paramètres"
              onPress={() => router.push(`/restaurant/settings/${currentRestaurant.id}` as any)}
              variant="outline"
              leftIcon="settings-outline"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}