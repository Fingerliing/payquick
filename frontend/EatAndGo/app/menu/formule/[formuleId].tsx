/**
 * Écran configurateur de formule (client).
 *
 * Flux : récupère la formule active (GET /formules/public/<restaurantId>/?lang=),
 * laisse le client choisir un plat par cran, puis ajoute la formule configurée
 * au panier (addFormuleToCart) — qui la transmettra au checkout via createFromCart.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAppTheme, BORDER_RADIUS, type AppColors } from '@/utils/designSystem';
import { useCart } from '@/contexts/CartContext';
import { formuleService } from '@/services/formuleService';
import type {
  FormuleClient,
  FormuleClientCourse,
  FormuleClientItem,
} from '@/types/formule';
import type { CartFormuleSelectionSummary } from '@/types/cart';
import { useFormuleSelection } from '@/types/formuleSelection';

// --------------------------------------------------------------------------
// Écran : fetch + états (loading / error / not found), puis configurateur
// --------------------------------------------------------------------------
export default function FormuleConfiguratorScreen() {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { formuleId, restaurantId } = useLocalSearchParams<{
    formuleId: string;
    restaurantId: string;
    tableNumber?: string;
    sessionId?: string;
  }>();

  const [formule, setFormule] = useState<FormuleClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!restaurantId || !formuleId) {
        setError(t('formule.notFound'));
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const found = await formuleService.getPublicFormuleById(
          restaurantId,
          formuleId,
          (i18n.language || '').split('-')[0],
        );
        if (!active) return;
        if (!found) {
          setError(t('formule.notFound'));
        } else {
          setFormule(found);
        }
      } catch (e) {
        if (active) setError(t('formule.loadError'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [restaurantId, formuleId, i18n.language, t]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Header title={t('formule.title')} colors={colors} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !formule) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Header title={t('formule.title')} colors={colors} />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.text.secondary} />
          <Text style={styles.errorText}>{error ?? t('formule.notFound')}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t('common.back', 'Retour')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Configurator
      formule={formule}
      restaurantId={restaurantId!}
      colors={colors}
      isDark={isDark}
    />
  );
}

// --------------------------------------------------------------------------
// Configurateur : hook de sélection + rendu (hooks toujours montés)
// --------------------------------------------------------------------------
function Configurator({
  formule,
  restaurantId,
  colors,
  isDark,
}: {
  formule: FormuleClient;
  restaurantId: string;
  colors: AppColors;
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { addFormuleToCart } = useCart();

  const {
    quantity,
    setQuantity,
    toggle,
    isItemPicked,
    validation,
    totalPrice,
    payload,
  } = useFormuleSelection(formule);

  // Un cran requis sans aucun plat disponible rend la formule non commandable.
  const hasBlockingEmptyCourse = formule.courses.some(
    (c) => c.is_required && c.items.length === 0,
  );

  const canAdd = validation.complete && !hasBlockingEmptyCourse && payload !== null;

  const handleAdd = () => {
    if (!payload) return;

    // Résumé lisible des plats choisis (affichage de la ligne panier).
    const summary: CartFormuleSelectionSummary[] = [];
    for (const course of formule.courses) {
      for (const item of course.items) {
        if (isItemPicked(course.id, item.menu_item_id)) {
          summary.push({
            course_name: course.name,
            item_name: item.name,
            extra_price: parseFloat(item.extra_price) || 0,
          });
        }
      }
    }

    addFormuleToCart({
      formule: payload, // déjà un CreateFormuleInput (formule + quantity + selections)
      name: formule.name,
      unitPrice: totalPrice / Math.max(quantity, 1),
      quantity,
      restaurantId: parseInt(restaurantId, 10),
      restaurantName: '', // complété par le contexte si déjà connu
      summary,
    });

    router.back();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title={formule.name} colors={colors} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!!formule.description && (
          <Text style={styles.formuleDescription}>{formule.description}</Text>
        )}
        <Text style={styles.basePrice}>
          {t('formule.basePrice', {
            price: formatPrice(parseFloat(formule.price)),
            defaultValue: `Formule à ${formatPrice(parseFloat(formule.price))}`,
          })}
        </Text>

        {hasBlockingEmptyCourse && (
          <View style={styles.warningBanner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={styles.warningText}>{t('formule.unavailable', 'Formule indisponible pour le moment')}</Text>
          </View>
        )}

        {formule.courses.map((course) => (
          <CourseBlock
            key={course.id}
            course={course}
            colors={colors}
            isPicked={(menuItemId) => isItemPicked(course.id, menuItemId)}
            onToggle={(menuItemId) => toggle(course, menuItemId)}
            status={validation.courses[course.id]}
          />
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer collant : quantité + total + ajouter */}
      <View style={styles.footer}>
        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>{t('formule.quantity', 'Quantité')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Ionicons name="remove" size={18} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{quantity}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setQuantity(Math.min(50, quantity + 1))}
            >
              <Ionicons name="add" size={18} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
          disabled={!canAdd}
          onPress={handleAdd}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>
            {canAdd
              ? `${t('formule.addToCart', 'Ajouter au panier')} • ${formatPrice(totalPrice)}`
              : validation.firstError ?? t('formule.incomplete', 'Complétez votre formule')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --------------------------------------------------------------------------
// Bloc d'un cran : titre + contrainte + plats sélectionnables
// --------------------------------------------------------------------------
function CourseBlock({
  course,
  colors,
  isPicked,
  onToggle,
  status,
}: {
  course: FormuleClientCourse;
  colors: AppColors;
  isPicked: (menuItemId: number) => boolean;
  onToggle: (menuItemId: number) => void;
  status?: { satisfied: boolean };
}) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const constraintLabel =
    course.max_choices > 1
      ? t('formule.chooseN', { count: course.max_choices, defaultValue: `Choisissez ${course.max_choices} plats` })
      : t('formule.chooseOne', 'Choisissez 1 plat');

  return (
    <View style={styles.courseBlock}>
      <View style={styles.courseHeader}>
        <Text style={styles.courseName}>{course.name}</Text>
        <View
          style={[
            styles.badge,
            course.is_required ? styles.badgeRequired : styles.badgeOptional,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              course.is_required ? styles.badgeTextRequired : styles.badgeTextOptional,
            ]}
          >
            {course.is_required
              ? t('formule.required', 'Obligatoire')
              : t('formule.optional', 'Optionnel')}
          </Text>
        </View>
      </View>
      <Text style={styles.constraint}>{constraintLabel}</Text>

      {course.items.length === 0 ? (
        <Text style={styles.emptyCourse}>{t('formule.empty', 'Aucun plat disponible dans ce cran')}</Text>
      ) : (
        course.items.map((item) => (
          <DishOption
            key={item.id}
            item={item}
            colors={colors}
            picked={isPicked(item.menu_item_id)}
            onPress={() => onToggle(item.menu_item_id)}
          />
        ))
      )}
    </View>
  );
}

