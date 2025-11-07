import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  Alert as RNAlert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Contexts
import { useComptabilite } from '@/contexts/ComptabiliteContext';

// Components
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { Alert as UIAlert } from '@/components/ui/Alert';

// Design System
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

// Types
import type { RecapitulatifTVA } from '@/types/comptabilite';

// Helpers responsive
const s = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof SPACING) =>
  getResponsiveValue(SPACING[key], screenType);
const fs = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof TYPOGRAPHY.fontSize) =>
  getResponsiveValue(TYPOGRAPHY.fontSize[key], screenType);

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export const RecapsTVAScreen: React.FC = () => {
  const {
    recapsTVA,
    recapsTVALoading,
    recapsTVAError,
    loadRecapsTVA,
    generateRecapTVA,
    regenerateRecapTVA,
    exportTVACSV,
  } = useComptabilite();

  const screenType = useScreenType();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);
  const [selectedRecap, setSelectedRecap] = useState<RecapitulatifTVA | null>(null);

  // Inline alert
  const [inlineAlert, setInlineAlert] = useState<{
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  // Charger les récaps au montage et quand l'année change
  useEffect(() => {
    loadRecapsTVA({ year: selectedYear });
  }, [selectedYear]);

  // Rafraîchir
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadRecapsTVA({ year: selectedYear });
    } finally {
      setRefreshing(false);
    }
  };

  // Générer un nouveau récap
  const handleGenerate = async (year: number, month: number) => {
    setGenerating(true);
    try {
      await generateRecapTVA(year, month);
      setInlineAlert({
        variant: 'success',
        message: `Récapitulatif ${getMonthName(month)} ${year} généré`,
      });
      await loadRecapsTVA({ year: selectedYear });
    } catch (error: any) {
      setInlineAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Erreur lors de la génération',
      });
    } finally {
      setGenerating(false);
    }
  };

  // Régénérer un récap existant (confirmation native)
  const handleRegenerate = async (recap: RecapitulatifTVA) => {
    RNAlert.alert(
      'Régénérer le récapitulatif',
      `Voulez-vous vraiment régénérer ${getMonthName(recap.month)} ${recap.year} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Régénérer',
          style: 'destructive',
          onPress: async () => {
            try {
              await regenerateRecapTVA(recap.year, recap.month);
              setInlineAlert({
                variant: 'success',
                message: 'Récapitulatif régénéré',
              });
              await loadRecapsTVA({ year: selectedYear });
            } catch (error: any) {
              setInlineAlert({
                variant: 'error',
                title: 'Erreur',
                message: error?.message || 'Erreur lors de la régénération',
              });
            }
          },
        },
      ]
    );
  };

  // Exporter en CSV
  const handleExportCSV = async () => {
    try {
      await exportTVACSV(selectedYear);
      setInlineAlert({
        variant: 'success',
        message: 'Export CSV téléchargé',
      });
    } catch (error: any) {
      setInlineAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || "Erreur lors de l'export",
      });
    }
  };

  // Styles responsive
  const styles = useMemo(() => {
    const padLg = s(screenType, 'lg');
    const padMd = s(screenType, 'md');
    const padSm = s(screenType, 'sm');
    const padXs = s(screenType, 'xs');

    return {
      container: {
        flex: 1,
        backgroundColor: COLORS.background,
        padding: padLg,
      },
      header: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'flex-start' as const,
        marginBottom: padLg,
      },
      title: {
        fontSize: fs(screenType, '3xl'),
        fontWeight: TYPOGRAPHY.fontWeight.bold,
        color: COLORS.text.primary,
      },
      subtitle: {
        marginTop: padXs,
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },

      // Year selector
      yearSelector: {
        flexDirection: 'row' as const,
      },
      yearButton: {
        paddingHorizontal: padMd,
        paddingVertical: padSm,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: COLORS.border.light,
        marginLeft: padXs / 2,
      },
      yearButtonActive: {
        backgroundColor: COLORS.primary,
      },
      yearButtonText: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },
      yearButtonTextActive: {
        color: COLORS.text.inverse,
        fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      },

      // Actions
      actions: {
        flexDirection: 'row' as const,
        marginBottom: padLg,
      },

      // List
      list: {
        paddingBottom: padLg,
      },
      recapCard: {
        padding: padLg,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      recapHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginBottom: padMd,
      },
      recapDate: {
        width: 92,
        paddingVertical: padSm,
        paddingHorizontal: padSm,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: `${COLORS.primary}10`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: padMd,
      },
      recapMonth: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      recapYear: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.text.secondary,
      },
      recapStats: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        marginRight: padMd,
      },
      stat: {
        alignItems: 'flex-start' as const,
      },
      statLabel: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.text.secondary,
        marginBottom: 2,
      },
      statValue: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      recapFooter: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        paddingTop: padMd,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      },
      recapInfo: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
      },
      recapInfoText: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.text.secondary,
        marginLeft: 6,
      },

      // Empty
      emptyContainer: {
        flex: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingVertical: s(screenType, 'xl') * 2,
      },
      emptyTitle: {
        fontSize: fs(screenType, 'xl'),
        color: COLORS.text.secondary,
        marginTop: padMd,
      },
      emptyText: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
        marginTop: padXs,
      },

      // Modal: details
      modalContainer: {
        flex: 1,
        backgroundColor: COLORS.background,
      },
      modalHeader: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        padding: padLg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border.light,
      },
      modalTitle: {
        fontSize: fs(screenType, '2xl'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      modalSubtitle: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.text.secondary,
      },
      modalContent: {
        flex: 1,
        padding: padLg,
      },
      detailSection: {
        padding: padLg,
        marginBottom: padMd,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      detailTitle: {
        fontSize: fs(screenType, 'lg'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padSm,
      },
      detailRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        marginTop: padSm,
      },
      detailLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },
      detailValue: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
      },
      detailValueBold: {
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      tvaBlock: {
        marginTop: padSm,
        paddingTop: padSm,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      },
      tvaRate: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
      },
      detailRowTotal: {
        marginTop: padMd,
        paddingTop: padSm,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      },
      detailLabelTotal: {
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      detailValueTotal: {
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      modalActions: {
        flexDirection: 'row' as const,
        padding: padLg,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      },

      // Modal: generate
      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        padding: padLg,
      },
      generateModal: {
        width: '100%',
        maxWidth: 520,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: padLg,
        ...SHADOWS.lg,
      },
      generateTitle: {
        fontSize: fs(screenType, 'xl'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padLg,
      },
      generateForm: {
        marginBottom: padLg,
      },
      generateLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
        marginBottom: padSm,
      },
      yearGrid: {
        flexDirection: 'row' as const,
        marginBottom: padSm,
      },
      yearOption: {
        flex: 1,
        padding: padMd,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border.light,
        alignItems: 'center' as const,
        marginRight: padSm,
      },
      yearOptionActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}15`,
      },
      yearOptionText: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },
      yearOptionTextActive: {
        color: COLORS.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      monthGrid: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        marginHorizontal: -padSm / 2,
        marginTop: padSm,
      },
      monthOption: {
        width: '25%',
        paddingHorizontal: padSm / 2,
        marginBottom: padSm,
      },
      monthOptionInner: {
        alignItems: 'center' as const,
        paddingVertical: padSm,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border.light,
        backgroundColor: COLORS.surface,
      },
      monthOptionActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}10`,
      },
      monthOptionText: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.text.secondary,
      },
      monthOptionTextActive: {
        color: COLORS.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      generateActions: {
        flexDirection: 'row' as const,
      },
    } as const;
  }, [screenType]);

  // Rendu d'un récap
  const renderRecap = ({ item }: { item: RecapitulatifTVA }) => {
    return (
      <TouchableOpacity onPress={() => setSelectedRecap(item)}>
        <Card style={styles.recapCard}>
          <View style={styles.recapHeader}>
            <View style={styles.recapDate}>
              <Text style={styles.recapMonth}>{getMonthName(item.month, true)}</Text>
              <Text style={styles.recapYear}>{item.year}</Text>
            </View>

            <View style={styles.recapStats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>CA TTC</Text>
                <Text style={styles.statValue}>{formatCurrency(item.caTtc)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>TVA</Text>
                <Text style={[styles.statValue, { color: COLORS.success }]}>
                  {formatCurrency(item.tvaTotal)}
                </Text>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
          </View>

          <View style={styles.recapFooter}>
            <View style={styles.recapInfo}>
              <Ionicons name="document-text-outline" size={16} color={COLORS.text.secondary} />
              <Text style={styles.recapInfoText}>
                {item.nombreFactures} facture{item.nombreFactures > 1 ? 's' : ''}
              </Text>
            </View>

            <View style={styles.recapInfo}>
              <Ionicons name="cash-outline" size={16} color={COLORS.text.secondary} />
              <Text style={styles.recapInfoText}>
                Ticket moyen&nbsp;: {formatCurrency(item.ticketMoyen)}
              </Text>
            </View>

            {/* Exemple de badge de statut si tu en as un dans le modèle */}
            {typeof (item as any).statut === 'string' && (
              <Badge text={(item as any).statut} variant="default" />
            )}
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  // Séparateur
  const renderSeparator = () => <View style={{ height: s(screenType, 'md') }} />;

  // Liste vide
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-text-outline" size={64} color={COLORS.text.secondary} />
      <Text style={styles.emptyTitle}>Aucun récapitulatif</Text>
      <Text style={styles.emptyText}>Générez votre premier récapitulatif TVA</Text>
      <View style={{ height: s(screenType, 'md') }} />
      <Button
        title="Générer un récapitulatif"
        onPress={() => setSelectedRecap(null)}
        leftIcon={<Ionicons name="add" size={18} color={COLORS.primary} />}
      />
    </View>
  );

  if (recapsTVALoading && recapsTVA.length === 0) {
    return <Loading text="Chargement des récapitulatifs..." />;
  }

  return (
    <View style={styles.container}>
      {/* Inline alert */}
      {inlineAlert && (
        <View style={{ marginBottom: s(screenType, 'md') }}>
          <UIAlert
            variant={inlineAlert.variant}
            title={inlineAlert.title}
            message={inlineAlert.message}
            onDismiss={() => setInlineAlert(null)}
            autoDismiss
          />
        </View>
      )}
      {recapsTVAError && (
        <View style={{ marginBottom: s(screenType, 'md') }}>
          <UIAlert variant="error" title="Erreur" message={recapsTVAError} />
        </View>
      )}

      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Récapitulatifs TVA</Text>
          <Text style={styles.subtitle}>Consultez vos déclarations mensuelles</Text>
        </View>

        <YearSelector selectedYear={selectedYear} onYearChange={setSelectedYear} styles={styles} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title="Nouveau récap"
          onPress={() =>
            RNAlert.alert(
              'Nouveau récapitulatif',
              'Choisissez une période',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Choisir…',
                  onPress: () => setSelectedRecap(null),
                },
              ]
            )
          }
          style={{ flex: 1 }}
          leftIcon={<Ionicons name="add" size={18} color={COLORS.text.inverse} />}
        />
        <View style={{ width: s(screenType, 'md') }} />
        <Button
          title="Export CSV"
          variant="outline"
          onPress={handleExportCSV}
          style={{ flex: 1 }}
          leftIcon={<Ionicons name="download-outline" size={18} color={COLORS.primary} />}
        />
      </View>

      {/* Liste des récaps */}
      <FlatList
        data={recapsTVA}
        renderItem={renderRecap}
        keyExtractor={(item) => `${item.year}-${item.month}`}
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={renderSeparator}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
      />

      {/* Modal détails */}
      {selectedRecap && (
        <RecapDetailModal
          recap={selectedRecap}
          visible={!!selectedRecap}
          onClose={() => setSelectedRecap(null)}
          onRegenerate={() => handleRegenerate(selectedRecap)}
          styles={styles}
        />
      )}

      {/* Modal génération rapide */}
      <GenerateRecapModal
        visible={false /* tu peux mettre un state pour l'ouvrir */}
        onClose={() => {}}
        onGenerate={handleGenerate}
        loading={generating}
        currentYear={selectedYear}
        styles={styles}
      />
    </View>
  );
};

// ============================================================================
// COMPOSANTS ENFANTS
// ============================================================================

interface YearSelectorProps {
  selectedYear: number;
  onYearChange: (year: number) => void;
  styles: any;
}

const YearSelector: React.FC<YearSelectorProps> = ({ selectedYear, onYearChange, styles }) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <View style={styles.yearSelector}>
      {years.map((year) => {
        const active = year === selectedYear;
        return (
          <TouchableOpacity
            key={year}
            style={[styles.yearButton, active && styles.yearButtonActive]}
            onPress={() => onYearChange(year)}
            accessibilityRole="button"
            accessibilityLabel={`Filtrer sur l'année ${year}`}
          >
            <Text style={[styles.yearButtonText, active && styles.yearButtonTextActive]}>
              {year}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

