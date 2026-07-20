/**
 * Réservation d'une table — flux client.
 *
 * Route : /reservation/[restaurantId]?restaurantName=<nom>
 *
 * 1. Date (14 prochains jours) + nombre de personnes
 * 2. Créneaux disponibles (GET /reservations/availability/)
 * 3. Coordonnées (préremplies si connecté) + demandes particulières
 * 4. POST /reservations/ → écran de succès
 *
 * Gestion des courses de créneaux : un 409 slot_full/no_table recharge
 * les disponibilités et invite à choisir un autre horaire.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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
import { useAuth } from '@/contexts/AuthContext';
import { reservationService } from '@/services/reservationService';
import { savePreOrderSession } from '@/utils/preOrderSession';
import type { AvailabilitySlot, Reservation } from '@/types/reservation';

const DAYS_AHEAD = 14;

const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const extractApiError = (e: any): any =>
  e?.response?.data ?? e?.data ?? e?.body ?? e ?? {};

export default function BookReservationScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();

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

  const params = useLocalSearchParams<{
    restaurantId: string;
    restaurantName?: string;
  }>();
  const restaurantId = Number(params.restaurantId);

  // ── State ─────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [preordersEnabled, setPreordersEnabled] = useState(true);
  const [noTableForParty, setNoTableForParty] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<Reservation | null>(null);

  const [name, setName] = useState((user as any)?.first_name ?? '');
  const [phone, setPhone] = useState((user as any)?.phone ?? '');
  const [email, setEmail] = useState((user as any)?.email ?? '');
  const [requests, setRequests] = useState('');

  // ── Jours proposés ────────────────────────────────────────────────────
  const days = useMemo(() => {
    const list: Date[] = [];
    const base = new Date();
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      list.push(d);
    }
    return list;
  }, []);

  const dayLabel = useCallback(
    (d: Date, index: number): { top: string; bottom: string } => {
      if (index === 0) return { top: t('reservation.today'), bottom: '' };
      if (index === 1) return { top: t('reservation.tomorrow'), bottom: '' };
      return {
        top: d.toLocaleDateString(i18n.language, { weekday: 'short' }),
        bottom: d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
      };
    },
    [i18n.language, t],
  );

  // ── Disponibilités ────────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    if (!restaurantId) return;
    setIsLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const res = await reservationService.getAvailability(
        restaurantId,
        toYMD(selectedDate),
        partySize,
      );
      setSlots(res.slots);
      setNoTableForParty(res.reason === 'no_table_for_party_size');
      setPreordersEnabled(res.preorders_enabled !== false);
    } catch (e) {
      const data = (e as any)?.response?.data ?? (e as any)?.data ?? {};
      if (data?.error === 'reservations_disabled') {
        // Restaurant qui a désactivé entre la fiche et cet écran
        Alert.alert('', t('reservation.errors.disabled'), [
          { text: t('common.back'), onPress: () => router.back() },
        ]);
        return;
      }
      console.error('[Reservation] availability error:', e);
      setSlots([]);
      setNoTableForParty(false);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [partySize, restaurantId, selectedDate]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // ── Soumission ────────────────────────────────────────────────────────
  const submit = useCallback(async (withPreOrder = false) => {
    if (!selectedSlot) return;
    if (!name.trim() || !phone.trim()) {
      Alert.alert('', t('reservation.requiredFields'));
      return;
    }
    setIsSubmitting(true);
    try {
      const reservation = await reservationService.create({
        restaurant: restaurantId,
        starts_at: selectedSlot.starts_at,
        party_size: partySize,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim() || undefined,
        special_requests: requests.trim() || undefined,
        with_pre_order: withPreOrder,
      });
      if (withPreOrder) {
        // Créneau bloqué 15 min (pending_payment) : mémoriser le contexte
        // puis composer le repas dans le menu — le panier routera le
        // checkout vers /reservation/pre-order-checkout.
        await savePreOrderSession({
          reservationId: reservation.id,
          restaurantId,
          tableNumber: reservation.table_number,
          startsAt: reservation.starts_at,
          expiresAt: reservation.expires_at,
        });
        router.replace(`/menu/client/${restaurantId}` as any);
        return;
      }
      setCreated(reservation);
    } catch (e) {
      const data = extractApiError(e);
      if (data?.error === 'slot_full' || data?.error === 'no_table_for_party_size') {
        Alert.alert('', t('reservation.errors.slotTaken'));
        loadSlots();
      } else {
        Alert.alert(t('common.error', 'Erreur'), t('reservation.errors.create'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [email, loadSlots, name, partySize, phone, requests, restaurantId, selectedSlot, t]);

  // ── Styles ────────────────────────────────────────────────────────────
  const fs = useCallback(
    (token: keyof typeof TYPOGRAPHY.fontSize) =>
      getResponsiveValue(TYPOGRAPHY.fontSize[token], screenType),
    [screenType],
  );

  const s = useMemo(
    () => ({
      container: { flex: 1, backgroundColor: colors.background } as const,
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
      title: {
        fontSize: fs('lg'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        flex: 1,
      },
      sectionLabel: {
        fontSize: fs('sm'),
        fontWeight: '600' as const,
        color: colors.text.secondary,
        marginTop: sp.lg,
        marginBottom: sp.sm,
        paddingHorizontal: sp.md,
      },
      dayChip: (active: boolean) => ({
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingHorizontal: sp.md,
        paddingVertical: sp.sm,
        marginRight: sp.sm,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: active ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border.light,
        minWidth: 72,
        ...shadows.card,
      }),
      dayText: (active: boolean, secondary = false) => ({
        fontSize: fs(secondary ? 'xs' : 'sm'),
        fontWeight: secondary ? ('400' as const) : ('600' as const),
        color: active
          ? colors.text.inverse
          : secondary
            ? colors.text.secondary
            : colors.text.primary,
      }),
      stepperRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: sp.lg,
      },
      stepperBtn: {
        width: 44,
        height: 44,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border.default,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
      stepperValue: {
        fontSize: fs('xl'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        minWidth: 120,
        textAlign: 'center' as const,
      },
      slotsWrap: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: sp.sm,
        paddingHorizontal: sp.md,
      },
      slotChip: (active: boolean) => ({
        paddingHorizontal: sp.md,
        paddingVertical: sp.sm,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: active ? colors.secondary : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.secondary : colors.border.light,
      }),
      slotText: (active: boolean) => ({
        fontSize: fs('sm'),
        fontWeight: '600' as const,
        color: active ? '#1E2A78' : colors.text.primary,
      }),
      input: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        borderColor: colors.border.light,
        paddingHorizontal: sp.md,
        paddingVertical: sp.sm + 2,
        marginHorizontal: sp.md,
        marginBottom: sp.sm,
        fontSize: fs('base'),
        color: colors.text.primary,
      },
      submitBtn: (enabled: boolean) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: sp.sm,
        marginHorizontal: sp.md,
        marginTop: sp.md,
        paddingVertical: sp.md,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: enabled ? colors.primary : colors.border.default,
      }),
      submitText: {
        fontSize: fs('md'),
        fontWeight: '700' as const,
        color: colors.text.inverse,
      },
      hint: {
        fontSize: fs('sm'),
        color: colors.text.secondary,
        textAlign: 'center' as const,
        paddingHorizontal: sp.lg,
      },
      centerBox: {
        flex: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: sp.xl,
        gap: sp.md,
      },
      successIcon: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: `${colors.success}22`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
    }),
    [colors, fs, insets, shadows, sp],
  );

  // ── Écran de succès ───────────────────────────────────────────────────
  if (created) {
    const d = new Date(created.starts_at);
    return (
      <View style={[s.container, s.centerBox]}>
        <View style={s.successIcon}>
          <Ionicons name="checkmark" size={48} color={colors.success} />
        </View>
        <Text style={[s.title, { flex: 0, fontSize: fs('2xl'), textAlign: 'center' }]}>
          {t('reservation.success.title')}
        </Text>
        <Text style={s.hint}>
          {t('reservation.success.subtitle', {
            date: d.toLocaleDateString(i18n.language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }),
            time: d.toLocaleTimeString(i18n.language, {
              hour: '2-digit',
              minute: '2-digit',
            }),
            people: t('reservation.people', { count: created.party_size }),
          })}
        </Text>
        {created.table_number && (
          <Text style={[s.hint, { fontWeight: '700', color: colors.text.primary }]}>
            {t('reservation.success.table', { table: created.table_number })}
          </Text>
        )}
        <Text style={s.hint}>{t('reservation.success.hint')}</Text>
        <TouchableOpacity
          style={[s.submitBtn(true), { alignSelf: 'stretch' }]}
          onPress={() => router.replace('/reservation/mine' as any)}
        >
          <Text style={s.submitText}>{t('reservation.success.viewMine')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Rendu principal ───────────────────────────────────────────────────
  const canSubmit = !!selectedSlot && !!name.trim() && !!phone.trim() && !isSubmitting;

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>
          {params.restaurantName || t('reservation.bookTitle')}
        </Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + sp.xl }}>
        {/* Date */}
        <Text style={s.sectionLabel}>{t('reservation.date')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: sp.md }}
        >
          {days.map((d, idx) => {
            const active = toYMD(d) === toYMD(selectedDate);
            const label = dayLabel(d, idx);
            return (
              <TouchableOpacity
                key={toYMD(d)}
                style={s.dayChip(active)}
                onPress={() => setSelectedDate(d)}
              >
                <Text style={s.dayText(active)}>{label.top}</Text>
                {!!label.bottom && (
                  <Text style={s.dayText(active, true)}>{label.bottom}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Couverts */}
        <Text style={s.sectionLabel}>{t('reservation.partySize')}</Text>
        <View style={s.stepperRow}>
          <TouchableOpacity
            style={s.stepperBtn}
            onPress={() => setPartySize((v) => Math.max(1, v - 1))}
          >
            <Ionicons name="remove" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={s.stepperValue}>
            {t('reservation.people', { count: partySize })}
          </Text>
          <TouchableOpacity
            style={s.stepperBtn}
            onPress={() => setPartySize((v) => Math.min(30, v + 1))}
          >
            <Ionicons name="add" size={22} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Créneaux */}
        <Text style={s.sectionLabel}>{t('reservation.time')}</Text>
        {isLoadingSlots ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: sp.lg }} />
        ) : slots.length === 0 ? (
          <Text style={[s.hint, { marginVertical: sp.md }]}>
            {noTableForParty
              ? t('reservation.noTableForParty')
              : t('reservation.noSlots')}
          </Text>
        ) : (
          <View style={s.slotsWrap}>
            {slots.map((slot) => {
              const active = selectedSlot?.starts_at === slot.starts_at;
              return (
                <TouchableOpacity
                  key={slot.starts_at}
                  style={s.slotChip(active)}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <Text style={s.slotText(active)}>{slot.time}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Coordonnées */}
        <Text style={s.sectionLabel}>{t('reservation.contact.title')}</Text>
        <TextInput
          style={s.input}
          placeholder={t('reservation.contact.name')}
          placeholderTextColor={colors.text.light}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <TextInput
          style={s.input}
          placeholder={t('reservation.contact.phone')}
          placeholderTextColor={colors.text.light}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextInput
          style={s.input}
          placeholder={t('reservation.contact.email')}
          placeholderTextColor={colors.text.light}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]}
          placeholder={t('reservation.contact.requests')}
          placeholderTextColor={colors.text.light}
          value={requests}
          onChangeText={setRequests}
          multiline
          maxLength={500}
        />

        {/* Soumission */}
        <TouchableOpacity
          style={s.submitBtn(canSubmit)}
          onPress={() => submit(false)}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <>
              <Ionicons name="calendar" size={20} color={colors.text.inverse} />
              <Text style={s.submitText}>{t('reservation.submit')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Réserver + pré-commander (compte requis : paiement 100%) */}
        {isAuthenticated && preordersEnabled && (
          <TouchableOpacity
            style={[
              s.submitBtn(canSubmit),
              {
                backgroundColor: canSubmit ? colors.secondary : colors.border.default,
              },
            ]}
            onPress={() => submit(true)}
            disabled={!canSubmit}
          >
            <Ionicons name="restaurant" size={20} color="#1E2A78" />
            <Text style={[s.submitText, { color: '#1E2A78' }]}>
              {t('reservation.preOrder.bookAndOrder')}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}