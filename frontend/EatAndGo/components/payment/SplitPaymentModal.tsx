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
  TouchableOpacity,
  ViewStyle,
  TextStyle,
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
  SHADOWS,
  TYPOGRAPHY,
} from '@/utils/designSystem';
import { SplitPaymentMode, SplitPaymentPortion } from '@/types/splitPayment';

interface SplitPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  totalAmount: number;
  tipAmount: number;
  onConfirm: (mode: SplitPaymentMode, portions: Omit<SplitPaymentPortion, 'id' | 'isPaid' | 'paidAt'>[]) => void;
}

// Fonction utilitaire pour distribuer équitablement les centimes
const distributeAmountEvenly = (totalAmount: number, numberOfPeople: number): number[] => {
  // Convertir en centimes pour éviter les problèmes de précision
  const totalCents = Math.round(totalAmount * 100);
  const baseCentsPerPerson = Math.floor(totalCents / numberOfPeople);
  const remainingCents = totalCents % numberOfPeople;
  
  const portions: number[] = [];
  
  for (let i = 0; i < numberOfPeople; i++) {
    // Les premiers "remainingCents" personnes reçoivent un centime supplémentaire
    const portionCents = baseCentsPerPerson + (i < remainingCents ? 1 : 0);
    portions.push(portionCents / 100); // Reconvertir en euros
  }
  
  return portions;
};

