import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Share,
  RefreshControl,
  Modal,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Table } from '@/types/table';
import { Restaurant } from '@/types/restaurant';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS 
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';
type QRSize = 'small' | 'medium' | 'large';

interface QRSizeConfig {
  label: string;
  displaySize: number;
  printSize: number;
  logoSize: number;
  perPage: number;
  cardWidth: string;
  cardHeight: string;
  columns: number;
  rows: number;
  maxBatchSize: number;
}

const APP_LOGO = require('@/assets/images/logo.png');

const QR_SIZES = {
  small: {
    label: 'Petit (24/page)',
    displaySize: 90,
    printSize: 120,
    logoSize: 8,
    perPage: 24,
    cardWidth: '16%',
    cardHeight: '24%',
    columns: 6,
    rows: 4,
    maxBatchSize: 24,
  },
  medium: {
    label: 'Moyen (12/page)',
    displaySize: 110,
    printSize: 150,
    logoSize: 12,
    perPage: 12,
    cardWidth: '24%',
    cardHeight: '32%',
    columns: 4,
    rows: 3,
    maxBatchSize: 12,
  },
  large: {
    label: 'Grand (6/page)',
    displaySize: 130,
    printSize: 180,
    logoSize: 15,
    perPage: 6,
    cardWidth: '49%',
    cardHeight: '32%',
    columns: 2,
    rows: 3,
    maxBatchSize: 6,
  },
};

