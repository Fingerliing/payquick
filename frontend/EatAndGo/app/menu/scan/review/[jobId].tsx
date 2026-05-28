/**
 * Écran de relecture — Import de menu par IA.
 *
 * Emplacement : frontend/EatAndGo/app/menu/scan/review/[jobId].tsx
 * Route       : /menu/scan/review/<jobId>
 *
 * Trois états selon l'avancement du job :
 *   - en traitement  -> écran de progression (polling toutes les 3 s)
 *   - échec          -> écran d'erreur + bouton « Réessayer »
 *   - prêt           -> éditeur du brouillon + bouton « Appliquer au menu »
 *   - appliqué       -> écran de bilan
 *
 * Le restaurateur corrige le brouillon (noms, prix, descriptions, régimes),
 * supprime ce que l'IA aurait mal détecté, puis applique. Les corrections
 * sont enregistrées juste avant la matérialisation.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  SHADOWS,
  getResponsiveValue,
  useScreenType,
} from '@/utils/designSystem';
import { Alert as AppAlert, AlertWithAction } from '@/components/ui/Alert';
import { menuScanService } from '@/services/menuScanService';
import {
  NON_TERMINAL_STATUSES,
  type ApplyResponse,
  type MenuScanJob,
  type MenuScanStatus,
  type ScanDraftCategory,
  type ScanDraftItem,
  type ScanExtractedData,
} from '@/types/menuScan';

// Intervalle et plafond du polling (3 s × 60 ≈ 3 min de marge).
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60;

// Libellés FR des codes allergènes (affichage lecture seule).
const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustacés',
  eggs: 'Œufs',
  fish: 'Poissons',
  peanuts: 'Arachides',
  soy: 'Soja',
  milk: 'Lait',
  nuts: 'Fruits à coque',
  celery: 'Céleri',
  mustard: 'Moutarde',
  sesame: 'Sésame',
  sulfites: 'Sulfites',
  lupin: 'Lupin',
  mollusks: 'Mollusques',
};

type ToastVariant = 'success' | 'error' | 'warning' | 'info';
type ToastState = { variant: ToastVariant; title?: string; message: string } | null;

// ─────────────────────────────────────────────────────────────────────────────
// Écran
// ─────────────────────────────────────────────────────────────────────────────
export default function MenuScanReviewScreen() {
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();

  const [job, setJob] = useState<MenuScanJob | null>(null);
  const [draft, setDraft] = useState<ScanExtractedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); // apply / save / retry en cours
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // Refs : ne déclenchent pas de re-render, évitent les boucles d'effet.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  const draftInitRef = useRef(false);

  const notify = useCallback(
    (variant: ToastVariant, message: string, title?: string) => {
      setToast({ variant, message, title });
    },
    [],
  );

  // ── Chargement / polling ────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyJobToState = useCallback((fresh: MenuScanJob) => {
    setJob(fresh);
    // Initialise le brouillon éditable une seule fois, au passage à « ready ».
    if (fresh.status === 'ready' && !draftInitRef.current) {
      setDraft(fresh.extracted_data);
      draftInitRef.current = true;
    }
  }, []);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const fresh = await menuScanService.getJob(jobId);
      applyJobToState(fresh);
      // Statut terminal ou prêt -> plus besoin de poller.
      if (!NON_TERMINAL_STATUSES.includes(fresh.status)) {
        stopPolling();
      }
    } catch (error: any) {
      notify('error', error?.message || 'Chargement impossible.', 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [jobId, applyJobToState, stopPolling, notify]);

  // Effet unique : charge le job puis lance le polling tant qu'il tourne.
  // Dépend uniquement de `jobId` -> stable, pas de boucle.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await fetchJob();
      if (cancelled) return;

      pollRef.current = setInterval(async () => {
        attemptsRef.current += 1;
        if (attemptsRef.current >= POLL_MAX_ATTEMPTS) {
          stopPolling();
          notify(
            'warning',
            'Le traitement prend plus de temps que prévu. Réessayez plus tard.',
            'Délai dépassé',
          );
          return;
        }
        await fetchJob();
      }, POLL_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ── Mutations du brouillon ──────────────────────────────────────────────
  /** Applique une transformation immuable aux catégories du brouillon. */
  const mutateDraft = useCallback(
    (transform: (categories: ScanDraftCategory[]) => ScanDraftCategory[]) => {
      setDraft((prev) =>
        prev ? { categories: transform(prev.categories) } : prev,
      );
    },
    [],
  );

  /** Modifie un plat. `subIndex === null` -> plat directement sous la catégorie. */
  const patchItem = useCallback(
    (
      catIndex: number,
      subIndex: number | null,
      itemIndex: number,
      patch: Partial<ScanDraftItem>,
    ) => {
      mutateDraft((categories) =>
        categories.map((cat, ci) => {
          if (ci !== catIndex) return cat;
          if (subIndex === null) {
            return {
              ...cat,
              items: cat.items.map((it, ii) =>
                ii === itemIndex ? { ...it, ...patch } : it,
              ),
            };
          }
          return {
            ...cat,
            subcategories: cat.subcategories.map((sub, si) =>
              si !== subIndex
                ? sub
                : {
                    ...sub,
                    items: sub.items.map((it, ii) =>
                      ii === itemIndex ? { ...it, ...patch } : it,
                    ),
                  },
            ),
          };
        }),
      );
    },
    [mutateDraft],
  );

  /** Supprime un plat. */
  const deleteItem = useCallback(
    (catIndex: number, subIndex: number | null, itemIndex: number) => {
      mutateDraft((categories) =>
        categories.map((cat, ci) => {
          if (ci !== catIndex) return cat;
          if (subIndex === null) {
            return {
              ...cat,
              items: cat.items.filter((_, ii) => ii !== itemIndex),
            };
          }
          return {
            ...cat,
            subcategories: cat.subcategories.map((sub, si) =>
              si !== subIndex
                ? sub
                : { ...sub, items: sub.items.filter((_, ii) => ii !== itemIndex) },
            ),
          };
        }),
      );
    },
    [mutateDraft],
  );

  /** Modifie le nom d'une catégorie. */
  const patchCategoryName = useCallback(
    (catIndex: number, name: string) => {
      mutateDraft((categories) =>
        categories.map((cat, ci) => (ci === catIndex ? { ...cat, name } : cat)),
      );
    },
    [mutateDraft],
  );

  /** Supprime une catégorie entière. */
  const deleteCategory = useCallback(
    (catIndex: number) => {
      mutateDraft((categories) => categories.filter((_, ci) => ci !== catIndex));
    },
    [mutateDraft],
  );

  /** Modifie le nom d'une sous-catégorie. */
  const patchSubCategoryName = useCallback(
    (catIndex: number, subIndex: number, name: string) => {
      mutateDraft((categories) =>
        categories.map((cat, ci) =>
          ci !== catIndex
            ? cat
            : {
                ...cat,
                subcategories: cat.subcategories.map((sub, si) =>
                  si === subIndex ? { ...sub, name } : sub,
                ),
              },
        ),
      );
    },
    [mutateDraft],
  );

  // ── Statistiques du brouillon courant ───────────────────────────────────
  const draftStats = useMemo(() => {
    if (!draft) return { categories: 0, items: 0, missingPrices: 0 };
    let items = 0;
    let missingPrices = 0;
    draft.categories.forEach((cat) => {
      const allItems = [
        ...cat.items,
        ...cat.subcategories.flatMap((s) => s.items),
      ];
      items += allItems.length;
      allItems.forEach((it) => {
        const value = parseFloat((it.price || '').replace(',', '.'));
        if (!it.price || Number.isNaN(value) || value <= 0) missingPrices += 1;
      });
    });
    return { categories: draft.categories.length, items, missingPrices };
  }, [draft]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleRetry = useCallback(async () => {
    if (!jobId) return;
    setBusy(true);
    try {
      await menuScanService.retryJob(jobId);
      draftInitRef.current = false;
      attemptsRef.current = 0;
      setLoading(true);
      await fetchJob();
      // Relance le polling.
      stopPolling();
      pollRef.current = setInterval(fetchJob, POLL_INTERVAL_MS);
    } catch (error: any) {
      notify('error', error?.message || 'Relance impossible.', 'Erreur');
    } finally {
      setBusy(false);
    }
  }, [jobId, fetchJob, stopPolling, notify]);

  const handleApply = useCallback(async () => {
    if (!jobId || !draft) return;
    setConfirmVisible(false);
    setBusy(true);
    try {
      // Enregistre les corrections, puis matérialise en menu réel.
      await menuScanService.updateDraft(jobId, { extracted_data: draft });
      const result = await menuScanService.applyJob(jobId);
      setApplyResult(result);
      setJob(result.job);
    } catch (error: any) {
      notify('error', error?.message || "L'application a échoué.", 'Erreur');
    } finally {
      setBusy(false);
    }
  }, [jobId, draft, notify]);

  const styles = useMemo(() => createStyles(screenType), [screenType]);

  // ── Rendu : en-tête commun ──────────────────────────────────────────────
  const renderHeader = (title: string) => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={10}
        style={styles.headerButton}
      >
        <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerButton} />
    </View>
  );

  const renderToast = () =>
    toast && (
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
    );

  // ── État : chargement initial ───────────────────────────────────────────
  if (loading && !job) {
    return (
      <View style={styles.root}>
        {renderHeader('Import du menu')}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  const status: MenuScanStatus = job?.status ?? 'pending';

  // ── État : bilan après application ──────────────────────────────────────
  if (applyResult) {
    const r = applyResult.report;
    return (
      <View style={styles.root}>
        {renderHeader('Import terminé')}
        <ScrollView contentContainerStyle={styles.centeredScroll}>
          <View style={[styles.statusIcon, styles.statusIconSuccess]}>
            <Ionicons name="checkmark" size={44} color={COLORS.success} />
          </View>
          <Text style={styles.bigTitle}>Menu importé</Text>
          <Text style={styles.bigSubtitle}>
            {r.categories_created} catégorie(s) et {r.items_created} plat(s)
            ajoutés à votre menu.
          </Text>

          <View style={styles.reportCard}>
            <ReportLine label="Catégories créées" value={r.categories_created} />
            <ReportLine label="Catégories réutilisées" value={r.categories_reused} />
            <ReportLine
              label="Sous-catégories créées"
              value={r.subcategories_created}
            />
            <ReportLine label="Plats créés" value={r.items_created} />
            <ReportLine
              label="Charte graphique"
              value={r.branding_applied ? 'Appliquée' : 'Inchangée'}
            />
          </View>

          {r.warnings.length > 0 && (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>
                <Ionicons name="warning-outline" size={14} /> À vérifier
              </Text>
              {r.warnings.map((w, i) => (
                <Text key={i} style={styles.warningItem}>
                  • {w}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/(restaurant)/menu')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Voir mon menu</Text>
          </TouchableOpacity>
        </View>
        {renderToast()}
      </View>
    );
  }

  // ── État : job déjà appliqué (réouverture) ──────────────────────────────
  if (status === 'applied') {
    return (
      <View style={styles.root}>
        {renderHeader('Import du menu')}
        <View style={styles.centeredScroll}>
          <View style={[styles.statusIcon, styles.statusIconSuccess]}>
            <Ionicons name="checkmark-done" size={44} color={COLORS.success} />
          </View>
          <Text style={styles.bigTitle}>Déjà appliqué</Text>
          <Text style={styles.bigSubtitle}>
            Cet import a déjà été ajouté à votre menu.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 24 }]}
            onPress={() => router.replace('/(restaurant)/menu')}
          >
            <Text style={styles.primaryButtonText}>Voir mon menu</Text>
          </TouchableOpacity>
        </View>
        {renderToast()}
      </View>
    );
  }

  // ── État : échec ────────────────────────────────────────────────────────
  if (status === 'failed') {
    return (
      <View style={styles.root}>
        {renderHeader('Import du menu')}
        <View style={styles.centeredScroll}>
          <View style={[styles.statusIcon, styles.statusIconError]}>
            <Ionicons name="close" size={44} color={COLORS.error} />
          </View>
          <Text style={styles.bigTitle}>L'analyse a échoué</Text>
          <Text style={styles.bigSubtitle}>
            {job?.error_message ||
              "Le traitement de votre carte n'a pas abouti."}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 24 }]}
            onPress={handleRetry}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Réessayer</Text>
            )}
          </TouchableOpacity>
        </View>
        {renderToast()}
      </View>
    );
  }

  // ── État : traitement en cours ──────────────────────────────────────────
  if (NON_TERMINAL_STATUSES.includes(status)) {
    const steps: { key: MenuScanStatus; label: string }[] = [
      { key: 'processing', label: 'Analyse de la carte' },
      { key: 'translating', label: 'Traduction du contenu' },
    ];
    const rank: Record<string, number> = {
      pending: 0,
      processing: 1,
      translating: 2,
      ready: 3,
    };
    const currentRank = rank[status] ?? 0;

    return (
      <View style={styles.root}>
        {renderHeader('Analyse en cours')}
        <View style={styles.centeredScroll}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={[styles.bigTitle, { marginTop: 24 }]}>
            Lecture de votre carte…
          </Text>
          <Text style={styles.bigSubtitle}>
            Cela prend généralement moins d'une minute. Vous pouvez patienter
            sur cet écran.
          </Text>

          <View style={styles.stepsCard}>
            {steps.map((step) => {
              const stepRank = rank[step.key];
              const done = currentRank > stepRank;
              const active = currentRank === stepRank;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <Ionicons
                    name={
                      done
                        ? 'checkmark-circle'
                        : active
                          ? 'ellipse'
                          : 'ellipse-outline'
                    }
                    size={20}
                    color={
                      done
                        ? COLORS.success
                        : active
                          ? COLORS.primary
                          : COLORS.text.light
                    }
                  />
                  <Text
                    style={[
                      styles.stepLabel,
                      (done || active) && styles.stepLabelActive,
                    ]}
                  >
                    {step.label}
                  </Text>
                  {active && (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.primary}
                      style={{ marginLeft: 'auto' }}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>
        {renderToast()}
      </View>
    );
  }

  // ── État : prêt -> éditeur du brouillon ─────────────────────────────────
  return (
    <View style={styles.root}>
      {renderHeader('Vérifier le menu')}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: getResponsiveValue(SPACING.container, screenType),
          paddingBottom: getResponsiveValue(SPACING['4xl'], screenType) + 80,
        }}
      >
        {/* Bandeau récapitulatif */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>
            {draftStats.categories} catégorie(s) · {draftStats.items} plat(s)
            détecté(s).
          </Text>
          {draftStats.missingPrices > 0 && (
            <Text style={styles.summaryWarning}>
              <Ionicons name="warning-outline" size={13} />{' '}
              {draftStats.missingPrices} plat(s) sans prix valide — à compléter
              avant d'appliquer.
            </Text>
          )}
          <Text style={styles.summaryHint}>
            Relisez les prix et les noms. Tout reste modifiable après l'import.
          </Text>
        </View>

        {/* Catégories */}
        {draft?.categories.map((category, catIndex) => (
          <View key={`cat-${catIndex}`} style={styles.categoryBlock}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryEmoji}>{category.icon || '🍽️'}</Text>
              <TextInput
                value={category.name}
                onChangeText={(t) => patchCategoryName(catIndex, t)}
                placeholder="Nom de la catégorie"
                placeholderTextColor={COLORS.text.light}
                style={styles.categoryNameInput}
              />
              <TouchableOpacity
                onPress={() => deleteCategory(catIndex)}
                hitSlop={8}
                style={styles.categoryDeleteBtn}
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </View>

            {/* Plats directement sous la catégorie */}
            {category.items.map((item, itemIndex) => (
              <ItemEditor
                key={`it-${catIndex}-${itemIndex}`}
                item={item}
                styles={styles}
                onChange={(patch) =>
                  patchItem(catIndex, null, itemIndex, patch)
                }
                onDelete={() => deleteItem(catIndex, null, itemIndex)}
              />
            ))}

            {/* Sous-catégories */}
            {category.subcategories.map((sub, subIndex) => (
              <View key={`sub-${catIndex}-${subIndex}`} style={styles.subBlock}>
                <View style={styles.subHeader}>
                  <Ionicons
                    name="return-down-forward"
                    size={16}
                    color={COLORS.text.secondary}
                  />
                  <TextInput
                    value={sub.name}
                    onChangeText={(t) =>
                      patchSubCategoryName(catIndex, subIndex, t)
                    }
                    placeholder="Nom de la sous-catégorie"
                    placeholderTextColor={COLORS.text.light}
                    style={styles.subNameInput}
                  />
                </View>
                {sub.items.map((item, itemIndex) => (
                  <ItemEditor
                    key={`subit-${catIndex}-${subIndex}-${itemIndex}`}
                    item={item}
                    styles={styles}
                    onChange={(patch) =>
                      patchItem(catIndex, subIndex, itemIndex, patch)
                    }
                    onDelete={() => deleteItem(catIndex, subIndex, itemIndex)}
                  />
                ))}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Barre d'action fixe */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
          onPress={() => setConfirmVisible(true)}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Appliquer à mon menu</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Confirmation (dans un Modal pour éviter les conflits de z-index) */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AlertWithAction
              variant={draftStats.missingPrices > 0 ? 'warning' : 'info'}
              title="Appliquer l'import ?"
              message={
                draftStats.missingPrices > 0
                  ? `${draftStats.missingPrices} plat(s) n'ont pas de prix valide et seront créés à 0,00 €. Continuer quand même ?`
                  : `${draftStats.categories} catégorie(s) et ${draftStats.items} plat(s) seront ajoutés à votre menu.`
              }
              autoDismiss={false}
              primaryButton={{
                text: 'Appliquer',
                onPress: handleApply,
                variant: 'primary',
              }}
              secondaryButton={{
                text: 'Annuler',
                onPress: () => setConfirmVisible(false),
              }}
            />
          </View>
        </View>
      </Modal>

      {renderToast()}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composant : éditeur d'un plat
// ─────────────────────────────────────────────────────────────────────────────
interface ItemEditorProps {
  item: ScanDraftItem;
  styles: ReturnType<typeof createStyles>;
  onChange: (patch: Partial<ScanDraftItem>) => void;
  onDelete: () => void;
}

const ItemEditor: React.FC<ItemEditorProps> = ({
  item,
  styles,
  onChange,
  onDelete,
}) => {
  const priceValue = parseFloat((item.price || '').replace(',', '.'));
  const priceInvalid =
    !item.price || Number.isNaN(priceValue) || priceValue <= 0;

  const toggleFlag = (key: 'is_vegetarian' | 'is_vegan' | 'is_gluten_free') => {
    const next = !item[key];
    // Cohérence : vegan implique végétarien.
    if (key === 'is_vegan' && next) {
      onChange({ is_vegan: true, is_vegetarian: true });
    } else {
      onChange({ [key]: next } as Partial<ScanDraftItem>);
    }
  };

  return (
    <View style={styles.itemCard}>
      {/* Ligne 1 : nom + suppression */}
      <View style={styles.itemRow}>
        <TextInput
          value={item.name}
          onChangeText={(t) => onChange({ name: t })}
          placeholder="Nom du plat"
          placeholderTextColor={COLORS.text.light}
          style={styles.itemNameInput}
        />
        <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.itemDeleteBtn}>
          <Ionicons name="close-circle" size={22} color={COLORS.text.light} />
        </TouchableOpacity>
      </View>

      {/* Ligne 2 : prix */}
      <View style={styles.priceRow}>
        <Text style={styles.fieldLabel}>Prix</Text>
        <View
          style={[
            styles.priceInputWrap,
            priceInvalid && styles.priceInputWrapError,
          ]}
        >
          <TextInput
            value={item.price}
            onChangeText={(t) => onChange({ price: t })}
            placeholder="0.00"
            placeholderTextColor={COLORS.text.light}
            keyboardType="decimal-pad"
            style={styles.priceInput}
          />
          <Text style={styles.priceCurrency}>€</Text>
        </View>
        {priceInvalid && (
          <Text style={styles.priceErrorText}>Prix à compléter</Text>
        )}
      </View>

      {/* Ligne 3 : description */}
      <TextInput
        value={item.description}
        onChangeText={(t) => onChange({ description: t })}
        placeholder="Description (optionnelle)"
        placeholderTextColor={COLORS.text.light}
        multiline
        style={styles.descriptionInput}
      />

      {/* Ligne 4 : régimes */}
      <View style={styles.flagsRow}>
        {(
          [
            ['is_vegetarian', 'Végétarien'],
            ['is_vegan', 'Vegan'],
            ['is_gluten_free', 'Sans gluten'],
          ] as const
        ).map(([key, label]) => {
          const active = item[key];
          return (
            <TouchableOpacity
              key={key}
              onPress={() => toggleFlag(key)}
              activeOpacity={0.8}
              style={[styles.flagChip, active && styles.flagChipActive]}
            >
              <Text
                style={[
                  styles.flagChipText,
                  active && styles.flagChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Ligne 5 : allergènes détectés (lecture seule) */}
      {item.allergens.length > 0 && (
        <View style={styles.allergenRow}>
          {item.allergens.map((code) => (
            <View key={code} style={styles.allergenBadge}>
              <Text style={styles.allergenBadgeText}>
                {ALLERGEN_LABELS[code] || code}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composant : ligne de bilan
// ─────────────────────────────────────────────────────────────────────────────
const ReportLine: React.FC<{ label: string; value: number | string }> = ({
  label,
  value,
}) => (
  <View style={reportLineStyles.row}>
    <Text style={reportLineStyles.label}>{label}</Text>
    <Text style={reportLineStyles.value}>{value}</Text>
  </View>
);

const reportLineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: { fontSize: 14, color: COLORS.text.secondary },
  value: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(screenType: 'mobile' | 'tablet' | 'desktop') {
  const sp = (key: keyof typeof SPACING) =>
    getResponsiveValue(SPACING[key], screenType);
  const fs = (key: keyof typeof TYPOGRAPHY.fontSize) =>
    getResponsiveValue(TYPOGRAPHY.fontSize[key], screenType);

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.background },

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

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    centeredScroll: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: sp('xl'),
    },

    // États plein écran
    statusIcon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: sp('lg'),
    },
    statusIconSuccess: { backgroundColor: COLORS.variants.primary[50] },
    statusIconError: { backgroundColor: '#FEF2F2' },
    bigTitle: {
      fontSize: fs('xl'),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      textAlign: 'center',
    },
    bigSubtitle: {
      fontSize: fs('sm'),
      color: COLORS.text.secondary,
      textAlign: 'center',
      marginTop: sp('sm'),
      lineHeight: fs('sm') * 1.5,
    },

    stepsCard: {
      width: '100%',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: sp('lg'),
      marginTop: sp('xl'),
      gap: sp('md'),
      ...SHADOWS.sm,
    },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: sp('sm') },
    stepLabel: { fontSize: fs('sm'), color: COLORS.text.light },
    stepLabelActive: {
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },

    // Bilan
    reportCard: {
      width: '100%',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: sp('lg'),
      marginTop: sp('lg'),
      ...SHADOWS.sm,
    },
    warningCard: {
      width: '100%',
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      padding: sp('lg'),
      marginTop: sp('md'),
    },
    warningTitle: {
      fontSize: fs('sm'),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.variants.secondary[800],
      marginBottom: sp('xs'),
    },
    warningItem: {
      fontSize: fs('xs'),
      color: COLORS.text.secondary,
      lineHeight: fs('xs') * 1.6,
    },

    // Éditeur — récapitulatif
    summaryCard: {
      backgroundColor: COLORS.variants.primary[50],
      borderRadius: BORDER_RADIUS.lg,
      padding: sp('md'),
      marginBottom: sp('lg'),
    },
    summaryText: {
      fontSize: fs('sm'),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    summaryWarning: {
      fontSize: fs('xs'),
      color: COLORS.variants.secondary[800],
      marginTop: sp('xs'),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    summaryHint: {
      fontSize: fs('xs'),
      color: COLORS.text.secondary,
      marginTop: sp('xs'),
    },

    // Catégorie
    categoryBlock: { marginBottom: sp('lg') },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp('sm'),
      marginBottom: sp('sm'),
    },
    categoryEmoji: { fontSize: fs('lg') },
    categoryNameInput: {
      flex: 1,
      fontSize: fs('lg'),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    categoryDeleteBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Sous-catégorie
    subBlock: {
      marginTop: sp('sm'),
      marginLeft: sp('sm'),
      paddingLeft: sp('sm'),
      borderLeftWidth: 2,
      borderLeftColor: COLORS.border.light,
    },
    subHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: sp('xs'),
    },
    subNameInput: {
      flex: 1,
      fontSize: fs('base'),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.secondary,
      paddingVertical: 2,
    },

    // Plat
    itemCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: sp('md'),
      marginBottom: sp('sm'),
      ...SHADOWS.sm,
    },
    itemRow: { flexDirection: 'row', alignItems: 'center' },
    itemNameInput: {
      flex: 1,
      fontSize: fs('base'),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      paddingVertical: 4,
    },
    itemDeleteBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },

    fieldLabel: {
      fontSize: fs('xs'),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp('sm'),
      marginTop: sp('xs'),
    },
    priceInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: sp('sm'),
      backgroundColor: COLORS.background,
      minWidth: 96,
    },
    priceInputWrapError: { borderColor: COLORS.error },
    priceInput: {
      flex: 1,
      fontSize: fs('base'),
      color: COLORS.text.primary,
      paddingVertical: 6,
    },
    priceCurrency: {
      fontSize: fs('base'),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    priceErrorText: { fontSize: fs('xs'), color: COLORS.error },

    descriptionInput: {
      fontSize: fs('sm'),
      color: COLORS.text.secondary,
      marginTop: sp('sm'),
      paddingVertical: 6,
      paddingHorizontal: sp('sm'),
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.md,
      minHeight: 40,
      textAlignVertical: 'top',
    },

    flagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: sp('xs'),
      marginTop: sp('sm'),
    },
    flagChip: {
      paddingVertical: 6,
      paddingHorizontal: sp('sm'),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      backgroundColor: COLORS.background,
    },
    flagChipActive: {
      borderColor: COLORS.success,
      backgroundColor: '#ECFDF5',
    },
    flagChipText: { fontSize: fs('xs'), color: COLORS.text.secondary },
    flagChipTextActive: {
      color: COLORS.success,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    allergenRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: sp('sm'),
    },
    allergenBadge: {
      paddingVertical: 3,
      paddingHorizontal: sp('sm'),
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: COLORS.variants.secondary[100],
    },
    allergenBadgeText: {
      fontSize: fs('xs'),
      color: COLORS.variants.secondary[800],
    },

    // Footer + boutons
    footer: {
      paddingHorizontal: sp('container'),
      paddingTop: sp('md'),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    primaryButton: {
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
    primaryButtonDisabled: { backgroundColor: COLORS.text.light, ...SHADOWS.none },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: fs('base'),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },

    // Modal de confirmation
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: sp('xl'),
    },
    modalCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: sp('lg'),
      ...SHADOWS.lg,
    },
  });
}
