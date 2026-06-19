import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAppTheme,
  makeComponentStyles,
  useScreenType,
  getResponsiveValue,
  TYPOGRAPHY,
} from '@/utils/designSystem';

// ──────────────────────────────────────────────────────────────────────────
// StatusBadge — badge de statut commande
//
// Conventions :
//  - Les couleurs de fond/bordure viennent de `makeComponentStyles(colors)`
//    (theme-aware via le designSystem).
//  - Les couleurs de texte sont *stables* dans les deux modes pour préserver
//    l'identité sémantique des badges (cf. KANBAN_RED/AMBER/GREEN). En dark
//    mode, les badges restent volontairement clairs (variantes 100/200 du
//    designSystem) → on garde un texte foncé qui reste lisible.
//  - Les libellés viennent de `order.statusLabels.*` (déjà présent en 11
//    langues, parité 594 clés).
// ──────────────────────────────────────────────────────────────────────────

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';

const KNOWN_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'served',
  'cancelled',
] as const;

// Couleurs de texte stables (lisibilité forte sur fond clair du badge)
const STATUS_TEXT_COLOR: Record<OrderStatus, string> = {
  pending:   '#B45309', // amber-700
  confirmed: '#1E40AF', // blue-800
  preparing: '#92400E', // amber-900
  ready:     '#065F46', // emerald-800
  served:    '#065F46',
  cancelled: '#991B1B', // red-800
};

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const screenType = useScreenType();
  const componentStyles = useMemo(() => makeComponentStyles(colors), [colors]);

  const normalized: OrderStatus = KNOWN_STATUSES.includes(status as OrderStatus)
    ? (status as OrderStatus)
    : 'pending';

  const label = t(`order.statusLabels.${normalized}`, { defaultValue: status });

  return (
    <View
      style={[
        componentStyles.statusBadge.base,
        componentStyles.statusBadge[normalized],
      ]}
    >
      <Text
        style={{
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
          fontWeight: TYPOGRAPHY.fontWeight.semibold,
          color: STATUS_TEXT_COLOR[normalized],
        }}
      >
        {label}
      </Text>
    </View>
  );
};