import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { menuService } from '@/services/menuService';
import { tableService } from '@/services/tableService';
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

// Android layout animations
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'done' | 'active' | 'locked';

interface SubStep {
  icon: string;
  text: string;
}

interface WizardStep {
  id: string;
  number: number;
  icon: string;
  accentColor: string;
  title: string;
  subtitle: string;
  doneLabel: string;
  substeps: SubStep[];
  tip: string;
  cta: { label: string; route: string; icon: string };
}

// ─── Définition des étapes ────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  {
    id: 'stripe',
    number: 1,
    icon: 'card',
    accentColor: '#6D28D9',
    title: 'Activer les paiements',
    subtitle: 'Connectez votre compte Stripe pour recevoir des paiements.',
    doneLabel: 'Stripe activé',
    substeps: [
      { icon: 'person-circle', text: 'Accédez à votre profil depuis le menu' },
      { icon: 'card', text: 'Appuyez sur "Configurer les paiements Stripe"' },
      { icon: 'document-text', text: 'Remplissez le formulaire d\'inscription Stripe' },
      { icon: 'checkmark-circle', text: 'Attendez la confirmation (quelques minutes)' },
    ],
    tip: 'Cette étape est requise une seule fois. Elle permet à EatQuickeR de vous reverser vos revenus quotidiennement.',
    cta: { label: 'Configurer Stripe', route: '/profile', icon: 'card' },
  },
  {
    id: 'restaurant',
    number: 2,
    icon: 'restaurant',
    accentColor: COLORS.primary,
    title: 'Créer votre restaurant',
    subtitle: 'Ajoutez votre établissement pour commencer à recevoir des commandes.',
    doneLabel: 'Restaurant créé',
    substeps: [
      { icon: 'add-circle', text: 'Appuyez sur "Créer un restaurant"' },
      { icon: 'text', text: 'Saisissez le nom et l\'adresse de votre établissement' },
      { icon: 'image', text: 'Ajoutez une photo de couverture attrayante' },
      { icon: 'call', text: 'Renseignez votre numéro de téléphone de contact' },
      { icon: 'save', text: 'Enregistrez — votre restaurant est en ligne !' },
    ],
    tip: 'Vous pouvez créer plusieurs restaurants depuis un seul compte restaurateur.',
    cta: { label: 'Créer mon restaurant', route: '/restaurant/add', icon: 'add-circle' },
  },
  {
    id: 'menu',
    number: 3,
    icon: 'book',
    accentColor: '#7C3AED',
    title: 'Créer votre menu',
    subtitle: 'Organisez vos plats dans un menu structuré par catégories.',
    doneLabel: 'Menu créé',
    substeps: [
      { icon: 'albums', text: 'Allez dans "Gérer les menus" et créez un menu' },
      { icon: 'list', text: 'Ajoutez des catégories (Entrées, Plats, Desserts...)' },
      { icon: 'layers', text: 'Créez des sous-catégories si besoin (Viandes, Poissons...)' },
      { icon: 'fast-food', text: 'Ajoutez vos plats avec nom, prix et description' },
      { icon: 'image', text: 'Illustrez chaque plat avec une photo appétissante' },
    ],
    tip: 'Créez différents menus pour vos saisons ou événements (Menu Été, Menu des Fêtes...).',
    cta: { label: 'Gérer les menus', route: '/(restaurant)/menu', icon: 'book' },
  },
  {
    id: 'items',
    number: 4,
    icon: 'fast-food',
    accentColor: '#DC2626',
    title: 'Ajouter vos plats',
    subtitle: 'Enrichissez votre menu avec tous vos plats et boissons.',
    doneLabel: 'Plats ajoutés',
    substeps: [
      { icon: 'add', text: 'Dans votre menu, appuyez sur "+" pour ajouter un plat' },
      { icon: 'pricetag', text: 'Définissez le nom, la description et le prix' },
      { icon: 'leaf', text: 'Renseignez les allergènes et options (végétarien, vegan...)' },
      { icon: 'toggle', text: 'Activez le plat pour le rendre disponible à la commande' },
    ],
    tip: 'Vous pouvez activer/désactiver un plat en temps réel si vous êtes en rupture.',
    cta: { label: 'Voir mes menus', route: '/(restaurant)/menu', icon: 'fast-food' },
  },
  {
    id: 'qrcodes',
    number: 5,
    icon: 'qr-code',
    accentColor: '#059669',
    title: 'Générer les QR Codes',
    subtitle: 'Créez un QR code par table pour que vos clients commandent depuis leur smartphone.',
    doneLabel: 'QR Codes générés',
    substeps: [
      { icon: 'grid', text: 'Ouvrez "QR Codes Tables" et sélectionnez votre restaurant' },
      { icon: 'add-circle', text: 'Indiquez le nombre de tables et le numéro de départ' },
      { icon: 'qr-code', text: 'Chaque table reçoit un QR code et un code manuel unique' },
      { icon: 'print', text: 'Imprimez les QR codes (PDF A4 ou partage individuel)' },
      { icon: 'phone-portrait', text: 'Disposez les sur vos tables — c\'est prêt !' },
    ],
    tip: 'La fonction "Tout imprimer" génère un PDF avec tous les QR codes en un seul clic.',
    cta: { label: 'Générer les QR Codes', route: '/(restaurant)/qrcodes', icon: 'qr-code' },
  },
];