// Fonction utilitaire pour vérifier si les montants correspondent (tolérance de 0.01€)
const amountsMatch = (amount1: number, amount2: number, tolerance: number = 0.01): boolean => {
  return Math.abs(amount1 - amount2) <= tolerance;
};

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

  // Styles définis avec typage explicite (styles conservés identiques)
  const modalStyle: ViewStyle = {
    flex: 1,
    backgroundColor: COLORS.background,
  };

  const headerStyle: ViewStyle = {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    shadowColor: COLORS.shadow?.light || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  };

  const headerContentStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: getResponsiveValue(SPACING.lg, screenType),
  };

  const headerTitleStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
  };

  const headerSubtitleStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    color: COLORS.text.secondary,
    marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
  };

  const contentStyle: ViewStyle = {
    flex: 1,
    padding: getResponsiveValue(SPACING.container, screenType),
  };

  const totalCardStyle: ViewStyle = {
    ...SHADOWS.lg,
    backgroundColor: COLORS.primary + '08',
    borderWidth: 2,
    borderColor: COLORS.primary + '20',
    marginBottom: getResponsiveValue(SPACING.xl, screenType),
    position: 'relative',
  };

  const totalRowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: getResponsiveValue(SPACING.xs, screenType),
  };

  const totalLabelStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    color: COLORS.text.secondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  };

  const totalValueStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  };

  const grandTotalRowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: getResponsiveValue(SPACING.xs, screenType),
    paddingTop: getResponsiveValue(SPACING.sm, screenType),
    borderTopWidth: 2,
    borderTopColor: COLORS.primary + '30',
    marginTop: getResponsiveValue(SPACING.sm, screenType),
  };

  const grandTotalStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.primary,
  };

  const sectionTitleStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: getResponsiveValue(SPACING.md, screenType),
    textAlign: 'center',
  };

  const modeGridStyle: ViewStyle = {
    flexDirection: 'row',
    gap: getResponsiveValue(SPACING.sm, screenType),
  };

  const modeButtonStyle: ViewStyle = {
    flex: 1,
    alignItems: 'center',
    padding: getResponsiveValue(SPACING.md, screenType),
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border.light,
    backgroundColor: COLORS.surface,
    gap: getResponsiveValue(SPACING.sm, screenType),
    minHeight: getResponsiveValue({ mobile: 80, tablet: 90, desktop: 100 }, screenType),
    justifyContent: 'center',
    ...SHADOWS.sm,
  };

  const modeButtonActiveStyle: ViewStyle = {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '08',
    ...SHADOWS.md,
    transform: [{ scale: 1.02 }],
  };

  const modeIconStyle: ViewStyle = {
    width: getResponsiveValue({ mobile: 32, tablet: 36, desktop: 40 }, screenType),
    height: getResponsiveValue({ mobile: 32, tablet: 36, desktop: 40 }, screenType),
    borderRadius: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.border.light,
  };

  const modeIconActiveStyle: ViewStyle = {
    backgroundColor: COLORS.primary,
  };

  const modeButtonTextStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text.secondary,
    textAlign: 'center',
  };

  const modeButtonTextActiveStyle: TextStyle = {
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  };

  const inputLabelStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text.primary,
  };

  const numberInputStyle: TextStyle = {
    borderWidth: 2,
    borderColor: COLORS.border.light,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
    paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    backgroundColor: COLORS.surface,
    textAlign: 'center',
    color: COLORS.text.primary,
  };

  const equalAmountCardStyle: ViewStyle = {
    backgroundColor: COLORS.secondary + '08',
    borderWidth: 2,
    borderColor: COLORS.secondary + '20',
    padding: getResponsiveValue(SPACING.md, screenType),
  };

  const portionItemStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: getResponsiveValue(SPACING.xs, screenType),
    paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
    backgroundColor: COLORS.surface + '50',
    borderRadius: BORDER_RADIUS.md,
    marginVertical: 2,
  };

  const portionNameStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text.primary,
  };

  const portionAmountStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.secondary,
  };

  const equalAmountTextStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.secondary,
    textAlign: 'center',
    marginBottom: getResponsiveValue(SPACING.sm, screenType),
  };

  const customPortionItemStyle: ViewStyle = {
    flexDirection: 'row',
    gap: getResponsiveValue(SPACING.sm, screenType),
    alignItems: 'center',
    marginBottom: getResponsiveValue(SPACING.sm, screenType),
    padding: getResponsiveValue(SPACING.sm, screenType),
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border.light,
    ...SHADOWS.sm,
  };

  const portionIndexStyle: ViewStyle = {
    width: getResponsiveValue({ mobile: 32, tablet: 36, desktop: 40 }, screenType),
    height: getResponsiveValue({ mobile: 32, tablet: 36, desktop: 40 }, screenType),
    borderRadius: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  };

  const portionIndexTextStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.surface,
  };

  const portionInputsStyle: ViewStyle = {
    flex: 1,
    gap: getResponsiveValue(SPACING.xs, screenType),
  };

  const customInputStyle: TextStyle = {
    borderWidth: 1,
    borderColor: COLORS.border.light,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
    paddingVertical: getResponsiveValue(SPACING.xs, screenType),
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    backgroundColor: COLORS.background,
    color: COLORS.text.primary,
  };

  const addButtonStyle: ViewStyle = {
    alignItems: 'center',
    padding: getResponsiveValue(SPACING.md, screenType),
    borderWidth: 2,
    borderColor: COLORS.border.light,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface + '50',
    marginTop: getResponsiveValue(SPACING.sm, screenType),
  };

  const addButtonTextStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    color: COLORS.text.secondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
  };

  const validationCardStyle: ViewStyle = {
    padding: getResponsiveValue(SPACING.md, screenType),
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    alignItems: 'center',
    ...SHADOWS.md,
  };

  const warningCardStyle: ViewStyle = {
    backgroundColor: COLORS.warning + '08',
    borderColor: COLORS.warning + '40',
  };

  const successCardStyle: ViewStyle = {
    backgroundColor: COLORS.success + '08',
    borderColor: COLORS.success + '40',
  };

  const validationTextStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    textAlign: 'center',
  };

  const warningTextStyle: TextStyle = {
    color: COLORS.warning,
  };

  const successTextStyle: TextStyle = {
    color: COLORS.success,
  };

  const actionsContainerStyle: ViewStyle = {
    flexDirection: 'row',
    gap: getResponsiveValue(SPACING.md, screenType),
    padding: getResponsiveValue(SPACING.lg, screenType),
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    shadowColor: COLORS.shadow?.light || '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  };

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType);
  const formatCurrency = (amount: number) => `${amount.toFixed(2)} €`;

  // Calcul amélioré des montants équitables avec distribution intelligente des centimes
  const equalPortions = useMemo(() => {
    const people = parseInt(numberOfPeople) || 1;
    if (people < 2) return [];
    return distributeAmountEvenly(totalWithTip, people);
  }, [totalWithTip, numberOfPeople]);

  const customTotal = useMemo(() => {
    return customPortions.reduce((sum, portion) => {
      const amount = parseFloat(portion.amount) || 0;
      return sum + amount;
    }, 0);
  }, [customPortions]);

  // Validation améliorée avec tolérance de 0.01€ (comme le backend)
  const customValidation = useMemo(() => {
    if (customTotal === 0) return { isValid: false, message: 'Veuillez saisir les montants' };
    
    if (amountsMatch(customTotal, totalWithTip)) {
      return { isValid: true, message: 'Répartition parfaite !' };
    }
    
    const difference = Math.abs(customTotal - totalWithTip);
    if (customTotal > totalWithTip) {
      return { isValid: false, message: `Excédent de ${formatCurrency(difference)}` };
    }
    
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

      const portions = equalPortions.map((amount, i) => ({
        name: `Personne ${i + 1}`,
        amount,
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

  const renderModeButton = (
    modeValue: SplitPaymentMode,
    title: string,
    icon: string,
    description: string
  ) => (
    <TouchableOpacity
      style={[
        modeButtonStyle,
        mode === modeValue && modeButtonActiveStyle,
      ]}
      onPress={() => setMode(modeValue)}
      activeOpacity={0.7}
    >
      <View style={[
        modeIconStyle,
        mode === modeValue && modeIconActiveStyle,
      ]}>
        <Ionicons
          name={icon as any}
          size={iconSize}
          color={mode === modeValue ? COLORS.surface : COLORS.text.secondary}
        />
      </View>
      <Text style={[
        modeButtonTextStyle,
        mode === modeValue && modeButtonTextActiveStyle,
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={modalStyle} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header amélioré */}
        <View style={headerStyle}>
          <View style={headerContentStyle}>
            <View style={{ flex: 1 }}>
              <Text style={headerTitleStyle}>Diviser la note</Text>
              <Text style={headerSubtitleStyle}>
                Choisissez comment répartir le paiement
              </Text>
            </View>
            <Button
              title=""
              leftIcon="close"
              onPress={onClose}
              variant="ghost"
              size="sm"
            />
          </View>
        </View>

        <ScrollView style={contentStyle} showsVerticalScrollIndicator={false}>
          {/* Total avec effet visuel amélioré */}
          <Card style={totalCardStyle}>
            <View style={totalRowStyle}>
              <Text style={totalLabelStyle}>Sous-total</Text>
              <Text style={totalValueStyle}>{formatCurrency(totalAmount)}</Text>
            </View>
            {tipAmount > 0 && (
              <View style={totalRowStyle}>
                <Text style={totalLabelStyle}>Pourboire</Text>
                <Text style={totalValueStyle}>{formatCurrency(tipAmount)}</Text>
              </View>
            )}
            <View style={grandTotalRowStyle}>
              <Text style={totalLabelStyle}>Total à diviser</Text>
              <Text style={grandTotalStyle}>{formatCurrency(totalWithTip)}</Text>
            </View>
          </Card>

          {/* Sélection du mode avec design amélioré */}
          <Card style={{ marginBottom: getResponsiveValue(SPACING.xl, screenType) }}>
            <Text style={sectionTitleStyle}>Comment diviser ?</Text>
            
            <View style={modeGridStyle}>
              {renderModeButton('none', 'Paiement unique', 'person', 'Une seule personne paie')}
              {renderModeButton('equal', 'Équitable', 'people', 'Parts égales pour tous')}
              {renderModeButton('custom', 'Personnalisé', 'calculator', 'Montants sur mesure')}
            </View>
          </Card>

          {/* Division équitable avec distribution intelligente des centimes */}
          {mode === 'equal' && (
            <Card style={{ gap: getResponsiveValue(SPACING.md, screenType) }}>
              <View style={{ gap: getResponsiveValue(SPACING.sm, screenType) }}>
                <Text style={inputLabelStyle}>Nombre de personnes</Text>
                <View>
                  <TextInput
                    style={numberInputStyle}
                    value={numberOfPeople}
                    onChangeText={setNumberOfPeople}
                    keyboardType="number-pad"
                    placeholder="2"
                    placeholderTextColor={COLORS.text.light}
                  />
                </View>
              </View>
              
              <Card style={equalAmountCardStyle}>
                <Text style={equalAmountTextStyle}>
                  Répartition équitable
                </Text>
                
                {equalPortions.length > 0 && (
                  <View style={{ gap: getResponsiveValue(SPACING.xs, screenType) }}>
                    {equalPortions.map((amount, index) => (
                      <View key={index} style={portionItemStyle}>
                        <Text style={portionNameStyle}>Personne {index + 1}</Text>
                        <Text style={portionAmountStyle}>{formatCurrency(amount)}</Text>
                      </View>
                    ))}
                    
                    <View style={[portionItemStyle, { backgroundColor: COLORS.primary + '08', borderWidth: 1, borderColor: COLORS.primary + '20' }]}>
                      <Text style={[portionNameStyle, { fontWeight: TYPOGRAPHY.fontWeight.bold }]}>Total</Text>
                      <Text style={[portionAmountStyle, { color: COLORS.primary }]}>
                        {formatCurrency(equalPortions.reduce((sum, amount) => sum + amount, 0))}
                      </Text>
                    </View>
                  </View>
                )}
              </Card>
            </Card>
          )}

          {/* Division personnalisée avec validation améliorée */}
          {mode === 'custom' && (
            <Card style={{ gap: getResponsiveValue(SPACING.md, screenType) }}>
              <Text style={sectionTitleStyle}>Montants personnalisés</Text>
              
              {customPortions.map((portion, index) => (
                <View key={index} style={customPortionItemStyle}>
                  <View style={portionIndexStyle}>
                    <Text style={portionIndexTextStyle}>{index + 1}</Text>
                  </View>
                  
                  <View style={portionInputsStyle}>
                    <TextInput
                      style={customInputStyle}
                      value={portion.name}
                      onChangeText={(text) => updateCustomPortion(index, 'name', text)}
                      placeholder={`Personne ${index + 1}`}
                      placeholderTextColor={COLORS.text.light}
                      maxLength={20}
                    />
                    <TextInput
                      style={customInputStyle}
                      value={portion.amount}
                      onChangeText={(text) => updateCustomPortion(index, 'amount', text)}
                      placeholder="0,00 €"
                      placeholderTextColor={COLORS.text.light}
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
                    />
                  )}
                </View>
              ))}
              
              <TouchableOpacity
                style={addButtonStyle}
                onPress={addCustomPortion}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle" size={iconSize + 4} color={COLORS.text.secondary} />
                <Text style={addButtonTextStyle}>Ajouter une personne</Text>
              </TouchableOpacity>

              {/* Validation avec tolérance améliorée */}
              {customTotal > 0 && (
                <Card style={[
                  validationCardStyle,
                  customValidation.isValid ? successCardStyle : warningCardStyle,
                ]}>
                  <Text style={[
                    validationTextStyle,
                    customValidation.isValid ? successTextStyle : warningTextStyle,
                  ]}>
                    {customValidation.message}
                  </Text>
                  {customValidation.isValid && (
                    <Text style={[validationTextStyle, successTextStyle, { fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType), marginTop: 4 }]}>
                      Total : {formatCurrency(customTotal)} (tolérance ±0,01 €)
                    </Text>
                  )}
                </Card>
              )}
            </Card>
          )}
        </ScrollView>

        {/* Actions avec design amélioré */}
        <View style={actionsContainerStyle}>
          <Button
            title="Annuler"
            onPress={onClose}
            variant="outline"
          />
          <Button
            title={mode === 'none' ? 'Paiement unique' : 'Diviser la note'}
            onPress={handleConfirm}
            disabled={!canConfirm}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};