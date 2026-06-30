/**
 * Section de gestion des formules (écran menu restaurateur).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { formuleService } from '@/services/formuleService';
import { useAppTheme, BORDER_RADIUS, type AppColors } from '@/utils/designSystem';

interface FormuleRow {
  id: string;
  name: string;
  price: string | number;
  is_active: boolean;
  courses_count?: number;
}

interface Props {
  restaurantId: number | string;
}

export function FormulesManagerSection({ restaurantId }: Props) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [formules, setFormules] = useState<FormuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await formuleService.getRestaurantFormules(restaurantId);
      setFormules(Array.isArray(data) ? data : []);
    } catch {
      setFormules([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const goAdd = () => router.push({
    pathname: '/menu/formule/add' as any,
    params: { restaurantId: String(restaurantId) },
  });

  const goEdit = (id: string) => router.push({
    pathname: '/menu/formule/add' as any,
    params: { restaurantId: String(restaurantId), formuleId: id },
  });

  const toggle = async (f: FormuleRow) => {
    setBusyId(f.id);
    try {
      const res = await formuleService.toggleFormule(f.id);
      setFormules(prev => prev.map(x => (x.id === f.id ? { ...x, is_active: res.is_active } : x)));
    } catch {
      Alert.alert(t('formule.manage.error'), t('formule.manage.toggleError'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (f: FormuleRow) => {
    Alert.alert(
      t('formule.manage.deleteTitle'),
      t('formule.manage.deleteMessage', { name: f.name }),
      [
        { text: t('formule.manage.cancel'), style: 'cancel' },
        {
          text: t('formule.manage.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(f.id);
            try {
              await formuleService.deleteFormule(f.id);
              setFormules(prev => prev.filter(x => x.id !== f.id));
            } catch {
              Alert.alert(t('formule.manage.error'), t('formule.manage.deleteError'));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const fmtPrice = (p: string | number) => `${(parseFloat(String(p)) || 0).toFixed(2)} €`;
  const courseLabel = (n?: number) =>
    typeof n === 'number'
      ? `  ·  ${n} ${n > 1 ? t('formule.manage.crans') : t('formule.manage.cran')}`
      : '';

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('formule.manage.listTitle')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={goAdd}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addBtnText}>{t('formule.manage.addShort')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : formules.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('formule.manage.emptyRestaurant')}</Text>
          <Button title={t('formule.manage.createOne')} onPress={goAdd} variant="outline" />
        </View>
      ) : (
        formules.map((f) => (
          <View key={f.id} style={styles.row}>
            <TouchableOpacity style={styles.rowMain} onPress={() => goEdit(f.id)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
                <Text style={styles.rowMeta}>
                  {fmtPrice(f.price)}
                  {courseLabel(f.courses_count)}
                  {f.is_active ? '' : `  ·  ${t('formule.manage.inactive')}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text.light} />
            </TouchableOpacity>

            <View style={styles.actions}>
              {busyId === f.id ? (
                <ActivityIndicator color={colors.primary} style={{ width: 36 }} />
              ) : (
                <>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggle(f)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                      name={f.is_active ? 'eye-outline' : 'eye-off-outline'}
                      size={20} color={f.is_active ? colors.success : colors.text.secondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(f)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    section: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg, padding: 16, marginTop: 16, borderWidth: 1, borderColor: colors.border.light },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '700', color: colors.text.golden },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    addBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
    emptyBox: { gap: 12, paddingVertical: 8 },
    emptyText: { fontSize: 13, color: colors.text.secondary },
    row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.light, paddingVertical: 10 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowName: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
    rowMeta: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
    actionBtn: { padding: 6 },
  });
}