// ─── Badge numéroté / coché ───────────────────────────────────────────────────

function StepBadge({ step, status, size = 44 }: { step: WizardStep; status: StepStatus; size?: number }) {
  if (status === 'done') {
    return (
      <View style={[badgeStyles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.success + '20', borderColor: COLORS.success }]}>
        <Ionicons name="checkmark" size={size * 0.45} color={COLORS.success} />
      </View>
    );
  }
  if (status === 'active') {
    return (
      <View style={[badgeStyles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: step.accentColor, borderColor: step.accentColor }]}>
        <Ionicons name={step.icon as any} size={size * 0.45} color="#FFF" />
      </View>
    );
  }
  return (
    <View style={[badgeStyles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.border.light, borderColor: COLORS.border.default }]}>
      <Text style={[badgeStyles.number, { fontSize: size * 0.35 }]}>{step.number}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  base: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  number: { fontWeight: TYPOGRAPHY.fontWeight.bold, color: COLORS.text.secondary },
});

// ─── Carte étape terminée ─────────────────────────────────────────────────────

function DoneStepCard({ step }: { step: WizardStep }) {
  return (
    <View style={doneStyles.card}>
      <StepBadge step={step} status="done" size={36} />
      <View style={doneStyles.textWrap}>
        <Text style={doneStyles.title}>{step.title}</Text>
        <Text style={doneStyles.label}>{step.doneLabel}</Text>
      </View>
      <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
    </View>
  );
}

const doneStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.success + '30',
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: TYPOGRAPHY.fontWeight.semibold, color: COLORS.text.primary },
  label: { fontSize: 12, color: COLORS.success, marginTop: 1 },
});

// ─── Carte étape verrouillée ──────────────────────────────────────────────────

function LockedStepCard({ step }: { step: WizardStep }) {
  return (
    <View style={lockedStyles.card}>
      <StepBadge step={step} status="locked" size={36} />
      <View style={{ flex: 1 }}>
        <Text style={lockedStyles.title}>{step.title}</Text>
        <Text style={lockedStyles.subtitle}>{step.subtitle}</Text>
      </View>
      <Ionicons name="lock-closed" size={16} color={COLORS.text.light} />
    </View>
  );
}

const lockedStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border.light,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10, opacity: 0.55,
  },
  title: { fontSize: 14, fontWeight: TYPOGRAPHY.fontWeight.semibold, color: COLORS.text.secondary },
  subtitle: { fontSize: 12, color: COLORS.text.light, marginTop: 2 },
});

// ─── Carte étape active ───────────────────────────────────────────────────────

