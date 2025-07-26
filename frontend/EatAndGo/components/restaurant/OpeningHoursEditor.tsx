import { OpeningHours } from '@/types/restaurant';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface OpeningHoursEditorProps {
  openingHours: OpeningHours[];
  onChange: (hours: OpeningHours[]) => void;
  error?: string;
}

export const OpeningHoursEditor: React.FC<OpeningHoursEditorProps> = ({
  openingHours,
  onChange,
  error
}) => {
  const DAYS_FR = [
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 
    'Jeudi', 'Vendredi', 'Samedi'
  ];

  const updateDay = (dayIndex: number, field: keyof OpeningHours, value: any) => {
    const newHours = openingHours.map((day, index) => {
      if (index === dayIndex) {
        return { ...day, [field]: value };
      }
      return day;
    });
    onChange(newHours);
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(timeString);
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 16,
      }}>
        Horaires d'ouverture *
      </Text>

      {openingHours.map((day, index) => (
        <View key={day.dayOfWeek} style={{
          backgroundColor: '#F9FAFB',
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: '#E5E7EB',
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: day.isClosed ? 0 : 12,
          }}>
            <Text style={{
              fontSize: 16,
              fontWeight: '500',
              color: '#374151',
              flex: 1,
            }}>
              {DAYS_FR[day.dayOfWeek]}
            </Text>

            <TouchableOpacity
              onPress={() => updateDay(index, 'isClosed', !day.isClosed)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: day.isClosed ? '#FEE2E2' : '#D1FAE5',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
              }}
            >
              <Ionicons 
                name={day.isClosed ? "close-circle" : "checkmark-circle"} 
                size={16} 
                color={day.isClosed ? "#DC2626" : "#059669"} 
              />
              <Text style={{
                fontSize: 12,
                fontWeight: '500',
                color: day.isClosed ? "#DC2626" : "#059669",
                marginLeft: 4,
              }}>
                {day.isClosed ? 'Fermé' : 'Ouvert'}
              </Text>
            </TouchableOpacity>
          </View>

          {!day.isClosed && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginBottom: 4,
                }}>
                  Ouverture
                </Text>
                <TouchableOpacity
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: '#FFFFFF',
                  }}
                  onPress={() => {
                    // Ici vous pourriez ouvrir un picker
                    Alert.alert(
                      'Heure d\'ouverture',
                      'Sélectionnez l\'heure d\'ouverture',
                      timeOptions.slice(0, 20).map(time => ({
                        text: time,
                        onPress: () => updateDay(index, 'openTime', time)
                      }))
                    );
                  }}
                >
                  <Text style={{ fontSize: 14, color: '#374151' }}>
                    {day.openTime}
                  </Text>
                </TouchableOpacity>
              </View>

              <Ionicons name="arrow-forward" size={16} color="#6B7280" />

              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginBottom: 4,
                }}>
                  Fermeture
                </Text>
                <TouchableOpacity
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: '#FFFFFF',
                  }}
                  onPress={() => {
                    // Ici vous pourriez ouvrir un picker
                    Alert.alert(
                      'Heure de fermeture',
                      'Sélectionnez l\'heure de fermeture',
                      timeOptions.slice(0, 20).map(time => ({
                        text: time,
                        onPress: () => updateDay(index, 'closeTime', time)
                      }))
                    );
                  }}
                >
                  <Text style={{ fontSize: 14, color: '#374151' }}>
                    {day.closeTime}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ))}

      {error && (
        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
          {error}
        </Text>
      )}

      <View style={{
        backgroundColor: '#EEF2FF',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons name="information-circle" size={16} color="#3B82F6" style={{ marginTop: 2 }} />
          <Text style={{
            fontSize: 12,
            color: '#1E40AF',
            marginLeft: 8,
            flex: 1,
            lineHeight: 16,
          }}>
            Le statut "ouvert/fermé" de votre restaurant sera automatiquement mis à jour selon ces horaires. Vous pourrez toujours fermer manuellement en cas de besoin.
          </Text>
        </View>
      </View>
    </View>
  );
};