import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Contexts
import { useComptabilite } from '@/contexts/ComptabiliteContext';

// Components
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { Alert } from '@/components/ui/Alert';

// Design System
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  useScreenType,
  getResponsiveValue,
  SHADOWS,
} from '@/utils/designSystem';

// Types
import type {
  ComptabiliteSettings,
  TVARegime,
  ExportFormat,
} from '@/types/comptabilite';

// Helpers responsive
const s = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof SPACING) =>
  getResponsiveValue(SPACING[key], screenType);
const fs = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof TYPOGRAPHY.fontSize) =>
  getResponsiveValue(TYPOGRAPHY.fontSize[key], screenType);

export const ComptabiliteSettingsScreen: React.FC = () => {
  const {
    settings,
    settingsLoading,
    settingsError,
    loadSettings,
    createSettings,
    updateSettings,
    isConfigured,
  } = useComptabilite();

  const screenType = useScreenType();

  // Inline alerts (remplace l'ancien useAlert)
  const [inlineAlert, setInlineAlert] = useState<{
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    siret: '',
    tvaIntracommunautaire: '',
    codeNaf: '',
    invoicePrefix: 'FACT',
    invoiceYearReset: true,
    tvaRegime: 'normal' as TVARegime,
    exportFormatDefault: 'FEC' as ExportFormat,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Charger les paramètres quand déjà configuré
  useEffect(() => {
    if (isConfigured) {
      loadSettings();
    }
  }, [isConfigured]);

  // Hydrater le formulaire
  useEffect(() => {
    if (settings) {
      setFormData({
        siret: settings.siret || '',
        tvaIntracommunautaire: settings.tvaIntracommunautaire || '',
        codeNaf: settings.codeNaf || '',
        invoicePrefix: settings.invoicePrefix || 'FACT',
        invoiceYearReset: settings.invoiceYearReset,
        tvaRegime: settings.tvaRegime,
        exportFormatDefault: settings.exportFormatDefault,
      });
    }
  }, [settings]);

  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.siret) {
      newErrors.siret = 'Le SIRET est obligatoire';
    } else if (!/^\d{14}$/.test(formData.siret)) {
      newErrors.siret = 'Le SIRET doit contenir exactement 14 chiffres';
    }

    if (!formData.invoicePrefix) {
      newErrors.invoicePrefix = 'Le préfixe de facture est obligatoire';
    } else if (formData.invoicePrefix.length > 10) {
      newErrors.invoicePrefix = 'Maximum 10 caractères';
    }

    if (formData.tvaIntracommunautaire && !/^FR\d{11}$/.test(formData.tvaIntracommunautaire)) {
      newErrors.tvaIntracommunautaire = 'Format invalide (ex: FR12345678901)';
    }

    if (formData.codeNaf && !/^\d{4}[A-Z]$/.test(formData.codeNaf)) {
      newErrors.codeNaf = 'Format invalide (ex: 5610A)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Sauvegarde
  const handleSave = async () => {
    if (!validateForm()) {
      setInlineAlert({
        variant: 'error',
        title: 'Formulaire invalide',
        message: 'Veuillez corriger les erreurs du formulaire',
      });
      return;
    }

    setSaving(true);
    try {
      if (isConfigured && settings) {
        await updateSettings(formData);
        setInlineAlert({
          variant: 'success',
          title: 'Succès',
          message: 'Paramètres mis à jour avec succès',
        });
      } else {
        await createSettings(formData);
        setInlineAlert({
          variant: 'success',
          title: 'Succès',
          message: 'Paramètres créés avec succès',
        });
        router.back();
      }
    } catch (error: any) {
      setInlineAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Erreur lors de la sauvegarde',
      });
    } finally {
      setSaving(false);
    }
  };

  // Styles dépendants du screenType (alignés sur le Dashboard)
  const styles = useMemo(() => {
    const paddingLg = s(screenType, 'lg');
    const paddingMd = s(screenType, 'md');
    const paddingSm = s(screenType, 'sm');
    const paddingXs = s(screenType, 'xs');
    const gapMd = s(screenType, 'md');

    return {
      container: {
        flex: 1,
        backgroundColor: COLORS.background,
        padding: paddingLg,
      },
      header: {
        marginBottom: paddingLg,
      },
      title: {
        fontSize: fs(screenType, '3xl'),
        fontWeight: TYPOGRAPHY.fontWeight.bold,
        color: COLORS.text.primary,
      },
      subtitle: {
        marginTop: paddingXs,
        fontSize: fs(screenType, 'base'),
        fontWeight: TYPOGRAPHY.fontWeight.normal,
        color: COLORS.text.secondary,
      },
      sectionCard: {
        padding: paddingLg,
        marginBottom: paddingMd,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      sectionTitle: {
        fontSize: fs(screenType, 'xl'),
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        color: COLORS.text.primary,
        marginBottom: paddingMd,
      },
      formGroup: {
        marginBottom: paddingLg,
      },
      labelRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginBottom: paddingXs,
      },
      label: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
      },
      required: {
        color: COLORS.error,
      },
      helpText: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.text.secondary,
        marginTop: paddingXs,
      },
      validIndicator: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginTop: paddingXs,
      },
      validText: {
        marginLeft: paddingXs,
        fontSize: fs(screenType, 'sm'),
        color: COLORS.success,
      },
      switchRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
      },
      switchLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
        flex: 1,
        marginRight: paddingMd,
      },
      switch: {
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.border.light,
        padding: 2,
        justifyContent: 'center' as const,
      },
      switchActive: {
        backgroundColor: COLORS.primary,
      },
      switchThumb: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: COLORS.surface,
        transform: [{ translateX: 0 }],
      },
      switchThumbActive: {
        transform: [{ translateX: 22 }],
      },
      radioGroup: {
        // éviter 'gap' pour compat Android: on espace via marginBottom
      },
      radioOption: {
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        padding: paddingMd,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border.light,
        backgroundColor: COLORS.surface,
        marginBottom: paddingSm,
      },
      radioOptionActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}10`,
      },
      radioButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: COLORS.border.light,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: paddingSm,
        marginTop: 2,
      },
      radioButtonInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: COLORS.primary,
      },
      radioContent: {
        flex: 1,
      },
      radioLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
      },
      radioDescription: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.text.secondary,
        marginTop: paddingXs,
      },
      exportOption: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        padding: paddingMd,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border.light,
        backgroundColor: COLORS.surface,
        marginBottom: paddingSm,
      },
      exportOptionActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}10`,
      },
      exportLabel: {
        marginLeft: paddingSm,
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },
      exportLabelActive: {
        color: COLORS.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
      },
      infoHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginBottom: paddingSm,
      },
      infoTitle: {
        marginLeft: paddingSm,
        fontSize: fs(screenType, 'base'),
        color: COLORS.info,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      infoBullet: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.info,
        marginBottom: paddingXs,
      },
      actions: {
        flexDirection: 'row' as const,
        marginTop: paddingLg,
      },
      actionSpacer: {
        width: paddingMd,
      },
    } as const;
  }, [screenType]);

  if (settingsLoading) {
    return <Loading text="Chargement des paramètres..." />;
  }

  return (
    <ScrollView style={styles.container}>
      {/* Inline alert */}
      {inlineAlert && (
        <View style={{ marginBottom: s(screenType, 'md') }}>
          <Alert
            variant={inlineAlert.variant}
            title={inlineAlert.title}
            message={inlineAlert.message}
          />
        </View>
      )}
      {/* Erreur de chargement initial éventuelle */}
      {settingsError && (
        <View style={{ marginBottom: s(screenType, 'md') }}>
          <Alert variant="error" title="Erreur" message={settingsError} />
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>Paramètres comptables</Text>
        <Text style={styles.subtitle}>
          Configurez vos informations légales et préférences comptables
        </Text>
      </View>

      {/* Informations légales */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Informations légales</Text>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>
              SIRET <Text style={styles.required}>*</Text>
            </Text>
          </View>
          <Input
            placeholder="14 chiffres"
            value={formData.siret}
            onChangeText={(value) => setFormData({ ...formData, siret: value })}
            keyboardType="numeric"
            maxLength={14}
            error={errors.siret}
          />
          {!errors.siret && formData.siret.length === 14 && (
            <View style={styles.validIndicator}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.validText}>SIRET valide</Text>
            </View>
          )}
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>TVA Intracommunautaire</Text>
          </View>
          <Input
            placeholder="FR12345678901"
            value={formData.tvaIntracommunautaire}
            onChangeText={(value) =>
              setFormData({ ...formData, tvaIntracommunautaire: value.toUpperCase() })
            }
            maxLength={13}
            error={errors.tvaIntracommunautaire}
          />
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Code NAF</Text>
          </View>
          <Input
            placeholder="5610A"
            value={formData.codeNaf}
            onChangeText={(value) => setFormData({ ...formData, codeNaf: value.toUpperCase() })}
            maxLength={5}
            error={errors.codeNaf}
          />
        </View>
      </Card>

      {/* Facturation */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Facturation</Text>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>
              Préfixe des factures <Text style={styles.required}>*</Text>
            </Text>
          </View>
          <Input
            placeholder="FACT"
            value={formData.invoicePrefix}
            onChangeText={(value) => setFormData({ ...formData, invoicePrefix: value.toUpperCase() })}
            maxLength={10}
            error={errors.invoicePrefix}
          />
          <Text style={styles.helpText}>
            Format&nbsp;: {formData.invoicePrefix}-2025-00001
          </Text>
        </View>

        <View style={styles.formGroup}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              Recommencer la numérotation chaque année
            </Text>
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityState={{ checked: formData.invoiceYearReset }}
              style={[
                styles.switch,
                formData.invoiceYearReset && styles.switchActive,
              ]}
              onPress={() =>
                setFormData((prev) => ({
                  ...prev,
                  invoiceYearReset: !prev.invoiceYearReset,
                }))
              }
            >
              <View
                style={[
                  styles.switchThumb,
                  formData.invoiceYearReset && styles.switchThumbActive,
                ]}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      {/* Régime TVA */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Régime TVA</Text>

        <View>
          {[
            { value: 'normal', label: 'Régime normal', description: 'TVA sur chaque vente' },
            { value: 'simplifie', label: 'Régime simplifié', description: 'Déclaration trimestrielle' },
            { value: 'franchise', label: 'Franchise en base', description: 'Exonération de TVA' },
          ].map((option) => {
            const active = formData.tvaRegime === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.radioOption, active && styles.radioOptionActive]}
                onPress={() => setFormData({ ...formData, tvaRegime: option.value as TVARegime })}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.radioButton}>
                  {active && <View style={styles.radioButtonInner} />}
                </View>
                <View style={styles.radioContent}>
                  <Text style={styles.radioLabel}>{option.label}</Text>
                  <Text style={styles.radioDescription}>{option.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Export par défaut */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Export par défaut</Text>

        <View>
          {[
            { value: 'FEC', label: 'FEC (Fichier des Écritures Comptables)', icon: 'document-text' },
            { value: 'CSV', label: 'CSV (Compatible Excel)', icon: 'list' },
            { value: 'EXCEL', label: 'Excel (.xlsx)', icon: 'grid' },
          ].map((option) => {
            const active = formData.exportFormatDefault === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.exportOption, active && styles.exportOptionActive]}
                onPress={() => setFormData({ ...formData, exportFormatDefault: option.value as ExportFormat })}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={option.icon as any}
                  size={24}
                  color={active ? COLORS.primary : COLORS.text.secondary}
                />
                <Text style={[styles.exportLabel, active && styles.exportLabelActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Informations */}
      <Card style={[styles.sectionCard, { backgroundColor: `${COLORS.info}10` }]}>
        <View style={styles.infoHeader}>
          <Ionicons name="information-circle" size={24} color={COLORS.info} />
          <Text style={styles.infoTitle}>Informations importantes</Text>
        </View>
        <View>
          <Text style={styles.infoBullet}>• Le SIRET est obligatoire pour générer le FEC</Text>
          <Text style={styles.infoBullet}>• Les factures sont générées automatiquement pour chaque commande</Text>
          <Text style={styles.infoBullet}>• Les données sont synchronisées quotidiennement avec Stripe</Text>
        </View>
      </Card>

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title="Annuler"
          variant="outline"
          onPress={() => router.back()}
          style={{ flex: 1 }}
        />
        <View style={styles.actionSpacer} />
        <Button
          title={isConfigured ? 'Enregistrer' : 'Créer'}
          onPress={handleSave}
          loading={saving}
          style={{ flex: 1 }}
        />
      </View>

      <View style={{ height: s(screenType, 'xl') }} />
    </ScrollView>
  );
};