// --------------------------------------------------------------------------
// Carte plat sélectionnable
// --------------------------------------------------------------------------
function DishOption({
  item,
  colors,
  picked,
  onPress,
}: {
  item: FormuleClientItem;
  colors: AppColors;
  picked: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const extra = parseFloat(item.extra_price) || 0;

  return (
    <TouchableOpacity
      style={[styles.dish, picked && styles.dishPicked]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.dishImage} />
      ) : (
        <View style={[styles.dishImage, styles.dishImagePlaceholder]}>
          <Ionicons name="restaurant-outline" size={20} color={colors.text.light} />
        </View>
      )}

      <View style={styles.dishInfo}>
        <Text style={styles.dishName} numberOfLines={1}>{item.name}</Text>
        {!!item.description && (
          <Text style={styles.dishDescription} numberOfLines={2}>{item.description}</Text>
        )}
        {extra > 0 && (
          <Text style={styles.dishExtra}>+{formatPrice(extra)}</Text>
        )}
      </View>

      <View style={[styles.check, picked && styles.checkPicked]}>
        {picked && <Ionicons name="checkmark" size={16} color={colors.text.inverse} />}
      </View>
    </TouchableOpacity>
  );
}

// --------------------------------------------------------------------------
// Header minimal (retour)
// --------------------------------------------------------------------------
function Header({ title, colors }: { title: string; colors: AppColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function formatPrice(value: number): string {
  return `${(value || 0).toFixed(2)} €`;
}

// --------------------------------------------------------------------------
// Styles (factory theme-aware)
// --------------------------------------------------------------------------
function createStyles(colors: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    errorText: { color: colors.text.secondary, fontSize: 15, textAlign: 'center' },
    backBtn: {
      marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
      borderRadius: BORDER_RADIUS.lg, backgroundColor: colors.primary,
    },
    backBtnText: { color: colors.text.inverse, fontWeight: '600' },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.light,
      backgroundColor: colors.surface,
    },
    headerBack: { width: 24 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text.primary },

    scrollContent: { padding: 16 },
    formuleDescription: { fontSize: 14, color: colors.text.secondary, marginBottom: 8, lineHeight: 20 },
    basePrice: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: 16 },

    warningBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.goldenSurface, padding: 12,
      borderRadius: BORDER_RADIUS.lg, marginBottom: 16,
    },
    warningText: { flex: 1, fontSize: 13, color: colors.text.secondary },

    courseBlock: { marginBottom: 20 },
    courseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    courseName: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
    constraint: { fontSize: 13, color: colors.text.secondary, marginBottom: 10 },

    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
    badgeRequired: { backgroundColor: colors.primary },
    badgeOptional: { backgroundColor: colors.border.light },
    badgeText: { fontSize: 11, fontWeight: '600' },
    badgeTextRequired: { color: colors.text.inverse },
    badgeTextOptional: { color: colors.text.secondary },

    emptyCourse: { fontSize: 13, color: colors.text.light, fontStyle: 'italic', paddingVertical: 8 },

    dish: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, padding: 10,
      borderRadius: BORDER_RADIUS.xl, marginBottom: 10,
      borderWidth: 1.5, borderColor: 'transparent',
    },
    dishPicked: { borderColor: colors.primary, backgroundColor: colors.goldenSurface },
    dishImage: { width: 56, height: 56, borderRadius: BORDER_RADIUS.lg, backgroundColor: colors.surface },
    dishImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    dishInfo: { flex: 1 },
    dishName: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
    dishDescription: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
    dishExtra: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 4 },

    check: {
      width: 26, height: 26, borderRadius: 13,
      borderWidth: 2, borderColor: colors.border.default,
      alignItems: 'center', justifyContent: 'center',
    },
    checkPicked: { backgroundColor: colors.primary, borderColor: colors.primary },

    footer: {
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.light,
      backgroundColor: colors.surface, padding: 16, gap: 12,
    },
    qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    qtyLabel: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepperBtn: {
      width: 34, height: 34, borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: colors.border.light,
    },
    stepperValue: { fontSize: 16, fontWeight: '700', color: colors.text.primary, minWidth: 20, textAlign: 'center' },

    addBtn: {
      backgroundColor: colors.primary, borderRadius: BORDER_RADIUS.xl,
      paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    addBtnDisabled: { backgroundColor: colors.border.default },
    addBtnText: { color: colors.text.inverse, fontWeight: '700', fontSize: 15 },
  });
}