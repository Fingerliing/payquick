import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const GOLD = '#D4AF37';
const EMPTY = '#C7CBD1';

interface StarRatingProps {
  value: number;
  /** Si fourni : mode saisie. */
  onChange?: (value: number) => void;
  size?: number;
  /** Force l'affichage sans demi-étoile (utile en saisie). */
  allowHalf?: boolean;
}

export const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  size = 20,
  allowHalf = true,
}) => {
  const { t } = useTranslation();
  const interactive = typeof onChange === 'function';

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((i) => {
        let name: keyof typeof Ionicons.glyphMap = 'star-outline';
        let color = EMPTY;

        if (value >= i) {
          name = 'star';
          color = GOLD;
        } else if (allowHalf && !interactive && value >= i - 0.5) {
          name = 'star-half';
          color = GOLD;
        }

        const icon = <Ionicons name={name} size={size} color={color} />;

        if (interactive) {
          return (
            <TouchableOpacity
              key={i}
              onPress={() => onChange?.(i)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={styles.star}
              accessibilityRole="button"
              accessibilityLabel={t('reviews.starRating', { value: i })}
            >
              {icon}
            </TouchableOpacity>
          );
        }
        return (
          <View key={i} style={styles.star}>
            {icon}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  star: { marginRight: 2 },
});

export default StarRating;