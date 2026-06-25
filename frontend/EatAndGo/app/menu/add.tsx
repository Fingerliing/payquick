import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { menuService } from '@/services/menuService';
import { Alert, AlertWithAction, useAlert } from '@/components/ui/Alert';
import {
  useAppTheme,
  type AppColors,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  SHADOWS,
  COMPONENT_STYLES,
  useScreenType,
  createResponsiveStyles,
  getResponsiveValue
} from '@/utils/designSystem';

export default function AddMenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const { alertState, showSuccess, showError, hideAlert } = useAlert();
  const [nextAction, setNextAction] = useState<null | (() => void)>(null);

  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const localStyles = useMemo(() => createLocalStyles(colors), [colors]);

  const handleCreate = async () => {
    if (!name.trim()) {
      showError(t('menuForm.nameRequired'), t('menuItemForm.error'));
      return;
    }

    if (!restaurantId) {
      showError(t('menuForm.restaurantNotSpecified'), t('menuItemForm.error'));
      return;
    }

    setIsCreating(true);
    try {
      const newMenu = await menuService.createMenu({
        name: name.trim(),
        restaurant: parseInt(restaurantId),
      });

      setNextAction(() => () => router.replace(`/menu/${newMenu.id}` as any));
    } catch (error) {
      console.error('Erreur lors de la création du menu:', error);
      showError(t('menuForm.createError'), t('menuItemForm.error'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={[localStyles.safeArea, { paddingBottom: insets.bottom }]}>
      <View style={localStyles.container}>
        <Header
          title={t('menuForm.newTitle')}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />

        <ScrollView
          style={localStyles.scrollView}
          contentContainerStyle={[
            localStyles.scrollContent,
            { padding: getResponsiveValue(SPACING.container, screenType) }
          ]}
        >
          {/* En-tête avec icône */}
          <View style={[
            styles.premiumCard,
            styles.mb('lg'),
            localStyles.headerCard
          ]}>
            <View style={localStyles.iconContainer}>
              <Text style={localStyles.iconEmoji}>📋</Text>
            </View>
            <Text style={[
              styles.textTitle,
              localStyles.headerTitle,
              { textAlign: 'center' }
            ]}>
              {t('menuForm.createTitle')}
            </Text>
            <Text style={[
              styles.textBody,
              { textAlign: 'center', marginTop: getResponsiveValue(SPACING.xs, screenType) }
            ]}>
              {t('menuForm.createSubtitle')}
            </Text>
          </View>

          {/* Formulaire principal */}
          <View style={[styles.card, styles.mb('lg')]}>
            <View style={localStyles.labelContainer}>
              <Text style={[styles.textSubtitle, localStyles.label]}>
                {t('menuForm.namePlaceholder')}
              </Text>
              <View style={localStyles.requiredBadge}>
                <Text style={localStyles.requiredText}>{t('menuForm.required')}</Text>
              </View>
            </View>

            <TextInput
              value={name}
              onChangeText={setName}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={t('menuForm.namePlaceholderExample')}
              placeholderTextColor={colors.text.light}
              style={[
                COMPONENT_STYLES.input.base,
                isFocused && COMPONENT_STYLES.input.focused,
                name.trim() && COMPONENT_STYLES.input.golden,
                isFocused && name.trim() && COMPONENT_STYLES.input.goldenFocused,
                {
                  fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
                  marginTop: getResponsiveValue(SPACING.sm, screenType),
                }
              ]}
            />

            <Text style={[
              styles.textCaption,
              { marginTop: getResponsiveValue(SPACING.xs, screenType) }
            ]}>
              {t('menuForm.nameHint')}
            </Text>
          </View>

          {/* Carte conseil */}
          <View style={[
            localStyles.tipCard,
            styles.mb('2xl'),
            { padding: getResponsiveValue(SPACING.card, screenType) }
          ]}>
            <View style={localStyles.tipHeader}>
              <View style={localStyles.tipIconContainer}>
                <Text style={localStyles.tipIcon}>💡</Text>
              </View>
              <Text style={[styles.textSubtitle, localStyles.tipTitle]}>
                {t('menuForm.tip')}
              </Text>
            </View>

            <Text style={[
              styles.textBody,
              { marginTop: getResponsiveValue(SPACING.sm, screenType) }
            ]}>
              {t('menuForm.tipBody')}
            </Text>

            <View style={localStyles.tipFeatures}>
              <View style={localStyles.tipFeature}>
                <Text style={localStyles.tipFeatureIcon}>✓</Text>
                <Text style={styles.textCaption}>{t('menuForm.tipFeature1')}</Text>
              </View>
              <View style={localStyles.tipFeature}>
                <Text style={localStyles.tipFeatureIcon}>✓</Text>
                <Text style={styles.textCaption}>{t('menuForm.tipFeature2')}</Text>
              </View>
              <View style={localStyles.tipFeature}>
                <Text style={localStyles.tipFeatureIcon}>✓</Text>
                <Text style={styles.textCaption}>{t('menuForm.tipFeature3')}</Text>
              </View>
            </View>
          </View>

          {/* Bouton de création */}
          <Button
            title={isCreating ? t('menuItemForm.creating') : t('menuForm.createButton')}
            onPress={handleCreate}
            disabled={isCreating || !name.trim()}
            variant={name.trim() ? "secondary" : "primary"}
            style={{
              marginBottom: getResponsiveValue(SPACING.xl, screenType),
            }}
          />
        </ScrollView>

        {/* Alert personnalisée */}
        {alertState?.visible && (
          <View pointerEvents="box-none" style={localStyles.alertOverlay}>
            <Alert
              variant={alertState?.variant ?? 'info'}
              title={alertState?.title}
              message={alertState?.message ?? ''}
              onDismiss={hideAlert}
              autoDismiss
              autoDismissDuration={5000}
            />
          </View>
        )}

        {/* AlertWithAction après succès */}
        {nextAction && (
          <View pointerEvents="box-none" style={localStyles.alertOverlay}>
            <AlertWithAction
              variant="success"
              title={t('menuForm.createdTitle')}
              message={t('menuForm.createdMessage')}
              autoDismiss={false}
              primaryButton={{
                text: t('menuForm.addDishes'),
                onPress: () => {
                  nextAction();
                  setNextAction(null);
                },
              }}
              secondaryButton={{
                text: t('menuForm.backToList'),
                onPress: () => {
                  router.back();
                  setNextAction(null);
                },
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const createLocalStyles = (colors: AppColors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  headerCard: { alignItems: 'center' },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.variants.secondary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.border.golden,
  },
  iconEmoji: { fontSize: 32 },
  headerTitle: { marginTop: 8 },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { flex: 1 },
  requiredBadge: {
    backgroundColor: colors.variants.secondary[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: colors.variants.secondary[300],
  },
  requiredText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.variants.secondary[700],
  },
  tipCard: {
    backgroundColor: colors.goldenSurface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: colors.border.golden,
    ...SHADOWS.md,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center' },
  tipIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.variants.secondary[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipIcon: { fontSize: 18 },
  tipTitle: { color: colors.variants.secondary[700] },
  tipFeatures: { marginTop: 16, gap: 8 },
  tipFeature: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipFeatureIcon: {
    fontSize: 16,
    color: colors.variants.secondary[600],
    fontWeight: 'bold',
  },
  alertOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
});