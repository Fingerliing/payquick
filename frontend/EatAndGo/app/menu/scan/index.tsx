/**
 * Écran de capture — Import de menu par IA.
 * 
 * Le restaurateur photographie sa carte (une photo par page), choisit les
 * langues de traduction, puis lance l'import. À la création du job, on
 * redirige vers l'écran de relecture qui suit l'avancement du traitement.
 *
 * `restaurantId` est attendu en paramètre de route (l'écran est ouvert depuis
 * l'onglet Menus, qui a déjà un restaurant sélectionné).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  SHADOWS,
  getResponsiveValue,
  useScreenType,
} from '@/utils/designSystem';
import { Alert as AppAlert } from '@/components/ui/Alert';
import { menuScanService } from '@/services/menuScanService';
import {
  SUPPORTED_SCAN_LANGUAGES,
  DEFAULT_SCAN_LANGUAGES,
  type LocalScanPhoto,
} from '@/types/menuScan';

const MAX_PAGES = 10;

type ToastVariant = 'success' | 'error' | 'warning' | 'info';
type ToastState = {
  variant: ToastVariant;
  title?: string;
  message: string;
} | null;

export default function MenuScanCaptureScreen() {
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();
  const { restaurantId, menuId } = useLocalSearchParams<{
    restaurantId?: string;
    menuId?: string;
  }>();

  const [photos, setPhotos] = useState<LocalScanPhoto[]>([]);
  const [languages, setLanguages] = useState<string[]>(DEFAULT_SCAN_LANGUAGES);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // ── Notification toast (pattern Alert du projet) ────────────────────────
  const notify = useCallback(
    (variant: ToastVariant, message: string, title?: string) => {
      setToast({ variant, message, title });
    },
    [],
  );

  // ── Helpers responsive ──────────────────────────────────────────────────
  const sp = useCallback(
    (key: keyof typeof SPACING) => getResponsiveValue(SPACING[key], screenType),
    [screenType],
  );

  // ── Ajout de photos ─────────────────────────────────────────────────────
  const addPhotos = useCallback(
    (uris: string[]) => {
      setPhotos((prev) => {
        const room = MAX_PAGES - prev.length;
        if (room <= 0) {
          notify('warning', `Maximum ${MAX_PAGES} pages par import.`, 'Limite atteinte');
          return prev;
        }
        const accepted = uris.slice(0, room).map((uri, i) => ({
          uri,
          key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        }));
        if (uris.length > room) {
          notify('warning', `Seules ${room} page(s) ont été ajoutées.`, 'Limite atteinte');
        }
        return [...prev, ...accepted];
      });
    },
    [notify],
  );

  const handleTakePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('warning', "Autorisez l'accès à l'appareil photo.", 'Permission requise');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.length) {
      addPhotos(result.assets.map((a) => a.uri));
    }
  }, [addPhotos, notify]);

  const handlePickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('warning', "Autorisez l'accès à vos photos.", 'Permission requise');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PAGES,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.length) {
      addPhotos(result.assets.map((a) => a.uri));
    }
  }, [addPhotos, notify]);

  // ── Réordonnancement / suppression ──────────────────────────────────────
  const movePhoto = useCallback((index: number, direction: -1 | 1) => {
    setPhotos((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removePhoto = useCallback((key: string) => {
    setPhotos((prev) => prev.filter((p) => p.key !== key));
  }, []);

  // ── Langues ─────────────────────────────────────────────────────────────
  const toggleLanguage = useCallback((code: string) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }, []);

  // ── Lancement de l'import ───────────────────────────────────────────────
  const canSubmit = photos.length > 0 && !submitting && !!restaurantId;

  const handleSubmit = useCallback(async () => {
    if (!restaurantId) {
      notify('error', "Restaurant introuvable. Repassez par l'onglet Menus.", 'Erreur');
      return;
    }
    if (photos.length === 0) {
      notify('warning', 'Ajoutez au moins une photo de votre carte.', 'Aucune photo');
      return;
    }

    setSubmitting(true);
    try {
      const job = await menuScanService.createJob(
        restaurantId,
        photos.map((p) => p.uri),
        languages,
        menuId,
      );
      // L'écran de relecture suit l'avancement du traitement.
      router.replace(`/menu/scan/review/${job.id}`);
    } catch (error: any) {
      notify('error', error?.message || "Impossible de lancer l'import.", 'Erreur');
      setSubmitting(false);
    }
  }, [restaurantId, photos, languages, notify]);

  // ── Styles dépendant du responsive ──────────────────────────────────────
  const styles = useMemo(() => createStyles(screenType), [screenType]);

  return (
    <View style={styles.root}>
      {/* En-tête */}
      <View style={[styles.header, { paddingTop: insets.top + sp('sm') }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerButton}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Importer une carte
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: sp('container'),
          paddingBottom: Math.max(insets.bottom, 20) + sp('4xl'),
        }}
      >
        {/* Introduction */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="sparkles" size={22} color={COLORS.variants.secondary[600]} />
          </View>
          <Text style={styles.introText}>
            Photographiez votre carte papier. L'IA détecte automatiquement les
            catégories, les plats, les prix et les traduit. Vous pourrez tout
            relire et corriger avant de l'appliquer à votre menu.
          </Text>
        </View>

        {/* Section photos */}
        <Text style={styles.sectionTitle}>
          Photos de la carte{' '}
          <Text style={styles.sectionCount}>
            ({photos.length}/{MAX_PAGES})
          </Text>
        </Text>
        <Text style={styles.sectionHint}>
          Une photo par page. L'ordre des pages correspond à l'ordre ci-dessous.
        </Text>

        {photos.length === 0 ? (
          <View style={styles.emptyPhotos}>
            <Ionicons name="camera-outline" size={40} color={COLORS.text.light} />
            <Text style={styles.emptyPhotosText}>Aucune page ajoutée</Text>
          </View>
        ) : (
          <View style={styles.photoList}>
            {photos.map((photo, index) => (
              <View key={photo.key} style={styles.photoRow}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                <View style={styles.photoInfo}>
                  <Text style={styles.photoLabel}>Page {index + 1}</Text>
                </View>
                <View style={styles.photoActions}>
                  <TouchableOpacity
                    onPress={() => movePhoto(index, -1)}
                    disabled={index === 0}
                    hitSlop={6}
                    style={styles.photoActionBtn}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={20}
                      color={index === 0 ? COLORS.text.light : COLORS.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => movePhoto(index, 1)}
                    disabled={index === photos.length - 1}
                    hitSlop={6}
                    style={styles.photoActionBtn}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={
                        index === photos.length - 1
                          ? COLORS.text.light
                          : COLORS.primary
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removePhoto(photo.key)}
                    hitSlop={6}
                    style={styles.photoActionBtn}
                  >
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Boutons d'ajout */}
        <View style={styles.addButtonsRow}>
          <TouchableOpacity
            style={[styles.addButton, styles.addButtonPrimary]}
            onPress={handleTakePhoto}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonPrimaryText}>Prendre une photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, styles.addButtonSecondary]}
            onPress={handlePickFromLibrary}
            activeOpacity={0.8}
          >
            <Ionicons name="images-outline" size={20} color={COLORS.primary} />
            <Text style={styles.addButtonSecondaryText}>Galerie</Text>
          </TouchableOpacity>
        </View>

        {/* Section langues */}
        <Text style={[styles.sectionTitle, { marginTop: sp('xl') }]}>
          Langues de traduction
        </Text>
        <Text style={styles.sectionHint}>
          Le contenu est extrait en français. Choisissez les langues
          supplémentaires à générer (optionnel).
        </Text>
        <View style={styles.languageGrid}>
          {SUPPORTED_SCAN_LANGUAGES.map((lang) => {
            const selected = languages.includes(lang.code);
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => toggleLanguage(lang.code)}
                activeOpacity={0.8}
                style={[
                  styles.languageChip,
                  selected && styles.languageChipSelected,
                ]}
              >
                {selected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={COLORS.primary}
                  />
                )}
                <Text
                  style={[
                    styles.languageChipText,
                    selected && styles.languageChipTextSelected,
                  ]}
                >
                  {lang.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Barre d'action fixe */}
      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>
                Lancer l'import ({photos.length} page
                {photos.length > 1 ? 's' : ''})
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Zone d'alerte (toast auto-dismiss) */}
      {toast && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24 + insets.bottom,
          }}
        >
          <AppAlert
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onDismiss={() => setToast(null)}
            autoDismiss
            autoDismissDuration={5000}
          />
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(screenType: 'mobile' | 'tablet' | 'desktop') {
  const sp = (key: keyof typeof SPACING) =>
    getResponsiveValue(SPACING[key], screenType);
  const fs = (key: keyof typeof TYPOGRAPHY.fontSize) =>
    getResponsiveValue(TYPOGRAPHY.fontSize[key], screenType);

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: sp('container'),
      paddingBottom: sp('sm'),
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: fs('lg'),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    introCard: {
      flexDirection: 'row',
      gap: sp('md'),
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      padding: sp('lg'),
      marginBottom: sp('xl'),
    },
    introIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    introText: {
      flex: 1,
      fontSize: fs('sm'),
      color: COLORS.text.secondary,
      lineHeight: fs('sm') * 1.5,
    },
    sectionTitle: {
      fontSize: fs('lg'),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: sp('xs'),
    },
    sectionCount: {
      fontSize: fs('base'),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: COLORS.text.secondary,
    },
    sectionHint: {
      fontSize: fs('sm'),
      color: COLORS.text.secondary,
      marginBottom: sp('md'),
      lineHeight: fs('sm') * 1.5,
    },
    emptyPhotos: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: sp('2xl'),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: COLORS.border.default,
    },
    emptyPhotosText: {
      marginTop: sp('sm'),
      fontSize: fs('sm'),
      color: COLORS.text.light,
    },
    photoList: {
      gap: sp('sm'),
    },
    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: sp('sm'),
      ...SHADOWS.sm,
    },
    photoThumb: {
      width: 56,
      height: 56,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.border.light,
    },
    photoInfo: {
      flex: 1,
      marginLeft: sp('md'),
    },
    photoLabel: {
      fontSize: fs('base'),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    photoActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp('xs'),
    },
    photoActionBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonsRow: {
      flexDirection: 'row',
      gap: sp('sm'),
      marginTop: sp('md'),
    },
    addButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: sp('xs'),
      paddingVertical: sp('md'),
      borderRadius: BORDER_RADIUS.lg,
    },
    addButtonPrimary: {
      backgroundColor: COLORS.primary,
    },
    addButtonPrimaryText: {
      color: '#FFFFFF',
      fontSize: fs('sm'),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    addButtonSecondary: {
      backgroundColor: COLORS.surface,
      borderWidth: 1.5,
      borderColor: COLORS.primary,
    },
    addButtonSecondaryText: {
      color: COLORS.primary,
      fontSize: fs('sm'),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    languageGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: sp('sm'),
    },
    languageChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: sp('sm'),
      paddingHorizontal: sp('md'),
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: COLORS.surface,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
    },
    languageChipSelected: {
      backgroundColor: COLORS.variants.primary[50],
      borderColor: COLORS.primary,
    },
    languageChipText: {
      fontSize: fs('sm'),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    languageChipTextSelected: {
      color: COLORS.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    footer: {
      paddingHorizontal: sp('container'),
      paddingTop: sp('md'),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: sp('sm'),
      paddingVertical: sp('md'),
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.primary,
      minHeight: 52,
      ...SHADOWS.md,
    },
    submitButtonDisabled: {
      backgroundColor: COLORS.text.light,
      ...SHADOWS.none,
    },
    submitButtonText: {
      color: '#FFFFFF',
      fontSize: fs('base'),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
  });
}