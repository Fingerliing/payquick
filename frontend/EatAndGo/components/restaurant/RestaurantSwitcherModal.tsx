import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  type AppColors,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';

// =============================================================================
// Couleurs (theme-aware)
// =============================================================================
const makeColors = (c: AppColors, isDark: boolean) => ({
  primary: c.primary,
  overlay: c.overlay,
  cardBg: c.card,
  text: c.text.primary,
  textSecondary: c.text.secondary,
  textInverse: c.text.inverse,
  border: c.border.light,
  success: c.success,
  // Hairline dorée en dark, cohérente avec Card.tsx / RestaurantCard.tsx
  hairline: isDark ? 'rgba(212, 175, 55, 0.12)' : c.border.light,
});
type SwitcherColors = ReturnType<typeof makeColors>;
type ScreenType = ReturnType<typeof useScreenType>;

/**
 * Forme minimale attendue d'un établissement. Volontairement structurelle
 * (et non `Restaurant` importé) : les écrans manipulent des `id` tantôt
 * `string`, tantôt `number`, parfois issus d'un `any[]`.
 */
export interface SwitchableRestaurant {
  id: string | number;
  name: string;
  address?: string | null;
  city?: string | null;
}

interface RestaurantSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
  restaurants: SwitchableRestaurant[];
  /** Établissement actif — comparé via `String()` pour tolérer string|number. */
  currentRestaurantId?: string | number | null;
  /** Reçoit l'`id` brut de l'élément choisi (à convertir par l'appelant). */
  onSelect: (restaurantId: string) => void;
  /** Titre de la feuille. Défaut : `restaurantSelector.chooseTitle`. */
  title?: string;
}

/**
 * Feuille de changement d'établissement, partagée par tous les écrans
 * restaurateur (menu, commandes, statistiques, plan de salle, réservations).
 *
 * Elle est ouverte par l'icône gauche `swap-horizontal` du <Header /> et est
 * entièrement contrôlée par le parent (`visible` / `onClose`).
 *
 * Ne rend rien s'il y a moins de deux établissements : il n'y a alors rien à
 * choisir, et les écrans masquent aussi l'icône du Header dans ce cas.
 */
export const RestaurantSwitcherModal: React.FC<RestaurantSwitcherModalProps> = ({
  visible,
  onClose,
  restaurants,
  currentRestaurantId,
  onSelect,
  title,
}) => {
  const { colors: C, isDark } = useAppTheme();
  const { t } = useTranslation();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const colors = useMemo(() => makeColors(C, isDark), [C, isDark]);
  const styles = useMemo(() => createStyles(colors, screenType), [colors, screenType]);

  // La feuille est ancrée en bas et l'app est en edge-to-edge : la barre de
  // navigation Android (ou la barre de geste / le home indicator iOS) recouvre
  // le contenu. On réserve donc l'inset bas, avec un plancher de confort pour
  // les appareils sans inset (boutons physiques).
  const basePad = getResponsiveValue(SPACING.lg, screenType);
  const bottomPad = Math.max(insets.bottom, basePad);

  // ⚠ Cet early-return doit rester APRÈS tous les hooks (règles des Hooks).
  if (restaurants.length <= 1) return null;

  const currentKey = currentRestaurantId == null ? null : String(currentRestaurantId);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* stopPropagation : un tap dans la carte ne doit pas fermer la feuille */}
        <Pressable
          style={[styles.card, { paddingBottom: bottomPad }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title || t('restaurantSelector.chooseTitle')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {restaurants.map((r) => {
              const isCurrent = currentKey !== null && String(r.id) === currentKey;
              return (
                <Pressable
                  key={String(r.id)}
                  onPress={() => {
                    if (!isCurrent) onSelect(String(r.id));
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && styles.optionPressed,
                  ]}
                  android_ripple={{ color: colors.primary + '20', borderless: false }}
                >
                  <View style={styles.avatar}>
                    <Ionicons
                      name="restaurant-outline"
                      size={20}
                      color={colors.textInverse}
                    />
                  </View>

                  <View style={styles.optionMain}>
                    <Text
                      style={[styles.optionName, isCurrent && styles.optionNameActive]}
                      numberOfLines={1}
                    >
                      {r.name}
                    </Text>
                    {(r.address || r.city) && (
                      <Text style={styles.optionSub} numberOfLines={1}>
                        {r.address}
                        {r.address && r.city ? ', ' : ''}
                        {r.city}
                      </Text>
                    )}
                  </View>

                  {isCurrent && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// =============================================================================
// Styles
// =============================================================================
function createStyles(colors: SwitcherColors, screenType: ScreenType) {
  // SPACING.* est responsive ({ mobile, tablet, desktop }) → résolu ici.
  // BORDER_RADIUS.* est déjà une valeur plate.
  const s = {
    xs: getResponsiveValue(SPACING.xs, screenType),
    sm: getResponsiveValue(SPACING.sm, screenType),
    md: getResponsiveValue(SPACING.md, screenType),
    lg: getResponsiveValue(SPACING.lg, screenType),
  };

  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    card: {
      backgroundColor: colors.cardBg,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      // paddingBottom fourni en inline : dépend de l'inset bas (safe area).
      maxHeight: '70%',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: s.sm,
      padding: s.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },

    list: { flexGrow: 0 },

    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s.sm,
      paddingHorizontal: s.md,
      paddingVertical: s.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionPressed: { opacity: 0.7 },

    avatar: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },

    optionMain: { flex: 1, gap: 2 },
    optionName: { fontSize: 15, fontWeight: '700', color: colors.text },
    optionNameActive: { color: colors.primary },
    optionSub: { fontSize: 12, color: colors.textSecondary },
  });
}

export default RestaurantSwitcherModal;