import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppTheme, type AppColors } from '@/utils/designSystem';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '@/contexts/NotificationContext';
import { NotificationPreferences } from '@/services/notificationService';

// =============================================================================
// CONSTANTES
// =============================================================================

const COLORS = {
  primary: '#1E3A5F',
  gold: '#D4AF37',
  background: '#F8F9FA',
  cardBg: '#FFFFFF',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  switchTrack: '#E5E7EB',
  switchTrackActive: '#1E3A5F',
  success: '#22C55E',
};

const makeColors = (c: AppColors, isDark: boolean) => ({
  primary: c.primary,
  gold: '#D4AF37',
  background: c.background,
  cardBg: c.surface,
  text: c.text.primary,
  textSecondary: c.text.secondary,
  textMuted: c.text.light,
  border: c.border.light,
  switchTrack: c.border.light,
  switchTrackActive: c.primary,
  success: '#22C55E',
});

// Générer les heures pour le picker
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

// =============================================================================
// TYPES
// =============================================================================

interface PreferenceItemProps {
  icon: string;
  iconColor?: string;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (time: string) => void;
  currentValue: string | null;
  title: string;
}

// =============================================================================
// COMPOSANT TIME PICKER MODAL
// =============================================================================

function TimePickerModal({
  visible,
  onClose,
  onSelect,
  currentValue,
  title,
}: TimePickerModalProps) {
  const { colors, isDark } = useAppTheme();
  const COLORS = useMemo(() => makeColors(colors, isDark), [colors, isDark]);
  const pickerStyles = useMemo(() => createPickerStyles(COLORS), [COLORS]);
  const { t } = useTranslation();
  const [selectedHour, setSelectedHour] = useState('22');
  const [selectedMinute, setSelectedMinute] = useState('00');

  useEffect(() => {
    if (currentValue) {
      const [h, m] = currentValue.split(':');
      setSelectedHour(h || '22');
      // Arrondir aux 15 minutes les plus proches
      const minute = parseInt(m || '0');
      const roundedMinute = Math.round(minute / 15) * 15;
      setSelectedMinute(roundedMinute === 60 ? '00' : roundedMinute.toString().padStart(2, '0'));
    }
  }, [currentValue, visible]);

  const handleConfirm = () => {
    onSelect(`${selectedHour}:${selectedMinute}:00`);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.container}>
          <Text style={pickerStyles.title}>{title}</Text>

          <View style={pickerStyles.pickersRow}>
            {/* Heures */}
            <View style={pickerStyles.pickerColumn}>
              <Text style={pickerStyles.pickerLabel}>{t('prefs.hour')}</Text>
              <FlatList
                data={HOURS}
                keyExtractor={(item) => item}
                style={pickerStyles.list}
                showsVerticalScrollIndicator={false}
                initialScrollIndex={Math.max(0, HOURS.indexOf(selectedHour))}
                getItemLayout={(_, index) => ({
                  length: 48,
                  offset: 48 * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      pickerStyles.pickerItem,
                      item === selectedHour && pickerStyles.pickerItemSelected,
                    ]}
                    onPress={() => setSelectedHour(item)}
                  >
                    <Text
                      style={[
                        pickerStyles.pickerItemText,
                        item === selectedHour && pickerStyles.pickerItemTextSelected,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            <Text style={pickerStyles.separator}>:</Text>

            {/* Minutes */}
            <View style={pickerStyles.pickerColumn}>
              <Text style={pickerStyles.pickerLabel}>{t('prefs.minutes')}</Text>
              <FlatList
                data={MINUTES}
                keyExtractor={(item) => item}
                style={pickerStyles.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      pickerStyles.pickerItem,
                      item === selectedMinute && pickerStyles.pickerItemSelected,
                    ]}
                    onPress={() => setSelectedMinute(item)}
                  >
                    <Text
                      style={[
                        pickerStyles.pickerItemText,
                        item === selectedMinute && pickerStyles.pickerItemTextSelected,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>

          {/* Aperçu */}
          <View style={pickerStyles.preview}>
            <Text style={pickerStyles.previewText}>
              {selectedHour}:{selectedMinute}
            </Text>
          </View>

          {/* Actions */}
          <View style={pickerStyles.actions}>
            <TouchableOpacity style={pickerStyles.cancelButton} onPress={onClose}>
              <Text style={pickerStyles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pickerStyles.confirmButton} onPress={handleConfirm}>
              <Text style={pickerStyles.confirmButtonText}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createPickerStyles = (COLORS: ReturnType<typeof makeColors>) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  pickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerColumn: {
    alignItems: 'center',
  },
  pickerLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  list: {
    height: 180,
    width: 80,
  },
  separator: {
    fontSize: 32,
    fontWeight: '600',
    color: COLORS.primary,
    marginHorizontal: 16,
  },
  pickerItem: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  pickerItemSelected: {
    backgroundColor: `${COLORS.primary}15`,
  },
  pickerItemText: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  pickerItemTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  preview: {
    alignItems: 'center',
    marginVertical: 20,
    padding: 16,
    backgroundColor: COLORS.background,
    borderRadius: 12,
  },
  previewText: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

// =============================================================================
// COMPOSANTS RÉUTILISABLES
// =============================================================================

function Section({ title, children }: SectionProps) {
  const { colors, isDark } = useAppTheme();
  const COLORS = useMemo(() => makeColors(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function PreferenceItem({
  icon,
  iconColor,
  title,
  description,
  value,
  onValueChange,
  disabled = false,
}: PreferenceItemProps) {
  const { colors, isDark } = useAppTheme();
  const COLORS = useMemo(() => makeColors(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const resolvedIconColor = iconColor ?? COLORS.primary;
  return (
    <View style={[styles.preferenceItem, disabled && styles.preferenceItemDisabled]}>
      <View style={[styles.preferenceIcon, { backgroundColor: `${resolvedIconColor}15` }]}>
        <Ionicons name={icon as any} size={22} color={resolvedIconColor} />
      </View>
      <View style={styles.preferenceContent}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.switchTrack, true: COLORS.switchTrackActive }}
        thumbColor="#FFFFFF"
        disabled={disabled}
      />
    </View>
  );
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function NotificationPreferencesScreen() {
  const { colors, isDark } = useAppTheme();
  const COLORS = useMemo(() => makeColors(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const { t } = useTranslation();
  const router = useRouter();
  const {
    preferences,
    updatePreferences,
    hasPermissions,
    requestPermissions,
  } = useNotifications();

  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Initialiser les préférences locales
  useEffect(() => {
    if (preferences) {
      setLocalPrefs(preferences);
    }
  }, [preferences]);

  // Sauvegarder une préférence
  const handlePreferenceChange = useCallback(
    async (key: keyof NotificationPreferences, value: boolean | string) => {
      if (!localPrefs) return;

      // Mise à jour locale immédiate
      setLocalPrefs((prev) => prev ? { ...prev, [key]: value } : null);

      // Sauvegarder sur le serveur
      setIsSaving(true);
      try {
        await updatePreferences({ [key]: value });
      } catch (error) {
        // Restaurer la valeur précédente en cas d'erreur
        setLocalPrefs((prev) => prev ? { ...prev, [key]: localPrefs[key] } : null);
        Alert.alert(t('common.error'), t('prefs.saveFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [localPrefs, updatePreferences]
  );

  // Demander les permissions
  const handleRequestPermissions = async () => {
    const granted = await requestPermissions();
    if (!granted) {
      Alert.alert(
        t('prefs.permissionsTitle'),
        t('prefs.permissionsMessage'),
        [
          { text: 'OK', style: 'default' },
        ]
      );
    }
  };

  // Formater l'heure pour affichage
  const formatTime = (timeString: string | null): string => {
    if (!timeString) return '00:00';
    return timeString.substring(0, 5);
  };

  // Affichage chargement initial
  if (!localPrefs) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t('prefs.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('prefs.title')}</Text>
        {isSaving && <ActivityIndicator size="small" color={COLORS.primary} />}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Alerte permissions */}
        {!hasPermissions && (
          <TouchableOpacity style={styles.permissionAlert} onPress={handleRequestPermissions}>
            <View style={styles.permissionIconContainer}>
              <Ionicons name="warning" size={24} color="#F59E0B" />
            </View>
            <View style={styles.permissionContent}>
              <Text style={styles.permissionTitle}>{t('prefs.disabledTitle')}</Text>
              <Text style={styles.permissionText}>{t('prefs.disabledSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        {/* Commandes */}
        <Section title={t('prefs.ordersTitle')}>
          <PreferenceItem
            icon="receipt-outline"
            iconColor="#3B82F6"
            title={t('prefs.sectionOrders')}
            description={t('prefs.ordersDesc')}
            value={localPrefs.order_updates}
            onValueChange={(v) => handlePreferenceChange('order_updates', v)}
          />
          <PreferenceItem
            icon="fast-food"
            iconColor="#22C55E"
            title={t('prefs.orderReadyTitle')}
            description={t('prefs.orderReadyDesc')}
            value={localPrefs.order_ready}
            onValueChange={(v) => handlePreferenceChange('order_ready', v)}
          />
        </Section>

        {/* Paiements */}
        <Section title={t('prefs.sectionPayments')}>
          <PreferenceItem
            icon="card-outline"
            iconColor="#8B5CF6"
            title={t('prefs.paymentTitle')}
            description={t('prefs.paymentDesc')}
            value={localPrefs.payment_received}
            onValueChange={(v) => handlePreferenceChange('payment_received', v)}
          />
        </Section>

        {/* Restaurateurs */}
        <Section title={t('prefs.sectionRestaurateurs')}>
          <PreferenceItem
            icon="restaurant-outline"
            iconColor="#EF4444"
            title={t('prefs.newOrdersTitle')}
            description={t('prefs.newOrdersDesc')}
            value={localPrefs.new_orders}
            onValueChange={(v) => handlePreferenceChange('new_orders', v)}
          />
        </Section>

        {/* Marketing */}
        <Section title={t('prefs.sectionMarketing')}>
          <PreferenceItem
            icon="pricetag-outline"
            iconColor={COLORS.gold}
            title={t('prefs.promoTitle')}
            description={t('prefs.promoDesc')}
            value={localPrefs.promotions}
            onValueChange={(v) => handlePreferenceChange('promotions', v)}
          />
        </Section>

        {/* Heures silencieuses */}
        <Section title={t('prefs.quietTitle')}>
          <PreferenceItem
            icon="moon-outline"
            iconColor="#6366F1"
            title={t('prefs.sectionDnd')}
            description={t('prefs.quietDesc')}
            value={localPrefs.quiet_hours_enabled}
            onValueChange={(v) => handlePreferenceChange('quiet_hours_enabled', v)}
          />

          {localPrefs.quiet_hours_enabled && (
            <View style={styles.timeContainer}>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowStartPicker(true)}
              >
                <Text style={styles.timeLabel}>{t('prefs.start')}</Text>
                <Text style={styles.timeValue}>
                  {formatTime(localPrefs.quiet_hours_start)}
                </Text>
              </TouchableOpacity>

              <View style={styles.timeSeparator}>
                <Ionicons name="arrow-forward" size={20} color={COLORS.textMuted} />
              </View>

              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowEndPicker(true)}
              >
                <Text style={styles.timeLabel}>{t('prefs.end')}</Text>
                <Text style={styles.timeValue}>
                  {formatTime(localPrefs.quiet_hours_end)}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* Son et vibration */}
        <Section title={t('prefs.sectionSound')}>
          <PreferenceItem
            icon="volume-high-outline"
            iconColor="#0EA5E9"
            title={t('prefs.soundTitle')}
            description={t('prefs.soundDesc')}
            value={localPrefs.sound_enabled}
            onValueChange={(v) => handlePreferenceChange('sound_enabled', v)}
          />
          <PreferenceItem
            icon="phone-portrait-outline"
            iconColor="#14B8A6"
            title={t('prefs.vibrationTitle')}
            description={t('prefs.vibrationDesc')}
            value={localPrefs.vibration_enabled}
            onValueChange={(v) => handlePreferenceChange('vibration_enabled', v)}
          />
        </Section>

        {/* Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Time Pickers */}
      <TimePickerModal
        visible={showStartPicker}
        onClose={() => setShowStartPicker(false)}
        onSelect={(time) => handlePreferenceChange('quiet_hours_start', time)}
        currentValue={localPrefs.quiet_hours_start}
        title={t('prefs.startTime')}
      />

      <TimePickerModal
        visible={showEndPicker}
        onClose={() => setShowEndPicker(false)}
        onSelect={(time) => handlePreferenceChange('quiet_hours_end', time)}
        currentValue={localPrefs.quiet_hours_end}
        title={t('prefs.endTime')}
      />
    </SafeAreaView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const createStyles = (COLORS: ReturnType<typeof makeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Permission alert
  permissionAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  permissionIconContainer: {
    marginRight: 12,
  },
  permissionContent: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 2,
  },
  permissionText: {
    fontSize: 13,
    color: '#B45309',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionContent: {
    backgroundColor: COLORS.cardBg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },

  // Preference item
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  preferenceItemDisabled: {
    opacity: 0.5,
  },
  preferenceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  preferenceContent: {
    flex: 1,
    marginRight: 12,
  },
  preferenceTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
  },
  preferenceDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Time picker
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: COLORS.cardBg,
  },
  timeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.background,
    borderRadius: 12,
  },
  timeLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.primary,
  },
  timeSeparator: {
    paddingHorizontal: 16,
  },

  bottomSpacer: {
    height: 40,
  },
});