function ActiveStepCard({ step, gv }: { step: WizardStep; gv: (t: any) => number }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={[activeStyles.card, { borderColor: step.accentColor + '70', shadowColor: step.accentColor }]}>

        {/* En-tête */}
        <View style={[activeStyles.header, { backgroundColor: step.accentColor + '10', borderBottomColor: step.accentColor + '25' }]}>
          <StepBadge step={step} status="active" size={50} />
          <View style={{ flex: 1 }}>
            <View style={[activeStyles.badgePill, { backgroundColor: step.accentColor }]}>
              <Text style={activeStyles.badgePillText}>ÉTAPE EN COURS</Text>
            </View>
            <Text style={[activeStyles.title, { fontSize: gv(TYPOGRAPHY.fontSize.lg) }]}>
              {step.title}
            </Text>
            <Text style={[activeStyles.subtitle, { fontSize: gv(TYPOGRAPHY.fontSize.sm) }]}>
              {step.subtitle}
            </Text>
          </View>
        </View>

        {/* Corps */}
        <View style={activeStyles.body}>
          <Text style={[activeStyles.sectionLabel, { fontSize: gv(TYPOGRAPHY.fontSize.sm) }]}>
            COMMENT FAIRE
          </Text>

          {step.substeps.map((sub, i) => (
            <View key={i} style={activeStyles.subRow}>
              {/* Ligne connecteur vertical */}
              <View style={activeStyles.subLeft}>
                <View style={[activeStyles.subDot, { backgroundColor: step.accentColor }]} />
                {i < step.substeps.length - 1 && (
                  <View style={[activeStyles.subLine, { backgroundColor: step.accentColor + '30' }]} />
                )}
              </View>
              <View style={activeStyles.subContent}>
                <View style={[activeStyles.subIcon, { backgroundColor: step.accentColor + '15' }]}>
                  <Ionicons name={sub.icon as any} size={14} color={step.accentColor} />
                </View>
                <Text style={[activeStyles.subText, { fontSize: gv(TYPOGRAPHY.fontSize.sm) }]}>
                  {sub.text}
                </Text>
              </View>
            </View>
          ))}

          {/* Conseil */}
          <View style={[activeStyles.tip, { borderColor: step.accentColor + '40', backgroundColor: step.accentColor + '08' }]}>
            <Ionicons name="bulb" size={16} color={step.accentColor} style={{ flexShrink: 0, marginTop: 1 }} />
            <Text style={[activeStyles.tipText, { fontSize: gv(TYPOGRAPHY.fontSize.sm), color: step.accentColor }]}>
              {step.tip}
            </Text>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[activeStyles.cta, { backgroundColor: step.accentColor }]}
            onPress={() => router.push(step.cta.route as any)}
            activeOpacity={0.85}
          >
            <Ionicons name={step.cta.icon as any} size={18} color="#FFF" />
            <Text style={[activeStyles.ctaText, { fontSize: gv(TYPOGRAPHY.fontSize.base) }]}>
              {step.cta.label}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const activeStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS['2xl'],
    borderWidth: 2,
    overflow: 'hidden',
    ...SHADOWS.lg,
    elevation: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    padding: 18, borderBottomWidth: 1,
  },
  badgePill: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full, marginBottom: 6,
  },
  badgePillText: {
    fontSize: 10, fontWeight: TYPOGRAPHY.fontWeight.bold, color: '#FFF', letterSpacing: 0.6,
  },
  title: { fontWeight: TYPOGRAPHY.fontWeight.bold, color: COLORS.text.primary, marginBottom: 3 },
  subtitle: { color: COLORS.text.secondary, lineHeight: 18 },
  body: { padding: 18 },
  sectionLabel: {
    color: COLORS.text.light, fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 0.8, marginBottom: 16,
  },
  subRow: { flexDirection: 'row', alignItems: 'flex-start' },
  subLeft: { width: 20, alignItems: 'center', marginRight: 10, paddingTop: 12 },
  subDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  subLine: { width: 2, flex: 1, minHeight: 24, marginTop: 2 },
  subContent: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 18,
  },
  subIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  subText: { flex: 1, color: COLORS.text.primary, lineHeight: 20, paddingTop: 4 },
  tip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderWidth: 1, borderRadius: BORDER_RADIUS.lg, padding: 12,
    marginTop: 2, marginBottom: 16,
  },
  tipText: { flex: 1, lineHeight: 18, fontWeight: TYPOGRAPHY.fontWeight.medium },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: BORDER_RADIUS.xl, paddingVertical: 14, paddingHorizontal: 20,
    ...SHADOWS.md,
  },
  ctaText: { color: '#FFF', fontWeight: TYPOGRAPHY.fontWeight.bold, flex: 1, textAlign: 'center' },
});

