/**
 * Plan de salle restaurateur — temps réel.
 *
 * Onglet (restaurant)/floor-plan — restaurant courant via RestaurantContext
 * (wrapper RestaurantAutoSelector, même pattern que qrcodes.tsx).
 *
 * - Vue Liste (par zone) + vue Plan (positions relatives 0..1)
 * - Statuts live via useFloorPlanSocket (fallback polling intégré au hook)
 * - Tap sur table → actions contextuelles selon statut
 * - Mode édition : drag & drop des tables (PanResponder) → POST /floor-plan/layout/
 * - Setup en masse : "6 tables de 2, 4 tables de 4…"
 * - Conflit résa (409) : warning + tables alternatives + force
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/ui/Header';
import { Alert, AlertWithAction } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@/utils/designSystem';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import { floorPlanService } from '@/services/floorPlanService';
import { useFloorPlanSocket } from '@/hooks/useFloorPlanSocket';
import type {
  FloorPlanTable,
  FloorPlanTableStatus,
  OccupyConflictResponse,
} from '@/types/reservation';

// =============================================================================
// HELPERS
// =============================================================================

const DURATION_PRESETS = [60, 90, 120] as const;

/** Extrait le payload d'erreur API quel que soit le wrapping du client HTTP */
const extractApiError = (e: any): any =>
  e?.response?.data ?? e?.data ?? e?.body ?? e ?? {};

const formatHM = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// =============================================================================
// ALERTES (bannières + confirmations) — pattern useAlerts de profile.tsx
// =============================================================================

interface AlertItem {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
}

const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const pushAlert = useCallback(
    (variant: AlertItem['variant'], title: string | undefined, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts((prev) => [{ id, variant, title, message }, ...prev]);
    },
    [],
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { alerts, pushAlert, dismissAlert };
};

/** Confirmation contextuelle rendue via AlertWithAction dans une modale */
interface ConfirmAction {
  variant: 'warning' | 'error';
  title?: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
}

// =============================================================================
// AIMANTATION DES TABLES (collage bord à bord + alignement)
// =============================================================================

type NeighborRect = { x: number; y: number; w: number; h: number };

/** Longueur proportionnelle à la capacité : une table de 6 est plus longue
 *  qu'une table de 4, une de 2 plus compacte. */
const tableWidthFactor = (capacity: number): number =>
  capacity <= 2 ? 0.85 : capacity <= 4 ? 1 : capacity <= 6 ? 1.25 : capacity <= 8 ? 1.45 : 1.65;

/** Dimensions d'affichage d'une table sur le plan (px). */
const getTableDims = (
  tb: { capacity: number; shape: 'square' | 'round' | 'rect' },
  tableSize: number,
): { w: number; h: number } => {
  const w = Math.round(tableSize * tableWidthFactor(tb.capacity));
  const h =
    tb.shape === 'round' ? w : tb.shape === 'rect' ? Math.round(tableSize * 0.7) : tableSize;
  return { w, h };
};

/**
 * Aimante une position (px) aux bords/axes de la voisine la plus proche :
 * - collage bord à bord (gauche/droite/dessus/dessous, écart zéro)
 * - alignement même ligne / même colonne
 * Un seul aimant à la fois (la voisine la plus proche) pour éviter les
 * conflits de snap.
 */
function magnetizePosition(
  px: number,
  py: number,
  myW: number,
  myH: number,
  neighbors: NeighborRect[],
  size: number,
  threshold: number,
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  let bestX = px;
  let bestY = py;
  let snappedX = false;
  let snappedY = false;
  const sorted = [...neighbors].sort(
    (a, b) =>
      Math.abs(a.x - px) + Math.abs(a.y - py) -
      (Math.abs(b.x - px) + Math.abs(b.y - py)),
  );
  for (const o of sorted) {
    if (Math.abs(o.x - px) > size * 2 || Math.abs(o.y - py) > size * 2) {
      continue;
    }
    const candX = [o.x + o.w, o.x - myW, o.x]; // collée droite / gauche / colonne
    const candY = [o.y + o.h, o.y - myH, o.y]; // collée dessous / dessus / ligne
    for (const c of candX) {
      if (Math.abs(px - c) < threshold) {
        bestX = c;
        snappedX = true;
        break;
      }
    }
    for (const c of candY) {
      if (Math.abs(py - c) < threshold) {
        bestY = c;
        snappedY = true;
        break;
      }
    }
    if (snappedX || snappedY) {
      break;
    }
  }
  return { x: bestX, y: bestY, snappedX, snappedY };
}

/**
 * Déposée SUR une autre table → collée contre elle : poussée jusqu'au bord
 * sur l'axe de moindre pénétration (écart zéro), pas de repoussage au loin.
 */
function resolveOverlapFlush(
  px: number,
  py: number,
  myW: number,
  myH: number,
  neighbors: NeighborRect[],
): { x: number; y: number; adjustedX: boolean; adjustedY: boolean } {
  let adjustedX = false;
  let adjustedY = false;
  for (const o of neighbors) {
    const overlapX = Math.min(px + myW, o.x + o.w) - Math.max(px, o.x);
    const overlapY = Math.min(py + myH, o.y + o.h) - Math.max(py, o.y);
    if (overlapX > 4 && overlapY > 4) {
      if (overlapX <= overlapY) {
        px = px < o.x ? o.x - myW : o.x + o.w;
        adjustedX = true;
      } else {
        py = py < o.y ? o.y - myH : o.y + o.h;
        adjustedY = true;
      }
    }
  }
  return { x: px, y: py, adjustedX, adjustedY };
}

// =============================================================================
// TABLE DRAGGABLE (top-level : définie DANS le parent, elle serait remontée à
// chaque re-render et le PanResponder mourrait en plein geste)
// =============================================================================

type DraggableTableProps = {
  table: FloorPlanTable;
  x: number; // position relative committée 0..1
  y: number;
  planWidth: number;
  planHeight: number;
  tableSize: number;
  isEditing: boolean;
  myWidth: number;
  myHeight: number;
  neighbors: NeighborRect[];
  baseStyle: object;
  inverseColor: string;
  fsBase: number;
  fsXs: number;
  hintColor: string;
  onPress: () => void;
  onEditRequest: () => void;
  onDragEnd: (x: number, y: number) => void;
};

