/**
 * Plan de salle restaurateur — temps réel.
 *
 * Route : /restaurant/floor-plan?restaurantId=<id>
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
  Alert,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@/utils/designSystem';
import { floorPlanService } from '@/services/floorPlanService';
import { useFloorPlanSocket } from '@/hooks/useFloorPlanSocket';
import type {
  BulkSetupGroup,
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
// ÉCRAN
// =============================================================================

export default function FloorPlanScreen() {
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

  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const restaurantId = Number(params.restaurantId);

  const [tables, setTables] = useState<FloorPlanTable[]>([]);
  const [summary, setSummary] = useState<Partial<Record<FloorPlanTableStatus, number>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'plan'>('grid');
  const [isEditing, setIsEditing] = useState(false);

  const [selectedTable, setSelectedTable] = useState<FloorPlanTable | null>(null);
  const [occupyVisible, setOccupyVisible] = useState(false);
  const [occupyPartySize, setOccupyPartySize] = useState(2);
  const [occupyDuration, setOccupyDuration] = useState(90);
  const [bulkVisible, setBulkVisible] = useState(false);
  const [bulkGroups, setBulkGroups] = useState<BulkSetupGroup[]>([
    { capacity: 2, count: 4 },
    { capacity: 4, count: 4 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Positions optimistes pendant le drag (relatives 0..1)
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

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
          Alert.alert(t('common.error', 'Erreur'), t('floorPlan.errors.action'));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [load, t],
  );

  const handleConflict = useCallback(
    (conflict: OccupyConflictResponse) => {
      const alt = conflict.alternatives?.length
        ? `\n\n${t('floorPlan.conflict.alternatives')} ${conflict.alternatives
            .map((a) => `${a.number} (${a.capacity})`)
            .join(', ')}`
        : `\n\n${t('floorPlan.conflict.none')}`;
      Alert.alert(
        t('floorPlan.conflict.title'),
        `${conflict.message}${alt}`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('floorPlan.actions.forceSeat'),
            style: 'destructive',
            onPress: () =>
              runAction(() =>
                floorPlanService.occupy({
                  table_id: conflict ? selectedTableRef.current?.id ?? '' : '',
                  party_size: occupyPartySize,
                  duration_minutes: occupyDuration,
                  force: true,
                }),
              ),
          },
        ],
      );
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

  const submitBulkSetup = useCallback(() => {
    const groups = bulkGroups.filter((g) => g.count > 0);
    if (!groups.length) return;
    runAction(async () => {
      const res = await floorPlanService.bulkSetup(restaurantId, groups);
      setBulkVisible(false);
      Alert.alert(
        t('floorPlan.bulkSetup.title'),
        t('floorPlan.bulkSetup.created', { count: res.count }),
      );
    });
  }, [bulkGroups, restaurantId, runAction, t]);

  // ── Plan : géométrie & drag ───────────────────────────────────────────

  const planPadding = sp.md;
  const planWidth = Math.min(windowWidth - planPadding * 2, 900);
  const planHeight = Math.round(planWidth * 0.72);
  const tableSize = getResponsiveValue(
    { mobile: 56, tablet: 68, desktop: 76 },
    screenType,
  );

  const placedTables = useMemo(
    () => tables.filter((tb) => tb.pos_x !== null && tb.pos_y !== null),
    [tables],
  );
  const unplacedTables = useMemo(
    () => tables.filter((tb) => tb.pos_x === null || tb.pos_y === null),
    [tables],
  );

  const relPos = useCallback(
    (tb: FloorPlanTable) =>
      dragPositions[tb.id] ?? { x: tb.pos_x ?? 0.5, y: tb.pos_y ?? 0.5 },
    [dragPositions],
  );

  const saveTablePosition = useCallback(
    async (tableId: string, x: number, y: number) => {
      try {
        await floorPlanService.saveLayout(restaurantId, [
          { table_id: tableId, pos_x: x, pos_y: y },
        ]);
      } catch {
        Alert.alert(t('common.error', 'Erreur'), t('floorPlan.errors.action'));
        load();
      }
    },
    [load, restaurantId, t],
  );

  const placeTableOnPlan = useCallback(
    (tb: FloorPlanTable) => {
      // Positionne au centre avec un léger décalage pour éviter l'empilement
      const jitter = () => 0.4 + Math.random() * 0.2;
      const x = jitter();
      const y = jitter();
      setDragPositions((prev) => ({ ...prev, [tb.id]: { x, y } }));
      setTables((prev) =>
        prev.map((item) =>
          item.id === tb.id ? { ...item, pos_x: x, pos_y: y } : item,
        ),
      );
      saveTablePosition(tb.id, x, y);
    },
    [saveTablePosition],
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
      header: {
        paddingTop: insets.top + sp.sm,
        paddingHorizontal: sp.md,
        paddingBottom: sp.sm,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: sp.sm,
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
        gap: sp.sm,
        paddingHorizontal: sp.md,
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
        marginHorizontal: sp.md,
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
        paddingHorizontal: sp.md,
        paddingBottom: sp.xl,
      },
      tableCard: (status: FloorPlanTableStatus) => ({
        width: getResponsiveValue(
          { mobile: (windowWidth - sp.md * 2 - sp.sm) / 2, tablet: 170, desktop: 190 },
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
      planTable: (tb: FloorPlanTable, pos: { x: number; y: number }) => ({
        position: 'absolute' as const,
        left: pos.x * (planWidth - tableSize),
        top: pos.y * (planHeight - tableSize),
        width: tableSize,
        height: tb.shape === 'rect' ? tableSize * 0.7 : tableSize,
        borderRadius: tb.shape === 'round' ? tableSize / 2 : BORDER_RADIUS.md,
        backgroundColor: statusColor(tb.status),
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        ...shadows.card,
      }),
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
    [colors, insets, isEditing, planHeight, planWidth, screenType, shadows, sp, statusColor, tableSize, windowWidth],
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

  // ── Composant table draggable (plan) ──────────────────────────────────

  const DraggableTable: React.FC<{ table: FloorPlanTable }> = ({ table }) => {
    const startPos = useRef({ x: 0, y: 0 });
    const pos = relPos(table);

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => isEditing,
          onMoveShouldSetPanResponder: () => isEditing,
          onPanResponderGrant: () => {
            startPos.current = relPos(table);
          },
          onPanResponderMove: (_evt, gesture) => {
            const x = Math.min(
              1,
              Math.max(0, startPos.current.x + gesture.dx / (planWidth - tableSize)),
            );
            const y = Math.min(
              1,
              Math.max(0, startPos.current.y + gesture.dy / (planHeight - tableSize)),
            );
            setDragPositions((prev) => ({ ...prev, [table.id]: { x, y } }));
          },
          onPanResponderRelease: (_evt, gesture) => {
            const x = Math.min(
              1,
              Math.max(0, startPos.current.x + gesture.dx / (planWidth - tableSize)),
            );
            const y = Math.min(
              1,
              Math.max(0, startPos.current.y + gesture.dy / (planHeight - tableSize)),
            );
            saveTablePosition(table.id, x, y);
          },
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isEditing, table.id],
    );

    return (
      <View
        style={viewStyles.planTable(table, pos)}
        {...(isEditing ? panResponder.panHandlers : {})}
      >
        <Pressable
          disabled={isEditing}
          onPress={() => setSelectedTable(table)}
          style={{ alignItems: 'center' }}
        >
          <Text
            style={{
              color: colors.text.inverse,
              fontWeight: '700',
              fontSize: fs('base'),
            }}
          >
            {table.number}
          </Text>
          <Text style={{ color: colors.text.inverse, fontSize: fs('xs') }}>
            {table.capacity}
          </Text>
          {table.next_reservation && (
            <Text style={{ color: colors.text.inverse, fontSize: fs('xs') }}>
              {table.next_reservation.time}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

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
                        {t('floorPlan.seats', { count: tb.capacity })}
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
    <ScrollView>
      {isEditing && (
        <Text style={[textStyles.small, { textAlign: 'center', marginBottom: sp.sm }]}>
          {t('floorPlan.dragHint')}
        </Text>
      )}
      <View style={viewStyles.planCanvas}>
        {placedTables.map((tb) => (
          <DraggableTable key={tb.id} table={tb} />
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

  const renderBulkModal = () => (
    <Modal transparent visible={bulkVisible} animationType="slide" onRequestClose={() => setBulkVisible(false)}>
      <Pressable style={viewStyles.modalOverlay} onPress={() => setBulkVisible(false)}>
        <Pressable style={viewStyles.sheet} onPress={() => {}}>
          <Text style={textStyles.sheetTitle}>{t('floorPlan.bulkSetup.title')}</Text>

          {bulkGroups.map((group, idx) => (
            <View
              key={idx}
              style={{ flexDirection: 'row', alignItems: 'center', gap: sp.md }}
            >
              {(['count', 'capacity'] as const).map((field) => (
                <View key={field} style={{ flex: 1 }}>
                  <Text style={textStyles.label}>
                    {t(`floorPlan.bulkSetup.${field}`)}
                  </Text>
                  <View style={[viewStyles.stepperRow, { gap: sp.sm, paddingVertical: sp.xs }]}>
                    <TouchableOpacity
                      style={viewStyles.stepperBtn}
                      onPress={() =>
                        setBulkGroups((prev) =>
                          prev.map((g, i) =>
                            i === idx
                              ? { ...g, [field]: Math.max(field === 'capacity' ? 1 : 0, g[field] - 1) }
                              : g,
                          ),
                        )
                      }
                    >
                      <Ionicons name="remove" size={18} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={[textStyles.stepperValue, { fontSize: fs('lg'), minWidth: 32 }]}>
                      {group[field]}
                    </Text>
                    <TouchableOpacity
                      style={viewStyles.stepperBtn}
                      onPress={() =>
                        setBulkGroups((prev) =>
                          prev.map((g, i) =>
                            i === idx ? { ...g, [field]: Math.min(field === 'capacity' ? 30 : 50, g[field] + 1) } : g,
                          ),
                        )
                      }
                    >
                      <Ionicons name="add" size={18} color={colors.text.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => setBulkGroups((prev) => prev.filter((_g, i) => i !== idx))}
                disabled={bulkGroups.length === 1}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={bulkGroups.length === 1 ? colors.text.light : colors.error}
                />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={viewStyles.actionBtn('neutral')}
            onPress={() => setBulkGroups((prev) => [...prev, { capacity: 4, count: 2 }])}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.text.primary} />
            <Text style={textStyles.actionText('neutral')}>
              {t('floorPlan.bulkSetup.addRow')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={viewStyles.actionBtn('primary')}
            onPress={submitBulkSetup}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={colors.text.inverse} />
                <Text style={textStyles.actionText('primary')}>
                  {t('floorPlan.bulkSetup.create')}
                </Text>
              </>
            )}
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
      {/* Header */}
      <View style={viewStyles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={textStyles.title}>{t('floorPlan.title')}</Text>
        <View style={viewStyles.liveBadge(isLive)}>
          <View style={viewStyles.liveDot(isLive)} />
          <Text style={textStyles.small}>
            {isLive ? t('floorPlan.live') : t('floorPlan.offline')}
          </Text>
        </View>
        {viewMode === 'plan' && tables.length > 0 && (
          <TouchableOpacity onPress={() => setIsEditing((v) => !v)} hitSlop={12}>
            <Ionicons
              name={isEditing ? 'checkmark-circle' : 'create-outline'}
              size={24}
              color={isEditing ? colors.success : colors.text.primary}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setBulkVisible(true)} hitSlop={12}>
          <Ionicons name="add-circle-outline" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

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
          <Ionicons name="grid-outline" size={48} color={colors.text.light} />
          <Text style={[textStyles.sheetTitle, { textAlign: 'center' }]}>
            {t('floorPlan.empty.title')}
          </Text>
          <Text style={[textStyles.small, { textAlign: 'center' }]}>
            {t('floorPlan.empty.subtitle')}
          </Text>
          <TouchableOpacity
            style={viewStyles.actionBtn('primary')}
            onPress={() => setBulkVisible(true)}
          >
            <Text style={textStyles.actionText('primary')}>{t('floorPlan.empty.cta')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loadError && tables.length > 0 && (
        <>
          {/* Résumé */}
          <View style={viewStyles.summaryBar}>
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

      {selectedTable && renderActionSheet()}
      {renderOccupyModal()}
      {renderBulkModal()}
    </View>
  );
}