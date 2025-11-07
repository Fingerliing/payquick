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
import type {
  ExportComptable,
  ExportStatus,
  CreateExportRequest,
} from '@/types/comptabilite';

import { ExportFormat } from '@/types/comptabilite';

// Helpers responsive
const s = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof SPACING) =>
  getResponsiveValue(SPACING[key], screenType);
const fs = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof TYPOGRAPHY.fontSize) =>
  getResponsiveValue(TYPOGRAPHY.fontSize[key], screenType);

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export const ExportsScreen: React.FC = () => {
  const {
    exports,
    exportsLoading,
    exportsError,
    exportsPagination,
    loadExports,
    createExport,
    deleteExport,
    downloadExport,
    generateFEC,
    downloadFEC,
  } = useComptabilite();

  // inline alerts (plus de useAlert)
  const [inlineAlert, setInlineAlert] = useState<{
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  const screenType = useScreenType();

  const [refreshing, setRefreshing] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFECModal, setShowFECModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Charger les exports au montage
  useEffect(() => {
    loadExports();
  }, []);

  // Rafraîchir
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadExports();
    } finally {
      setRefreshing(false);
    }
  };

  // Créer un export
  const handleCreateExport = async (data: CreateExportRequest) => {
    setCreating(true);
    try {
      await createExport(data);
      setInlineAlert({
        variant: 'success',
        message: 'Export créé avec succès',
      });
      setShowExportModal(false);
      await loadExports();
    } catch (error: any) {
      setInlineAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Erreur lors de la création',
      });
    } finally {
      setCreating(false);
    }
  };

  // Télécharger un export
  const handleDownload = async (exportItem: ExportComptable) => {
    if (exportItem.statut !== 'completed') {
      setInlineAlert({
        variant: 'warning',
        message: 'Export en cours de génération',
      });
      return;
    }

    try {
      await downloadExport(exportItem.id!, exportItem.fichierNom);
      setInlineAlert({
        variant: 'success',
        message: 'Téléchargement démarré',
      });
    } catch (error: any) {
      setInlineAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Erreur lors du téléchargement',
      });
    }
  };

  // Supprimer un export (confirmation native)
  const confirmDelete = (id: string) => {
    RNAlert.alert(
      'Supprimer l’export',
      'Voulez-vous vraiment supprimer cet export ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => handleDelete(id),
        },
      ]
    );
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExport(id);
      setInlineAlert({
        variant: 'success',
        message: 'Export supprimé',
      });
      await loadExports();
    } catch (error: any) {
      setInlineAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Erreur lors de la suppression',
      });
    }
  };

  // Générer le FEC
  const handleGenerateFEC = async (year: number) => {
    setCreating(true);
    try {
      const response = await generateFEC({ year });

      if (response.status === 'success' && response.downloadUrl) {
        setInlineAlert({
          variant: 'success',
          message: 'FEC généré avec succès',
        });
        await downloadFEC(year);
      } else {
        setInlineAlert({
          variant: 'info',
          message: 'Génération en cours, vous serez notifié',
        });
      }

      setShowFECModal(false);
      await loadExports();
    } catch (error: any) {
      setInlineAlert({
        variant: 'error',
        title: 'Erreur',
        message: error?.message || 'Erreur lors de la génération du FEC',
      });
    } finally {
      setCreating(false);
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
      quickActions: {
        flexDirection: 'row' as const,
        marginBottom: padLg,
      },
      fecCard: {
        flex: 2,
        backgroundColor: `${COLORS.primary}10`,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 2,
        borderColor: COLORS.primary,
        padding: padLg,
        marginRight: padSm,
        ...SHADOWS.md,
      },
      fecIcon: {
        width: 56,
        height: 56,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: `${COLORS.primary}20`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginBottom: padSm,
      },
      fecTitle: {
        fontSize: fs(screenType, 'xl'),
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        color: COLORS.text.primary,
        marginBottom: padXs,
      },
      fecSubtitle: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.text.secondary,
        marginBottom: padSm,
      },
      fecBadge: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        alignSelf: 'flex-start' as const,
        backgroundColor: `${COLORS.success}20`,
        paddingHorizontal: padSm,
        paddingVertical: padXs,
        borderRadius: BORDER_RADIUS.sm,
      },
      fecBadgeText: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.success,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginLeft: 6,
      },
      quickActionCard: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: padLg,
        alignItems: 'center' as const,
        marginLeft: padSm,
        ...SHADOWS.sm,
      },
      quickActionIconWrap: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: `${COLORS.info}20`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginBottom: padSm,
      },
      quickActionTitle: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padXs,
      },
      quickActionSubtitle: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.text.secondary,
        textAlign: 'center' as const,
      },

      listHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        marginBottom: padMd,
      },
      listTitle: {
        fontSize: fs(screenType, 'xl'),
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        color: COLORS.text.primary,
      },
      listContent: {
        paddingBottom: padLg,
      },

      itemCard: {
        padding: padLg,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      exportHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginBottom: padMd,
      },
      exportIcon: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: `${COLORS.primary}15`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: padMd,
      },
      exportInfo: {
        flex: 1,
      },
      exportName: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padXs,
      },
      exportPeriod: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.text.secondary,
      },
      exportMeta: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingVertical: padMd,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border.light,
        marginBottom: padMd,
      },
      metaItem: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginRight: padLg,
      },
      metaText: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.text.secondary,
        marginLeft: 6,
      },
      exportActions: {
        flexDirection: 'row' as const,
      },
      actionSpacer: {
        width: padSm,
      },

      // empty state
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

      // modal
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
      modalContent: {
        flex: 1,
        padding: padLg,
      },
      modalSection: {
        padding: padLg,
        marginBottom: padMd,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      modalSectionTitle: {
        fontSize: fs(screenType, 'lg'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padMd,
      },

      // format grid
      formatRow: {
        flexDirection: 'row' as const,
      },
      formatOption: {
        flex: 1,
        padding: padMd,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border.light,
        alignItems: 'center' as const,
        marginRight: padSm,
      },
      formatOptionLast: {
        marginRight: 0,
      },
      formatOptionActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}10`,
      },
      formatLabel: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.text.secondary,
        marginTop: 6,
      },
      formatLabelActive: {
        color: COLORS.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },

      // period
      dateRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        marginBottom: padSm,
      },
      dateLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },
      dateValue: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
      },

      // options
      optionRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginTop: padSm,
      },
      checkbox: {
        width: 20,
        height: 20,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 2,
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primary,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: padSm,
      },
      optionLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
      },

      // modal actions
      modalActions: {
        flexDirection: 'row' as const,
        padding: padLg,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      },

      // FEC modal (overlay)
      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        padding: padLg,
      },
      fecModal: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: padLg,
        ...SHADOWS.lg,
      },
      fecModalHeader: {
        alignItems: 'center' as const,
        marginBottom: padLg,
      },
      fecModalIcon: {
        width: 64,
        height: 64,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: `${COLORS.success}20`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginBottom: padMd,
      },
      fecModalTitle: {
        fontSize: fs(screenType, 'xl'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padXs,
      },
      fecModalSubtitle: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
        textAlign: 'center' as const,
      },
      fecModalContent: {
        marginBottom: padLg,
      },
      fecLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
        marginBottom: padSm,
      },
      yearRow: {
        flexDirection: 'row' as const,
        marginBottom: padMd,
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
      yearOptionLast: {
        marginRight: 0,
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
      fecWarning: {
        flexDirection: 'row' as const,
        padding: padMd,
        backgroundColor: `${COLORS.warning}15`,
        borderRadius: BORDER_RADIUS.md,
      },
      fecWarningText: {
        flex: 1,
        fontSize: fs(screenType, 'xs'),
        color: COLORS.warning,
        marginLeft: padSm,
      },
      fecModalActions: {
        flexDirection: 'row' as const,
      },
    } as const;
  }, [screenType]);

  // Rendu d'un export
  const renderExport = ({ item }: { item: ExportComptable }) => {
    return (
      <Card style={styles.itemCard}>
        <View style={styles.exportHeader}>
          <View style={styles.exportIcon}>
            <Ionicons name={getExportIcon(item.typeExport)} size={24} color={COLORS.primary} />
          </View>

          <View style={styles.exportInfo}>
            <Text style={styles.exportName}>{item.fichierNom}</Text>
            <Text style={styles.exportPeriod}>
              {formatDate(item.periodeDebut)} — {formatDate(item.periodeFin)}
            </Text>
          </View>

          <Badge
            text={getStatusLabel(item.statut)}
            variant={getStatusVariant(item.statut)}
          />
        </View>

        <View style={styles.exportMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="document-text-outline" size={16} color={COLORS.text.secondary} />
            <Text style={styles.metaText}>{item.nombreLignes || 0} lignes</Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons name="cloud-outline" size={16} color={COLORS.text.secondary} />
            <Text style={styles.metaText}>{formatFileSize(item.fichierTaille || 0)}</Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={COLORS.text.secondary} />
            <Text style={styles.metaText}>{formatDate(item.createdAt!)}</Text>
          </View>
        </View>

        <View style={styles.exportActions}>
          {item.statut === 'completed' && (
            <>
              <Button
                title="Télécharger"
                variant="outline"
                size="sm"
                onPress={() => handleDownload(item)}
                style={{ flex: 1 }}
                leftIcon={<Ionicons name="download-outline" size={16} color={COLORS.primary} />}
              />
              <View style={styles.actionSpacer} />
            </>
          )}

          <Button
            title="Supprimer"
            variant="outline"
            size="sm"
            onPress={() => confirmDelete(item.id!)}
            style={{ flex: 1 }}
            leftIcon={<Ionicons name="trash-outline" size={16} color={COLORS.error} />}
          />
        </View>
      </Card>
    );
  };

  // Séparateur entre items
  const renderSeparator = () => <View style={{ height: s(screenType, 'md') }} />;

  // Liste vide
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="folder-open-outline" size={64} color={COLORS.text.secondary} />
      <Text style={styles.emptyTitle}>Aucun export</Text>
      <Text style={styles.emptyText}>Créez votre premier export comptable</Text>
      <View style={{ height: s(screenType, 'md') }} />
      <Button title="Créer un export" onPress={() => setShowExportModal(true)} />
    </View>
  );

  if (exportsLoading && exports.length === 0) {
    return <Loading text="Chargement des exports..." />;
  }

  return (
    <View style={styles.container}>
      {/* Inline / top alerts */}
      {inlineAlert && (
        <View style={{ marginBottom: s(screenType, 'md') }}>
          <UIAbortableAlert {...inlineAlert} />
        </View>
      )}
      {exportsError && (
        <View style={{ marginBottom: s(screenType, 'md') }}>
          <UIAlert variant="error" title="Erreur" message={exportsError} />
        </View>
      )}

      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.title}>Exports comptables</Text>
        <Text style={styles.subtitle}>
          Générez et téléchargez vos données comptables
        </Text>
      </View>

      {/* Actions rapides */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.fecCard}
          onPress={() => setShowFECModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Générer le FEC"
        >
          <View style={styles.fecIcon}>
            <Ionicons name="document-text" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.fecTitle}>Générer le FEC</Text>
          <Text style={styles.fecSubtitle}>Fichier des Écritures Comptables (légal)</Text>
          <View style={styles.fecBadge}>
            <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
            <Text style={styles.fecBadgeText}>Conforme DGFiP</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionCard}
          onPress={() => setShowExportModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Créer un export"
        >
          <View style={styles.quickActionIconWrap}>
            <Ionicons name="download" size={24} color={COLORS.info} />
          </View>
          <Text style={styles.quickActionTitle}>Nouvel export</Text>
          <Text style={styles.quickActionSubtitle}>CSV, Excel ou PDF personnalisé</Text>
        </TouchableOpacity>
      </View>

      {/* Liste des exports */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Historique des exports</Text>
      </View>

      <FlatList
        data={exports}
        renderItem={renderExport}
        keyExtractor={(item) => item.id!}
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={renderSeparator}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.listContent}
      />

      {/* Modal création export */}
      <CreateExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        onCreate={handleCreateExport}
        loading={creating}
      />

      {/* Modal génération FEC */}
      <GenerateFECModal
        visible={showFECModal}
        onClose={() => setShowFECModal(false)}
        onGenerate={handleGenerateFEC}
        loading={creating}
      />
    </View>
  );
};

// Petit wrapper pour que l’alerte inline disparaisse d’elle-même
const UIAbortableAlert: React.FC<{
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
}> = ({ variant, title, message }) => {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <UIAlert
      variant={variant}
      title={title}
      message={message}
      onDismiss={() => setVisible(false)}
      autoDismiss
    />
  );
};

// ============================================================================
// COMPOSANTS ENFANTS
// ============================================================================

interface CreateExportModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: CreateExportRequest) => void;
  loading: boolean;
}

const CreateExportModal: React.FC<CreateExportModalProps> = ({
  visible,
  onClose,
  onCreate,
  loading,
}) => {
  const screenType = useScreenType();
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.CSV);
  const [dateDebut, setDateDebut] = useState(new Date(new Date().getFullYear(), 0, 1));
  const [dateFin, setDateFin] = useState(new Date());
  const [includeDetails, setIncludeDetails] = useState(true);

  const styles = useMemo(() => {
    const padLg = s(screenType, 'lg');
    const padMd = s(screenType, 'md');
    const padSm = s(screenType, 'sm');

    return {
      modalContainer: { flex: 1, backgroundColor: COLORS.background },
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
      modalContent: { flex: 1, padding: padLg },
      modalSection: {
        padding: padLg,
        marginBottom: padMd,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      modalSectionTitle: {
        fontSize: fs(screenType, 'lg'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padMd,
      },
      formatRow: { flexDirection: 'row' as const },
      formatOption: {
        flex: 1,
        padding: padMd,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border.light,
        alignItems: 'center' as const,
        marginRight: padSm,
      },
      formatOptionLast: { marginRight: 0 },
      formatOptionActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}10`,
      },
      formatLabel: {
        fontSize: fs(screenType, 'xs'),
        color: COLORS.text.secondary,
        marginTop: 6,
      },
      formatLabelActive: {
        color: COLORS.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      dateRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: padSm,
      },
      dateLabel: { fontSize: fs(screenType, 'base'), color: COLORS.text.secondary },
      dateValue: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
      },
      optionRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginTop: padSm,
      },
      checkbox: {
        width: 20,
        height: 20,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 2,
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primary,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: padSm,
      },
      optionLabel: { fontSize: fs(screenType, 'base'), color: COLORS.text.primary },
      modalActions: {
        flexDirection: 'row' as const,
        padding: padLg,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      },
    } as const;
  }, [screenType]);

  const handleCreate = () => {
    onCreate({
      typeExport: format,
      periodeDebut: dateDebut.toISOString().split('T')[0],
      periodeFin: dateFin.toISOString().split('T')[0],
      includeDetails,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Nouvel export</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer">
            <Ionicons name="close" size={28} color={COLORS.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {/* Format */}
          <Card style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Format d'export</Text>
            <View style={styles.formatRow}>
              {[
                { value: ExportFormat.CSV, label: 'CSV', icon: 'list' },
                { value: ExportFormat.EXCEL, label: 'Excel', icon: 'grid' },
                { value: ExportFormat.PDF, label: 'PDF', icon: 'document' },
              ].map((option, idx, arr) => {
                const active = format === (option.value as ExportFormat);
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.formatOption,
                      idx === arr.length - 1 && styles.formatOptionLast,
                      active && styles.formatOptionActive,
                    ]}
                    onPress={() => setFormat(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={24}
                      color={active ? COLORS.primary : COLORS.text.secondary}
                    />
                    <Text
                      style={[styles.formatLabel, active && styles.formatLabelActive]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          {/* Période */}
          <Card style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Période</Text>

            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Date de début</Text>
              <Text style={styles.dateValue}>{formatDate(dateDebut.toISOString())}</Text>
            </View>

            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Date de fin</Text>
              <Text style={styles.dateValue}>{formatDate(dateFin.toISOString())}</Text>
            </View>
          </Card>

          {/* Options */}
          <Card style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Options</Text>

            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setIncludeDetails(!includeDetails)}
            >
              <View style={styles.checkbox}>
                {includeDetails && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
              <Text style={styles.optionLabel}>Inclure les détails des transactions</Text>
            </TouchableOpacity>
          </Card>
        </ScrollView>

        <View style={styles.modalActions}>
          <Button
            title="Annuler"
            variant="outline"
            onPress={onClose}
            style={{ flex: 1 }}
            disabled={loading}
          />
          <Button
            title="Créer l'export"
            onPress={handleCreate}
            loading={loading}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
};

interface GenerateFECModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (year: number) => void;
  loading: boolean;
}

const GenerateFECModal: React.FC<GenerateFECModalProps> = ({
  visible,
  onClose,
  onGenerate,
  loading,
}) => {
  const screenType = useScreenType();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const styles = useMemo(() => {
    const padLg = s(screenType, 'lg');
    const padMd = s(screenType, 'md');
    const padSm = s(screenType, 'sm');
    const padXs = s(screenType, 'xs');

    return {
      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        padding: padLg,
      },
      fecModal: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: padLg,
        ...SHADOWS.lg,
      },
      fecModalHeader: { alignItems: 'center' as const, marginBottom: padLg },
      fecModalIcon: {
        width: 64,
        height: 64,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: `${COLORS.success}20`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginBottom: padMd,
      },
      fecModalTitle: {
        fontSize: fs(screenType, 'xl'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        marginBottom: padXs,
      },
      fecModalSubtitle: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
        textAlign: 'center' as const,
      },
      fecModalContent: { marginBottom: padLg },
      fecLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        fontWeight: TYPOGRAPHY.fontWeight.medium,
        marginBottom: padSm,
      },
      yearRow: { flexDirection: 'row' as const, marginBottom: padMd },
      yearOption: {
        flex: 1,
        padding: padMd,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border.light,
        alignItems: 'center' as const,
        marginRight: padSm,
      },
      yearOptionLast: { marginRight: 0 },
      yearOptionActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}15`,
      },
      yearOptionText: { fontSize: fs(screenType, 'base'), color: COLORS.text.secondary },
      yearOptionTextActive: {
        color: COLORS.primary,
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
      },
      fecWarning: {
        flexDirection: 'row' as const,
        padding: padMd,
        backgroundColor: `${COLORS.warning}15`,
        borderRadius: BORDER_RADIUS.md,
      },
      fecWarningText: {
        flex: 1,
        fontSize: fs(screenType, 'xs'),
        color: COLORS.warning,
        marginLeft: padSm,
      },
      fecModalActions: { flexDirection: 'row' as const },
    } as const;
  }, [screenType]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.fecModal}>
          <View style={styles.fecModalHeader}>
            <View style={styles.fecModalIcon}>
              <Ionicons name="shield-checkmark" size={32} color={COLORS.success} />
            </View>
            <Text style={styles.fecModalTitle}>Générer le FEC</Text>
            <Text style={styles.fecModalSubtitle}>
              Fichier des Écritures Comptables conforme DGFiP
            </Text>
          </View>

          <View style={styles.fecModalContent}>
            <Text style={styles.fecLabel}>Exercice fiscal</Text>
            <View style={styles.yearRow}>
              {[currentYear, currentYear - 1, currentYear - 2].map((y, idx, arr) => {
                const active = year === y;
                return (
                  <TouchableOpacity
                    key={y}
                    style={[
                      styles.yearOption,
                      idx === arr.length - 1 && styles.yearOptionLast,
                      active && styles.yearOptionActive,
                    ]}
                    onPress={() => setYear(y)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.yearOptionText,
                        active && styles.yearOptionTextActive,
                      ]}
                    >
                      {y}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.fecWarning}>
              <Ionicons name="information-circle" size={20} color={COLORS.warning} />
              <Text style={styles.fecWarningText}>
                La génération du FEC peut prendre quelques minutes.
                Vous recevrez une notification une fois terminé.
              </Text>
            </View>
          </View>

          <View style={styles.fecModalActions}>
            <Button
              title="Annuler"
              variant="outline"
              onPress={onClose}
              style={{ flex: 1 }}
              disabled={loading}
            />
            <Button
              title="Générer"
              onPress={() => onGenerate(year)}
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

function getExportIcon(format: ExportFormat): any {
  const icons: Record<ExportFormat, any> = {
    FEC: 'document-text',
    CSV: 'list',
    EXCEL: 'grid',
    PDF: 'document',
  };
  return icons[format] || 'document';
}

function getStatusLabel(status: ExportStatus): string {
  const labels: Record<ExportStatus, string> = {
    pending: 'En attente',
    processing: 'En cours',
    completed: 'Terminé',
    failed: 'Échoué',
  };
  return labels[status] || status;
}

function getStatusVariant(status: ExportStatus): 'default' | 'success' | 'error' | 'warning' {
  const variants: Record<ExportStatus, any> = {
    pending: 'default',
    processing: 'warning',
    completed: 'success',
    failed: 'error',
  };
  return variants[status] || 'default';
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}