interface RecapDetailModalProps {
  recap: RecapitulatifTVA;
  visible: boolean;
  onClose: () => void;
  onRegenerate: () => void;
  styles: any;
}

const RecapDetailModal: React.FC<RecapDetailModalProps> = ({
  recap,
  visible,
  onClose,
  onRegenerate,
  styles,
}) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>
              {getMonthName(recap.month)} {recap.year}
            </Text>
            <Text style={styles.modalSubtitle}>Détails du récapitulatif</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color={COLORS.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {/* CA */}
          <Card style={styles.detailSection}>
            <Text style={styles.detailTitle}>Chiffre d'affaires</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>CA HT</Text>
              <Text style={styles.detailValue}>{formatCurrency(recap.caHt)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>CA TTC</Text>
              <Text style={[styles.detailValue, styles.detailValueBold]}>
                {formatCurrency(recap.caTtc)}
              </Text>
            </View>
          </Card>

          {/* TVA par taux */}
          <Card style={styles.detailSection}>
            <Text style={styles.detailTitle}>Détail TVA</Text>

            {recap.tva55Montant > 0 && (
              <View style={styles.tvaBlock}>
                <Text style={styles.tvaRate}>TVA 5.5%</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Base HT</Text>
                  <Text style={styles.detailValue}>{formatCurrency(recap.tva55Base)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>TVA collectée</Text>
                  <Text style={[styles.detailValue, { color: COLORS.success }]}>
                    {formatCurrency(recap.tva55Montant)}
                  </Text>
                </View>
              </View>
            )}

            {recap.tva10Montant > 0 && (
              <View style={styles.tvaBlock}>
                <Text style={styles.tvaRate}>TVA 10%</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Base HT</Text>
                  <Text style={styles.detailValue}>{formatCurrency(recap.tva10Base)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>TVA collectée</Text>
                  <Text style={[styles.detailValue, { color: COLORS.success }]}>
                    {formatCurrency(recap.tva10Montant)}
                  </Text>
                </View>
              </View>
            )}

            {recap.tva20Montant > 0 && (
              <View style={styles.tvaBlock}>
                <Text style={styles.tvaRate}>TVA 20%</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Base HT</Text>
                  <Text style={styles.detailValue}>{formatCurrency(recap.tva20Base)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>TVA collectée</Text>
                  <Text style={[styles.detailValue, { color: COLORS.success }]}>
                    {formatCurrency(recap.tva20Montant)}
                  </Text>
                </View>
              </View>
            )}

            <View style={[styles.detailRow, styles.detailRowTotal]}>
              <Text style={[styles.detailLabel, styles.detailLabelTotal]}>TVA Totale</Text>
              <Text style={[styles.detailValue, styles.detailValueTotal]}>
                {formatCurrency(recap.tvaTotal)}
              </Text>
            </View>
          </Card>

          {/* Stats */}
          <Card style={styles.detailSection}>
            <Text style={styles.detailTitle}>Statistiques</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Nombre de factures</Text>
              <Text style={styles.detailValue}>{recap.nombreFactures}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Ticket moyen</Text>
              <Text style={styles.detailValue}>{formatCurrency(recap.ticketMoyen)}</Text>
            </View>
            {recap.commissionsStripe != null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Commissions Stripe</Text>
                <Text style={[styles.detailValue, { color: COLORS.error }]}>
                  -{formatCurrency(recap.commissionsStripe)}
                </Text>
              </View>
            )}
          </Card>
        </ScrollView>

        <View style={styles.modalActions}>
          <Button
            title="Régénérer"
            variant="outline"
            onPress={onRegenerate}
            style={{ flex: 1 }}
            leftIcon={<Ionicons name="refresh" size={18} color={COLORS.primary} />}
          />
          <Button title="Fermer" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
};

interface GenerateRecapModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (year: number, month: number) => void;
  loading: boolean;
  currentYear: number;
  styles: any;
}

const GenerateRecapModal: React.FC<GenerateRecapModalProps> = ({
  visible,
  onClose,
  onGenerate,
  loading,
  currentYear,
  styles,
}) => {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.generateModal}>
          <Text style={styles.generateTitle}>Générer un récapitulatif</Text>

          <View style={styles.generateForm}>
            <Text style={styles.generateLabel}>Année</Text>
            <View style={styles.yearGrid}>
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => {
                const active = year === y;
                return (
                  <TouchableOpacity
                    key={y}
                    style={[styles.yearOption, active && styles.yearOptionActive]}
                    onPress={() => setYear(y)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[styles.yearOptionText, active && styles.yearOptionTextActive]}
                    >
                      {y}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.generateLabel}>Mois</Text>
            <View style={styles.monthGrid}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const active = month === m;
                return (
                  <View key={m} style={styles.monthOption}>
                    <TouchableOpacity
                      style={[
                        styles.monthOptionInner,
                        active && styles.monthOptionActive,
                      ]}
                      onPress={() => setMonth(m)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[styles.monthOptionText, active && styles.monthOptionTextActive]}
                      >
                        {getMonthName(m, true)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.generateActions}>
            <Button
              title="Annuler"
              variant="outline"
              onPress={onClose}
              style={{ flex: 1 }}
              disabled={loading}
            />
            <Button
              title="Générer"
              onPress={() => onGenerate(year, month)}
              loading={loading}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ============================================================================
// UTILITAIRES
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

function getMonthName(month: number, short: boolean = false): string {
  const safeMonth = Math.min(12, Math.max(1, month)) - 1;
  const date = new Date(2020, safeMonth, 1);
  const fmt = new Intl.DateTimeFormat('fr-FR', { month: short ? 'short' : 'long' });
  return fmt
    .format(date)
    .replace('.', '')
    .replace(/^./, (c) => c.toUpperCase());
}
