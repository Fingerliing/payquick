import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  TYPOGRAPHY,
  SPACING,
  useScreenType,
  getResponsiveValue,
  type AppColors,
} from '@/utils/designSystem';

const APP_VERSION = '1.1.2';

export function LegalFooter() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();

  const styles = React.useMemo(
    () => createStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  const currentYear = new Date().getFullYear();

  return (
    <View style={styles.footer}>
      <Text style={styles.copyright}>
        {t('legal.copyright', { year: currentYear })}
      </Text>

      <View style={styles.links}>
        <TouchableOpacity onPress={() => router.push('/(legal)/terms')}>
          <Text style={styles.link}>{t('legal.termsShort')}</Text>
        </TouchableOpacity>

        <Text style={styles.separator}>•</Text>

        <TouchableOpacity onPress={() => router.push('/(legal)/privacy')}>
          <Text style={styles.link}>{t('legal.privacyShort')}</Text>
        </TouchableOpacity>

        <Text style={styles.separator}>•</Text>

        <TouchableOpacity onPress={() => router.push('/(legal)/notice')}>
          <Text style={styles.link}>{t('legal.noticeShort')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>
        {t('profile.version', { version: APP_VERSION })}
      </Text>
    </View>
  );
}

const createStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: 'mobile' | 'tablet' | 'desktop',
) =>
  StyleSheet.create({
    footer: {
      paddingTop: getResponsiveValue(SPACING.xl, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.xl, screenType),
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      backgroundColor: colors.background,
      borderTopWidth: 1,
      // En dark, on glisse une nuance or très subtile sur la bordure
      // supérieure pour rappeler la dorure du logo sans alourdir.
      borderTopColor: isDark ? 'rgba(212, 175, 55, 0.15)' : colors.border.default,
    },
    copyright: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      textAlign: 'center',
    },
    links: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    link: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      // En dark, on relève les liens en or chaud : "CGU", "Confidentialité",
      // "Mentions légales" deviennent des accents premium subtils.
      color: isDark ? colors.text.golden : colors.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    separator: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.light,
      marginHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
    version: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.light,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
  });