// ─── Carte "Tout est prêt" ────────────────────────────────────────────────────

function AllDoneCard({ gv }: { gv: (t: any) => number }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={allDoneStyles.card}>
        <View style={allDoneStyles.iconWrap}>
          <Text style={{ fontSize: 46 }}>🎉</Text>
        </View>
        <Text style={[allDoneStyles.title, { fontSize: gv(TYPOGRAPHY.fontSize['2xl']) }]}>
          Votre restaurant est opérationnel !
        </Text>
        <Text style={[allDoneStyles.subtitle, { fontSize: gv(TYPOGRAPHY.fontSize.base) }]}>
          Vous êtes prêt à recevoir des commandes. Partagez vos QR codes sur vos tables et laissez EatQuickeR faire le reste.
        </Text>
        <View style={allDoneStyles.row}>
          <TouchableOpacity
            style={[allDoneStyles.btn, { backgroundColor: COLORS.primary }]}
            onPress={() => router.push('/(restaurant)/orders' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="receipt" size={17} color="#FFF" />
            <Text style={allDoneStyles.btnText}>Commandes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[allDoneStyles.btn, { backgroundColor: COLORS.secondary }]}
            onPress={() => router.push('/(restaurant)/statistics' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="stats-chart" size={17} color="#FFF" />
            <Text style={allDoneStyles.btnText}>Statistiques</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const allDoneStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.goldenSurface, borderRadius: BORDER_RADIUS['2xl'],
    borderWidth: 2, borderColor: COLORS.border.golden,
    padding: 24, alignItems: 'center', ...SHADOWS.lg,
  },
  iconWrap: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: COLORS.secondary + '20',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontWeight: TYPOGRAPHY.fontWeight.bold, color: COLORS.text.primary, textAlign: 'center', marginBottom: 10 },
  subtitle: { color: COLORS.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: BORDER_RADIUS.xl, ...SHADOWS.sm,
  },
  btnText: { color: '#FFF', fontWeight: TYPOGRAPHY.fontWeight.semibold, fontSize: 13 },
});

// ─── Barre de progression ─────────────────────────────────────────────────────

