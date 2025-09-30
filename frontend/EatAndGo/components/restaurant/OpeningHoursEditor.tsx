import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Period {
  startTime: string;
  endTime: string;
  name?: string;
}

interface OpeningHours {
  dayOfWeek: number;
  isClosed: boolean;
  periods: Period[];
}

interface MultiPeriodHoursEditorProps {
  openingHours: OpeningHours[];
  onChange: (hours: OpeningHours[]) => void;
  error?: string;
}

export const MultiPeriodHoursEditor: React.FC<MultiPeriodHoursEditorProps> = ({
  openingHours,
  onChange,
  error
}) => {
  const DAYS_FR = [
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 
    'Jeudi', 'Vendredi', 'Samedi'
  ];

  const SERVICE_PRESETS = [
    { name: 'Service continu', periods: [{ startTime: '12:00', endTime: '22:00', name: 'Service continu' }] },
    { name: 'Déjeuner + Dîner', periods: [
      { startTime: '12:00', endTime: '14:00', name: 'Déjeuner' },
      { startTime: '19:00', endTime: '22:00', name: 'Dîner' }
    ]},
    { name: 'Petit-déj + Déjeuner + Dîner', periods: [
      { startTime: '07:00', endTime: '10:00', name: 'Petit-déjeuner' },
      { startTime: '12:00', endTime: '14:30', name: 'Déjeuner' },
      { startTime: '19:00', endTime: '22:30', name: 'Dîner' }
    ]},
  ];

  // Initialiser les horaires si nécessaire
  React.useEffect(() => {
    if (!openingHours || openingHours.length !== 7) {
      const defaultHours: OpeningHours[] = Array.from({ length: 7 }, (_, dayIndex) => ({
        dayOfWeek: dayIndex,
        isClosed: dayIndex === 0, // Fermé le dimanche par défaut
        periods: dayIndex === 0 ? [] : [
          { startTime: '12:00', endTime: '14:00', name: 'Déjeuner' },
          { startTime: '19:00', endTime: '22:00', name: 'Dîner' }
        ]
      }));
      onChange(defaultHours);
    }
  }, []);

  const updateDay = (dayIndex: number, updates: Partial<OpeningHours>) => {
    const newHours = [...openingHours];
    newHours[dayIndex] = { ...newHours[dayIndex], ...updates };
    onChange(newHours);
  };

  const toggleDayClosed = (dayIndex: number) => {
    const day = openingHours[dayIndex];
    if (day.isClosed) {
      // Ouvrir avec horaires par défaut
      updateDay(dayIndex, {
        isClosed: false,
        periods: [{ startTime: '12:00', endTime: '14:00', name: 'Déjeuner' }]
      });
    } else {
      // Fermer
      updateDay(dayIndex, {
        isClosed: true,
        periods: []
      });
    }
  };

  const addPeriod = (dayIndex: number) => {
    const day = openingHours[dayIndex];
    const lastPeriod = day.periods[day.periods.length - 1];
    const newPeriod: Period = lastPeriod 
      ? { startTime: '19:00', endTime: '22:00', name: '' }
      : { startTime: '12:00', endTime: '14:00', name: 'Service' };
    
    updateDay(dayIndex, {
      periods: [...day.periods, newPeriod]
    });
  };

  const removePeriod = (dayIndex: number, periodIndex: number) => {
    const day = openingHours[dayIndex];
    const newPeriods = day.periods.filter((_, idx) => idx !== periodIndex);
    updateDay(dayIndex, { periods: newPeriods });
  };

  const updatePeriod = (dayIndex: number, periodIndex: number, field: keyof Period, value: string) => {
    const day = openingHours[dayIndex];
    const newPeriods = [...day.periods];
    newPeriods[periodIndex] = { ...newPeriods[periodIndex], [field]: value };
    updateDay(dayIndex, { periods: newPeriods });
  };

  const applyPreset = (preset: typeof SERVICE_PRESETS[0]) => {
    Alert.alert(
      'Appliquer le modèle',
      `Voulez-vous appliquer "${preset.name}" à tous les jours ouverts ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Appliquer',
          onPress: () => {
            const newHours = openingHours.map(day => {
              if (!day.isClosed) {
                return { ...day, periods: [...preset.periods] };
              }
              return day;
            });
            onChange(newHours);
          }
        }
      ]
    );
  };

  const copyToWeekdays = (sourceDayIndex: number) => {
    const sourceDay = openingHours[sourceDayIndex];
    Alert.alert(
      'Copier les horaires',
      'Appliquer ces horaires à tous les jours de la semaine (lundi-vendredi) ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Appliquer',
          onPress: () => {
            const newHours = openingHours.map((day, idx) => {
              // Appliquer aux jours 1-5 (lundi-vendredi)
              if (idx >= 1 && idx <= 5) {
                return {
                  ...day,
                  isClosed: sourceDay.isClosed,
                  periods: [...sourceDay.periods]
                };
              }
              return day;
            });
            onChange(newHours);
          }
        }
      ]
    );
  };

  return (
    <View>
      {/* Modèles rapides */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{
          fontSize: 14,
          fontWeight: '600',
          color: '#374151',
          marginBottom: 8,
        }}>
          Modèles rapides
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SERVICE_PRESETS.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => applyPreset(preset)}
                style={{
                  backgroundColor: '#E0E7FF',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                }}
              >
                <Text style={{
                  fontSize: 12,
                  color: '#4338CA',
                  fontWeight: '500',
                }}>
                  {preset.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Jours de la semaine */}
      {openingHours && openingHours.length === 7 && openingHours.map((day, dayIndex) => (
        <View key={day.dayOfWeek} style={{
          backgroundColor: '#F9FAFB',
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: day.isClosed ? '#FCA5A5' : '#A7F3D0',
        }}>
          {/* En-tête du jour */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: day.isClosed ? 0 : 12,
          }}>
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#111827',
              flex: 1,
            }}>
              {DAYS_FR[day.dayOfWeek]}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Bouton copier (seulement pour les jours ouverts) */}
              {!day.isClosed && day.periods.length > 0 && (
                <TouchableOpacity
                  onPress={() => copyToWeekdays(dayIndex)}
                  style={{
                    padding: 4,
                  }}
                >
                  <Ionicons name="copy-outline" size={18} color="#6B7280" />
                </TouchableOpacity>
              )}

              {/* Toggle ouvert/fermé */}
              <TouchableOpacity
                onPress={() => toggleDayClosed(dayIndex)}
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
          </View>

          {/* Périodes d'ouverture */}
          {!day.isClosed && (
            <View>
              {day.periods.map((period, periodIndex) => (
                <View key={periodIndex} style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                }}>
                  {/* Nom du service */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}>
                    <TextInput
                      value={period.name}
                      onChangeText={(text) => updatePeriod(dayIndex, periodIndex, 'name', text)}
                      placeholder="Nom du service (ex: Déjeuner)"
                      placeholderTextColor="#9CA3AF"
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: '#374151',
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        borderRadius: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => removePeriod(dayIndex, periodIndex)}
                      style={{
                        marginLeft: 8,
                        padding: 4,
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  {/* Heures */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 10,
                        color: '#6B7280',
                        marginBottom: 2,
                      }}>
                        Début
                      </Text>
                      <TextInput
                        value={period.startTime}
                        onChangeText={(text) => updatePeriod(dayIndex, periodIndex, 'startTime', text)}
                        placeholder="12:00"
                        placeholderTextColor="#9CA3AF"
                        style={{
                          borderWidth: 1,
                          borderColor: '#D1D5DB',
                          borderRadius: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          backgroundColor: '#FFFFFF',
                          fontSize: 14,
                          color: '#111827',
                          textAlign: 'center',
                        }}
                      />
                    </View>

                    <Ionicons 
                      name="arrow-forward" 
                      size={16} 
                      color="#6B7280" 
                      style={{ marginTop: 12 }}
                    />

                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 10,
                        color: '#6B7280',
                        marginBottom: 2,
                      }}>
                        Fin
                      </Text>
                      <TextInput
                        value={period.endTime}
                        onChangeText={(text) => updatePeriod(dayIndex, periodIndex, 'endTime', text)}
                        placeholder="14:00"
                        placeholderTextColor="#9CA3AF"
                        style={{
                          borderWidth: 1,
                          borderColor: '#D1D5DB',
                          borderRadius: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          backgroundColor: '#FFFFFF',
                          fontSize: 14,
                          color: '#111827',
                          textAlign: 'center',
                        }}
                      />
                    </View>
                  </View>
                </View>
              ))}

              {/* Bouton ajouter une période */}
              <TouchableOpacity
                onPress={() => addPeriod(dayIndex)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#EFF6FF',
                  borderRadius: 6,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: '#BFDBFE',
                  borderStyle: 'dashed',
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color="#3B82F6" />
                <Text style={{
                  fontSize: 12,
                  color: '#3B82F6',
                  fontWeight: '500',
                  marginLeft: 4,
                }}>
                  Ajouter une plage horaire
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {error && (
        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
          {error}
        </Text>
      )}

      {/* Info */}
      <View style={{
        backgroundColor: '#EEF2FF',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons name="information-circle" size={16} color="#3B82F6" style={{ marginTop: 2 }} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{
              fontSize: 12,
              color: '#1E40AF',
              lineHeight: 16,
            }}>
              Vous pouvez définir plusieurs services par jour (déjeuner, dîner, etc.).
            </Text>
            <Text style={{
              fontSize: 12,
              color: '#1E40AF',
              lineHeight: 16,
              marginTop: 4,
            }}>
              Format des heures : HH:MM (ex: 12:00, 19:30)
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};