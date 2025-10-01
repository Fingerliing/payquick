import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

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

// Composant TimePicker intégré
const TimePicker: React.FC<{
  value: string;
  onChange: (time: string) => void;
  label?: string;
  placeholder?: string;
}> = ({ value, onChange, label, placeholder = '12:00' }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(() => {
    const parts = value.split(':');
    return parts[0] || '12';
  });
  const [selectedMinute, setSelectedMinute] = useState(() => {
    const parts = value.split(':');
    return parts[1] || '00';
  });

  const QUICK_TIMES = [
    { label: '7h', value: '07:00', icon: '☀️' },
    { label: '8h', value: '08:00', icon: '🌅' },
    { label: '9h', value: '09:00', icon: '☕' },
    { label: '10h', value: '10:00', icon: '🥐' },
    { label: '12h', value: '12:00', icon: '🍽️' },
    { label: '14h', value: '14:00', icon: '🥗' },
    { label: '14h30', value: '14:30', icon: '☕' },
    { label: '19h', value: '19:00', icon: '🌆' },
    { label: '20h', value: '20:00', icon: '🍷' },
    { label: '21h', value: '21:00', icon: '🌙' },
    { label: '22h', value: '22:00', icon: '✨' },
    { label: '22h30', value: '22:30', icon: '🌛' },
  ];

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  const handleConfirm = () => {
    onChange(`${selectedHour}:${selectedMinute}`);
    setShowPicker(false);
  };

  const handleQuickTime = (time: string) => {
    onChange(time);
    setShowPicker(false);
  };

  const handleOpen = () => {
    if (value) {
      const parts = value.split(':');
      setSelectedHour(parts[0] || '12');
      setSelectedMinute(parts[1] || '00');
    }
    setShowPicker(true);
  };

  return (
    <>
      <View>
        {label && (
          <Text style={{
            fontSize: 11,
            fontWeight: '600',
            color: '#6B7280',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            {label}
          </Text>
        )}
        
        <TouchableOpacity
          onPress={handleOpen}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: value ? '#D4AF37' : '#D1D5DB',
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Ionicons 
            name="time-outline" 
            size={18} 
            color={value ? '#D4AF37' : '#9CA3AF'} 
            style={{ marginRight: 8 }} 
          />
          <Text style={{
            flex: 1,
            fontSize: 15,
            fontWeight: '600',
            color: value ? '#111827' : '#9CA3AF',
            textAlign: 'center',
          }}>
            {value || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        {/* Use a single overlay Pressable to close the modal when tapping outside the sheet.
            Do not wrap the sheet itself in a touchable component so that ScrollView gestures work
            correctly inside the modal. */}
        {/* Root container covers the entire screen and darkens the background. */}
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'flex-end',
          }}
        >
          {/* Transparent overlay to detect taps outside the bottom sheet and close the modal. */}
          <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
          </TouchableWithoutFeedback>
          {/* Bottom sheet container. It is not wrapped in a touchable so that scroll
              gestures inside it are handled correctly. */}
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '75%',
            }}
          >
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 20,
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
          }}>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={{ padding: 4 }}>
              <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: '500' }}>Annuler</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#FFFCF0',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
                borderWidth: 1,
                borderColor: '#E6D08A',
              }}>
                <Ionicons name="time" size={16} color="#D4AF37" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>
                Choisir l'heure
              </Text>
            </View>

            <TouchableOpacity 
              onPress={handleConfirm}
              style={{
                backgroundColor: '#D4AF37',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
              }}
            >
              <Text style={{ fontSize: 15, color: '#FFFFFF', fontWeight: '600' }}>OK</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: 450 }}
            showsVerticalScrollIndicator={false}
            /* Enable nested scrolling so that child ScrollViews (hours/minutes columns)
               can scroll independently without interfering with the parent scroll. */
            nestedScrollEnabled
            /* Keep the keyboard open while tapping inside the scroll view */
            keyboardShouldPersistTaps="handled"
          >
            {/* Tout le reste du contenu reste identique */}
                  <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      <Ionicons name="flash" size={16} color="#D4AF37" style={{ marginRight: 6 }} />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: '#6B7280',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        Horaires suggérés
                      </Text>
                    </View>
                    
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {QUICK_TIMES.map((time) => (
                        <TouchableOpacity
                          key={time.value}
                          onPress={() => handleQuickTime(time.value)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: value === time.value ? '#FFFCF0' : '#F9FAFB',
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 20,
                            borderWidth: 1.5,
                            borderColor: value === time.value ? '#D4AF37' : '#E5E7EB',
                          }}
                        >
                          <Text style={{ fontSize: 16, marginRight: 6 }}>{time.icon}</Text>
                          <Text style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: value === time.value ? '#B8941F' : '#6B7280',
                          }}>
                            {time.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ padding: 20 }}>
                    {/* Use pointerEvents="none" so that touches on this header pass through to the parent ScrollView.
                        Without this, starting a drag on the text or icon does not initiate scrolling. */}
                    <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                      <Ionicons name="settings-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: '#6B7280',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        Heure personnalisée
                      </Text>
                    </View>

                    {/* Disable touch handling on the decorative gradient so that scroll gestures starting here
                        are handled by the parent ScrollView. */}
                    <LinearGradient
                      pointerEvents="none"
                      colors={['#FFFCF0', '#FAF7E8']}
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        marginBottom: 20,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{
                        fontSize: 42,
                        fontWeight: '700',
                        color: '#1E2A78',
                        letterSpacing: 2,
                      }}>
                        {selectedHour}:{selectedMinute}
                      </Text>
                    </LinearGradient>

                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: '#6B7280',
                          marginBottom: 8,
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}>
                          Heures
                        </Text>
                        <ScrollView
                          style={{
                            height: 210,
                            borderRadius: 12,
                            backgroundColor: '#F9FAFB',
                            borderWidth: 1,
                            borderColor: '#E5E7EB',
                          }}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled
                        >
                          {hours.map((hour) => (
                            <TouchableOpacity
                              key={hour}
                              onPress={() => setSelectedHour(hour)}
                              activeOpacity={0.7}
                              style={{
                                paddingVertical: 12,
                                paddingHorizontal: 16,
                                backgroundColor: selectedHour === hour ? '#FFFCF0' : 'transparent',
                                borderLeftWidth: 3,
                                borderLeftColor: selectedHour === hour ? '#D4AF37' : 'transparent',
                              }}
                            >
                              <Text style={{
                                fontSize: 16,
                                fontWeight: selectedHour === hour ? '700' : '500',
                                color: selectedHour === hour ? '#1E2A78' : '#6B7280',
                                textAlign: 'center',
                              }}>
                                {hour}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>

                      <View style={{
                        width: 32,
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingTop: 24,
                      }}>
                        <Text style={{ fontSize: 28, fontWeight: '700', color: '#D4AF37' }}>:</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: '#6B7280',
                          marginBottom: 8,
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}>
                          Minutes
                        </Text>
                        <ScrollView
                          style={{
                            height: 210,
                            borderRadius: 12,
                            backgroundColor: '#F9FAFB',
                            borderWidth: 1,
                            borderColor: '#E5E7EB',
                          }}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled
                        >
                          {minutes.map((minute, index) => (
                            <TouchableOpacity
                              key={minute}
                              onPress={() => setSelectedMinute(minute)}
                              activeOpacity={0.7}
                              style={{
                                paddingVertical: 14,
                                paddingHorizontal: 16,
                                backgroundColor: selectedMinute === minute ? '#FFFCF0' : 'transparent',
                                borderLeftWidth: 3,
                                borderLeftColor: selectedMinute === minute ? '#D4AF37' : 'transparent',
                                borderTopWidth: index > 0 ? 1 : 0,
                                borderTopColor: '#E5E7EB',
                              }}
                            >
                              <Text style={{
                                fontSize: 16,
                                fontWeight: selectedMinute === minute ? '700' : '500',
                                color: selectedMinute === minute ? '#1E2A78' : '#6B7280',
                                textAlign: 'center',
                              }}>
                                {minute}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              </View>
          </View>
      </Modal>
    </>
  );
};

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
    { 
      name: 'Service continu', 
      icon: '🍽️',
      periods: [{ startTime: '12:00', endTime: '22:00', name: 'Service continu' }] 
    },
    { 
      name: 'Déjeuner + Dîner',
      icon: '🥗',
      periods: [
        { startTime: '12:00', endTime: '14:00', name: 'Déjeuner' },
        { startTime: '19:00', endTime: '22:00', name: 'Dîner' }
      ]
    },
    { 
      name: 'Complet',
      icon: '☕',
      periods: [
        { startTime: '07:00', endTime: '10:00', name: 'Petit-déjeuner' },
        { startTime: '12:00', endTime: '14:30', name: 'Déjeuner' },
        { startTime: '19:00', endTime: '22:30', name: 'Dîner' }
      ]
    },
  ];

  React.useEffect(() => {
    if (!openingHours || openingHours.length !== 7) {
      const defaultHours: OpeningHours[] = Array.from({ length: 7 }, (_, dayIndex) => ({
        dayOfWeek: dayIndex,
        isClosed: dayIndex === 0,
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
      updateDay(dayIndex, {
        isClosed: false,
        periods: [{ startTime: '12:00', endTime: '14:00', name: 'Déjeuner' }]
      });
    } else {
      updateDay(dayIndex, { isClosed: true, periods: [] });
    }
  };

  const addPeriod = (dayIndex: number) => {
    const day = openingHours[dayIndex];
    const lastPeriod = day.periods[day.periods.length - 1];
    const newPeriod: Period = lastPeriod 
      ? { startTime: '19:00', endTime: '22:00', name: '' }
      : { startTime: '12:00', endTime: '14:00', name: 'Service' };
    
    updateDay(dayIndex, { periods: [...day.periods, newPeriod] });
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
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={['#FFFCF0', '#FAF7E8']}
        style={{ padding: 16, borderRadius: 12, marginBottom: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <View style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#D4AF37',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}>
            <Ionicons name="time" size={18} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E2A78' }}>
            Horaires d'ouverture
          </Text>
        </View>
        <Text style={{
          fontSize: 13,
          color: '#6B7280',
          lineHeight: 18,
          marginLeft: 44,
        }}>
          Définissez vos horaires de service pour chaque jour de la semaine
        </Text>
      </LinearGradient>

      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Ionicons name="flash" size={16} color="#D4AF37" style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>
            Modèles rapides
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {SERVICE_PRESETS.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => applyPreset(preset)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: '#E6D08A',
                  flexDirection: 'row',
                  alignItems: 'center',
                  shadowColor: 'rgba(212, 175, 55, 0.15)',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 1,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>{preset.icon}</Text>
                <Text style={{ fontSize: 13, color: '#1E2A78', fontWeight: '600' }}>
                  {preset.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {openingHours && openingHours.length === 7 && openingHours.map((day, dayIndex) => (
        <View key={day.dayOfWeek} style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          borderWidth: 2,
          borderColor: day.isClosed ? '#FCA5A5' : '#D4AF37',
          shadowColor: day.isClosed ? 'rgba(239, 68, 68, 0.1)' : 'rgba(212, 175, 55, 0.15)',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 1,
          shadowRadius: 8,
          elevation: 3,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: day.isClosed ? 0 : 16,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: day.isClosed ? '#FEE2E2' : '#FFFCF0',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: day.isClosed ? '#DC2626' : '#D4AF37',
                }}>
                  {DAYS_FR[day.dayOfWeek].substring(0, 3).toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>
                {DAYS_FR[day.dayOfWeek]}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {!day.isClosed && day.periods.length > 0 && (
                <TouchableOpacity
                  onPress={() => copyToWeekdays(dayIndex)}
                  activeOpacity={0.7}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#EFF6FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#BFDBFE',
                  }}
                >
                  <Ionicons name="copy-outline" size={18} color="#3B82F6" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => toggleDayClosed(dayIndex)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: day.isClosed ? '#FEE2E2' : '#FFFCF0',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: day.isClosed ? '#FCA5A5' : '#E6D08A',
                }}
              >
                <Ionicons 
                  name={day.isClosed ? "close-circle" : "checkmark-circle"} 
                  size={18} 
                  color={day.isClosed ? "#DC2626" : "#D4AF37"} 
                />
                <Text style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: day.isClosed ? "#DC2626" : "#B8941F",
                  marginLeft: 6,
                }}>
                  {day.isClosed ? 'Fermé' : 'Ouvert'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {!day.isClosed && (
            <View>
              {day.periods.map((period, periodIndex) => (
                <View key={periodIndex} style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                }}>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}>
                    <View style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: '#FFFCF0',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                      borderWidth: 1,
                      borderColor: '#E6D08A',
                    }}>
                      <Ionicons name="restaurant" size={14} color="#D4AF37" />
                    </View>
                    <TextInput
                      value={period.name}
                      onChangeText={(text) => updatePeriod(dayIndex, periodIndex, 'name', text)}
                      placeholder="Nom du service (ex: Déjeuner)"
                      placeholderTextColor="#9CA3AF"
                      style={{
                        flex: 1,
                        fontSize: 14,
                        fontWeight: '500',
                        color: '#374151',
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => removePeriod(dayIndex, periodIndex)}
                      activeOpacity={0.7}
                      style={{
                        marginLeft: 10,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: '#FEE2E2',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <TimePicker
                        value={period.startTime}
                        onChange={(time) => updatePeriod(dayIndex, periodIndex, 'startTime', time)}
                        label="Début"
                        placeholder="12:00"
                      />
                    </View>

                    <View style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#FFFCF0',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 18,
                      borderWidth: 1,
                      borderColor: '#E6D08A',
                    }}>
                      <Ionicons name="arrow-forward" size={16} color="#D4AF37" />
                    </View>

                    <View style={{ flex: 1 }}>
                      <TimePicker
                        value={period.endTime}
                        onChange={(time) => updatePeriod(dayIndex, periodIndex, 'endTime', time)}
                        label="Fin"
                        placeholder="14:00"
                      />
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity
                onPress={() => addPeriod(dayIndex)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FFFCF0',
                  borderRadius: 10,
                  paddingVertical: 12,
                  borderWidth: 2,
                  borderColor: '#E6D08A',
                  borderStyle: 'dashed',
                }}
              >
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#D4AF37',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                }}>
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                </View>
                <Text style={{ fontSize: 13, color: '#B8941F', fontWeight: '600' }}>
                  Ajouter une plage horaire
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {error && (
        <View style={{
          backgroundColor: '#FEE2E2',
          padding: 12,
          borderRadius: 8,
          borderLeftWidth: 4,
          borderLeftColor: '#EF4444',
          marginTop: 8,
        }}>
          <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '500' }}>
            {error}
          </Text>
        </View>
      )}

      <LinearGradient
        colors={['#EEF2FF', '#E0E7FF']}
        style={{ padding: 16, borderRadius: 12, marginTop: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#3B82F6',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}>
            <Ionicons name="information" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: 13,
              color: '#1E40AF',
              lineHeight: 18,
              fontWeight: '500',
            }}>
              💡 Cliquez sur les heures pour choisir facilement vos horaires de service
            </Text>
            <Text style={{
              fontSize: 13,
              color: '#1E40AF',
              lineHeight: 18,
              marginTop: 6,
              fontWeight: '500',
            }}>
              ⚡ Utilisez les horaires suggérés ou définissez des heures personnalisées
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};