function ProgressBar({ completedCount, total, gv }: { completedCount: number; total: number; gv: (t: any) => number }) {
  const progress = completedCount / total;
  const allDone = completedCount === total;

  return (
    <View style={[progressStyles.card, { padding: gv(SPACING.lg) }]}>
      <View style={progressStyles.header}>
        <View>
          <Text style={[progressStyles.title, { fontSize: gv(TYPOGRAPHY.fontSize.base) }]}>
            {allDone ? 'Configuration terminée !' : 'Configuration en cours'}
          </Text>
          <Text style={[progressStyles.subtitle, { fontSize: gv(TYPOGRAPHY.fontSize.sm) }]}>
            {completedCount} / {total} étapes complétées
          </Text>
        </View>
        <View style={[progressStyles.pctBadge, { backgroundColor: allDone ? COLORS.success + '20' : COLORS.primary + '15' }]}>
          <Text style={[progressStyles.pctText, { color: allDone ? COLORS.success : COLORS.primary, fontSize: gv(TYPOGRAPHY.fontSize.base) }]}>
            {Math.round(progress * 100)} %
          </Text>
        </View>
      </View>

      {/* Track */}
      <View style={progressStyles.track}>
        <View
          style={[
            progressStyles.fill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: allDone ? COLORS.success : COLORS.primary,
            },
          ]}
        />
      </View>

      {/* Dots */}
      <View style={progressStyles.dots}>
        {STEPS.map((s, i) => {
          const isDone = i < completedCount;
          const isActive = i === completedCount;
          return (
            <View key={s.id} style={progressStyles.dotWrap}>
              <View style={[
                progressStyles.dot,
                isDone && { backgroundColor: COLORS.success, borderColor: COLORS.success },
                isActive && { backgroundColor: COLORS.primary, borderColor: COLORS.primary, transform: [{ scale: 1.3 }] },
              ]}>
                {isDone && <Ionicons name="checkmark" size={8} color="#FFF" />}
                {isActive && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFF' }} />}
              </View>
              <Text style={[progressStyles.dotLabel, { color: isDone ? COLORS.success : isActive ? COLORS.primary : COLORS.text.light }]}>
                {s.number}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS['2xl'],
    borderWidth: 1, borderColor: COLORS.border.default, ...SHADOWS.sm, marginBottom: 20,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontWeight: TYPOGRAPHY.fontWeight.bold, color: COLORS.text.primary, marginBottom: 2 },
  subtitle: { color: COLORS.text.secondary },
  pctBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BORDER_RADIUS.full },
  pctText: { fontWeight: TYPOGRAPHY.fontWeight.bold },
  track: { height: 8, backgroundColor: COLORS.border.light, borderRadius: 4, overflow: 'hidden', marginBottom: 14 },
  fill: { height: '100%', borderRadius: 4 },
  dots: { flexDirection: 'row', justifyContent: 'space-between' },
  dotWrap: { alignItems: 'center', gap: 4 },
  dot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: COLORS.border.default, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  dotLabel: { fontSize: 11, fontWeight: TYPOGRAPHY.fontWeight.semibold },
});

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();
  const gv = useCallback((token: any) => getResponsiveValue(token, screenType) as number, [screenType]);

  const { user } = useAuth();
  const { restaurants, loadRestaurants } = useRestaurant();

  // Refs stables — évitent de mettre restaurants/loadRestaurants dans les deps
  // de computeProgress, ce qui causerait une boucle infinie (loadRestaurants →
  // restaurants change → computeProgress recrée → useFocusEffect refire → ...).
  const restaurantsRef = useRef(restaurants);
  useEffect(() => { restaurantsRef.current = Array.isArray(restaurants) ? restaurants : []; }, [restaurants]);

  const loadRestaurantsRef = useRef(loadRestaurants);
  useEffect(() => { loadRestaurantsRef.current = loadRestaurants; }, [loadRestaurants]);

  // Garde anti-reentrance : empêche un double appel concurrent
  const isRunning = useRef(false);

  const [loadingProgress, setLoadingProgress] = useState(true);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(['active', 'locked', 'locked', 'locked', 'locked']);

  const completedCount = stepStatuses.filter(s => s === 'done').length;
  const allDone = completedCount === STEPS.length;

  // ── Calcul de la progression réelle ──────────────────────────────────────

  const computeProgress = useCallback(async () => {
    if (isRunning.current) return;
    isRunning.current = true;
    setLoadingProgress(true);
    try {
      const s: StepStatus[] = ['locked', 'locked', 'locked', 'locked', 'locked'];

      // Étape 1 — Stripe
      const stripeOk = !!user?.roles?.has_validated_profile;
      s[0] = stripeOk ? 'done' : 'active';
      if (!stripeOk) { setStepStatuses(s); return; }

      // Étape 2 — Restaurant
      // On charge via la ref pour ne pas déclencher de re-render de ce callback
      await loadRestaurantsRef.current();
      // La ref est synchronisée par le useEffect ci-dessus ; on attend un tick
      // pour que le contexte ait eu le temps de dispatcher avant de lire.
      await new Promise(r => setTimeout(r, 0));
      const safeRestaurants = restaurantsRef.current;
      const hasRestaurant = safeRestaurants.length > 0;
      s[1] = hasRestaurant ? 'done' : 'active';
      if (!hasRestaurant) { setStepStatuses(s); return; }

      const firstRestaurant = safeRestaurants[0];

      // Étape 3 — Menu
      let menus: any[] = [];
      try { menus = await menuService.getMenusByRestaurant(Number(firstRestaurant.id)); } catch {}
      s[2] = menus.length > 0 ? 'done' : 'active';
      if (menus.length === 0) { setStepStatuses(s); return; }

      // Étape 4 — Plats
      let items: any[] = [];
      try { items = await menuService.menuItems.getMyMenuItems(); } catch {}
      s[3] = items.length > 0 ? 'done' : 'active';
      if (items.length === 0) { setStepStatuses(s); return; }

      // Étape 5 — QR Codes
      let tables: any[] = [];
      try { tables = await tableService.getRestaurantTables(String(firstRestaurant.id)); } catch {}
      s[4] = tables.length > 0 ? 'done' : 'active';

      setStepStatuses(s);
    } catch (e) {
      console.warn('[HelpScreen] computeProgress error', e);
    } finally {
      setLoadingProgress(false);
      isRunning.current = false;
    }
  }, [user]); // user est la seule vraie dépendance fonctionnelle

  useFocusEffect(
    useCallback(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      computeProgress();
    }, [computeProgress])
  );

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Header title="Guide de démarrage" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: gv(SPACING.container),
            paddingBottom: Math.max(insets.bottom, 20) + 24,
          },
        ]}
      >
        {/* Hero */}
        <View style={[styles.hero, { marginBottom: gv(SPACING.lg) }]}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroTitle, { fontSize: gv(TYPOGRAPHY.fontSize.xl) }]}>
              Bienvenue sur EatQuickeR
            </Text>
            <Text style={[styles.heroSubtitle, { fontSize: gv(TYPOGRAPHY.fontSize.sm) }]}>
              Suivez ce guide pour configurer votre restaurant en quelques minutes.
            </Text>
          </View>
          <View style={styles.heroEmoji}>
            <Text style={{ fontSize: 36 }}>🚀</Text>
          </View>
        </View>

        {/* Barre de progression */}
        <ProgressBar completedCount={completedCount} total={STEPS.length} gv={gv} />

        {/* État "Tout est prêt" */}
        {allDone && !loadingProgress && <AllDoneCard gv={gv} />}

        {/* Étapes */}
        {!allDone && !loadingProgress && (
          <>
            <Text style={[styles.sectionLabel, { fontSize: gv(TYPOGRAPHY.fontSize.sm), marginBottom: gv(SPACING.md) }]}>
              ÉTAPE {completedCount + 1} SUR {STEPS.length}
            </Text>

            {STEPS.map((step, i) => {
              const status = stepStatuses[i];
              if (status === 'done') return <DoneStepCard key={step.id} step={step} />;
              if (status === 'active') return <ActiveStepCard key={step.id} step={step} gv={gv} />;
              return <LockedStepCard key={step.id} step={step} />;
            })}
          </>
        )}

        {/* Squelette chargement */}
        {loadingProgress && (
          <View style={styles.loadingWrap}>
            {[1, 0.7, 0.45].map((op, i) => (
              <View key={i} style={[styles.skeleton, { opacity: op }]} />
            ))}
          </View>
        )}

        {/* Contact */}
        <View style={[styles.helpBox, { marginTop: gv(SPACING.lg) }]}>
          <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.helpTitle, { fontSize: gv(TYPOGRAPHY.fontSize.sm) }]}>
              Besoin d'aide ?
            </Text>
            <Text style={[styles.helpText, { fontSize: gv(TYPOGRAPHY.fontSize.sm) }]}>
              Contactez-nous à{' '}
              <Text style={{ color: COLORS.primary, fontWeight: TYPOGRAPHY.fontWeight.semibold }}>
                contact@eatquicker.com
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles globaux ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingTop: 16 },
  hero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.goldenSurface, borderRadius: BORDER_RADIUS['2xl'],
    borderWidth: 1, borderColor: COLORS.border.golden,
    paddingHorizontal: 20, paddingVertical: 18, ...SHADOWS.sm,
  },
  heroLeft: { flex: 1, marginRight: 12 },
  heroTitle: { fontWeight: TYPOGRAPHY.fontWeight.bold, color: COLORS.text.primary, marginBottom: 6 },
  heroSubtitle: { color: COLORS.text.secondary, lineHeight: 18 },
  heroEmoji: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.secondary + '20',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sectionLabel: { color: COLORS.text.light, fontWeight: TYPOGRAPHY.fontWeight.bold, letterSpacing: 0.8 },
  loadingWrap: { gap: 10 },
  skeleton: { height: 68, backgroundColor: COLORS.border.light, borderRadius: BORDER_RADIUS.xl },
  helpBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.variants.primary[100], borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.primary + '30', padding: 16,
  },
  helpTitle: { fontWeight: TYPOGRAPHY.fontWeight.semibold, color: COLORS.text.primary, marginBottom: 2 },
  helpText: { color: COLORS.text.secondary, lineHeight: 18 },
});