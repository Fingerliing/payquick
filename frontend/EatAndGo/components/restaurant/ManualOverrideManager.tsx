import { Restaurant } from '@/types/restaurant';
import { View, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface ManualOverrideManagerProps {
  restaurant: Restaurant;
  onUpdate: (data: Partial<Restaurant>) => Promise<void>;
}

export const ManualOverrideManager: React.FC<ManualOverrideManagerProps> = ({
  restaurant,
  onUpdate
}) => {
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideUntil, setOverrideUntil] = useState<Date | null>(null);

  const handleManualClose = () => {
    Alert.alert(
      'Fermer temporairement',
      'Voulez-vous fermer temporairement votre restaurant ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Fermer',
          style: 'destructive',
          onPress: () => showOverrideOptions()
        }
      ]
    );
  };

  const showOverrideOptions = () => {
    Alert.prompt(
      'Raison de la fermeture',
      'Indiquez la raison (vacances, travaux, etc.)',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: (reason) => showDatePicker(reason || 'Fermeture temporaire')
        }
      ],
      'plain-text',
      'Vacances'
    );
  };

  const showDatePicker = (reason: string) => {
    // Ici vous pourriez utiliser un DatePicker plus sophistiqué
    Alert.alert(
      'Durée de fermeture',
      'Choisissez la durée',
      [
        {
          text: '1 jour',
          onPress: () => applyOverride(reason, 1)
        },
        {
          text: '3 jours',
          onPress: () => applyOverride(reason, 3)
        },
        {
          text: '1 semaine',
          onPress: () => applyOverride(reason, 7)
        },
        {
          text: 'Jusqu\'à nouvel ordre',
          onPress: () => applyOverride(reason, null)
        }
      ]
    );
  };

  const applyOverride = async (reason: string, days: number | null) => {
    try {
      let overrideUntil = null;
      if (days) {
        const until = new Date();
        until.setDate(until.getDate() + days);
        overrideUntil = until.toISOString();
      }

      await onUpdate({
        isManuallyOverridden: true,
        manualOverrideReason: reason,
        manualOverrideUntil: overrideUntil,
      });

      Alert.alert('Succès', 'Restaurant fermé temporairement');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de fermer le restaurant');
    }
  };

  const handleRemoveOverride = async () => {
    try {
      await onUpdate({
        isManuallyOverridden: false,
        manualOverrideReason: undefined,
        manualOverrideUntil: undefined,
      });

      Alert.alert('Succès', 'Fermeture manuelle annulée');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'annuler la fermeture');
    }
  };

  if (restaurant.isManuallyOverridden) {
    return (
      <Card style={{ margin: 16, backgroundColor: '#FEF2F2' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Ionicons name="warning" size={20} color="#DC2626" />
          <Text style={{
            fontSize: 16,
            fontWeight: '600',
            color: '#DC2626',
            marginLeft: 8,
          }}>
            Restaurant fermé temporairement
          </Text>
        </View>

        <Text style={{ fontSize: 14, color: '#374151', marginBottom: 8 }}>
          Raison: {restaurant.manualOverrideReason}
        </Text>

        {restaurant.manualOverrideUntil && (
          <Text style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
            Jusqu'au: {new Date(restaurant.manualOverrideUntil).toLocaleDateString('fr-FR')}
          </Text>
        )}

        <Button
          title="Réouvrir le restaurant"
          onPress={handleRemoveOverride}
          variant="primary"
          leftIcon="checkmark-circle-outline"
        />
      </Card>
    );
  }

  return (
    <Card style={{ margin: 16 }}>
      <Text style={{
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 12,
      }}>
        Fermeture temporaire
      </Text>

      <Text style={{
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 16,
        lineHeight: 20,
      }}>
        En cas de vacances, travaux ou fermeture exceptionnelle, vous pouvez fermer temporairement votre restaurant.
      </Text>

      <Button
        title="Fermer temporairement"
        onPress={handleManualClose}
        variant="secondary"
        leftIcon="close-circle-outline"
      />
    </Card>
  );
};