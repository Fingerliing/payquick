import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  type AppColors,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';
import {
  restaurantDirectoryService,
  type SiretEnrichment,
} from '@/services/restaurantDirectoryService';

const makeColors = (c: AppColors) => ({
  primary: c.primary,
  cardBg: c.surface,
  text: c.text.primary,
  textSecondary: c.text.secondary,
  border: c.border.light,
  success: c.success,
  warning: c.warning,
  error: c.error,
});
type Colors = ReturnType<typeof makeColors>;
type ScreenType = ReturnType<typeof useScreenType>;

interface SiretEnrichFieldProps {
  siret: string;
  onEnriched: (data: SiretEnrichment) => void;
  disabled?: boolean;
}

export const SiretEnrichField: React.FC<SiretEnrichFieldProps> = ({
  siret,
  onEnriched,
  disabled,
}) => {
  const { colors: C } = useAppTheme();
  const { t } = useTranslation();
  const screenType = useScreenType();
  const colors = useMemo(() => makeColors(C), [C]);
  const styles = useMemo(() => createStyles(colors, screenType), [colors, screenType]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SiretEnrichment | null>(null);

  const cleaned = (siret || '').replace(/\s/g, '');
  const isValidFormat = /^\d{14}$/.test(cleaned);

  const verify = async () => {
    setError(null);
    setResult(null);
    if (!isValidFormat) {
      setError(t('siret.invalidFormat'));
      return;
    }
    setLoading(true);
    try {
      const data = await restaurantDirectoryService.enrichSiret(cleaned);
      setResult(data);
      onEnriched(data);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.detail ||
        e?.message ||
        t('siret.notFound');
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, (!isValidFormat || disabled) && styles.btnDisabled]}
        onPress={verify}
        disabled={loading || disabled || !isValidFormat}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <>
            <Ionicons name="business-outline" size={16} color={colors.primary} />
            <Text style={styles.btnText}>{t('siret.verifyFill')}</Text>
          </>
        )}
      </TouchableOpacity>

      {error ? (
        <View style={[styles.panel, styles.panelError]}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.panelErrorText}>{error}</Text>
        </View>
      ) : null}

      {result ? (
        <View style={styles.panel}>
          <View style={styles.resultHeader}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.resultName} numberOfLines={2}>
              {result.raison_sociale || t('siret.establishmentFound')}
            </Text>
          </View>
          {result.address ? (
            <Text style={styles.resultLine}>
              {result.address}, {result.zip_code} {result.city}
            </Text>
          ) : null}
          {result.ape_code ? (
            <Text style={styles.resultMeta}>APE {result.ape_code}</Text>
          ) : null}

          {result.warnings?.map((w, i) => (
            <View key={i} style={styles.warningRow}>
              <Ionicons name="warning-outline" size={13} color={colors.warning} />
              <Text style={styles.warningText}>{w}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

function createStyles(colors: Colors, screenType: ScreenType) {
  // SPACING.* est responsive ({ mobile, tablet, desktop }) → résolu ici.
  // BORDER_RADIUS.* est déjà une valeur plate.
  const s = {
    xs: getResponsiveValue(SPACING.xs, screenType),
    sm: getResponsiveValue(SPACING.sm, screenType),
    md: getResponsiveValue(SPACING.md, screenType),
  };

  return StyleSheet.create({
    container: { gap: s.sm, marginTop: s.xs },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.sm,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: s.sm,
      backgroundColor: colors.cardBg,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

    panel: {
      backgroundColor: colors.cardBg,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: s.md,
      gap: 4,
    },
    panelError: { flexDirection: 'row', alignItems: 'center', gap: s.sm },
    panelErrorText: { flex: 1, color: colors.error, fontSize: 13 },

    resultHeader: { flexDirection: 'row', alignItems: 'center', gap: s.sm },
    resultName: { flex: 1, fontWeight: '700', color: colors.text, fontSize: 14 },
    resultLine: { color: colors.textSecondary, fontSize: 13 },
    resultMeta: { color: colors.textSecondary, fontSize: 12 },

    warningRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    warningText: { flex: 1, color: colors.warning, fontSize: 12 },
  });
}

export default SiretEnrichField;