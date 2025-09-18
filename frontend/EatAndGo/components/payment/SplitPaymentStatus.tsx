import React from 'react';
import {
  View,
  Text,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';
import { SplitPaymentSession, SplitPaymentPortion } from '@/types/splitPayment';

interface SplitPaymentStatusProps {
  session: SplitPaymentSession;
  currentUserPortionId?: string; // ID de la portion que l'utilisateur actuel va payer
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

  const formatCurrency = (amount: number) => `${amount.toFixed(2)} €`;

  const paidPortions = session.portions.filter(p => p.isPaid);
  const unpaidPortions = session.portions.filter(p => !p.isPaid);
  const totalPaid = paidPortions.reduce((sum, p) => sum + p.amount, 0);
  const totalRemaining = unpaidPortions.reduce((sum, p) => sum + p.amount, 0);
  const progress = (totalPaid / (session.totalAmount + session.tipAmount)) * 100;

  const styles = {
    container: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    
    progressCard: {
      backgroundColor: session.isCompleted ? COLORS.success + '10' : COLORS.primary + '10',
      borderColor: session.isCompleted ? COLORS.success + '30' : COLORS.primary + '30',
      borderWidth: 1,
    },
    
    progressHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    progressTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600' as const,
      color: session.isCompleted ? COLORS.success : COLORS.primary,
      flex: 1,
    },
    
    progressPercent: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: 'bold' as const,
      color: session.isCompleted ? COLORS.success : COLORS.primary,
    },
    
    progressBar: {
      height: getResponsiveValue({ mobile: 8, tablet: 10, desktop: 12 }, screenType),
      backgroundColor: COLORS.border.light,
      borderRadius: getResponsiveValue({ mobile: 4, tablet: 5, desktop: 6 }, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      overflow: 'hidden' as const,
    },
    
    progressFill: {
      height: '100%' as const,
      backgroundColor: session.isCompleted ? COLORS.success : COLORS.primary,
      borderRadius: getResponsiveValue({ mobile: 4, tablet: 5, desktop: 6 }, screenType),
    },
    
    progressStats: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
    },
    
    progressStat: {
      alignItems: 'center' as const,
    },
    
    progressStatValue: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    
    progressStatLabel: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    
    portionsTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    
    portionItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      borderWidth: 1,
      shadowColor: COLORS.shadow?.default,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    
    portionPaid: {
      borderColor: COLORS.success + '50',
      backgroundColor: COLORS.success + '05',
    },
    
    portionCurrent: {
      borderColor: COLORS.secondary + '50',
      backgroundColor: COLORS.secondary + '05',
    },
    
    portionPending: {
      borderColor: COLORS.border.light,
      backgroundColor: COLORS.surface,
    },
    
    portionIcon: {
      width: getResponsiveValue({ mobile: 36, tablet: 40, desktop: 44 }, screenType),
      height: getResponsiveValue({ mobile: 36, tablet: 40, desktop: 44 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
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
    },
    
    portionName: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    
    portionAmount: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      color: COLORS.text.secondary,
    },
    
    portionStatus: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      fontWeight: '500' as const,
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
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
    
    actionsCard: {
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    
    completedCard: {
      backgroundColor: COLORS.success + '10',
      borderColor: COLORS.success + '30',
      borderWidth: 1,
      alignItems: 'center' as const,
    },
    
    completedIcon: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    completedTitle: {
      fontSize: getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType),
      fontWeight: 'bold' as const,
      color: COLORS.success,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },
    
    completedMessage: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
    },
  };

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType);

  const getPortionIcon = (portion: SplitPaymentPortion) => {
    if (portion.isPaid) return 'checkmark';
    if (portion.id === currentUserPortionId) return 'card';
    return 'time';
  };

  const getPortionIconColor = (portion: SplitPaymentPortion) => {
    if (portion.isPaid) return COLORS.surface;
    if (portion.id === currentUserPortionId) return COLORS.text.primary;
    return COLORS.surface;
  };

  if (session.isCompleted) {
    return (
      <Card style={[styles.container, styles.completedCard]}>
        <View style={styles.completedIcon}>
          <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
        </View>
        <Text style={styles.completedTitle}>Paiement terminé !</Text>
        <Text style={styles.completedMessage}>
          Tous les paiements ont été effectués avec succès.
          {session.completedAt && `\nTerminé le ${new Date(session.completedAt).toLocaleString('fr-FR')}`}
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progression globale */}
      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Ionicons name="people" size={iconSize} color={session.isCompleted ? COLORS.success : COLORS.primary} />
          <Text style={styles.progressTitle}>
            Paiement divisé - {session.splitType === 'equal' ? 'Équitable' : 'Personnalisé'}
          </Text>
          <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
        </View>
        
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
        </View>
        
        <View style={styles.progressStats}>
          <View style={styles.progressStat}>
            <Text style={styles.progressStatValue}>{formatCurrency(totalPaid)}</Text>
            <Text style={styles.progressStatLabel}>Payé</Text>
          </View>
          
          <View style={styles.progressStat}>
            <Text style={styles.progressStatValue}>{formatCurrency(totalRemaining)}</Text>
            <Text style={styles.progressStatLabel}>Restant</Text>
          </View>
          
          <View style={styles.progressStat}>
            <Text style={styles.progressStatValue}>{paidPortions.length}/{session.portions.length}</Text>
            <Text style={styles.progressStatLabel}>Personnes</Text>
          </View>
        </View>
      </Card>

      {/* Liste des portions */}
      <Card style={styles.container}>
        <Text style={styles.portionsTitle}>Détail des paiements</Text>
        
        <ScrollView showsVerticalScrollIndicator={false}>
          {session.portions.map((portion) => {
            const isPaid = portion.isPaid;
            const isCurrent = portion.id === currentUserPortionId;
            const isPending = !isPaid && !isCurrent;
            
            return (
              <View
                key={portion.id}
                style={[
                  styles.portionItem,
                  isPaid && styles.portionPaid,
                  isCurrent && styles.portionCurrent,
                  isPending && styles.portionPending,
                ]}
              >
                <View style={[
                  styles.portionIcon,
                  isPaid && styles.portionIconPaid,
                  isCurrent && styles.portionIconCurrent,
                  isPending && styles.portionIconPending,
                ]}>
                  <Ionicons
                    name={getPortionIcon(portion)}
                    size={iconSize}
                    color={getPortionIconColor(portion)}
                  />
                </View>
                
                <View style={styles.portionInfo}>
                  <Text style={styles.portionName}>{portion.name || 'Anonyme'}</Text>
                  <Text style={styles.portionAmount}>{formatCurrency(portion.amount)}</Text>
                  
                  <Text style={[
                    styles.portionStatus,
                    isPaid && styles.portionStatusPaid,
                    isCurrent && styles.portionStatusCurrent,
                    isPending && styles.portionStatusPending,
                  ]}>
                    {isPaid && `Payé le ${new Date(portion.paidAt!).toLocaleString('fr-FR', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}`}
                    {isCurrent && 'Votre part'}
                    {isPending && 'En attente'}
                  </Text>
                </View>
                
                {isCurrent && !isPaid && (
                  <View style={styles.portionAction}>
                    <Button
                      title={`Payer ${formatCurrency(portion.amount)}`}
                      onPress={() => onPayPortion(portion.id)}
                      size="sm"
                      disabled={isProcessing}
                      loading={isProcessing}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </Card>

      {/* Actions globales */}
      {unpaidPortions.length > 1 && onPayAllRemaining && (
        <Card style={styles.actionsCard}>
          <Button
            title={`Payer le reste (${formatCurrency(totalRemaining)})`}
            leftIcon="card"
            onPress={onPayAllRemaining}
            disabled={isProcessing}
            loading={isProcessing}
            variant="secondary"
            fullWidth
          />
          
          <Text style={{
            fontSize: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
            color: COLORS.text.secondary,
            textAlign: 'center' as const,
            marginTop: getResponsiveValue(SPACING.xs, screenType),
          }}>
            Vous pouvez payer pour les autres personnes qui n'ont pas encore payé
          </Text>
        </Card>
      )}
    </View>
  );
};