export default function QRCodesScreen() {
  const { 
    restaurants, 
    createTables, 
    loadRestaurantTables, 
    deleteTable,
    isLoading,
    error 
  } = useRestaurant();

  const [selectedRestaurant, setSelectedRestaurant] = useState('');
  const [tableCount, setTableCount] = useState(5);
  const [startNumber, setStartNumber] = useState(1);
  const [generatedTables, setGeneratedTables] = useState<Table[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRestaurantPicker, setShowRestaurantPicker] = useState(false);
  const [previewTable, setPreviewTable] = useState<Table | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [existingTablesCount, setExistingTablesCount] = useState(0);
  const [qrSize, setQrSize] = useState<QRSize>('medium');
  const [isDownloading, setIsDownloading] = useState(false);
  const [logoBase64, setLogoBase64] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  
  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
    isTabletLandscape: screenType === 'tablet' && width > 1000,
    cardColumns: getResponsiveValue(
      { mobile: 1, tablet: 2, desktop: 3 },
      screenType
    ),
  };

  useEffect(() => {
    if (restaurants.length === 1) {
      setSelectedRestaurant(restaurants[0].id);
    }
  }, [restaurants]);

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const asset = Asset.fromModule(APP_LOGO);
        await asset.downloadAsync();
        const localUri = asset.localUri || asset.uri;
        if (localUri) {
          const base64 = await FileSystem.readAsStringAsync(localUri, {
            encoding: "base64",
          });
          setLogoBase64(`data:image/png;base64,${base64}`);
        }
      } catch (err) {
        console.warn('Erreur chargement du logo en base64:', err);
      }
    };
    loadLogo();
  }, []);

  useEffect(() => {
    if (selectedRestaurant) {
      checkExistingTables();
    }
  }, [selectedRestaurant]);

  const checkExistingTables = async () => {
    if (!selectedRestaurant) return;
    
    try {
      const existingTables = await loadRestaurantTables(selectedRestaurant);
      const tablesArray = Array.isArray(existingTables) ? existingTables : [];
      setExistingTablesCount(tablesArray.length);
    } catch (error: any) {
      if (error.message?.includes('404') || error.response?.status === 404) {
        setExistingTablesCount(0);
      } else {
        setExistingTablesCount(0);
      }
    }
  };

  const selectedRestaurantData = restaurants.find((r: Restaurant) => r.id === selectedRestaurant);

  const handleGenerateTables = async () => {
    if (!selectedRestaurant) {
      Alert.alert('Erreur', 'Veuillez sélectionner un restaurant');
      return;
    }

    setIsGenerating(true);
    try {
      const tables = await createTables(selectedRestaurant, tableCount, startNumber);
      setGeneratedTables(tables);
      Alert.alert(
        'Succès', 
        `${tables.length} tables créées avec succès !`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Erreur lors de la génération des tables:', error);
      
      if (error.message.includes('400') || error.message.includes('exist') || error.message.includes('conflit')) {
        Alert.alert(
          'Conflit détecté', 
          'Certaines tables existent déjà avec ces numéros. Voulez-vous :',
          [
            {
              text: 'Remplacer',
              onPress: () => handleReplaceTables(),
              style: 'destructive'
            },
            {
              text: 'Charger existantes',
              onPress: () => loadExistingTables()
            },
            {
              text: 'Autres numéros',
              onPress: () => suggestNewStartNumber()
            },
            {
              text: 'Annuler',
              style: 'cancel'
            }
          ]
        );
      } else {
        Alert.alert(
          'Erreur', 
          error.message || 'Erreur lors de la génération des QR codes'
        );
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReplaceTables = async () => {
    if (!selectedRestaurant) return;

    Alert.alert(
      'Confirmer le remplacement',
      `Voulez-vous vraiment remplacer les tables existantes ?\n\nCette action va :\n• Supprimer toutes les tables existantes\n• Créer ${tableCount} nouvelles tables (${startNumber} à ${startNumber + tableCount - 1})\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Remplacer',
          style: 'destructive',
          onPress: async () => {
            setIsGenerating(true);
            try {
              const existingTables = await loadRestaurantTables(selectedRestaurant);
              const tablesArray = Array.isArray(existingTables) ? existingTables : [];
              
              if (tablesArray.length > 0) {
                const deletePromises = tablesArray.map(table => deleteTable(table.id));
                await Promise.all(deletePromises);
              }
              
              const newTables = await createTables(selectedRestaurant, tableCount, startNumber);
              
              setGeneratedTables(newTables);
              setExistingTablesCount(newTables.length);
              
              Alert.alert(
                'Remplacement réussi', 
                `${tablesArray.length > 0 ? `${tablesArray.length} tables supprimées et ` : ''}${newTables.length} nouvelles tables créées avec succès !`,
                [{ text: 'OK' }]
              );
            } catch (error: any) {
              console.error('Erreur lors du remplacement:', error);
              Alert.alert('Erreur', error.message || 'Erreur lors du remplacement des tables');
            } finally {
              setIsGenerating(false);
            }
          }
        }
      ]
    );
  };

  const loadExistingTables = async () => {
    if (!selectedRestaurant) return;
    
    try {
      setIsGenerating(true);
      const existingTables = await loadRestaurantTables(selectedRestaurant);
      const tablesArray = Array.isArray(existingTables) ? existingTables : [];
      
      if (tablesArray.length > 0) {
        setGeneratedTables(tablesArray);
        setExistingTablesCount(tablesArray.length);
        Alert.alert(
          'Tables chargées', 
          `${tablesArray.length} tables existantes ont été chargées.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Aucune table', 'Aucune table trouvée pour ce restaurant.');
        setExistingTablesCount(0);
      }
    } catch (error: any) {
      console.error('Erreur chargement tables:', error);
      
      if (error.message?.includes('404') || error.response?.status === 404) {
        Alert.alert('Aucune table', 'Aucune table trouvée pour ce restaurant.');
        setExistingTablesCount(0);
      } else {
        Alert.alert('Erreur', 'Impossible de charger les tables existantes.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const suggestNewStartNumber = async () => {
    if (!selectedRestaurant) return;
    
    try {
      const existingTables = await loadRestaurantTables(selectedRestaurant);
      const tablesArray = Array.isArray(existingTables) ? existingTables : [];
      
      if (tablesArray.length > 0) {
        const maxNumber = Math.max(...tablesArray.map(t => parseInt(t.number) || 0));
        const suggestedStart = maxNumber + 1;
        
        Alert.alert(
          'Numéro suggéré',
          `Il y a déjà ${tablesArray.length} tables (jusqu'au numéro ${maxNumber}).\n\nCommencer au numéro ${suggestedStart} ?`,
          [
            {
              text: 'Oui',
              onPress: () => {
                setStartNumber(suggestedStart);
                Alert.alert('Numéro mis à jour', `Le numéro de départ a été changé pour ${suggestedStart}. Vous pouvez maintenant générer les tables.`);
              }
            },
            {
              text: 'Choisir autre',
              onPress: () => promptForStartNumber()
            },
            { text: 'Annuler', style: 'cancel' }
          ]
        );
      } else {
        setStartNumber(1);
        Alert.alert('Info', 'Aucune table existante trouvée. Le numéro de départ reste à 1.');
      }
    } catch (error: any) {
      if (error.message?.includes('404') || error.response?.status === 404) {
        setStartNumber(1);
        Alert.alert('Info', 'Aucune table existante trouvée. Vous pouvez commencer au numéro 1.');
      } else {
        Alert.alert('Erreur', 'Impossible de vérifier les tables existantes.');
      }
    }
  };

  const promptForStartNumber = () => {
    Alert.alert(
      'Choisir un numéro',
      'Utilisez les boutons +/- dans les paramètres pour ajuster le numéro de départ, puis générez à nouveau.',
      [
        { 
          text: 'Compris', 
          onPress: () => setShowSettings(true)
        }
      ]
    );
  };

  const handleShareTable = async (table: Table) => {
    try {
      const message = `Table ${table.number} - ${selectedRestaurantData?.name}\n\nCode manuel: ${table.manualCode}\nOu scannez ce QR code pour accéder au menu !\n\n${table.qrCodeUrl}`;
      
      await Share.share({
        message,
        title: `QR Code - Table ${table.number}`,
      });
    } catch (error) {
      console.error('Erreur partage:', error);
    }
  };

  const generateOptimizedPrintHTML = (tables: Table[], size: QRSize = qrSize) => {
    const sizeConfig = QR_SIZES[size];
    
    const generateOptimizedQRCodeSVG = (url: string, size: number) => {
      const qrData = encodeURIComponent(url);
      return `
        <div style="position: relative; width: ${size}px; height: ${size}px; margin: 0 auto;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${qrData}&format=png&ecc=M&margin=8"
               width="${size}" height="${size}" 
               style="display: block; image-rendering: -webkit-optimize-contrast;" 
               alt="QR Code" />
        </div>
      `;
    };

    const buildOptimizedQRCard = (table: Table) => {
      return `
        <div class="qr-card qr-card-${size}" style="width: ${sizeConfig.cardWidth}; height: ${sizeConfig.cardHeight};">
          <div style="font-size: ${size === 'small' ? '12px' : size === 'medium' ? '14px' : '16px'}; font-weight: bold; color: #111827; margin-bottom: 4px; flex-shrink: 0;">Table ${table.number}</div>
          <div style="display: flex; justify-content: center; align-items: center; flex: 1; margin: 2px 0;">
            ${generateOptimizedQRCodeSVG(table.qrCodeUrl, sizeConfig.printSize)}
          </div>
          <div style="font-size: ${size === 'small' ? '8px' : size === 'medium' ? '10px' : '11px'}; color: #666; background: #f8f9fa; padding: 2px 4px; border-radius: 2px; margin-bottom: 2px; flex-shrink: 0;">
            <span style="font-family: monospace; font-weight: bold; font-size: ${size === 'small' ? '9px' : size === 'medium' ? '11px' : '12px'}; color: #111827;">${table.manualCode}</span>
          </div>
          <div style="font-size: ${size === 'small' ? '6px' : size === 'medium' ? '7px' : '8px'}; color: #999; line-height: 1.1; flex-shrink: 0;">Scanner ou saisir</div>
        </div>
      `;
    };

    const sortedTables = [...tables].sort((a, b) => {
      const aNum = parseInt((a as any).number, 10) || 0;
      const bNum = parseInt((b as any).number, 10) || 0;
      return aNum - bNum;
    });

    const pages: string[] = [];
    for (let i = 0; i < sortedTables.length; i += sizeConfig.perPage) {
      const pageTables = sortedTables.slice(i, i + sizeConfig.perPage);
      const cardsHTML = pageTables.map((table) => buildOptimizedQRCard(table)).join('');
      pages.push(`
        <div class="page-container">
          <div class="qr-container">
            ${cardsHTML}
          </div>
        </div>
      `);
    }

    const pagesHTML = pages
      .map((pageHTML, idx) => {
        const isLast = idx === pages.length - 1;
        return isLast
          ? pageHTML.replace('<div class="page-container">', '<div class="page-container last-page">')
          : pageHTML;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          body { margin: 0; font-family: Arial, sans-serif; }
          .page-container { display: flex; flex-direction: column; height: 100%; page-break-after: always; }
          .page-container.last-page { page-break-after: auto; }
          .qr-container { display: flex; flex-wrap: wrap; justify-content: center; align-content: space-between; height: 100%; }
          .qr-card { display: flex; flex-direction: column; align-items: center; justify-content: center; }
          .qr-card-small { width: 16%; height: 24%; }
          .qr-card-medium { width: 24%; height: 32%; }
          .qr-card-large { width: 49%; height: 32%; }
          img { image-rendering: -webkit-optimize-contrast; image-rendering: pixelated; }
        </style>
        <body>
          ${pagesHTML}
        </body>
      </html>
    `;
  };

  const handlePrintAll = async () => {
    if (generatedTables.length === 0) return;

    setIsPrinting(true);
    try {
      const html = generateOptimizedPrintHTML(generatedTables);
      await Print.printAsync({
        html,
        orientation: 'landscape',
        printerUrl: undefined,
      });
    } catch (error) {
      console.error('Erreur impression:', error);
      Alert.alert('Erreur', 'Impossible d\'imprimer les QR codes');
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintSingle = async (table: Table) => {
    setIsPrinting(true);
    try {
      const html = generateOptimizedPrintHTML([table]);
      await Print.printAsync({
        html,
        orientation: 'landscape',
        printerUrl: undefined,
      });
    } catch (error) {
      console.error('Erreur impression:', error);
      Alert.alert('Erreur', 'Impossible d\'imprimer le QR code');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadAll = async () => {
    if (generatedTables.length === 0) return;

    setIsDownloading(true);
    try {
      const html = generateOptimizedPrintHTML(generatedTables);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
      });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      Alert.alert('Erreur', 'Impossible de générer le PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSingle = async (table: Table) => {
    setIsDownloading(true);
    try {
      const html = generateOptimizedPrintHTML([table]);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
      });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      Alert.alert('Erreur', 'Impossible de générer le PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (selectedRestaurant) {
        await loadRestaurantTables(selectedRestaurant);
      }
    } catch (error) {
      console.error('Erreur rafraîchissement:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    content: {
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    scrollContent: {
      padding: layoutConfig.containerPadding,
    },

    // Carte de configuration
    configCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    sectionHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    sectionTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
    },

    description: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      lineHeight: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
    },

    warningCard: {
      backgroundColor: COLORS.warning + '10',
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: COLORS.warning + '40',
    },

    warningText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.warning,
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      flex: 1,
    },

    // Sélecteur de restaurant
    restaurantSelector: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    restaurantInfo: {
      flex: 1,
    },

    restaurantLabel: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    restaurantName: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      color: COLORS.text.primary,
      fontWeight: '500' as const,
    },

    // Sélecteur de taille QR
    qrSizePicker: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    qrSizeLabel: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      fontWeight: '500' as const,
    },

    qrSizeButtons: {
      flexDirection: 'row' as const,
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.xs, screenType) / 2,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    qrSizeButton: {
      flex: 1,
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center' as const,
    },

    qrSizeButtonActive: {
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.secondary,
    },

    qrSizeButtonText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '400' as const,
      color: COLORS.text.secondary,
    },

    qrSizeButtonTextActive: {
      color: COLORS.secondary,
      fontWeight: '600' as const,
    },

    // Contrôles numériques
    controlsRow: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    controlGroup: {
      flex: 1,
    },

    controlLabel: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      fontWeight: '500' as const,
    },

    controlContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      height: getResponsiveValue(
        { mobile: 44, tablet: 48, desktop: 52 },
        screenType
      ),
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    controlButton: {
      width: getResponsiveValue(
        { mobile: 30, tablet: 32, desktop: 36 },
        screenType
      ),
      height: getResponsiveValue(
        { mobile: 30, tablet: 32, desktop: 36 },
        screenType
      ),
      borderRadius: getResponsiveValue(
        { mobile: 15, tablet: 16, desktop: 18 },
        screenType
      ),
      backgroundColor: COLORS.surface,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    controlValue: {
      flex: 1,
      textAlign: 'center' as const,
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },

    // Actions
    actionsSection: {
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    actionsRow: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    // Carte restaurant sélectionné
    selectedRestaurantCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    restaurantCardContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },

    restaurantAvatar: {
      width: getResponsiveValue(
        { mobile: 40, tablet: 44, desktop: 48 },
        screenType
      ),
      height: getResponsiveValue(
        { mobile: 40, tablet: 44, desktop: 48 },
        screenType
      ),
      borderRadius: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      backgroundColor: COLORS.secondary,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    restaurantDetails: {
      flex: 1,
    },

    restaurantCardName: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    restaurantAddress: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
    },

    sizeBadge: {
      backgroundColor: COLORS.background,
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    sizeBadgeText: {
      fontSize: getResponsiveValue(
        { mobile: 10, tablet: 11, desktop: 12 },
        screenType
      ),
      color: COLORS.text.secondary,
      fontWeight: '500' as const,
    },

    // Liste des QR codes
    qrListHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    qrListTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },

    // Carte QR individuelle
    qrCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center' as const,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    tableTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    qrCodeContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.surface,
      padding: getResponsiveValue(SPACING.sm, screenType),
    },

    manualCodeContainer: {
      backgroundColor: COLORS.background,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    manualCodeLabel: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      fontWeight: '500' as const,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    manualCode: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      fontFamily: 'monospace' as const,
    },

    instruction: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.light,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    qrActions: {
      width: '100%' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    qrActionsRow: {
      flexDirection: 'row' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    // État vide
    emptyContainer: {
      alignItems: 'center' as const,
      padding: getResponsiveValue(
        { mobile: 32, tablet: 40, desktop: 48 },
        screenType
      ),
    },

    emptyIcon: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    emptyTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
    },

    emptyMessage: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    helpCard: {
      backgroundColor: COLORS.primary + '08',
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.md,
      width: '100%' as const,
      borderWidth: 1,
      borderColor: COLORS.primary + '20',
    },

    helpTitle: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    helpText: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.primary,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 19, desktop: 20 },
        screenType
      ),
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.lg, screenType),
    },

    modalContent: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.xl, screenType),
      alignItems: 'center' as const,
      maxWidth: getResponsiveValue(
        { mobile: 300, tablet: 400, desktop: 500 },
        screenType
      ),
      width: '100%' as const,
      maxHeight: '80%' as const,
    },

    modalTitle: {
      fontSize: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    modalQRContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
    },

    modalManualCodeContainer: {
      backgroundColor: COLORS.background,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    modalManualCodeLabel: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      fontWeight: '500' as const,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    modalManualCode: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      fontFamily: 'monospace' as const,
    },

    modalInstruction: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.light,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    // Picker de restaurant
    pickerContainer: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    pickerOption: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },

    pickerOptionAvatar: {
      width: getResponsiveValue(
        { mobile: 50, tablet: 56, desktop: 60 },
        screenType
      ),
      height: getResponsiveValue(
        { mobile: 50, tablet: 56, desktop: 60 },
        screenType
      ),
      borderRadius: getResponsiveValue(
        { mobile: 25, tablet: 28, desktop: 30 },
        screenType
      ),
      backgroundColor: COLORS.primary,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    pickerOptionContent: {
      flex: 1,
    },

    pickerOptionName: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    pickerOptionAddress: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 18, desktop: 20 },
    screenType
  );

  const qrIconSize = getResponsiveValue(
    { mobile: 24, tablet: 26, desktop: 28 },
    screenType
  );

  const emptyIconSize = getResponsiveValue(
    { mobile: 64, tablet: 80, desktop: 96 },
    screenType
  );

  const renderRestaurantPicker = () => (
    <Modal
      visible={showRestaurantPicker}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.pickerContainer}>
        <Header 
          title="Choisir un restaurant"
          leftIcon="close-outline"
          onLeftPress={() => setShowRestaurantPicker(false)}
        />
        <ScrollView style={{ flex: 1 }}>
          {restaurants.map((restaurant: Restaurant) => (
            <Pressable
              key={restaurant.id}
              onPress={() => {
                setSelectedRestaurant(restaurant.id);
                setShowRestaurantPicker(false);
              }}
              style={styles.pickerOption}
              android_ripple={{ 
                color: COLORS.primary + '20',
                borderless: false 
              }}
            >
              <View style={styles.pickerOptionAvatar}>
                <Ionicons name="restaurant-outline" size={iconSize + 8} color={COLORS.surface} />
              </View>
              <View style={styles.pickerOptionContent}>
                <Text style={styles.pickerOptionName}>
                  {restaurant.name}
                </Text>
                <Text style={styles.pickerOptionAddress}>
                  {restaurant.address}, {restaurant.city}
                </Text>
              </View>
              {selectedRestaurant === restaurant.id && (
                <Ionicons name="checkmark-outline" size={iconSize + 8} color={COLORS.success} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderQRSizePicker = () => (
    <View style={styles.qrSizePicker}>
      <Text style={styles.qrSizeLabel}>
        Taille du QR Code
      </Text>
      <View style={styles.qrSizeButtons}>
        {(Object.keys(QR_SIZES) as QRSize[]).map((size) => (
          <Pressable
            key={size}
            onPress={() => setQrSize(size)}
            style={[
              styles.qrSizeButton,
              qrSize === size && styles.qrSizeButtonActive,
            ]}
            android_ripple={{ 
              color: COLORS.secondary + '20',
              borderless: false 
            }}
          >
            <Text style={[
              styles.qrSizeButtonText,
              qrSize === size && styles.qrSizeButtonTextActive,
            ]}>
              {QR_SIZES[size].label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderTableCard = (table: Table) => (
    <Card key={table.id} style={styles.qrCard}>
      <Text style={styles.tableTitle}>
        Table {table.number}
      </Text>
      
      <View style={styles.qrCodeContainer}>
        <QRCode
          value={table.qrCodeUrl}
          size={QR_SIZES[qrSize].displaySize}
          backgroundColor={COLORS.surface}
          color={COLORS.text.primary}
          ecl="H"
          quietZone={16}
        />
      </View>
      
      <View style={styles.manualCodeContainer}>
        <Text style={styles.manualCodeLabel}>
          Code manuel
        </Text>
        <Text style={styles.manualCode}>
          {table.manualCode}
        </Text>
      </View>
      
      <Text style={styles.instruction}>
        Scannez le QR code ou saisissez le code manuel
      </Text>
      
      <View style={styles.qrActions}>
        <View style={styles.qrActionsRow}>
          <Button
            title="Aperçu"
            onPress={() => setPreviewTable(table)}
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            leftIcon="eye-outline"
          />
          
          <Button
            title="Partager"
            onPress={() => handleShareTable(table)}
            style={{ 
              flex: 1, 
              backgroundColor: COLORS.secondary,
              borderColor: COLORS.secondary 
            }}
            textStyle={{ color: COLORS.text.primary }}
            size="sm"
            leftIcon="share-outline"
          />
        </View>

        <View style={styles.qrActionsRow}>
          <Button
            title="Imprimer"
            onPress={() => handlePrintSingle(table)}
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            loading={isPrinting}
            leftIcon="print-outline"
          />
          
          <Button
            title="Télécharger"
            onPress={() => handleDownloadSingle(table)}
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            loading={isDownloading}
            leftIcon="download-outline"
          />
        </View>
      </View>
    </Card>
  );

  const renderPreviewModal = () => (
    <Modal
      visible={!!previewTable}
      animationType="fade"
      transparent={true}
    >
      <View style={styles.modalOverlay}>
        {previewTable && (
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Table {previewTable.number}
            </Text>
            
            <View style={styles.modalQRContainer}>
              <QRCode
                value={previewTable.qrCodeUrl}
                size={150}
                backgroundColor={COLORS.surface}
                color={COLORS.text.primary}
                ecl="H"
                quietZone={16}
              />
            </View>
            
            <View style={styles.modalManualCodeContainer}>
              <Text style={styles.modalManualCodeLabel}>
                Code manuel
              </Text>
              <Text style={styles.modalManualCode}>
                {previewTable.manualCode}
              </Text>
            </View>
            
            <Text style={styles.modalInstruction}>
              Scannez le QR code ou saisissez le code manuel
            </Text>
            
            <Button
              title="Fermer"
              onPress={() => setPreviewTable(null)}
              style={{ backgroundColor: COLORS.secondary }}
              textStyle={{ color: COLORS.text.primary }}
            />
          </View>
        )}
      </View>
    </Modal>
  );

  if (isLoading && restaurants.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="QR Codes Tables" />
        <Loading fullScreen text="Chargement..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header 
        title="QR Codes Tables"
        rightIcon="settings-outline"
        onRightPress={() => setShowSettings(!showSettings)}
      />
      
      <ScrollView
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.scrollContent}>
            
            {/* Configuration */}
            <Card style={styles.configCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="qr-code-outline" size={qrIconSize} color={COLORS.secondary} />
                <Text style={styles.sectionTitle}>
                  Générateur de QR Codes
                </Text>
              </View>
              
              <Text style={styles.description}>
                Créez des QR codes pour vos tables et permettez à vos clients de scanner ou saisir un code manuel pour accéder au menu.
              </Text>

              {/* Indication des tables existantes */}
              {selectedRestaurant && existingTablesCount > 0 && (
                <View style={styles.warningCard}>
                  <Ionicons name="information-circle-outline" size={iconSize + 4} color={COLORS.warning} />
                  <Text style={styles.warningText}>
                    {existingTablesCount} table{existingTablesCount > 1 ? 's' : ''} existe{existingTablesCount > 1 ? 'nt' : ''} déjà pour ce restaurant
                  </Text>
                </View>
              )}

              {/* Sélection du restaurant */}
              <Pressable
                onPress={() => setShowRestaurantPicker(true)}
                style={styles.restaurantSelector}
                android_ripple={{ 
                  color: COLORS.primary + '20',
                  borderless: false 
                }}
              >
                <View style={styles.restaurantInfo}>
                  <Text style={styles.restaurantLabel}>
                    Restaurant
                  </Text>
                  <Text style={styles.restaurantName}>
                    {selectedRestaurantData?.name || 'Sélectionner un restaurant'}
                  </Text>
                </View>
                <Ionicons name="chevron-down-outline" size={iconSize + 4} color={COLORS.text.secondary} />
              </Pressable>

              {/* Sélecteur de taille de QR Code */}
              {renderQRSizePicker()}

              {/* Configuration du nombre de tables */}
              <View style={styles.controlsRow}>
                <View style={styles.controlGroup}>
                  <Text style={styles.controlLabel}>
                    Nombre de tables
                  </Text>
                  <View style={styles.controlContainer}>
                    <Pressable
                      onPress={() => setTableCount(Math.max(1, tableCount - 1))}
                      style={styles.controlButton}
                    >
                      <Ionicons name="remove-outline" size={iconSize} color={COLORS.text.secondary} />
                    </Pressable>
                    <Text style={styles.controlValue}>
                      {tableCount}
                    </Text>
                    <Pressable
                      onPress={() => setTableCount(Math.min(50, tableCount + 1))}
                      style={styles.controlButton}
                    >
                      <Ionicons name="add-outline" size={iconSize} color={COLORS.text.secondary} />
                    </Pressable>
                  </View>
                </View>

                {showSettings && (
                  <View style={styles.controlGroup}>
                    <Text style={styles.controlLabel}>
                      Numéro de départ
                    </Text>
                    <View style={styles.controlContainer}>
                      <Pressable
                        onPress={() => setStartNumber(Math.max(1, startNumber - 1))}
                        style={styles.controlButton}
                      >
                        <Ionicons name="remove-outline" size={iconSize} color={COLORS.text.secondary} />
                      </Pressable>
                      <Text style={styles.controlValue}>
                        {startNumber}
                      </Text>
                      <Pressable
                        onPress={() => setStartNumber(startNumber + 1)}
                        style={styles.controlButton}
                      >
                        <Ionicons name="add-outline" size={iconSize} color={COLORS.text.secondary} />
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>

              {/* Boutons d'action */}
              <View style={styles.actionsSection}>
                <View style={styles.actionsRow}>
                  <Button
                    title={isGenerating ? 'Génération...' : 'Générer les QR Codes'}
                    onPress={handleGenerateTables}
                    loading={isGenerating}
                    disabled={!selectedRestaurant}
                    style={{ 
                      backgroundColor: COLORS.primary,
                      flex: screenType === 'mobile' ? undefined : 2 
                    }}
                    textStyle={{ color: COLORS.surface }}
                    leftIcon="qr-code-outline"
                  />

                  {selectedRestaurant && existingTablesCount > 0 && (
                    <Button
                      title="Remplacer"
                      onPress={handleReplaceTables}
                      loading={isGenerating}
                      disabled={!selectedRestaurant}
                      style={{ 
                        backgroundColor: COLORS.error,
                        borderColor: COLORS.error,
                        flex: screenType === 'mobile' ? undefined : 1 
                      }}
                      textStyle={{ color: COLORS.surface }}
                      leftIcon="refresh-outline"
                    />
                  )}
                </View>

                {selectedRestaurant && (
                  <Button
                    title="Charger les tables existantes"
                    onPress={loadExistingTables}
                    loading={isGenerating}
                    variant="outline"
                    fullWidth
                    leftIcon="download-outline"
                    style={{ borderColor: COLORS.primary }}
                    textStyle={{ color: COLORS.primary }}
                  />
                )}

                {generatedTables.length > 0 && (
                  <View style={styles.actionsRow}>
                    <Button
                      title={isPrinting ? 'Impression...' : 'Imprimer tout'}
                      onPress={handlePrintAll}
                      style={{ 
                        backgroundColor: COLORS.secondary,
                        borderColor: COLORS.secondary,
                        flex: 1 
                      }}
                      textStyle={{ color: COLORS.text.primary }}
                      loading={isPrinting}
                      leftIcon="print-outline"
                    />
                    <Button
                      title={isDownloading ? 'Téléchargement...' : 'Télécharger PDF'}
                      onPress={handleDownloadAll}
                      variant="outline"
                      style={{ 
                        flex: 1,
                        borderColor: COLORS.secondary 
                      }}
                      textStyle={{ color: COLORS.secondary }}
                      loading={isDownloading}
                      leftIcon="download-outline"
                    />
                  </View>
                )}
              </View>
            </Card>

            {/* Information du restaurant sélectionné */}
            {selectedRestaurantData && (
              <Card style={styles.selectedRestaurantCard}>
                <View style={styles.restaurantCardContent}>
                  <View style={styles.restaurantAvatar}>
                    <Ionicons name="restaurant-outline" size={iconSize + 4} color={COLORS.surface} />
                  </View>
                  <View style={styles.restaurantDetails}>
                    <Text style={styles.restaurantCardName}>
                      {selectedRestaurantData.name}
                    </Text>
                    <Text style={styles.restaurantAddress}>
                      {selectedRestaurantData.address}, {selectedRestaurantData.city}
                    </Text>
                  </View>
                  <View style={styles.sizeBadge}>
                    <Text style={styles.sizeBadgeText}>
                      {QR_SIZES[qrSize].label}
                    </Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Liste des QR codes générés */}
            {generatedTables.length > 0 && (
              <View>
                <View style={styles.qrListHeader}>
                  <Text style={styles.qrListTitle}>
                    QR Codes générés ({generatedTables.length})
                  </Text>
                </View>

                {generatedTables.map(renderTableCard)}
              </View>
            )}

            {/* Message d'aide */}
            {generatedTables.length === 0 && (
              <Card style={styles.configCard}>
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="qr-code-outline" size={emptyIconSize} color={COLORS.secondary} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    Aucun QR code généré
                  </Text>
                  <Text style={styles.emptyMessage}>
                    Sélectionnez un restaurant et spécifiez le nombre de tables pour commencer
                  </Text>
                  
                  <View style={styles.helpCard}>
                    <Text style={styles.helpTitle}>
                      Comment ça marche :
                    </Text>
                    <Text style={styles.helpText}>
                      • Choisissez votre restaurant{'\n'}
                      • Sélectionnez la taille des QR codes{'\n'}
                      • Indiquez le nombre de tables{'\n'}
                      • Générez les QR codes{'\n'}
                      • Imprimez ou téléchargez en PDF{'\n'}
                      • Vos clients pourront scanner ou saisir le code manuel
                    </Text>
                  </View>
                </View>
              </Card>
            )}
            
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      {renderRestaurantPicker()}
      {renderPreviewModal()}
    </SafeAreaView>
  );
}