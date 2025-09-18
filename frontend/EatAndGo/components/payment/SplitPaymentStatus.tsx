import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY,
  COMPONENT_CONSTANTS,
} from '@/utils/designSystem';
import { SplitPaymentSession, SplitPaymentPortion } from '@/types/splitPayment';

interface SplitPaymentStatusProps {
  session: SplitPaymentSession;
  currentUserPortionId?: string;
  onPayPortion: (portionId: string) => void;
  onPayAllRemaining?: () => void;
  isProcessing?: boolean;
}

export const SplitPaymentStatus: React.FC<SplitPaymentStatusProps> = ({
  session,
  currentUserPortionId,
  onPayPortion,
  onPayAllRemaining,
  isProcessing = false,
}) => {
  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);

  const formatCurrency = (amount: number) => `${amount.toFixed(2)} €`;

  const safeParseFloat = (value: any, fallback = 0): number => {
    if (typeof value === 'number' && !isNaN(value)) return value;
    const parsed = parseFloat(String(value || fallback));
    return isNaN(parsed) ? fallback : parsed;
  };
  
  const paidPortions = session.portions.filter(p => p.isPaid);
  const unpaidPortions = session.portions.filter(p => !p.isPaid);
  const totalPaid = paidPortions.reduce((sum, p) => sum + safeParseFloat(p.amount), 0);
  const totalRemaining = unpaidPortions.reduce((sum, p) => sum + safeParseFloat(p.amount), 0);
  
  // Calcul sécurisé du progrès
  const sessionTotal = safeParseFloat(session.totalAmount) + safeParseFloat(session.tipAmount);
  const progress = sessionTotal > 0 ? (totalPaid / sessionTotal) * 100 : 0;

  const customStyles: { [key: string]: any } = {
    container: {
      gap: getResponsiveValue(SPACING.lg, screenType),
    },
    
    // Carte de progression avec effet visuel premium
    progressCard: {
      position: 'relative' as const,
      overflow: 'hidden' as const,
      backgroundColor: session.isCompleted ? COLORS.success + '08' : COLORS.primary + '08',
      borderWidth: 2,
      borderColor: session.isCompleted ? COLORS.success + '30' : COLORS.primary + '30',
      ...SHADOWS.lg,
    },
    
    progressGradient: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.1,
    },
    
    progressHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      zIndex: 1,
    },
    
    progressIconContainer: {
      width: getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType),
      height: getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType),
      backgroundColor: session.isCompleted ? COLORS.success : COLORS.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      ...SHADOWS.md,
    },
    
    progressTitleContainer: {
      flex: 1,
    },
    
    progressTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: session.isCompleted ? COLORS.success : COLORS.primary,
      lineHeight: getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType),
    },
    
    progressSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    
    progressPercent: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: session.isCompleted ? COLORS.success : COLORS.primary,
      textAlign: 'center' as const,
      minWidth: getResponsiveValue({ mobile: 60, tablet: 70, desktop: 80 }, screenType),
    },
    
    // Barre de progression avec animation fluide
    progressBarContainer: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    
    progressBarTrack: {
      height: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      backgroundColor: COLORS.border.light,
      borderRadius: getResponsiveValue({ mobile: 6, tablet: 7, desktop: 8 }, screenType),
      overflow: 'hidden' as const,
      ...SHADOWS.sm,
    },
    
    progressBarFill: {
      height: '100%' as const,
      borderRadius: getResponsiveValue({ mobile: 6, tablet: 7, desktop: 8 }, screenType),
      minWidth: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
    },
    
    progressStats: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    
    progressStat: {
      flex: 1,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.surface + '80',
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.sm,
    },
    
    progressStatValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    
    progressStatLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    
    // Section des portions avec design premium
    portionsSection: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    
    portionsTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },
    
    portionsList: {
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    
    portionItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 2,
      ...SHADOWS.md,
      minHeight: getResponsiveValue({ mobile: 72, tablet: 80, desktop: 88 }, screenType),
    },
    
    portionPaid: {
      borderColor: COLORS.success + '40',
      backgroundColor: COLORS.success + '05',
    },
    
    portionCurrent: {
      borderColor: COLORS.secondary + '40',
      backgroundColor: COLORS.secondary + '05',
      ...SHADOWS.lg,
      transform: [{ scale: 1.02 }],
    },
    
    portionPending: {
      borderColor: COLORS.border.light,
      backgroundColor: COLORS.surface,
      opacity: 0.8,
    },
    
    // Icônes des portions avec design amélioré
    portionIconContainer: {
      width: getResponsiveValue({ mobile: 48, tablet: 54, desktop: 60 }, screenType),
      height: getResponsiveValue({ mobile: 48, tablet: 54, desktop: 60 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 24, tablet: 27, desktop: 30 }, screenType),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
      ...SHADOWS.sm,
    },
    
    portionIconPaid: {
      backgroundColor: COLORS.success,
    },
    
    portionIconCurrent: {
      backgroundColor: COLORS.secondary,
    },
    
    portionIconPending: {
      backgroundColor: COLORS.text.light,
    },
    
    portionInfo: {
      flex: 1,
      gap: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    
    portionName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    
    portionAmount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    
    portionStatus: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    portionStatusPaid: {
      color: COLORS.success,
    },
    
    portionStatusCurrent: {
      color: COLORS.secondary,
    },
    
    portionStatusPending: {
      color: COLORS.text.light,
    },
    
    portionAction: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
    
    // Actions globales avec design premium
    globalActionsCard: {
      backgroundColor: COLORS.surface,
      borderWidth: 2,
      borderColor: COLORS.border.light,
      gap: getResponsiveValue(SPACING.md, screenType),
      ...SHADOWS.lg,
    },
    
    globalActionButton: {
      borderRadius: BORDER_RADIUS.xl,
      ...SHADOWS.md,
    },
    
    globalActionHint: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontStyle: 'italic' as const,
    },
    
    // État de complétion avec animation et confettis visuels
    completedCard: {
      backgroundColor: COLORS.success + '08',
      borderWidth: 2,
      borderColor: COLORS.success + '30',
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.xl, screenType),
      position: 'relative' as const,
      overflow: 'hidden' as const,
      ...SHADOWS.lg,
    },
    
    completedBackground: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.1,
    },
    
    completedIconContainer: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      position: 'relative' as const,
    },
    
    completedIconGlow: {
      position: 'absolute' as const,
      top: -8,
      left: -8,
      right: -8,
      bottom: -8,
      borderRadius: 50,
      backgroundColor: COLORS.success + '20',
    },
    
    completedTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.success,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      textAlign: 'center' as const,
    },
    
    completedMessage: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue({ mobile: 22, tablet: 24, desktop: 26 }, screenType),
    },
    
    completedStats: {
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: getResponsiveValue(SPACING.lg, screenType),
      marginTop: getResponsiveValue(SPACING.lg, screenType),
      paddingTop: getResponsiveValue(SPACING.md, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.success + '20',
    },
    
    completedStat: {
      alignItems: 'center' as const,
    },
    
    completedStatValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.success,
    },
    
    completedStatLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
  };

  const iconSize = getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType);
  const largeIconSize = getResponsiveValue({ mobile: 32, tablet: 38, desktop: 44 }, screenType);

  const getPortionIcon = (portion: SplitPaymentPortion) => {
    if (portion.isPaid) return 'checkmark-circle';
    if (portion.id === currentUserPortionId) return 'card';
    return 'time-outline';
  };

  const getPortionIconColor = (portion: SplitPaymentPortion) => {
    return COLORS.surface;
  };

  const renderProgressBar = () => {
    const progressColor = session.isCompleted ? COLORS.success : COLORS.primary;

    return (
      <View style={customStyles.progressBarContainer}>
        <View style={customStyles.progressBarTrack}>
          <View
            style={[
              customStyles.progressBarFill,
              { 
                width: `${Math.min(progress, 100)}%`,
                backgroundColor: progressColor,
              }
            ]}
          />
        </View>
      </View>
    );
  };

  const renderPortion = (portion: SplitPaymentPortion) => {
    const isPaid = portion.isPaid;
    const isCurrent = portion.id === currentUserPortionId;
    const isPending = !isPaid && !isCurrent;
    
    return (
      <View
        key={portion.id}
        style={[
          customStyles.portionItem,
          isPaid && customStyles.portionPaid,
          isCurrent && customStyles.portionCurrent,
          isPending && customStyles.portionPending,
        ]}
      >
        <View style={[
          customStyles.portionIconContainer,
          isPaid && customStyles.portionIconPaid,
          isCurrent && customStyles.portionIconCurrent,
          isPending && customStyles.portionIconPending,
        ]}>
          <Ionicons
            name={getPortionIcon(portion)}
            size={iconSize}
            color={getPortionIconColor(portion)}
          />
        </View>
        
        <View style={customStyles.portionInfo}>
          <Text style={customStyles.portionName}>
            {portion.name || 'Anonyme'}
          </Text>
          <Text style={customStyles.portionAmount}>
            {formatCurrency(portion.amount)}
          </Text>
          
          <Text style={[
            customStyles.portionStatus,
            isPaid && customStyles.portionStatusPaid,
            isCurrent && customStyles.portionStatusCurrent,
            isPending && customStyles.portionStatusPending,
          ]}>
            {isPaid && `Payé le ${new Date(portion.paidAt!).toLocaleString('fr-FR', { 
              day: '2-digit', 
              month: '2-digit', 
              hour: '2-digit', 
              minute: '2-digit' 
            })}`}
            {isCurrent && '💳 Votre part'}
            {isPending && '⏳ En attente'}
          </Text>
        </View>
        
        {isCurrent && !isPaid && (
          <View style={customStyles.portionAction}>
            <Button
              title={`Payer ${formatCurrency(portion.amount)}`}
              onPress={() => onPayPortion(portion.id)}
              size="sm"
              disabled={isProcessing}
              loading={isProcessing}
              style={{ borderRadius: BORDER_RADIUS.xl }}
            />
          </View>
        )}
      </View>
    );
  };

  if (session.isCompleted) {
    return (
      <Card style={[customStyles.container, customStyles.completedCard]}>
        <View style={customStyles.completedIconContainer}>
          <View style={customStyles.completedIconGlow} />
          <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
        </View>
        
        <Text style={customStyles.completedTitle}>
          🎉 Paiement terminé !
        </Text>
        
        <Text style={customStyles.completedMessage}>
          Tous les paiements ont été effectués avec succès.
          {session.completedAt && `\n\nTerminé le ${new Date(session.completedAt).toLocaleString('fr-FR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
          })}`}
        </Text>

        <View style={customStyles.completedStats}>
          <View style={customStyles.completedStat}>
            <Text style={customStyles.completedStatValue}>
              {formatCurrency(session.totalAmount + session.tipAmount)}
            </Text>
            <Text style={customStyles.completedStatLabel}>Total</Text>
          </View>
          
          <View style={customStyles.completedStat}>
            <Text style={customStyles.completedStatValue}>
              {session.portions.length}
            </Text>
            <Text style={customStyles.completedStatLabel}>Personnes</Text>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <View style={customStyles.container}>
      {/* Progression globale avec design premium */}
      <Card style={customStyles.progressCard}>
        <View style={customStyles.progressHeader}>
          <View style={customStyles.progressIconContainer}>
            <Ionicons 
              name="people" 
              size={largeIconSize} 
              color={COLORS.surface} 
            />
          </View>
          
          <View style={customStyles.progressTitleContainer}>
            <Text style={customStyles.progressTitle}>
              Paiement divisé
            </Text>
            <Text style={customStyles.progressSubtitle}>
              {session.splitType === 'equal' ? '⚖️ Répartition équitable' : '🎯 Montants personnalisés'}
            </Text>
          </View>
          
          <Text style={customStyles.progressPercent}>
            {Math.round(progress)}%
          </Text>
        </View>
        
        {renderProgressBar()}
        
        <View style={customStyles.progressStats}>
          <View style={customStyles.progressStat}>
            <Text style={customStyles.progressStatValue}>{formatCurrency(totalPaid)}</Text>
            <Text style={customStyles.progressStatLabel}>✅ Payé</Text>
          </View>
          
          <View style={customStyles.progressStat}>
            <Text style={customStyles.progressStatValue}>{formatCurrency(totalRemaining)}</Text>
            <Text style={customStyles.progressStatLabel}>⏳ Restant</Text>
          </View>
          
          <View style={customStyles.progressStat}>
            <Text style={customStyles.progressStatValue}>{paidPortions.length}/{session.portions.length}</Text>
            <Text style={customStyles.progressStatLabel}>👥 Personnes</Text>
          </View>
        </View>
      </Card>

      {/* Liste des portions avec design amélioré */}
      <Card style={customStyles.portionsSection}>
        <Text style={customStyles.portionsTitle}>
          📋 Détail des paiements
        </Text>
        
        <View style={customStyles.portionsList}>
          {session.portions.map(renderPortion)}
        </View>
      </Card>

      {/* Actions globales avec design premium */}
      {unpaidPortions.length > 1 && onPayAllRemaining && (
        <Card style={customStyles.globalActionsCard}>
          <Button
            title={`💳 Payer le reste (${formatCurrency(totalRemaining)})`}
            onPress={onPayAllRemaining}
            disabled={isProcessing}
            loading={isProcessing}
            variant="secondary"
            fullWidth
            style={customStyles.globalActionButton}
          />
          
          <Text style={customStyles.globalActionHint}>
            💡 Vous pouvez payer pour les autres personnes qui n'ont pas encore réglé leur part
          </Text>
        </Card>
      )}
    </View>
  );
};