const DraggableTable = React.memo(function DraggableTable({
  table,
  x,
  y,
  planWidth,
  planHeight,
  tableSize,
  isEditing,
  myWidth,
  myHeight,
  neighbors,
  baseStyle,
  inverseColor,
  fsBase,
  fsXs,
  hintColor,
  onPress,
  onEditRequest,
  onDragEnd,
}: DraggableTableProps) {
  // Translation animée pendant le geste — aucun setState parent pendant le
  // mouvement, uniquement isDragging (local) au début/fin pour l'effet de
  // levée : le geste reste vivant du début à la fin.
  const pan = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [isDragging, setIsDragging] = useState(false);

  // ── Appui maintenu → édition ────────────────────────────────────────
  // Un anneau doré se "charge" pendant l'appui (350 ms). Quand il est
  // plein (badge crayon), relâcher ouvre la fiche de la table. Bouger le
  // doigt annule la charge (le drag prend le relais).
  const HOLD_MS = 350;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPress = useRef(false);
  const [holdReady, setHoldReady] = useState(false);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    Animated.timing(ringOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: false,
    }).start();
    setHoldReady(false);
  }, [ringOpacity]);

  const startHold = useCallback(() => {
    suppressPress.current = false;
    Animated.timing(ringOpacity, {
      toValue: 1,
      duration: HOLD_MS,
      useNativeDriver: false,
    }).start();
    holdTimer.current = setTimeout(() => setHoldReady(true), HOLD_MS);
  }, [ringOpacity]);

  const handlePressOut = useCallback(() => {
    if (holdReady) {
      // L'anneau était plein → relâcher = ouvrir l'édition, pas un tap
      suppressPress.current = true;
      cancelHold();
      onEditRequest();
    } else {
      cancelHold();
    }
  }, [cancelHold, holdReady, onEditRequest]);

  const handlePress = useCallback(() => {
    if (suppressPress.current) {
      suppressPress.current = false;
      return;
    }
    onPress();
  }, [onPress]);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const magnetThreshold = Math.max(10, tableSize * 0.18);
  // Grille invisible : pas = tableSize/4 → un collage bord à bord = 4 pas
  // exactement, l'aimant et la grille ne se contredisent jamais.
  const gridStep = Math.max(8, Math.round(tableSize / 4));

  const responder = useMemo(() => {
    const maxX = planWidth - myWidth;
    const maxY = planHeight - myHeight;
    const baseX = x * maxX;
    const baseY = y * maxY;
    // Clamp de la translation : la table ne sort jamais du canvas,
    // même visuellement pendant le geste.
    const clampDx = (dx: number) => Math.min(maxX - baseX, Math.max(-baseX, dx));
    const clampDy = (dy: number) => Math.min(maxY - baseY, Math.max(-baseY, dy));

    return PanResponder.create({
      // Jamais de prise au start : les TAPS passent au Pressable.
      // La prise ne se fait que sur MOUVEMENT.
      onStartShouldSetPanResponder: () => false,
      // Capture : sinon la ScrollView parente vole les mouvements verticaux
      onMoveShouldSetPanResponder: (_e, g) =>
        isEditing && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        isEditing && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
      onPanResponderGrant: () => {
        cancelHold();
        setIsDragging(true);
        Animated.spring(scale, {
          toValue: 1.08,
          useNativeDriver: false,
          speed: 40,
          bounciness: 6,
        }).start();
      },
      onPanResponderMove: (_e, g) => {
        // EN DIRECT, par axe : aimant (collage/alignement) prioritaire,
        // sinon grille invisible — le déplacement est quantifié et les
        // tables tombent toujours parfaitement alignées.
        const px = baseX + clampDx(g.dx);
        const py = baseY + clampDy(g.dy);
        const magnet = magnetizePosition(
          px, py, myWidth, myHeight, neighbors, tableSize, magnetThreshold,
        );
        const gx = magnet.snappedX
          ? magnet.x
          : Math.round(magnet.x / gridStep) * gridStep;
        const gy = magnet.snappedY
          ? magnet.y
          : Math.round(magnet.y / gridStep) * gridStep;
        pan.setValue({
          x: Math.min(maxX, Math.max(0, gx)) - baseX,
          y: Math.min(maxY, Math.max(0, gy)) - baseY,
        });
      },
      onPanResponderRelease: (_e, g) => {
        let px = baseX + clampDx(g.dx);
        let py = baseY + clampDy(g.dy);

        // 1. Aimant (collage/alignement), par axe
        const magnet = magnetizePosition(
          px, py, myWidth, myHeight, neighbors, tableSize, magnetThreshold,
        );
        px = magnet.x;
        py = magnet.y;

        // 2. Déposée sur une voisine → collée contre elle
        const flush = resolveOverlapFlush(px, py, myWidth, myHeight, neighbors);
        px = flush.x;
        py = flush.y;

        // 3. Grille invisible sur chaque axe libre (ni aimanté ni collé)
        if (!magnet.snappedX && !flush.adjustedX) {
          px = Math.round(px / gridStep) * gridStep;
        }
        if (!magnet.snappedY && !flush.adjustedY) {
          py = Math.round(py / gridStep) * gridStep;
        }

        px = Math.min(maxX, Math.max(0, px));
        py = Math.min(maxY, Math.max(0, py));
        const nx = maxX > 0 ? px / maxX : 0;
        const ny = maxY > 0 ? py / maxY : 0;

        pan.setValue({ x: 0, y: 0 });
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: false,
          speed: 40,
        }).start();
        setIsDragging(false);
        onDragEnd(Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny)));
      },
      onPanResponderTerminate: () => {
        pan.setValue({ x: 0, y: 0 });
        Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
        setIsDragging(false);
      },
    });
  }, [cancelHold, isEditing, x, y, planWidth, planHeight, tableSize, myWidth, myHeight, neighbors, magnetThreshold, gridStep, onDragEnd, pan, scale]);

  return (
    <Animated.View
      style={[
        baseStyle,
        {
          left: x * (planWidth - myWidth),
          top: y * (planHeight - myHeight),
          transform: [...pan.getTranslateTransform(), { scale }],
        },
        isDragging && {
          zIndex: 20,
          elevation: 12,
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        },
      ]}
      {...(isEditing ? responder.panHandlers : {})}
    >
      {/* Anneau de charge : plein = relâcher pour éditer */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderWidth: 3,
          borderColor: hintColor,
          borderRadius:
            table.shape === 'round' ? (myWidth + 8) / 2 : BORDER_RADIUS.md + 4,
          opacity: ringOpacity,
        }}
      />
      {holdReady && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -11,
            alignSelf: 'center',
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: hintColor,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: inverseColor,
          }}
        >
          <Ionicons name="pencil" size={12} color="#1E2A78" />
        </View>
      )}

      <Pressable
        onPress={handlePress}
        onPressIn={startHold}
        onPressOut={handlePressOut}
        style={{ alignItems: 'center' }}
      >
        <Text style={{ color: inverseColor, fontWeight: '700', fontSize: fsBase }}>
          {table.number}
        </Text>
        <Text style={{ color: inverseColor, fontSize: fsXs }}>
          {table.capacity_max ? `${table.capacity}→${table.capacity_max}` : table.capacity}
        </Text>
        {table.next_reservation && (
          <Text style={{ color: inverseColor, fontSize: fsXs }}>
            {table.next_reservation.time}
          </Text>
        )}
      </Pressable>

    </Animated.View>
  );
});

// =============================================================================
// ÉCRAN
// =============================================================================

