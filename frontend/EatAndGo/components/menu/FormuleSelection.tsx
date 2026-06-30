/**
 * Section « Formules » à insérer dans l'écran menu client.
 *
 * Autonome : récupère les formules actives du restaurant et affiche une carte
 * par formule. Au tap, navigue vers le configurateur. Renvoie `null` si le
 * restaurant n'a aucune formule (n'encombre pas l'écran).
 *
 * Insertion dans _restaurantId_.tsx, p. ex. en ListHeaderComponent
 * de la FlatList du menu :
 *
 *   <FormulesSection restaurantId={restaurantId} tableNumber={tableNumberParam} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAppTheme, BORDER_RADIUS, type AppColors } from '@/utils/designSystem';
import { formuleService } from '@/services/formuleService';
import type { FormuleClient } from '@/types/formule';

interface Props {
  restaurantId: string | number;
  tableNumber?: string;
}

export function FormulesSection({ restaurantId, tableNumber }: Props) {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [formules, setFormules] = useState<FormuleClient[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await formuleService.getPublicFormules(
          restaurantId,
          (i18n.language || '').split('-')[0],
        );
        if (active) setFormules(data);
      } catch {
        if (active) setFormules([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [restaurantId, i18n.language]);

  if (formules.length === 0) return null;

  const openConfigurator = (formuleId: string) => {
    router.push({
      // ⚠️ Adapte ce pathname à l'emplacement réel du fichier configurateur.
      pathname: '/menu/formule/[formuleId]' as any,
      params: {
        formuleId,
        restaurantId: String(restaurantId),
        ...(tableNumber ? { tableNumber } : {}),
      },
    });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('formule.sectionTitle', 'Nos formules')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {formules.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => openConfigurator(f.id)}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="fast-food-outline" size={18} color={colors.primary} />
              <Text style={styles.price}>{(parseFloat(f.price) || 0).toFixed(2)} €</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
            {!!f.description && (
              <Text style={styles.description} numberOfLines={2}>{f.description}</Text>
            )}
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{t('formule.compose', 'Composer')}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    section: { marginBottom: 16 },
    sectionTitle: {
      fontSize: 18, fontWeight: '700', color: colors.text.primary,
      marginBottom: 10, paddingHorizontal: 16,
    },
    row: { paddingHorizontal: 16, gap: 12 },
    card: {
      width: 220, backgroundColor: colors.card, borderRadius: BORDER_RADIUS.xl,
      padding: 14, borderWidth: 1, borderColor: colors.border.light,
    },
    cardHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 8,
    },
    price: { fontSize: 16, fontWeight: '700', color: colors.primary },
    name: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
    description: { fontSize: 12, color: colors.text.secondary, marginTop: 4, lineHeight: 17 },
    cta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 10 },
    ctaText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  });
}