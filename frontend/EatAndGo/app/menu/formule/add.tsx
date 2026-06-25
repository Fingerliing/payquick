/**
 * Écran restaurateur : création / édition d'une formule.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert as InlineAlert } from '@/components/ui/Alert';

import { menuService } from '@/services/menuService';
import { formuleService, CreateFormulePayload } from '@/services/formuleService';
import type { MenuItem } from '@/types/menu';

import { useAppTheme, BORDER_RADIUS, type AppColors } from '@/utils/designSystem';

interface DraftCourseItem {
  menuItemId: number;
  name: string;
  price: string;
  extraPrice: string;
}
interface DraftCourse {
  key: string;
  name: string;
  isRequired: boolean;
  minChoices: number;
  maxChoices: number;
  items: DraftCourseItem[];
}

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makeCourse = (name = ''): DraftCourse => ({
  key: newKey(), name, isRequired: true, minChoices: 1, maxChoices: 1, items: [],
});

export default function AddFormuleScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { restaurantId, formuleId } = useLocalSearchParams<{ restaurantId: string; formuleId?: string }>();
  const isEdit = !!formuleId;
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [courses, setCourses] = useState<DraftCourse[]>([makeCourse('Entrée')]);
  const [isCreating, setIsCreating] = useState(false);
  const [loadingFormule, setLoadingFormule] = useState(!!formuleId);

  const [dishes, setDishes] = useState<MenuItem[]>([]);
  const [loadingDishes, setLoadingDishes] = useState(true);
  const [pickerCourseKey, setPickerCourseKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [toast, setToast] = useState<{
    visible: boolean; variant: 'success' | 'error' | 'warning' | 'info'; title?: string; message: string;
  }>({ visible: false, variant: 'info', message: '' });
  const showToast = useCallback(
    (variant: 'success' | 'error' | 'warning' | 'info', message: string, title?: string) =>
      setToast({ visible: true, variant, message, title }), []);
  const hideToast = useCallback(() => setToast(p => ({ ...p, visible: false })), []);

  // ── Chargement de la formule (édition) ────────────────────────────────
  useEffect(() => {
    if (!formuleId) { setLoadingFormule(false); return; }
    let active = true;
    (async () => {
      try {
        setLoadingFormule(true);
        const f: any = await formuleService.getFormule(formuleId);
        if (!active) return;
        setName(f.name || '');
        setDescription(f.description || '');
        setPrice(f.price != null ? String(f.price) : '');
        setIsActive(f.is_active !== false);
        const mapped: DraftCourse[] = (f.courses || []).map((c: any) => ({
          key: newKey(),
          name: c.name || '',
          isRequired: c.is_required !== false,
          minChoices: c.min_choices ?? 1,
          maxChoices: c.max_choices ?? 1,
          items: (c.items || []).map((it: any) => ({
            menuItemId: it.menu_item,
            name: it.menu_item_name || '',
            price: it.menu_item_price != null ? String(it.menu_item_price) : '',
            extraPrice: it.extra_price != null ? String(it.extra_price) : '0',
          })),
        }));
        if (mapped.length) setCourses(mapped);
      } catch {
        if (active) showToast('error', t('formule.manage.loadError'));
      } finally {
        if (active) setLoadingFormule(false);
      }
    })();
    return () => { active = false; };
  }, [formuleId, showToast, t]);

  // ── Chargement des plats ──────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      if (!restaurantId) { setLoadingDishes(false); return; }
      try {
        setLoadingDishes(true);
        const menus = await menuService.getMenusByRestaurant(Number(restaurantId));
        const all: MenuItem[] = [];
        const seen = new Set<number>();
        for (const m of menus) {
          for (const it of ((m as any).items || []) as MenuItem[]) {
            if (!seen.has(it.id)) { seen.add(it.id); all.push(it); }
          }
        }
        if (active) setDishes(all);
      } catch {
        if (active) showToast('error', t('formule.manage.loadDishesError'));
      } finally {
        if (active) setLoadingDishes(false);
      }
    })();
    return () => { active = false; };
  }, [restaurantId, showToast, t]);

  const patchCourse = useCallback((key: string, patch: Partial<DraftCourse>) => {
    setCourses(prev => prev.map(c => (c.key === key ? { ...c, ...patch } : c)));
  }, []);
  const addCourse = useCallback(() => setCourses(prev => [...prev, makeCourse('')]), []);
  const removeCourse = useCallback((key: string) => {
    setCourses(prev => prev.filter(c => c.key !== key));
  }, []);

  const toggleDish = useCallback((courseKey: string, dish: MenuItem) => {
    setCourses(prev => prev.map(c => {
      if (c.key !== courseKey) return c;
      const exists = c.items.some(it => it.menuItemId === dish.id);
      const items = exists
        ? c.items.filter(it => it.menuItemId !== dish.id)
        : [...c.items, {
            menuItemId: dish.id, name: dish.name,
            price: String((dish as any).price ?? ''), extraPrice: '0',
          }];
      return { ...c, items };
    }));
  }, []);

  const setExtra = useCallback((courseKey: string, menuItemId: number, value: string) => {
    setCourses(prev => prev.map(c => (c.key !== courseKey ? c : {
      ...c, items: c.items.map(it => (it.menuItemId === menuItemId ? { ...it, extraPrice: value } : it)),
    })));
  }, []);

  const handleCreate = useCallback(async () => {
    const priceNum = parseFloat(price.replace(',', '.'));
    if (!name.trim()) return showToast('error', t('formule.manage.requiredName'));
    if (!price.trim() || isNaN(priceNum) || priceNum <= 0)
      return showToast('error', t('formule.manage.pricePositive'));
    if (courses.length === 0) return showToast('error', t('formule.manage.addCourseFirst'));

    for (const c of courses) {
      if (!c.name.trim()) return showToast('error', t('formule.manage.courseNeedsName'));
      if (c.items.length === 0)
        return showToast('error', t('formule.manage.courseNeedsDish', { course: c.name || '…' }));
      if (c.minChoices > c.maxChoices)
        return showToast('error', t('formule.manage.minOverMax', { course: c.name }));
      if (c.isRequired && c.minChoices > c.items.length)
        return showToast('error', t('formule.manage.minOverItems', { course: c.name }));
    }

    const payload: CreateFormulePayload = {
      restaurant: Number(restaurantId),
      name: name.trim(),
      description: description.trim() || undefined,
      price: priceNum,
      is_active: isActive,
      courses: courses.map((c, ci) => ({
        name: c.name.trim(), order: ci, is_required: c.isRequired,
        min_choices: c.minChoices, max_choices: c.maxChoices,
        items: c.items.map((it, ii) => ({
          menu_item: it.menuItemId,
          extra_price: it.extraPrice ? parseFloat(it.extraPrice.replace(',', '.')) || 0 : 0,
          display_order: ii,
        })),
      })),
    };

    try {
      setIsCreating(true);
      if (isEdit && formuleId) {
        await formuleService.updateFormule(formuleId, payload);
        showToast('success', t('formule.manage.updated'));
      } else {
        await formuleService.createFormule(payload);
        showToast('success', t('formule.manage.created'));
      }
      setTimeout(() => router.back(), 800);
    } catch (e: any) {
      showToast('error', e?.message || t('formule.manage.saveError'));
    } finally {
      setIsCreating(false);
    }
  }, [name, description, price, isActive, courses, restaurantId, isEdit, formuleId, showToast, t]);

  const pickerCourse = courses.find(c => c.key === pickerCourseKey) || null;
  const filteredDishes = search.trim()
    ? dishes.filter(d => d.name.toLowerCase().includes(search.trim().toLowerCase()))
    : dishes;

  return (
    <View style={styles.container}>
      <Header
        title={isEdit ? t('formule.manage.editTitle') : t('formule.manage.newTitle')}
        showBackButton
        rightActions={[
          { icon: 'checkmark', onPress: handleCreate, disabled: isCreating || loadingFormule, loading: isCreating },
        ]}
      />

      {toast.visible && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, zIndex: 100 }}>
          <InlineAlert
            variant={toast.variant} title={toast.title} message={toast.message}
            onDismiss={hideToast} autoDismiss autoDismissDuration={5000}
          />
        </View>
      )}

      {loadingFormule ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Informations */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 {t('formule.manage.infoSection')}</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('formule.manage.nameLabel')} *</Text>
                <Input value={name} onChangeText={setName} placeholder={t('formule.manage.namePlaceholder')} style={styles.input} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('formule.manage.descriptionLabel')}</Text>
                <Input
                  value={description} onChangeText={setDescription}
                  placeholder={t('formule.manage.descriptionPlaceholder')}
                  multiline numberOfLines={2}
                  style={[styles.input, styles.inputMultiline]}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('formule.manage.priceLabel')} *</Text>
                <Input value={price} onChangeText={setPrice} placeholder="19.90" keyboardType="decimal-pad" style={styles.input} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.label}>{t('formule.manage.activeLabel')}</Text>
                <Switch
                  value={isActive} onValueChange={setIsActive}
                  trackColor={{ false: colors.border.default, true: colors.primary }} thumbColor="#fff"
                />
              </View>
            </View>
          </View>

          {/* Crans */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🍽️ {t('formule.manage.coursesSection')}</Text>

            {courses.map((course, idx) => (
              <View key={course.key} style={styles.courseCard}>
                <View style={styles.courseHeader}>
                  <Input
                    value={course.name}
                    onChangeText={(v) => patchCourse(course.key, { name: v })}
                    placeholder={t('formule.manage.coursePlaceholder', { index: idx + 1 })}
                    style={[styles.input, { flex: 1 }]}
                  />
                  {courses.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeCourse(course.key)} style={styles.iconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.smallLabel}>{t('formule.manage.requiredLabel')}</Text>
                  <Switch
                    value={course.isRequired}
                    onValueChange={(v) => patchCourse(course.key, { isRequired: v })}
                    trackColor={{ false: colors.border.default, true: colors.primary }} thumbColor="#fff"
                  />
                </View>

                <View style={styles.row}>
                  <Stepper label={t('formule.manage.min')} value={course.minChoices} min={0}
                    onChange={(v) => patchCourse(course.key, { minChoices: v })} styles={styles} colors={colors} />
                  <Stepper label={t('formule.manage.max')} value={course.maxChoices} min={1}
                    onChange={(v) => patchCourse(course.key, { maxChoices: v })} styles={styles} colors={colors} />
                </View>

                {course.items.length === 0 ? (
                  <Text style={styles.emptyText}>{t('formule.manage.noDishSelected')}</Text>
                ) : (
                  course.items.map((it) => (
                    <View key={it.menuItemId} style={styles.dishRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dishName} numberOfLines={1}>{it.name}</Text>
                        {!!it.price && (
                          <Text style={styles.dishMeta}>
                            {parseFloat(it.price).toFixed(2)} € {t('formule.manage.cardPriceSuffix')}
                          </Text>
                        )}
                      </View>
                      <View style={styles.extraWrap}>
                        <Text style={styles.extraLabel}>+€</Text>
                        <Input
                          value={it.extraPrice}
                          onChangeText={(v) => setExtra(course.key, it.menuItemId, v)}
                          placeholder="0" keyboardType="decimal-pad" style={styles.extraInput}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleDish(course.key, { id: it.menuItemId, name: it.name } as MenuItem)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.iconBtn}
                      >
                        <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <TouchableOpacity style={styles.addDishBtn} onPress={() => { setSearch(''); setPickerCourseKey(course.key); }}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.addDishBtnText}>{t('formule.manage.addDishes')}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addCourseBtn} onPress={addCourse}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.addCourseBtnText}>{t('formule.manage.addCourse')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomButtonContainer}>
            <Button
              title={isCreating
                ? (isEdit ? t('formule.manage.saving') : t('formule.manage.creating'))
                : (isEdit ? t('formule.manage.save') : t('formule.manage.create'))}
              onPress={handleCreate} variant="primary"
              disabled={isCreating || !name.trim() || !price.trim()} loading={isCreating}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      )}

      {/* Modale : sélection des plats */}
      <Modal visible={!!pickerCourseKey} transparent animationType="slide" onRequestClose={() => setPickerCourseKey(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPickerCourseKey(null)} />
          <View style={[styles.modalContainer, { paddingBottom: insets.bottom || 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {pickerCourse
                  ? t('formule.manage.pickerTitle', { course: pickerCourse.name || t('formule.manage.pickerTitleGeneric') })
                  : t('formule.manage.pickerTitleGeneric')}
              </Text>
              <TouchableOpacity onPress={() => setPickerCourseKey(null)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Input value={search} onChangeText={setSearch} placeholder={t('formule.manage.searchPlaceholder')} style={styles.input} />
            </View>

            <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {loadingDishes ? (
                <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
              ) : filteredDishes.length === 0 ? (
                <Text style={[styles.emptyText, { padding: 16 }]}>{t('formule.manage.noDishFound')}</Text>
              ) : (
                filteredDishes.map((dish) => {
                  const selected = !!pickerCourse?.items.some(it => it.menuItemId === dish.id);
                  return (
                    <TouchableOpacity
                      key={dish.id}
                      style={[styles.modalItem, selected && styles.modalItemSelected]}
                      onPress={() => pickerCourse && toggleDish(pickerCourse.key, dish)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemName} numberOfLines={1}>{dish.name}</Text>
                        <Text style={styles.modalItemMeta}>
                          {(dish as any).price ? `${parseFloat(String((dish as any).price)).toFixed(2)} €` : ''}
                          {(dish as any).category_name ? `  ·  ${(dish as any).category_name}` : ''}
                          {(dish as any).is_available === false ? `  ·  ${t('formule.manage.unavailable')}` : ''}
                        </Text>
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={24} color={selected ? colors.primary : colors.border.default}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={{ padding: 16 }}>
              <Button title={t('formule.manage.done')} onPress={() => setPickerCourseKey(null)} variant="primary" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stepper({
  label, value, min, onChange, styles, colors,
}: {
  label: string; value: number; min: number; onChange: (v: number) => void;
  styles: ReturnType<typeof createStyles>; colors: AppColors;
}) {
  return (
    <View style={styles.stepperWrap}>
      <Text style={styles.smallLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(Math.max(min, value - 1))}>
          <Ionicons name="remove" size={16} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(value + 1)}>
          <Ionicons name="add" size={16} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1 },
    section: { marginBottom: 24, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 12 },
    card: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg, padding: 16, borderWidth: 1, borderColor: colors.border.light },
    inputGroup: { marginBottom: 14 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text.primary, marginBottom: 6 },
    smallLabel: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
    input: { backgroundColor: colors.background, borderRadius: BORDER_RADIUS.md },
    inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 16, marginBottom: 8 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
    courseCard: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border.light },
    courseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    iconBtn: { padding: 4 },
    stepperWrap: { flex: 1 },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, backgroundColor: colors.background, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 6, paddingVertical: 4 },
    stepperBtn: { width: 30, height: 30, borderRadius: BORDER_RADIUS.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.light },
    stepperValue: { fontSize: 15, fontWeight: '700', color: colors.text.primary, minWidth: 24, textAlign: 'center' },
    emptyText: { fontSize: 13, color: colors.text.light, fontStyle: 'italic', paddingVertical: 8 },
    dishRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.light },
    dishName: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    dishMeta: { fontSize: 12, color: colors.text.secondary, marginTop: 1 },
    extraWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    extraLabel: { fontSize: 13, color: colors.text.secondary },
    extraInput: { width: 64, backgroundColor: colors.background, borderRadius: BORDER_RADIUS.sm, textAlign: 'center' },
    addDishBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 8 },
    addDishBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
    addCourseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: BORDER_RADIUS.lg, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed' },
    addCourseBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
    bottomButtonContainer: { paddingHorizontal: 16, marginTop: 8 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay || 'rgba(0,0,0,0.4)' },
    modalContainer: { backgroundColor: colors.surface, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.light },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text.primary },
    modalContent: { paddingHorizontal: 16 },
    modalItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: BORDER_RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: 'transparent' },
    modalItemSelected: { backgroundColor: colors.background, borderColor: colors.primary },
    modalItemName: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
    modalItemMeta: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  });
}