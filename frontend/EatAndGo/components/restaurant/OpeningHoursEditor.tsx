import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { AlertWithAction } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

// ──────────────────────────────────────────────────────────────────────────
// Palette gold stable cross-thème — identité visuelle de l'éditeur
// (gradients, accents, bordures dorées). Les surfaces et textes principaux
// passent par useAppTheme().
// ──────────────────────────────────────────────────────────────────────────
const GOLD = {
  500: '#D4AF37',
  700: '#B8941F',
} as const;

const NAVY = {
  primary: '#1E2A78',
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────────────────
// Helpers locale
// ──────────────────────────────────────────────────────────────────────────

/**
 * Liste des 7 jours de la semaine dans la locale active, ordre JS (Dimanche=0).
 * Utilise une date dont on sait qu'elle est un dimanche.
 */
const getWeekdays = (locale: string, length: 'long' | 'short' = 'long'): string[] => {
  const days: string[] = [];
  // Le 4 janvier 1970 était un dimanche (utc-safe pour `weekday`).
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.UTC(1970, 0, 4 + i));
    try {
      days.push(
        new Intl.DateTimeFormat(locale, { weekday: length, timeZone: 'UTC' }).format(date),
      );
    } catch {
      // Fallback FR si la locale n'est pas reconnue
      days.push(
        new Intl.DateTimeFormat('fr', { weekday: length, timeZone: 'UTC' }).format(date),
      );
    }
  }
  return days;
};

/**
 * Formate "HH:MM" selon la locale active (ex : "14:30" → "14:30" en FR,
 * "2:30 PM" en EN, etc.).
 */
const formatTimeLabel = (hhmm: string, locale: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const d = new Date(2000, 0, 1, h, m);
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: undefined, // laisse la locale décider
    }).format(d);
  } catch {
    return hhmm;
  }
};

// Heures suggérées — valeurs canoniques HH:MM, formatées dans la locale active
const QUICK_TIME_VALUES: ReadonlyArray<{ value: string; icon: string }> = [
  { value: '07:00', icon: '☀️' },
  { value: '08:00', icon: '🌅' },
  { value: '09:00', icon: '☕' },
  { value: '10:00', icon: '🥐' },
  { value: '12:00', icon: '🍽️' },
  { value: '14:00', icon: '🥗' },
  { value: '14:30', icon: '☕' },
  { value: '19:00', icon: '🌆' },
  { value: '20:00', icon: '🍷' },
  { value: '21:00', icon: '🌙' },
  { value: '22:00', icon: '✨' },
  { value: '22:30', icon: '🌛' },
];