function FloorPlanScreenContent({ restaurantId }: { restaurantId: number }) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // SPACING est responsive ({mobile, tablet, desktop}) → résolution unique
  const sp = useMemo(
    () => ({
      xs: getResponsiveValue(SPACING.xs, screenType),
      sm: getResponsiveValue(SPACING.sm, screenType),
      md: getResponsiveValue(SPACING.md, screenType),
      lg: getResponsiveValue(SPACING.lg, screenType),
      xl: getResponsiveValue(SPACING.xl, screenType),
    }),
    [screenType],
  );

  // Layout responsive — même convention que les autres écrans restaurateur
  const layoutConfig = useMemo(
    () => ({
      containerPadding: getResponsiveValue(SPACING.container, screenType),
      maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
    }),
    [screenType],
  );


  const { alerts, pushAlert, dismissAlert } = useAlerts();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [tables, setTables] = useState<FloorPlanTable[]>([]);
  const [summary, setSummary] = useState<Partial<Record<FloorPlanTableStatus, number>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'plan'>('grid');
  const [isEditing, setIsEditing] = useState(false);

  const [selectedTable, setSelectedTable] = useState<FloorPlanTable | null>(null);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [pendingZones, setPendingZones] = useState<string[]>([]);
  const [addZoneVisible, setAddZoneVisible] = useState(false);
  const [addZoneName, setAddZoneName] = useState('');
  const [editTable, setEditTable] = useState<FloorPlanTable | null>(null);
  const [editZone, setEditZone] = useState('');
  const [newZoneInput, setNewZoneInput] = useState('');
  const [editCapacity, setEditCapacity] = useState(4);
  const [editCapacityMax, setEditCapacityMax] = useState<number | null>(null);
  const [editShape, setEditShape] = useState<'square' | 'round' | 'rect'>('square');
  const [occupyVisible, setOccupyVisible] = useState(false);
  const [occupyPartySize, setOccupyPartySize] = useState(2);
  const [occupyDuration, setOccupyDuration] = useState(90);
  const [isSubmitting, setIsSubmitting] = useState(false);


  // ── Chargement ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const data = await floorPlanService.getFloorPlan(restaurantId);
      setTables(data.tables);
      setSummary(data.summary);
      setLoadError(false);
    } catch (e) {
      console.error('[FloorPlan] load error:', e);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch au focus de l'onglet : les tables créées/supprimées dans
  // l'écran QR codes apparaissent sans recharger l'app.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Temps réel — pas de refetch pendant l'édition (écraserait le drag)
  const onSocketRefetch = useCallback(() => {
    if (!isEditing) load();
  }, [isEditing, load]);
  const { isLive } = useFloorPlanSocket(
    restaurantId ? String(restaurantId) : undefined,
    onSocketRefetch,
  );

  // ── Couleurs / libellés de statut ─────────────────────────────────────

  const statusColor = useCallback(
    (status: FloorPlanTableStatus): string => {
      switch (status) {
        case 'free': return colors.success;
        case 'occupied': return colors.error;
        case 'seated': return colors.info;
        case 'reserved_soon': return colors.warning;
        case 'blocked': return colors.text.light;
      }
    },
    [colors],
  );

  // ── Actions ───────────────────────────────────────────────────────────

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setIsSubmitting(true);
      try {
        await action();
        setSelectedTable(null);
        setOccupyVisible(false);
        await load();
      } catch (e) {
        const data = extractApiError(e);
        if (data?.error === 'reservation_conflict') {
          handleConflict(data as OccupyConflictResponse);
        } else {
          pushAlert('error', undefined, t('floorPlan.errors.action'));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [load, pushAlert, t],
  );

  const handleConflict = useCallback(
    (conflict: OccupyConflictResponse) => {
      const alt = conflict.alternatives?.length
        ? `\n\n${t('floorPlan.conflict.alternatives')} ${conflict.alternatives
            .map((a) => `${a.number} (${a.capacity})`)
            .join(', ')}`
        : `\n\n${t('floorPlan.conflict.none')}`;
      setConfirmAction({
        variant: 'warning',
        title: t('floorPlan.conflict.title'),
        message: `${conflict.message}${alt}`,
        confirmText: t('floorPlan.actions.forceSeat'),
        onConfirm: () =>
          runAction(() =>
            floorPlanService.occupy({
              table_id: selectedTableRef.current?.id ?? '',
              party_size: occupyPartySize,
              duration_minutes: occupyDuration,
              force: true,
            }),
          ),
      });
    },
    [occupyDuration, occupyPartySize, runAction, t],
  );

  // Ref pour que handleConflict voie la table même après fermeture du modal
  const selectedTableRef = useRef<FloorPlanTable | null>(null);
  useEffect(() => {
    if (selectedTable) selectedTableRef.current = selectedTable;
  }, [selectedTable]);

  const confirmOccupy = useCallback(() => {
    const table = selectedTableRef.current;
    if (!table) return;
    runAction(() =>
      floorPlanService.occupy({
        table_id: table.id,
        party_size: occupyPartySize,
        duration_minutes: occupyDuration,
      }),
    );
  }, [occupyDuration, occupyPartySize, runAction]);

  // ── Plan : géométrie & drag ───────────────────────────────────────────

  const planPadding = sp.md;
  const planWidth = Math.min(windowWidth - planPadding * 2, 900);
  const planHeight = Math.round(planWidth * 0.72);
  const tableSize = getResponsiveValue(
    { mobile: 56, tablet: 68, desktop: 76 },
    screenType,
  );

  const zones = useMemo(() => {
    const distinct = Array.from(
      new Set([...tables.map((tb) => tb.zone || ''), ...pendingZones]),
    );
    return distinct.sort((a, b) =>
      a === '' ? -1 : b === '' ? 1 : a.localeCompare(b),
    );
  }, [tables, pendingZones]);

  // Si la zone sélectionnée n'existe plus (ou init sur un resto sans zone
  // vide), se caler sur la première zone disponible.
  useEffect(() => {
    if (zones.length > 0 && !zones.includes(selectedZone)) {
      setSelectedZone(zones[0]);
    }
  }, [zones, selectedZone]);

  const placedTables = useMemo(
    () =>
      tables.filter(
        (tb) =>
          tb.pos_x !== null &&
          tb.pos_y !== null &&
          (tb.zone || '') === selectedZone,
      ),
    [tables, selectedZone],
  );
  const unplacedTables = useMemo(
    () => tables.filter((tb) => tb.pos_x === null || tb.pos_y === null),
    [tables],
  );

  const saveTablePosition = useCallback(
    async (tableId: string, x: number, y: number) => {
      try {
        await floorPlanService.saveLayout(restaurantId, [
          { table_id: tableId, pos_x: x, pos_y: y },
        ]);
      } catch {
        pushAlert('error', undefined, t('floorPlan.errors.action'));
        load();
      }
    },
    [load, pushAlert, restaurantId, t],
  );

  const commitTablePosition = useCallback(
    (tableId: string, x: number, y: number) => {
      setTables((prev) =>
        prev.map((item) =>
          item.id === tableId ? { ...item, pos_x: x, pos_y: y } : item,
        ),
      );
      saveTablePosition(tableId, x, y);
    },
    [saveTablePosition],
  );

  const placeTableOnPlan = useCallback(
    (tb: FloorPlanTable) => {
      // Positionne au centre avec un léger décalage pour éviter l'empilement
      const jitter = () => 0.4 + Math.random() * 0.2;
      const x = jitter();
      const y = jitter();
      setTables((prev) =>
        prev.map((item) =>
          item.id === tb.id
            ? { ...item, pos_x: x, pos_y: y, zone: selectedZone }
            : item,
        ),
      );
      floorPlanService
        .saveLayout(restaurantId, [
          { table_id: tb.id, pos_x: x, pos_y: y, zone: selectedZone },
        ])
        .catch(() => {
          pushAlert('error', undefined, t('floorPlan.errors.action'));
          load();
        });
    },
    [load, pushAlert, restaurantId, selectedZone, t],
  );

  const openEditSheet = useCallback((tb: FloorPlanTable) => {
    setEditTable(tb);
    setEditZone(tb.zone || '');
    setNewZoneInput('');
    setEditCapacity(tb.capacity);
    setEditCapacityMax(tb.capacity_max);
    setEditShape(tb.shape);
  }, []);

  const saveTableEdit = useCallback(async () => {
    if (!editTable) return;
    const zone = newZoneInput.trim() || editZone;
    const payload = {
      table_id: editTable.id,
      zone,
      capacity: editCapacity,
      capacity_max: editCapacityMax,
      shape: editShape,
    };
    setIsSubmitting(true);
    try {
      await floorPlanService.saveLayout(restaurantId, [payload]);
      setTables((prev) =>
        prev.map((item) =>
          item.id === editTable.id
            ? {
                ...item,
                zone,
                capacity: editCapacity,
                capacity_max: editCapacityMax,
                shape: editShape,
              }
            : item,
        ),
      );
      if (zone && !zones.includes(zone)) setSelectedZone(zone);
      setEditTable(null);
    } catch {
      pushAlert('error', undefined, t('floorPlan.errors.action'));
    } finally {
      setIsSubmitting(false);
    }
  }, [editCapacity, editCapacityMax, editShape, editTable, editZone, newZoneInput, pushAlert, restaurantId, t, zones]);

  const addZone = useCallback(() => {
    const name = addZoneName.trim();
    if (!name) return;
    if (!zones.includes(name)) {
      setPendingZones((prev) => [...prev, name]);
    }
    setSelectedZone(name);
    setAddZoneName('');
    setAddZoneVisible(false);
  }, [addZoneName, zones]);

  const removeZone = useCallback(
    (zone: string) => {
      if (zone === '') return; // la salle par défaut n'est pas supprimable
      const zoneTables = tables.filter((tb) => (tb.zone || '') === zone);

      const doRemove = async () => {
        if (zoneTables.length > 0) {
          try {
            await floorPlanService.saveLayout(
              restaurantId,
              zoneTables.map((tb) => ({ table_id: tb.id, zone: '' })),
            );
            setTables((prev) =>
              prev.map((item) =>
                (item.zone || '') === zone ? { ...item, zone: '' } : item,
              ),
            );
          } catch {
            pushAlert('error', undefined, t('floorPlan.errors.action'));
            return;
          }
        }
        setPendingZones((prev) => prev.filter((z) => z !== zone));
        setSelectedZone('');
      };

      if (zoneTables.length === 0) {
        doRemove();
        return;
      }
      setConfirmAction({
        variant: 'warning',
        title: t('floorPlan.zones.deleteTitle', { zone }),
        message: t('floorPlan.zones.deleteMessage', {
          count: zoneTables.length,
          target: t('floorPlan.zones.default'),
        }),
        confirmText: t('floorPlan.zones.deleteConfirm'),
        onConfirm: doRemove,
      });
    },
    [pushAlert, restaurantId, t, tables],
  );

  // ── Styles ────────────────────────────────────────────────────────────

  const fs = useCallback(
    (token: keyof typeof TYPOGRAPHY.fontSize) =>
      getResponsiveValue(TYPOGRAPHY.fontSize[token], screenType),
    [screenType],
  );

  const viewStyles = useMemo(
    () => ({
      container: {
        flex: 1,
        backgroundColor: colors.background,
      } as const,
      content: {
        flex: 1,
        maxWidth: layoutConfig.maxContentWidth,
        alignSelf: 'center' as const,
        width: '100%' as const,
      },
      liveBadge: (live: boolean) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 4,
        paddingHorizontal: sp.sm,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: live ? `${colors.success}22` : `${colors.text.light}22`,
      }),
      liveDot: (live: boolean) => ({
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: live ? colors.success : colors.text.light,
      }),
      summaryBar: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        alignItems: 'center' as const,
        gap: sp.sm,
        paddingHorizontal: layoutConfig.containerPadding,
        paddingVertical: sp.sm,
      },
      summaryChip: (color: string) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 6,
        paddingHorizontal: sp.sm,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: `${color}66`,
      }),
      dot: (color: string) => ({
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: color,
      }),
      toggleRow: {
        flexDirection: 'row' as const,
        marginHorizontal: layoutConfig.containerPadding,
        marginBottom: sp.sm,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: 3,
        borderWidth: 1,
        borderColor: colors.border.light,
      },
      toggleBtn: (active: boolean) => ({
        flex: 1,
        alignItems: 'center' as const,
        paddingVertical: sp.sm,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: active ? colors.primary : 'transparent',
      }),
      // Grille
      grid: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: sp.sm,
        paddingHorizontal: layoutConfig.containerPadding,
        paddingBottom: sp.xl,
      },
      tableCard: (status: FloorPlanTableStatus) => ({
        // Largeur calculée sur le padding RÉEL de la grille (containerPadding)
        // et arrondie à l'entier inférieur -1px : sans ça, l'arrondi
        // sub-pixel Android fait passer la 2e colonne à la ligne.
        width: getResponsiveValue(
          {
            mobile: Math.floor(
              (windowWidth - layoutConfig.containerPadding * 2 - sp.sm) / 2,
            ) - 1,
            tablet: 170,
            desktop: 190,
          },
          screenType,
        ),
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.lg,
        padding: sp.md,
        borderLeftWidth: 4,
        borderLeftColor: statusColor(status),
        ...shadows.card,
      }),
      badgeRow: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: 4,
        marginTop: sp.xs,
      },
      badge: (color: string) => ({
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: `${color}22`,
      }),
      // Plan
      planCanvas: {
        width: planWidth,
        height: planHeight,
        alignSelf: 'center' as const,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        borderColor: isEditing ? colors.secondary : colors.border.light,
        overflow: 'hidden' as const,
        marginBottom: sp.md,
      },
      planTable: (tb: FloorPlanTable) => {
        const { w, h } = getTableDims(tb, tableSize);
        return {
          position: 'absolute' as const,
          width: w,
          height: h,
          borderRadius: tb.shape === 'round' ? w / 2 : BORDER_RADIUS.md,
          backgroundColor: statusColor(tb.status),
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          ...shadows.card,
        };
      },
      // Modals
      modalOverlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'flex-end' as const,
      },
      sheet: {
        backgroundColor: colors.card,
        borderTopLeftRadius: BORDER_RADIUS['2xl'],
        borderTopRightRadius: BORDER_RADIUS['2xl'],
        padding: sp.lg,
        paddingBottom: insets.bottom + sp.lg,
        gap: sp.sm,
      },
      actionBtn: (variant: 'primary' | 'danger' | 'neutral') => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: sp.sm,
        paddingVertical: sp.md,
        paddingHorizontal: sp.md,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor:
          variant === 'primary'
            ? colors.primary
            : variant === 'danger'
              ? `${colors.error}18`
              : colors.surface,
        borderWidth: variant === 'neutral' ? 1 : 0,
        borderColor: colors.border.light,
      }),
      stepperRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: sp.lg,
        paddingVertical: sp.sm,
      },
      stepperBtn: {
        width: 44,
        height: 44,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border.default,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
      chipRow: {
        flexDirection: 'row' as const,
        gap: sp.sm,
        justifyContent: 'center' as const,
      },
      chip: (active: boolean) => ({
        paddingHorizontal: sp.md,
        paddingVertical: sp.sm,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: active ? colors.primary : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border.default,
      }),
      centerBox: {
        flex: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: sp.xl,
        gap: sp.md,
      },
    }),
    [colors, insets, isEditing, layoutConfig, planHeight, planWidth, screenType, shadows, sp, statusColor, tableSize, windowWidth],
  );

  const textStyles = useMemo(
    () => ({
      title: {
        fontSize: fs('xl'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        flex: 1,
      },
      small: { fontSize: fs('xs'), color: colors.text.secondary },
      tableNumber: {
        fontSize: fs('lg'),
        fontWeight: '700' as const,
        color: colors.text.primary,
      },
      badgeText: (color: string) => ({
        fontSize: fs('xs'),
        color,
        fontWeight: '600' as const,
      }),
      sheetTitle: {
        fontSize: fs('lg'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        marginBottom: sp.xs,
      },
      actionText: (variant: 'primary' | 'danger' | 'neutral') => ({
        fontSize: fs('base'),
        fontWeight: '600' as const,
        color:
          variant === 'primary'
            ? colors.text.inverse
            : variant === 'danger'
              ? colors.error
              : colors.text.primary,
      }),
      stepperValue: {
        fontSize: fs('2xl'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        minWidth: 48,
        textAlign: 'center' as const,
      },
      label: {
        fontSize: fs('sm'),
        fontWeight: '600' as const,
        color: colors.text.secondary,
        marginTop: sp.sm,
      },
    }),
    [colors, fs, sp],
  );

  // ── Rendus partiels ───────────────────────────────────────────────────

  const renderTableBadges = (tb: FloorPlanTable) => (
    <View style={viewStyles.badgeRow}>
      <View style={viewStyles.badge(statusColor(tb.status))}>
        <Text style={textStyles.badgeText(statusColor(tb.status))}>
          {t(`floorPlan.status.${tb.status}`)}
        </Text>
      </View>
      {tb.next_reservation && (
        <View style={viewStyles.badge(colors.warning)}>
          <Text style={textStyles.badgeText(colors.warning)}>
            {t('floorPlan.reservedAt', { time: tb.next_reservation.time })}
          </Text>
        </View>
      )}
      {tb.occupancy?.is_overdue && (
        <View style={viewStyles.badge(colors.error)}>
          <Text style={textStyles.badgeText(colors.error)}>
            {t('floorPlan.overdue')}
          </Text>
        </View>
      )}
      {tb.has_app_orders && (
        <View style={viewStyles.badge(colors.info)}>
          <Text style={textStyles.badgeText(colors.info)}>
            {t('floorPlan.appOrders')}
          </Text>
        </View>
      )}
      {(() => {
        const res = tb.current_reservation ?? tb.next_reservation;
        const needsExtension =
          !!res && !!tb.capacity_max && res.party_size > tb.capacity;
        return needsExtension ? (
          <View style={viewStyles.badge(colors.secondary)}>
            <Text style={textStyles.badgeText(colors.secondary)}>
              {t('floorPlan.extension', { count: res!.party_size })}
            </Text>
          </View>
        ) : null;
      })()}
    </View>
  );

  const renderGrid = () => {
    // Groupement par zone (zone vide → dernière)
    const zones = Array.from(new Set(tables.map((tb) => tb.zone || ''))).sort(
      (a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)),
    );
    return (
      <ScrollView>
        {zones.map((zone) => (
          <View key={zone || '_default'}>
            {zones.length > 1 && (
              <Text style={[textStyles.label, { paddingHorizontal: sp.md }]}>
                {zone || t('floorPlan.title')}
              </Text>
            )}
            <View style={[viewStyles.grid, { marginTop: sp.xs }]}>
              {tables
                .filter((tb) => (tb.zone || '') === zone)
                .map((tb) => (
                  <TouchableOpacity
                    key={tb.id}
                    style={viewStyles.tableCard(tb.status)}
                    onPress={() => setSelectedTable(tb)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={textStyles.tableNumber}>{tb.number}</Text>
                      <Text style={textStyles.small}>
                        {tb.capacity_max
                          ? `${tb.capacity}→${t('floorPlan.seats', { count: tb.capacity_max })}`
                          : t('floorPlan.seats', { count: tb.capacity })}
                      </Text>
                    </View>
                    {renderTableBadges(tb)}
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderPlan = () => (
    <ScrollView scrollEnabled={!isEditing}>
      {/* Zones : un plan par salle/terrasse */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layoutConfig.containerPadding,
          paddingBottom: sp.sm,
          gap: sp.sm,
        }}
      >
        {zones.map((zone) => (
          <TouchableOpacity
            key={zone || '_default'}
            style={viewStyles.chip(selectedZone === zone)}
            onPress={() => setSelectedZone(zone)}
          >
            <Text
              style={{
                color: selectedZone === zone ? colors.text.inverse : colors.text.primary,
                fontWeight: '600',
                fontSize: fs('sm'),
              }}
            >
              {zone || t('floorPlan.zones.default')}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={viewStyles.chip(false)}
          onPress={() => setAddZoneVisible(true)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="add" size={16} color={colors.text.primary} />
            <Text
              style={{
                color: colors.text.primary,
                fontWeight: '600',
                fontSize: fs('sm'),
              }}
            >
              {t('floorPlan.zones.add')}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Barre d'outils du plan : édition + suppression de salle */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: sp.sm,
          paddingHorizontal: layoutConfig.containerPadding,
          paddingBottom: sp.sm,
        }}
      >
        {isEditing && selectedZone !== '' && (
          <TouchableOpacity
            style={[viewStyles.chip(false), { borderColor: `${colors.error}66` }]}
            onPress={() => removeZone(selectedZone)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="trash-outline" size={15} color={colors.error} />
              <Text style={{ color: colors.error, fontWeight: '600', fontSize: fs('sm') }}>
                {t('floorPlan.zones.deleteConfirm')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={viewStyles.chip(isEditing)}
          onPress={() => setIsEditing((v) => !v)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons
              name={isEditing ? 'checkmark' : 'create-outline'}
              size={15}
              color={isEditing ? colors.text.inverse : colors.text.primary}
            />
            <Text
              style={{
                color: isEditing ? colors.text.inverse : colors.text.primary,
                fontWeight: '600',
                fontSize: fs('sm'),
              }}
            >
              {isEditing ? t('floorPlan.doneEditing') : t('floorPlan.editMode')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      {isEditing && (
        <Text style={[textStyles.small, { textAlign: 'center', marginBottom: sp.sm }]}>
          {t('floorPlan.dragHint')}
        </Text>
      )}
      <View style={viewStyles.planCanvas}>
        {placedTables.map((tb) => (
          <DraggableTable
            key={tb.id}
            table={tb}
            x={tb.pos_x ?? 0.5}
            y={tb.pos_y ?? 0.5}
            planWidth={planWidth}
            planHeight={planHeight}
            tableSize={tableSize}
            isEditing={isEditing}
            myWidth={getTableDims(tb, tableSize).w}
            myHeight={getTableDims(tb, tableSize).h}
            neighbors={placedTables
              .filter((o) => o.id !== tb.id)
              .map((o) => {
                const dims = getTableDims(o, tableSize);
                return {
                  x: (o.pos_x ?? 0) * (planWidth - dims.w),
                  y: (o.pos_y ?? 0) * (planHeight - dims.h),
                  w: dims.w,
                  h: dims.h,
                };
              })}
            baseStyle={viewStyles.planTable(tb)}
            hintColor={colors.secondary}
            inverseColor={colors.text.inverse}
            fsBase={fs('base')}
            fsXs={fs('xs')}
            onPress={() =>
              isEditing ? openEditSheet(tb) : setSelectedTable(tb)
            }
            onEditRequest={() => openEditSheet(tb)}
            onDragEnd={(x, y) => commitTablePosition(tb.id, x, y)}
          />
        ))}
      </View>
      {unplacedTables.length > 0 && (
        <View style={{ paddingHorizontal: sp.md, paddingBottom: sp.xl }}>
          <Text style={textStyles.label}>{t('floorPlan.unplaced')}</Text>
          <View style={[viewStyles.grid, { paddingHorizontal: 0, marginTop: sp.xs }]}>
            {unplacedTables.map((tb) => (
              <TouchableOpacity
                key={tb.id}
                style={viewStyles.tableCard(tb.status)}
                onPress={() => placeTableOnPlan(tb)}
              >
                <Text style={textStyles.tableNumber}>{tb.number}</Text>
                <Text style={textStyles.small}>
                  {t('floorPlan.seats', { count: tb.capacity })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );

  const renderActionSheet = () => {
    const tb = selectedTable;
    if (!tb) return null;
    const occ = tb.occupancy;
    const res = tb.current_reservation ?? tb.next_reservation;

    return (
      <Modal transparent visible animationType="slide" onRequestClose={() => setSelectedTable(null)}>
        <Pressable style={viewStyles.modalOverlay} onPress={() => setSelectedTable(null)}>
          <Pressable style={viewStyles.sheet} onPress={() => {}}>
            <Text style={textStyles.sheetTitle}>
              {`Table ${tb.number} · ${t('floorPlan.seats', { count: tb.capacity })}`}
            </Text>
            {renderTableBadges(tb)}

            {res && (
              <View style={{ marginTop: sp.sm, gap: 2 }}>
                <Text style={textStyles.small}>
                  {res.customer_name} · {t('floorPlan.seats', { count: res.party_size })}
                </Text>
                {res.ends_at && (
                  <Text style={textStyles.small}>
                    {t('floorPlan.until', { time: formatHM(res.ends_at) })}
                  </Text>
                )}
                {res.has_paid_pre_order && (
                  <Text style={[textStyles.small, { color: colors.success }]}>
                    ✓ {t('floorPlan.prepaid')}
                  </Text>
                )}
              </View>
            )}
            {occ && (
              <Text style={textStyles.small}>
                {t('floorPlan.since', { time: formatHM(occ.started_at) })} ·{' '}
                {t('floorPlan.until', { time: formatHM(occ.expected_end_at) })}
              </Text>
            )}

            <View style={{ height: sp.sm }} />

            {(tb.status === 'free' || tb.status === 'reserved_soon') && (
              <>
                <TouchableOpacity
                  style={viewStyles.actionBtn('primary')}
                  onPress={() => {
                    setOccupyPartySize(Math.min(2, tb.capacity));
                    setOccupyDuration(90);
                    setOccupyVisible(true);
                  }}
                >
                  <Ionicons name="people" size={20} color={colors.text.inverse} />
                  <Text style={textStyles.actionText('primary')}>
                    {t('floorPlan.actions.seatGuests')}
                  </Text>
                </TouchableOpacity>
                {tb.status === 'free' && (
                  <TouchableOpacity
                    style={viewStyles.actionBtn('neutral')}
                    onPress={() =>
                      runAction(() =>
                        floorPlanService.occupy({ table_id: tb.id, blocked: true }),
                      )
                    }
                  >
                    <Ionicons name="ban" size={20} color={colors.text.primary} />
                    <Text style={textStyles.actionText('neutral')}>
                      {t('floorPlan.actions.block')}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity
              style={viewStyles.actionBtn('neutral')}
              onPress={() => {
                setSelectedTable(null);
                openEditSheet(tb);
              }}
            >
              <Ionicons name="create-outline" size={20} color={colors.text.primary} />
              <Text style={textStyles.actionText('neutral')}>
                {t('floorPlan.actions.editTable')}
              </Text>
            </TouchableOpacity>

            {(tb.status === 'occupied' || tb.status === 'blocked') && (
              <>
                <TouchableOpacity
                  style={viewStyles.actionBtn('danger')}
                  onPress={() => runAction(() => floorPlanService.release(tb.id))}
                >
                  <Ionicons name="exit-outline" size={20} color={colors.error} />
                  <Text style={textStyles.actionText('danger')}>
                    {tb.status === 'blocked'
                      ? t('floorPlan.actions.unblock')
                      : t('floorPlan.actions.release')}
                  </Text>
                </TouchableOpacity>
                {tb.status === 'occupied' && (
                  <TouchableOpacity
                    style={viewStyles.actionBtn('neutral')}
                    onPress={() => runAction(() => floorPlanService.extend(tb.id, 30))}
                  >
                    <Ionicons name="time-outline" size={20} color={colors.text.primary} />
                    <Text style={textStyles.actionText('neutral')}>
                      {t('floorPlan.actions.extend')}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {isSubmitting && <ActivityIndicator color={colors.primary} />}
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderOccupyModal = () => (
    <Modal transparent visible={occupyVisible} animationType="slide" onRequestClose={() => setOccupyVisible(false)}>
      <Pressable style={viewStyles.modalOverlay} onPress={() => setOccupyVisible(false)}>
        <Pressable style={viewStyles.sheet} onPress={() => {}}>
          <Text style={textStyles.sheetTitle}>{t('floorPlan.occupyModal.title')}</Text>

          <Text style={textStyles.label}>{t('floorPlan.occupyModal.partySize')}</Text>
          <View style={viewStyles.stepperRow}>
            <TouchableOpacity
              style={viewStyles.stepperBtn}
              onPress={() => setOccupyPartySize((v) => Math.max(1, v - 1))}
            >
              <Ionicons name="remove" size={22} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={textStyles.stepperValue}>{occupyPartySize}</Text>
            <TouchableOpacity
              style={viewStyles.stepperBtn}
              onPress={() => setOccupyPartySize((v) => Math.min(30, v + 1))}
            >
              <Ionicons name="add" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <Text style={textStyles.label}>{t('floorPlan.occupyModal.duration')}</Text>
          <View style={viewStyles.chipRow}>
            {DURATION_PRESETS.map((d) => (
              <TouchableOpacity
                key={d}
                style={viewStyles.chip(occupyDuration === d)}
                onPress={() => setOccupyDuration(d)}
              >
                <Text
                  style={{
                    color: occupyDuration === d ? colors.text.inverse : colors.text.primary,
                    fontWeight: '600',
                    fontSize: fs('sm'),
                  }}
                >
                  {t('floorPlan.occupyModal.minutes', { count: d })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: sp.sm }} />
          <TouchableOpacity
            style={viewStyles.actionBtn('primary')}
            onPress={confirmOccupy}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={colors.text.inverse} />
                <Text style={textStyles.actionText('primary')}>
                  {t('floorPlan.occupyModal.confirm')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderEditTableSheet = () => {
    if (!editTable) return null;
    const shapes: Array<'square' | 'round' | 'rect'> = ['square', 'round', 'rect'];
    return (
      <Modal transparent visible animationType="slide" onRequestClose={() => setEditTable(null)}>
        <Pressable style={viewStyles.modalOverlay} onPress={() => setEditTable(null)}>
          <Pressable style={viewStyles.sheet} onPress={() => {}}>
            <Text style={textStyles.sheetTitle}>
              {t('floorPlan.tableEdit.title', { number: editTable.number })}
            </Text>

            {/* Zone */}
            <Text style={textStyles.label}>{t('floorPlan.tableEdit.zone')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
              {zones.map((zone) => (
                <TouchableOpacity
                  key={zone || '_default'}
                  style={viewStyles.chip(editZone === zone && !newZoneInput.trim())}
                  onPress={() => {
                    setEditZone(zone);
                    setNewZoneInput('');
                  }}
                >
                  <Text
                    style={{
                      color:
                        editZone === zone && !newZoneInput.trim()
                          ? colors.text.inverse
                          : colors.text.primary,
                      fontWeight: '600',
                      fontSize: fs('sm'),
                    }}
                  >
                    {zone || t('floorPlan.zones.default')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={{
                backgroundColor: colors.surface,
                borderRadius: BORDER_RADIUS.lg,
                borderWidth: 1,
                borderColor: colors.border.light,
                paddingHorizontal: sp.md,
                paddingVertical: sp.sm,
                fontSize: fs('sm'),
                color: colors.text.primary,
              }}
              placeholder={t('floorPlan.zones.placeholder')}
              placeholderTextColor={colors.text.light}
              value={newZoneInput}
              onChangeText={setNewZoneInput}
              maxLength={50}
            />

            {/* Capacités standard / étendue */}
            <View style={{ flexDirection: 'row', gap: sp.md }}>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.label}>
                  {t('floorPlan.tableEdit.capacity')}
                </Text>
                <View style={[viewStyles.stepperRow, { gap: sp.sm, paddingVertical: sp.xs }]}>
                  <TouchableOpacity
                    style={viewStyles.stepperBtn}
                    onPress={() => {
                      const value = Math.max(1, editCapacity - 1);
                      setEditCapacity(value);
                      if (editCapacityMax !== null && editCapacityMax < value) {
                        setEditCapacityMax(value);
                      }
                    }}
                  >
                    <Ionicons name="remove" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text style={[textStyles.stepperValue, { fontSize: fs('lg'), minWidth: 32 }]}>
                    {editCapacity}
                  </Text>
                  <TouchableOpacity
                    style={viewStyles.stepperBtn}
                    onPress={() => {
                      const value = Math.min(50, editCapacity + 1);
                      setEditCapacity(value);
                      if (editCapacityMax !== null && editCapacityMax < value) {
                        setEditCapacityMax(value);
                      }
                    }}
                  >
                    <Ionicons name="add" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.label}>
                  {t('floorPlan.tableEdit.capacityMax')}
                </Text>
                <View style={[viewStyles.stepperRow, { gap: sp.sm, paddingVertical: sp.xs }]}>
                  <TouchableOpacity
                    style={viewStyles.stepperBtn}
                    onPress={() =>
                      setEditCapacityMax((prev) => {
                        if (prev === null) return null;
                        const value = prev - 1;
                        return value <= editCapacity ? null : value;
                      })
                    }
                  >
                    <Ionicons name="remove" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text
                    style={[
                      textStyles.stepperValue,
                      { fontSize: fs(editCapacityMax === null ? 'xs' : 'lg'), minWidth: 48 },
                    ]}
                    numberOfLines={2}
                  >
                    {editCapacityMax === null
                      ? t('floorPlan.tableEdit.notExtendable')
                      : editCapacityMax}
                  </Text>
                  <TouchableOpacity
                    style={viewStyles.stepperBtn}
                    onPress={() =>
                      setEditCapacityMax((prev) =>
                        prev === null ? editCapacity + 1 : Math.min(50, prev + 1),
                      )
                    }
                  >
                    <Ionicons name="add" size={18} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Forme */}
            <Text style={textStyles.label}>{t('floorPlan.tableEdit.shape')}</Text>
            <View style={viewStyles.chipRow}>
              {shapes.map((shape) => (
                <TouchableOpacity
                  key={shape}
                  style={viewStyles.chip(editShape === shape)}
                  onPress={() => setEditShape(shape)}
                >
                  <Text
                    style={{
                      color: editShape === shape ? colors.text.inverse : colors.text.primary,
                      fontWeight: '600',
                      fontSize: fs('sm'),
                    }}
                  >
                    {t(`floorPlan.tableEdit.shapes.${shape}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: sp.sm }} />
            <TouchableOpacity
              style={viewStyles.actionBtn('primary')}
              onPress={saveTableEdit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={colors.text.inverse} />
                  <Text style={textStyles.actionText('primary')}>
                    {t('floorPlan.tableEdit.save')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderAddZoneSheet = () => (
    <Modal
      transparent
      visible={addZoneVisible}
      animationType="slide"
      onRequestClose={() => setAddZoneVisible(false)}
    >
      <Pressable style={viewStyles.modalOverlay} onPress={() => setAddZoneVisible(false)}>
        <Pressable style={viewStyles.sheet} onPress={() => {}}>
          <Text style={textStyles.sheetTitle}>{t('floorPlan.zones.addTitle')}</Text>
          <TextInput
            style={{
              backgroundColor: colors.surface,
              borderRadius: BORDER_RADIUS.lg,
              borderWidth: 1,
              borderColor: colors.border.light,
              paddingHorizontal: sp.md,
              paddingVertical: sp.sm,
              fontSize: fs('base'),
              color: colors.text.primary,
            }}
            placeholder={t('floorPlan.zones.placeholder')}
            placeholderTextColor={colors.text.light}
            value={addZoneName}
            onChangeText={setAddZoneName}
            maxLength={50}
            autoFocus
            onSubmitEditing={addZone}
          />
          <TouchableOpacity
            style={viewStyles.actionBtn('primary')}
            onPress={addZone}
            disabled={!addZoneName.trim()}
          >
            <Ionicons name="checkmark" size={20} color={colors.text.inverse} />
            <Text style={textStyles.actionText('primary')}>
              {t('floorPlan.zones.create')}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ── Rendu principal ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[viewStyles.container, viewStyles.centerBox]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const summaryEntries: Array<[FloorPlanTableStatus, string]> = [
    ['free', t('floorPlan.summary.free')],
    ['occupied', t('floorPlan.summary.occupied')],
    ['reserved_soon', t('floorPlan.summary.reserved')],
    ['blocked', t('floorPlan.summary.blocked')],
  ];

  return (
    <View style={viewStyles.container}>
      <Header
        title={t('floorPlan.title')}
        showLanguageSwitcher
        showThemeSwitcher
      />

      <View style={viewStyles.content}>
        {/* Bannières d'alerte (succès/erreur) */}
        {alerts.length > 0 && (
          <View
            style={{
              paddingHorizontal: layoutConfig.containerPadding,
              paddingTop: sp.sm,
              gap: sp.xs,
            }}
          >
            {alerts.map((alert) => (
              <Alert
                key={alert.id}
                variant={alert.variant}
                title={alert.title}
                message={alert.message}
                autoDismiss
                autoDismissDuration={4000}
                onDismiss={() => dismissAlert(alert.id)}
              />
            ))}
          </View>
        )}

      {loadError && (
        <View style={viewStyles.centerBox}>
          <Text style={textStyles.small}>{t('floorPlan.errors.load')}</Text>
          <TouchableOpacity style={viewStyles.actionBtn('primary')} onPress={load}>
            <Text style={textStyles.actionText('primary')}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loadError && tables.length === 0 && (
        <View style={viewStyles.centerBox}>
          <Ionicons name="grid-outline" size={64} color={colors.secondary} />
          <Text style={[textStyles.sheetTitle, { textAlign: 'center', fontSize: fs('xl') }]}>
            {t('floorPlan.empty.title')}
          </Text>
          <Text style={[textStyles.small, { textAlign: 'center', lineHeight: 20 }]}>
            {t('floorPlan.empty.subtitle')}
          </Text>
          <TouchableOpacity
            style={[viewStyles.actionBtn('primary'), { alignSelf: 'stretch', justifyContent: 'center' }]}
            onPress={() => router.navigate('/(restaurant)/qrcodes' as any)}
          >
            <Ionicons name="arrow-forward" size={20} color={colors.text.inverse} />
            <Text style={textStyles.actionText('primary')}>{t('floorPlan.empty.cta')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loadError && tables.length > 0 && (
        <>
          {/* Résumé + badge live */}
          <View style={viewStyles.summaryBar}>
            <View style={viewStyles.liveBadge(isLive)}>
              <View style={viewStyles.liveDot(isLive)} />
              <Text style={textStyles.small}>
                {isLive ? t('floorPlan.live') : t('floorPlan.offline')}
              </Text>
            </View>
            {summaryEntries.map(([status, label]) => (
              <View key={status} style={viewStyles.summaryChip(statusColor(status))}>
                <View style={viewStyles.dot(statusColor(status))} />
                <Text style={textStyles.small}>
                  {(summary[status] ?? 0) + (status === 'occupied' ? summary.seated ?? 0 : 0)}{' '}
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* Toggle Liste / Plan */}
          <View style={viewStyles.toggleRow}>
            {(['grid', 'plan'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={viewStyles.toggleBtn(viewMode === mode)}
                onPress={() => {
                  setViewMode(mode);
                  if (mode === 'grid') setIsEditing(false);
                }}
              >
                <Text
                  style={{
                    color: viewMode === mode ? colors.text.inverse : colors.text.secondary,
                    fontWeight: '600',
                    fontSize: fs('sm'),
                  }}
                >
                  {t(mode === 'grid' ? 'floorPlan.gridView' : 'floorPlan.planView')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {viewMode === 'grid' ? renderGrid() : renderPlan()}
        </>
      )}

      </View>

      {selectedTable && renderActionSheet()}
      {renderOccupyModal()}
      {editTable && renderEditTableSheet()}
      {renderAddZoneSheet()}

      {/* Confirmation contextuelle (AlertWithAction) */}
      {confirmAction && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setConfirmAction(null)}
        >
          <Pressable
            style={[
              viewStyles.modalOverlay,
              { justifyContent: 'center', paddingHorizontal: sp.lg },
            ]}
            onPress={() => setConfirmAction(null)}
          >
            <Pressable onPress={() => {}}>
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: BORDER_RADIUS.xl,
                  padding: sp.md,
                }}
              >
                <AlertWithAction
                  variant={confirmAction.variant}
                  title={confirmAction.title}
                  message={confirmAction.message}
                  primaryButton={{
                    text: confirmAction.confirmText,
                    variant: 'danger',
                    onPress: () => {
                      const action = confirmAction.onConfirm;
                      setConfirmAction(null);
                      action();
                    },
                  }}
                  secondaryButton={{
                    text: t('common.cancel'),
                    onPress: () => setConfirmAction(null),
                  }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// WRAPPER avec gestion automatique de la sélection du restaurant
// ════════════════════════════════════════════════════════════════════════════
export default function FloorPlanScreen() {
  const { t } = useTranslation();
  const { currentRestaurant } = useRestaurant();

  return (
    <RestaurantAutoSelector
      noRestaurantMessage={t('restaurantDailyMenu.noRestaurantMessage')}
      createButtonText={t('restaurantDailyMenu.createRestaurant')}
      onRestaurantSelected={(_restaurantId) => {
        /* noop */
      }}
    >
      {currentRestaurant && (
        <FloorPlanScreenContent restaurantId={Number(currentRestaurant.id)} />
      )}
    </RestaurantAutoSelector>
  );
}