import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { SplitPaymentMode, SplitPaymentPortion } from '@/types/splitPayment';

interface SplitPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  totalAmount: number;
  tipAmount: number;
  onConfirm: (mode: SplitPaymentMode, portions: Omit<SplitPaymentPortion, 'id' | 'isPaid' | 'paidAt'>[]) => void;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  visible,
  onClose,
  totalAmount,
  tipAmount,
  onConfirm,
}) => {
  const [mode, setMode] = useState<SplitPaymentMode>('none');
  const [numberOfPeople, setNumberOfPeople] = useState('2');
  const [customPortions, setCustomPortions] = useState<Array<{ name: string; amount: string }>>([
    { name: '', amount: '' },
    { name: '', amount: '' }
  ]);

  const screenType = useScreenType();
  const totalWithTip = totalAmount + tipAmount;

  const styles = {
    modal: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    
    headerTitle: {
      fontSize: getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    
    content: {
      flex: 1,
      padding: getResponsiveValue(SPACING.md, screenType),
    },
    
    totalCard: {
      backgroundColor: COLORS.primary + '10',
      borderColor: COLORS.primary + '30',
      borderWidth: 1,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    
    totalRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    
    totalLabel: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      color: COLORS.text.secondary,
    },
    
    totalValue: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    
    grandTotal: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 24 }, screenType),
      fontWeight: 'bold' as const,
      color: COLORS.primary,
    },
    
    modeCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    modeTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    modeButtons: {
      flexDirection: 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    modeButton: {
      flex: 1,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 2,
      borderColor: COLORS.border.light,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    
    modeButtonActive: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.primary + '10',
    },
    
    modeButtonText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
    },
    
    modeButtonTextActive: {
      color: COLORS.primary,
    },
    
    equalSplitCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    inputContainer: {
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    
    inputLabel: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    
    numberInput: {
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      backgroundColor: COLORS.surface,
      textAlign: 'center' as const,
    },
    
    equalAmountText: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '600' as const,
      color: COLORS.secondary,
      textAlign: 'center' as const,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
    
    customPortionItem: {
      flexDirection: 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    
    customPortionIndex: {
      width: getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType),
      height: getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      backgroundColor: COLORS.secondary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    customPortionIndexText: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
    },
    
    customPortionInputs: {
      flex: 1,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    
    customPortionInput: {
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      backgroundColor: COLORS.surface,
    },
    
    addPortionButton: {
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderWidth: 2,
      borderColor: COLORS.border.light,
      borderStyle: 'dashed' as const,
      borderRadius: BORDER_RADIUS.md,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
    
    addPortionText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },
    
    validationCard: {
      backgroundColor: COLORS.warning + '10',
      borderColor: COLORS.warning + '30',
      borderWidth: 1,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    validationText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      color: COLORS.warning,
      textAlign: 'center' as const,
    },
    
    successCard: {
      backgroundColor: COLORS.success + '10',
      borderColor: COLORS.success + '30',
      borderWidth: 1,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    successText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      color: COLORS.success,
      textAlign: 'center' as const,
    },
    
    actionsContainer: {
      flexDirection: 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
  };

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType);

  const formatCurrency = (amount: number) => `${amount.toFixed(2)} €`;

  const equalAmount = useMemo(() => {
    const people = parseInt(numberOfPeople) || 1;
    return totalWithTip / people;
  }, [totalWithTip, numberOfPeople]);

  const customTotal = useMemo(() => {
    return customPortions.reduce((sum, portion) => {
      const amount = parseFloat(portion.amount) || 0;
      return sum + amount;
    }, 0);
  }, [customPortions]);

  const customValidation = useMemo(() => {
    const difference = Math.abs(customTotal - totalWithTip);
    if (difference < 0.01) return { isValid: true, message: 'Répartition correcte' };
    if (customTotal > totalWithTip) return { isValid: false, message: `Excédent de ${formatCurrency(difference)}` };
    return { isValid: false, message: `Manque ${formatCurrency(difference)}` };
  }, [customTotal, totalWithTip]);

  const addCustomPortion = () => {
    setCustomPortions([...customPortions, { name: '', amount: '' }]);
  };

  const removeCustomPortion = (index: number) => {
    if (customPortions.length > 2) {
      setCustomPortions(customPortions.filter((_, i) => i !== index));
    }
  };

  const updateCustomPortion = (index: number, field: 'name' | 'amount', value: string) => {
    const updated = [...customPortions];
    updated[index][field] = value;
    setCustomPortions(updated);
  };

  const handleConfirm = () => {
    if (mode === 'none') {
      onClose();
      return;
    }

    if (mode === 'equal') {
      const people = parseInt(numberOfPeople) || 1;
      if (people < 2) {
        Alert.alert('Erreur', 'Le nombre de personnes doit être au moins 2');
        return;
      }

      const portions = Array.from({ length: people }, (_, i) => ({
        name: `Personne ${i + 1}`,
        amount: equalAmount,
      }));

      onConfirm(mode, portions);
    } else if (mode === 'custom') {
      if (!customValidation.isValid) {
        Alert.alert('Erreur', 'La répartition ne correspond pas au montant total');
        return;
      }

      const portions = customPortions
        .filter(p => parseFloat(p.amount) > 0)
        .map((p, i) => ({
          name: p.name.trim() || `Personne ${i + 1}`,
          amount: parseFloat(p.amount),
        }));

      if (portions.length < 2) {
        Alert.alert('Erreur', 'Il faut au moins 2 portions avec un montant');
        return;
      }

      onConfirm(mode, portions);
    }
  };

  const canConfirm = mode === 'none' || 
    (mode === 'equal' && parseInt(numberOfPeople) >= 2) ||
    (mode === 'custom' && customValidation.isValid && customPortions.filter(p => parseFloat(p.amount) > 0).length >= 2);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.modal} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Diviser la note</Text>
          <Button
            title=""
            leftIcon="close"
            onPress={onClose}
            variant="ghost"
            size="sm"
          />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Total à diviser */}
          <Card style={styles.totalCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
            </View>
            {tipAmount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Pourboire</Text>
                <Text style={styles.totalValue}>{formatCurrency(tipAmount)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, { paddingTop: getResponsiveValue(SPACING.sm, screenType), borderTopWidth: 1, borderTopColor: COLORS.border.light }]}>
              <Text style={styles.totalLabel}>Total à diviser</Text>
              <Text style={styles.grandTotal}>{formatCurrency(totalWithTip)}</Text>
            </View>
          </Card>

          {/* Mode de division */}
          <Card style={styles.modeCard}>
            <Text style={styles.modeTitle}>Comment diviser ?</Text>
            
            <View style={styles.modeButtons}>
              <Button
                title="Paiement unique"
                leftIcon="person"
                onPress={() => setMode('none')}
                variant={mode === 'none' ? 'primary' : 'outline'}
                style={{ flex: 1 }}
                size="sm"
              />
              
              <Button
                title="Équitable"
                leftIcon="people"
                onPress={() => setMode('equal')}
                variant={mode === 'equal' ? 'primary' : 'outline'}
                style={{ flex: 1 }}
                size="sm"
              />
              
              <Button
                title="Personnalisé"
                leftIcon="calculator"
                onPress={() => setMode('custom')}
                variant={mode === 'custom' ? 'primary' : 'outline'}
                style={{ flex: 1 }}
                size="sm"
              />
            </View>
          </Card>

          {/* Division équitable */}
          {mode === 'equal' && (
            <Card style={styles.equalSplitCard}>
              <Text style={styles.inputLabel}>Nombre de personnes</Text>
              <TextInput
                style={styles.numberInput}
                value={numberOfPeople}
                onChangeText={setNumberOfPeople}
                keyboardType="number-pad"
                placeholder="2"
              />
              <Text style={styles.equalAmountText}>
                {formatCurrency(equalAmount)} par personne
              </Text>
            </Card>
          )}

          {/* Division personnalisée */}
          {mode === 'custom' && (
            <Card style={styles.modeCard}>
              <Text style={styles.modeTitle}>Montants personnalisés</Text>
              
              <View style={styles.inputContainer}>
                {customPortions.map((portion, index) => (
                  <View key={index} style={styles.customPortionItem}>
                    <View style={styles.customPortionIndex}>
                      <Text style={styles.customPortionIndexText}>{index + 1}</Text>
                    </View>
                    
                    <View style={styles.customPortionInputs}>
                      <TextInput
                        style={styles.customPortionInput}
                        value={portion.name}
                        onChangeText={(text) => updateCustomPortion(index, 'name', text)}
                        placeholder={`Personne ${index + 1}`}
                        maxLength={20}
                      />
                      <TextInput
                        style={styles.customPortionInput}
                        value={portion.amount}
                        onChangeText={(text) => updateCustomPortion(index, 'amount', text)}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>

                    {customPortions.length > 2 && (
                      <Button
                        title=""
                        leftIcon="trash-outline"
                        onPress={() => removeCustomPortion(index)}
                        variant="ghost"
                        size="sm"
                        style={{ padding: getResponsiveValue(SPACING.xs, screenType) }}
                      />
                    )}
                  </View>
                ))}
                
                <Button
                  title="Ajouter une personne"
                  leftIcon="add"
                  onPress={addCustomPortion}
                  variant="outline"
                  style={styles.addPortionButton}
                  size="sm"
                />
              </View>

              {/* Validation */}
              {customValidation.isValid ? (
                <Card style={styles.successCard}>
                  <Text style={styles.successText}>{customValidation.message}</Text>
                </Card>
              ) : customTotal > 0 && (
                <Card style={styles.validationCard}>
                  <Text style={styles.validationText}>{customValidation.message}</Text>
                </Card>
              )}
            </Card>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <Button
            title="Annuler"
            onPress={onClose}
            variant="outline"
            style={{ flex: 1 }}
          />
          <Button
            title={mode === 'none' ? 'Paiement unique' : 'Diviser la note'}
            onPress={handleConfirm}
            disabled={!canConfirm}
            style={{ flex: 2 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};