// ──────────────────────────────────────────────────────────────────────────
// TimePicker — bottom-sheet de sélection d'heure
// ──────────────────────────────────────────────────────────────────────────
const TimePicker: React.FC<{
  value: string;
  onChange: (time: string) => void;
  label?: string;
  placeholder?: string;
}> = ({ value, onChange, label, placeholder = '12:00' }) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeTimePickerStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  const [showPicker, setShowPicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(() => {
    const parts = value.split(':');
    return parts[0] || '12';
  });
  const [selectedMinute, setSelectedMinute] = useState(() => {
    const parts = value.split(':');
    return parts[1] || '00';
  });

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

  const displayedValue = value ? formatTimeLabel(value, i18n.language) : '';

  return (
    <>
      <View>
        {label && <Text style={styles.label}>{label}</Text>}

        <TouchableOpacity
          onPress={handleOpen}
          activeOpacity={0.7}
          style={[
            styles.timeField,
            { borderColor: value ? GOLD[500] : colors.border.default },
          ]}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={value ? GOLD[500] : colors.text.light}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.timeFieldValue,
              { color: value ? colors.text.primary : colors.text.light },
            ]}
            numberOfLines={1}
          >
            {displayedValue || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.text.light} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showPicker}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={styles.modalRoot}>
          {/* Overlay pour fermer en tapant en dehors */}
          <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          {/* Bottom sheet */}
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity
                onPress={() => setShowPicker(false)}
                style={{ padding: 4 }}
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>

              <View style={styles.sheetTitleContainer}>
                <View style={styles.sheetTitleIcon}>
                  <Ionicons name="time" size={16} color={GOLD[500]} />
                </View>
                <Text style={styles.sheetTitle}>
                  {t('openingHours.timePicker.title')}
                </Text>
              </View>

              <TouchableOpacity onPress={handleConfirm} style={styles.okBtn}>
                <Text style={styles.okBtnText}>{t('openingHours.timePicker.ok')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 450 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {/* Horaires suggérés */}
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons
                    name="flash"
                    size={16}
                    color={GOLD[500]}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.sectionLabel}>
                    {t('openingHours.timePicker.suggestedTimes')}
                  </Text>
                </View>

                <View style={styles.quickTimesGrid}>
                  {QUICK_TIME_VALUES.map((time) => (
                    <TouchableOpacity
                      key={time.value}
                      onPress={() => handleQuickTime(time.value)}
                      activeOpacity={0.7}
                      style={[
                        styles.quickTimeChip,
                        value === time.value && styles.quickTimeChipSelected,
                      ]}
                    >
                      <Text style={{ fontSize: 16, marginRight: 6 }}>{time.icon}</Text>
                      <Text
                        style={[
                          styles.quickTimeChipText,
                          value === time.value && styles.quickTimeChipTextSelected,
                        ]}
                      >
                        {formatTimeLabel(time.value, i18n.language)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Heure personnalisée */}
              <View style={styles.section}>
                <View
                  pointerEvents="none"
                  style={[styles.sectionHeaderRow, { marginBottom: 16 }]}
                >
                  <Ionicons
                    name="settings-outline"
                    size={16}
                    color={colors.text.secondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.sectionLabel}>
                    {t('openingHours.timePicker.customTime')}
                  </Text>
                </View>

                <LinearGradient
                  pointerEvents="none"
                  colors={['#FFFCF0', '#FAF7E8']}
                  style={styles.timePreview}
                >
                  <Text style={styles.timePreviewText}>
                    {selectedHour}:{selectedMinute}
                  </Text>
                </LinearGradient>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.columnLabel}>
                      {t('openingHours.timePicker.hours')}
                    </Text>
                    <ScrollView
                      style={styles.scrollColumn}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                    >
                      {hours.map((hour) => (
                        <TouchableOpacity
                          key={hour}
                          onPress={() => setSelectedHour(hour)}
                          activeOpacity={0.7}
                          style={[
                            styles.scrollItem,
                            selectedHour === hour && styles.scrollItemSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.scrollItemText,
                              selectedHour === hour && styles.scrollItemTextSelected,
                            ]}
                          >
                            {hour}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.colonContainer}>
                    <Text style={styles.colonText}>:</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.columnLabel}>
                      {t('openingHours.timePicker.minutes')}
                    </Text>
                    <ScrollView
                      style={styles.scrollColumn}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                    >
                      {minutes.map((minute, index) => (
                        <TouchableOpacity
                          key={minute}
                          onPress={() => setSelectedMinute(minute)}
                          activeOpacity={0.7}
                          style={[
                            styles.scrollItem,
                            selectedMinute === minute && styles.scrollItemSelected,
                            index > 0 && {
                              borderTopWidth: 1,
                              borderTopColor: colors.border.default,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.scrollItemText,
                              selectedMinute === minute && styles.scrollItemTextSelected,
                            ]}
                          >
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

// ──────────────────────────────────────────────────────────────────────────
// MultiPeriodHoursEditor — composant principal
// ──────────────────────────────────────────────────────────────────────────
export const MultiPeriodHoursEditor: React.FC<MultiPeriodHoursEditorProps> = ({
  openingHours,
  onChange,
  error,
}) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeEditorStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  // Jours de la semaine dans la locale active
  const weekdaysLong = useMemo(
    () => getWeekdays(i18n.language, 'long'),
    [i18n.language],
  );
  const weekdaysShort = useMemo(
    () => getWeekdays(i18n.language, 'short'),
    [i18n.language],
  );

  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Presets — traduits à l'application (les noms persistent dans la BDD avec
  // la langue active au moment de la création, le restaurateur peut les
  // éditer manuellement par la suite).
  const SERVICE_PRESETS = useMemo(
    () => [
      {
        key: 'continuous',
        name: t('openingHours.presets.continuous.name'),
        icon: '🍽️',
        periods: [
          {
            startTime: '12:00',
            endTime: '22:00',
            name: t('openingHours.presets.continuous.name'),
          },
        ],
      },
      {
        key: 'lunchDinner',
        name: t('openingHours.presets.lunchDinner.name'),
        icon: '🥗',
        periods: [
          {
            startTime: '12:00',
            endTime: '14:00',
            name: t('openingHours.periodNames.lunch'),
          },
          {
            startTime: '19:00',
            endTime: '22:00',
            name: t('openingHours.periodNames.dinner'),
          },
        ],
      },
      {
        key: 'complete',
        name: t('openingHours.presets.complete.name'),
        icon: '☕',
        periods: [
          {
            startTime: '07:00',
            endTime: '10:00',
            name: t('openingHours.periodNames.breakfast'),
          },
          {
            startTime: '12:00',
            endTime: '14:30',
            name: t('openingHours.periodNames.lunch'),
          },
          {
            startTime: '19:00',
            endTime: '22:30',
            name: t('openingHours.periodNames.dinner'),
          },
        ],
      },
    ],
    [t, i18n.language],
  );

  React.useEffect(() => {
    if (!openingHours || openingHours.length !== 7) {
      const defaultHours: OpeningHours[] = Array.from({ length: 7 }, (_, dayIndex) => ({
        dayOfWeek: dayIndex,
        isClosed: dayIndex === 0,
        periods:
          dayIndex === 0
            ? []
            : [
                {
                  startTime: '12:00',
                  endTime: '14:00',
                  name: t('openingHours.periodNames.lunch'),
                },
                {
                  startTime: '19:00',
                  endTime: '22:00',
                  name: t('openingHours.periodNames.dinner'),
                },
              ],
      }));
      onChange(defaultHours);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        periods: [
          {
            startTime: '12:00',
            endTime: '14:00',
            name: t('openingHours.periodNames.lunch'),
          },
        ],
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
      : {
          startTime: '12:00',
          endTime: '14:00',
          name: t('openingHours.periodNames.service'),
        };

    updateDay(dayIndex, { periods: [...day.periods, newPeriod] });
  };

  const removePeriod = (dayIndex: number, periodIndex: number) => {
    const day = openingHours[dayIndex];
    const newPeriods = day.periods.filter((_, idx) => idx !== periodIndex);
    updateDay(dayIndex, { periods: newPeriods });
  };

  const updatePeriod = (
    dayIndex: number,
    periodIndex: number,
    field: keyof Period,
    value: string,
  ) => {
    const day = openingHours[dayIndex];
    const newPeriods = [...day.periods];
    newPeriods[periodIndex] = { ...newPeriods[periodIndex], [field]: value };
    updateDay(dayIndex, { periods: newPeriods });
  };

  const applyPreset = (preset: (typeof SERVICE_PRESETS)[number]) => {
    setConfirm({
      title: t('openingHours.confirmApplyPreset.title'),
      message: t('openingHours.confirmApplyPreset.message', { name: preset.name }),
      onConfirm: () => {
        const newHours = openingHours.map((day) => ({
          ...day,
          isClosed: false,
          periods: preset.periods.map((p) => ({ ...p })),
        }));
        onChange(newHours);
        setConfirm(null);
      },
    });
  };

  const copyToWeekdays = (sourceDayIndex: number) => {
    const sourceDay = openingHours[sourceDayIndex];
    setConfirm({
      title: t('openingHours.confirmCopyHours.title'),
      message: t('openingHours.confirmCopyHours.message', {
        day: weekdaysLong[sourceDayIndex],
      }),
      onConfirm: () => {
        const newHours = openingHours.map((day, idx) => {
          if (idx >= 1 && idx <= 5) {
            return {
              ...day,
              isClosed: sourceDay.isClosed,
              periods: sourceDay.periods.map((p) => ({ ...p })),
            };
          }
          return day;
        });
        onChange(newHours);
        setConfirm(null);
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {confirm && (
        <AlertWithAction
          variant="info"
          title={confirm.title}
          message={confirm.message}
          autoDismiss={false}
          primaryButton={{
            text: t('openingHours.apply'),
            variant: 'primary',
            onPress: confirm.onConfirm,
          }}
          secondaryButton={{
            text: t('common.cancel'),
            onPress: () => setConfirm(null),
          }}
        />
      )}

      {/* En-tête en gradient doré stable */}
      <LinearGradient
        colors={['#FFFCF0', '#FAF7E8']}
        style={styles.headerGradient}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="time" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.headerTitle}>{t('openingHours.title')}</Text>
        </View>
        <Text style={styles.headerSubtitle}>{t('openingHours.subtitle')}</Text>
      </LinearGradient>

      {/* Modèles rapides */}
      <View style={{ marginBottom: 24 }}>
        <View style={[styles.sectionHeaderRow, { marginBottom: 12 }]}>
          <Ionicons
            name="flash"
            size={16}
            color={GOLD[500]}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.sectionLabelStrong}>
            {t('openingHours.quickPresets')}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {SERVICE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.key}
                onPress={() => applyPreset(preset)}
                activeOpacity={0.7}
                style={styles.presetChip}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>{preset.icon}</Text>
                <Text style={styles.presetChipText}>{preset.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Grille des 7 jours */}
      {openingHours &&
        openingHours.length === 7 &&
        openingHours.map((day, dayIndex) => (
          <View
            key={day.dayOfWeek}
            style={[
              styles.dayCard,
              {
                borderColor: day.isClosed ? '#FCA5A5' : GOLD[500],
              },
            ]}
          >
            <View
              style={[
                styles.dayHeader,
                { marginBottom: day.isClosed ? 0 : 16 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View
                  style={[
                    styles.dayAbbrPill,
                    {
                      backgroundColor: day.isClosed
                        ? (isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2')
                        : (isDark ? 'rgba(212,175,55,0.12)' : '#FFFCF0'),
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: day.isClosed ? '#DC2626' : GOLD[500],
                    }}
                  >
                    {(weekdaysShort[day.dayOfWeek] || '')
                      .substring(0, 3)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.dayName}>{weekdaysLong[day.dayOfWeek]}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                {!day.isClosed && day.periods.length > 0 && (
                  <TouchableOpacity
                    onPress={() => copyToWeekdays(dayIndex)}
                    activeOpacity={0.7}
                    style={styles.copyBtn}
                  >
                    <Ionicons name="copy-outline" size={18} color={colors.info} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => toggleDayClosed(dayIndex)}
                  activeOpacity={0.8}
                  style={[
                    styles.openClosedPill,
                    {
                      backgroundColor: day.isClosed
                        ? (isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2')
                        : (isDark ? 'rgba(212,175,55,0.12)' : '#FFFCF0'),
                      borderColor: day.isClosed ? '#FCA5A5' : '#E6D08A',
                    },
                  ]}
                >
                  <Ionicons
                    name={day.isClosed ? 'close-circle' : 'checkmark-circle'}
                    size={18}
                    color={day.isClosed ? '#DC2626' : GOLD[500]}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: day.isClosed ? '#DC2626' : GOLD[700],
                      marginLeft: 6,
                    }}
                  >
                    {day.isClosed
                      ? t('openingHours.closed')
                      : t('openingHours.open')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {!day.isClosed && (
              <View>
                {day.periods.map((period, periodIndex) => (
                  <View key={periodIndex} style={styles.periodCard}>
                    <View style={styles.periodHeader}>
                      <View style={styles.periodIcon}>
                        <Ionicons name="restaurant" size={14} color={GOLD[500]} />
                      </View>
                      <TextInput
                        value={period.name}
                        onChangeText={(text) =>
                          updatePeriod(dayIndex, periodIndex, 'name', text)
                        }
                        placeholder={t('openingHours.serviceNamePlaceholder')}
                        placeholderTextColor={colors.text.light}
                        style={styles.periodNameInput}
                      />
                      <TouchableOpacity
                        onPress={() => removePeriod(dayIndex, periodIndex)}
                        activeOpacity={0.7}
                        style={styles.periodRemoveBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <TimePicker
                          value={period.startTime}
                          onChange={(time) =>
                            updatePeriod(dayIndex, periodIndex, 'startTime', time)
                          }
                          label={t('openingHours.start')}
                          placeholder="12:00"
                        />
                      </View>

                      <View style={styles.arrowBetween}>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color={GOLD[500]}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <TimePicker
                          value={period.endTime}
                          onChange={(time) =>
                            updatePeriod(dayIndex, periodIndex, 'endTime', time)
                          }
                          label={t('openingHours.end')}
                          placeholder="14:00"
                        />
                      </View>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={() => addPeriod(dayIndex)}
                  activeOpacity={0.8}
                  style={styles.addPeriodBtn}
                >
                  <View style={styles.addPeriodBtnIcon}>
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                  </View>
                  <Text style={styles.addPeriodBtnText}>
                    {t('openingHours.addPeriod')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Tips */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(59,130,246,0.15)', 'rgba(99,102,241,0.15)']
            : ['#EEF2FF', '#E0E7FF']
        }
        style={styles.tipsBox}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={styles.tipsIcon}>
            <Ionicons name="information" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipsText}>
              💡 {t('openingHours.tip1')}
            </Text>
            <Text style={[styles.tipsText, { marginTop: 6 }]}>
              ⚡ {t('openingHours.tip2')}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// STYLES — TimePicker
// ──────────────────────────────────────────────────────────────────────────
const makeTimePickerStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    label: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    timeField: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 8,
      paddingVertical: 10,
    },
    timeFieldValue: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
    modalRoot: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: BORDER_RADIUS['3xl'],
      borderTopRightRadius: BORDER_RADIUS['3xl'],
      maxHeight: '75%',
      borderTopWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderTopColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    cancelBtnText: {
      fontSize: 16,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    sheetTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sheetTitleIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(212,175,55,0.12)' : '#FFFCF0',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      borderWidth: 1,
      borderColor: '#E6D08A',
    },
    sheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text.primary,
    },
    okBtn: {
      backgroundColor: GOLD[500],
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    okBtnText: {
      fontSize: 15,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    section: {
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    quickTimesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    quickTimeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.border.default,
    },
    quickTimeChipSelected: {
      backgroundColor: isDark ? 'rgba(212,175,55,0.12)' : '#FFFCF0',
      borderColor: GOLD[500],
    },
    quickTimeChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    quickTimeChipTextSelected: {
      color: GOLD[700],
    },
    timePreview: {
      padding: 16,
      borderRadius: BORDER_RADIUS.xl,
      marginBottom: 20,
      alignItems: 'center',
    },
    timePreviewText: {
      fontSize: 42,
      fontWeight: '700',
      // Navy stable pour préserver l'identité, lisible sur fond or
      color: NAVY.primary,
      letterSpacing: 2,
    },
    columnLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 8,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    scrollColumn: {
      height: 210,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    scrollItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderLeftWidth: 3,
      borderLeftColor: 'transparent',
    },
    scrollItemSelected: {
      backgroundColor: isDark ? 'rgba(212,175,55,0.10)' : '#FFFCF0',
      borderLeftColor: GOLD[500],
    },
    scrollItemText: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.secondary,
      textAlign: 'center',
    },
    scrollItemTextSelected: {
      fontWeight: '700',
      color: NAVY.primary,
    },
    colonContainer: {
      width: 32,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 24,
    },
    colonText: {
      fontSize: 28,
      fontWeight: '700',
      color: GOLD[500],
    },
  });
};

// ──────────────────────────────────────────────────────────────────────────
// STYLES — Editor principal
// ──────────────────────────────────────────────────────────────────────────
const makeEditorStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) =>
  StyleSheet.create({
    headerGradient: {
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 20,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    headerIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: GOLD[500],
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      // Navy stable sur fond doré clair
      color: NAVY.primary,
    },
    headerSubtitle: {
      fontSize: 13,
      // Texte secondaire foncé stable sur fond doré clair
      color: '#6B7280',
      lineHeight: 18,
      marginLeft: 44,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionLabelStrong: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    presetChip: {
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1.5,
      borderColor: '#E6D08A',
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: GOLD[500],
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.15,
      shadowRadius: 4,
      elevation: 2,
    },
    presetChipText: {
      fontSize: 13,
      color: isDark ? GOLD[500] : NAVY.primary,
      fontWeight: '600',
    },
    dayCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 12,
      borderWidth: 2,
      shadowColor: GOLD[500],
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.15,
      shadowRadius: 8,
      elevation: 3,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dayAbbrPill: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    dayName: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text.primary,
      textTransform: 'capitalize',
    },
    copyBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark
        ? 'rgba(59, 130, 246, 0.15)'
        : '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(59,130,246,0.30)' : '#BFDBFE',
    },
    openClosedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
    },
    periodCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    periodHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    periodIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(212,175,55,0.12)' : '#FFFCF0',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      borderWidth: 1,
      borderColor: '#E6D08A',
    },
    periodNameInput: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    periodRemoveBtn: {
      marginLeft: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark
        ? 'rgba(239, 68, 68, 0.15)'
        : '#FEE2E2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowBetween: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(212,175,55,0.12)' : '#FFFCF0',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
      borderWidth: 1,
      borderColor: '#E6D08A',
    },
    addPeriodBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(212,175,55,0.10)' : '#FFFCF0',
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 12,
      borderWidth: 2,
      borderColor: '#E6D08A',
      borderStyle: 'dashed',
    },
    addPeriodBtnIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: GOLD[500],
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    addPeriodBtnText: {
      fontSize: 13,
      color: GOLD[700],
      fontWeight: '600',
    },
    errorBox: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
      marginTop: 8,
    },
    errorText: {
      color: isDark ? '#FCA5A5' : '#991B1B',
      fontSize: 13,
      fontWeight: '500',
    },
    tipsBox: {
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginTop: 16,
    },
    tipsIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.info,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    tipsText: {
      fontSize: 13,
      // Texte bleu stable lisible sur fond pastel bleu
      color: isDark ? '#A5B4FC' : '#1E40AF',
      lineHeight: 18,
      fontWeight: '500',
    },
  });

export default MultiPeriodHoursEditor;