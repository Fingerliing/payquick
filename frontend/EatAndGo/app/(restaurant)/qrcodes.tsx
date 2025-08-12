import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Dimensions,
  RefreshControl,
  Modal,
  ViewStyle,
  TextStyle,
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
import { COLORS } from '@/constants/config';
import * as FileSystem from 'expo-file-system';
import { Image } from 'react-native';
import { Asset } from 'expo-asset';

const { width } = Dimensions.get('window');

// Import du logo de l'application
const APP_LOGO = require('@/assets/images/logo.png');

// Types pour les tailles de QR code optimisées pour format paysage A4
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
}

const QR_SIZES = {
  small: {
    label: 'Petit (24/page)',
    displaySize: 90,
    printSize: 70,
    logoSize: 12,
    perPage: 24,
    cardWidth: '16%', // 6 colonnes
    cardHeight: '31%', // 3 rangées par page
    columns: 6,
    rows: 3,
  },
  medium: {
    label: 'Moyen (12/page)',
    displaySize: 110,
    printSize: 110,
    logoSize: 18,
    perPage: 12,
    cardWidth: '32%', // 3 colonnes
    cardHeight: '31%', // 3 rangées par page
    columns: 3,
    rows: 3,
  },
  large: {
    // Ajustement : le grand format utilise réellement 6 cartes par page (2 colonnes × 3 lignes).
    label: 'Grand (6/page)',
    displaySize: 130,
    printSize: 150,
    logoSize: 26,
    perPage: 6,
    cardWidth: '49%', // 2 colonnes
    cardHeight: '31%', // 3 rangées par page
    columns: 2,
    rows: 3,
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
  // Stocke la version Base64 du logo pour l'impression. Ce state est rempli à l'initialisation
  // afin de permettre l'insertion de l'image dans le HTML généré par l'impression/PDF.
  const [logoBase64, setLogoBase64] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (restaurants.length === 1) {
      setSelectedRestaurant(restaurants[0].id);
    }
  }, [restaurants]);

  // Charge le logo en Base64 au chargement du composant. On utilise expo‑asset pour s'assurer que
  // l'image est disponible localement, puis expo‑file‑system pour lire son contenu et le convertir.
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const asset = Asset.fromModule(APP_LOGO);
        await asset.downloadAsync();
        const localUri = asset.localUri || asset.uri;
        if (localUri) {
          const base64 = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
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
      // Si erreur 404, cela signifie qu'il n'y a pas de tables
      if (error.message?.includes('404') || error.response?.status === 404) {
        console.log('Info: Aucune table trouvée pour ce restaurant (404 - normal)');
        setExistingTablesCount(0);
      } else {
        console.log('Info: Erreur lors de la vérification des tables existantes:', error.message);
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
      
      // Gestion spécifique des erreurs de conflit
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
        {
          text: 'Annuler',
          style: 'cancel'
        },
        {
          text: 'Remplacer',
          style: 'destructive',
          onPress: async () => {
            setIsGenerating(true);
            try {
              // 1. Charger les tables existantes
              const existingTables = await loadRestaurantTables(selectedRestaurant);
              const tablesArray = Array.isArray(existingTables) ? existingTables : [];
              
              if (tablesArray.length > 0) {
                // 2. Supprimer toutes les tables existantes
                console.log(`🗑️ Suppression de ${tablesArray.length} tables existantes...`);
                const deletePromises = tablesArray.map(table => deleteTable(table.id));
                await Promise.all(deletePromises);
                console.log('✅ Toutes les tables existantes ont été supprimées');
              }
              
              // 3. Créer les nouvelles tables
              console.log(`📝 Création de ${tableCount} nouvelles tables...`);
              const newTables = await createTables(selectedRestaurant, tableCount, startNumber);
              
              // 4. Mettre à jour l'état
              setGeneratedTables(newTables);
              setExistingTablesCount(newTables.length);
              
              Alert.alert(
                'Remplacement réussi', 
                `${tablesArray.length > 0 ? `${tablesArray.length} tables supprimées et ` : ''}${newTables.length} nouvelles tables créées avec succès !`,
                [{ text: 'OK' }]
              );
              
            } catch (error: any) {
              console.error('❌ Erreur lors du remplacement:', error);
              
              let errorMessage = 'Erreur lors du remplacement des tables';
              if (error.message) {
                errorMessage = error.message;
              }
              
              Alert.alert('Erreur', errorMessage);
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
      
      // Si erreur 404, cela signifie qu'il n'y a pas de tables
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
        // Trouver le numéro de table le plus élevé
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
      // Si erreur 404, cela signifie qu'il n'y a pas de tables
      if (error.message?.includes('404') || error.response?.status === 404) {
        setStartNumber(1);
        Alert.alert('Info', 'Aucune table existante trouvée. Vous pouvez commencer au numéro 1.');
      } else {
        Alert.alert('Erreur', 'Impossible de vérifier les tables existantes.');
      }
    }
  };

  const promptForStartNumber = () => {
    // Solution compatible avec Android et iOS
    Alert.alert(
      'Choisir un numéro',
      'Utilisez les boutons +/- dans les paramètres pour ajuster le numéro de départ, puis générez à nouveau.',
      [
        { 
          text: 'Compris', 
          onPress: () => setShowSettings(true)  // Ouvre les paramètres avancés
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

  // Fonction pour générer un QR code avec un logo au centre. Utilise la variable d'état logoBase64
  // pour insérer l'image en Base64 dans le HTML de l'impression. Si logoBase64 est vide (logo non chargé),
  // le QR code s'affichera sans logo.
  const generateQRCodeSVG = (url: string, size: number, logoSize: number) => {
    const qrData = encodeURIComponent(url);
    const logoPosition = (size - logoSize) / 2;
    const logoSrc = logoBase64;
    return `
      <div style="position: relative; width: ${size}px; height: ${size}px; margin: 0 auto;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${qrData}&format=png" 
             width="${size}" height="${size}" 
             style="display: block;" 
             alt="QR Code" />
        ${logoSrc ? `<img src="${logoSrc}" 
             style="
               position: absolute;
               top: ${logoPosition}px;
               left: ${logoPosition}px;
               width: ${logoSize}px;
               height: ${logoSize}px;
               background: white;
               border-radius: 4px;
               padding: 2px;
               border: 2px solid white;
               box-shadow: 0 0 0 1px #ddd;
               z-index: 1;
             " 
             alt="Logo" />` : ''}
      </div>
    `;
  };

  const generatePrintHTML = (tables: Table[], size: QRSize = qrSize) => {
    /*
     * Cette fonction génère du HTML optimisé pour l'impression en format paysage.
     * Chaque page comprend un en‑tête et une grille de QR codes répartis en deux
     * rangées. Les QR codes sont répartis en pages selon la configuration
     * spécifiée dans QR_SIZES.perPage. Pour éviter que du contenu ne déborde
     * d'une page à l'autre, on découpe le tableau en tranches et on génère
     * autant de conteneurs de page que nécessaire. Chaque conteneur possède
     * l'attribut CSS page‑break‑after pour forcer un saut de page après
     * l'impression (sauf pour la dernière page).
     */
    const sizeConfig = QR_SIZES[size];

    // Fonction utilitaire pour générer le bloc HTML d'un QR code
    const buildQRCard = (table: Table) => {
      return `
        <div class="qr-card qr-card-${size}" style="width: ${sizeConfig.cardWidth}; height: ${sizeConfig.cardHeight};">
          <div style="font-size: ${size === 'small' ? '14px' : size === 'medium' ? '16px' : '18px'}; font-weight: bold; color: #111827; margin-bottom: 6px; flex-shrink: 0;">Table ${table.number}</div>
          <div style="display: flex; justify-content: center; align-items: center; flex: 1; margin: 4px 0;">
            ${generateQRCodeSVG(table.qrCodeUrl, sizeConfig.printSize, sizeConfig.logoSize)}
          </div>
          <div style="font-size: ${size === 'small' ? '10px' : size === 'medium' ? '11px' : '12px'}; color: #666; background: #f8f9fa; padding: 3px 5px; border-radius: 3px; margin-bottom: 3px; flex-shrink: 0;">
            <span style="font-family: monospace; font-weight: bold; font-size: ${size === 'small' ? '11px' : size === 'medium' ? '12px' : '14px'}; color: #111827;">${table.manualCode}</span>
          </div>
          <div style="font-size: ${size === 'small' ? '7px' : size === 'medium' ? '8px' : '9px'}; color: #999; line-height: 1.1; flex-shrink: 0;">Scanner ou saisir le code</div>
        </div>
      `;
    };

    // Trier les tables par leur numéro (numériquement) pour que 9, 10, 11 s'affichent dans l'ordre correct
    const sortedTables = [...tables].sort((a, b) => {
      const aNum = parseInt((a as any).number, 10) || 0;
      const bNum = parseInt((b as any).number, 10) || 0;
      return aNum - bNum;
    });
    // Découper les tables triées en pages
    const pages: string[] = [];
    for (let i = 0; i < sortedTables.length; i += sizeConfig.perPage) {
      const pageTables = sortedTables.slice(i, i + sizeConfig.perPage);
      const cardsHTML = pageTables.map((table) => buildQRCard(table)).join('');
      pages.push(`
        <div class="page-container">
          <div class="qr-container">
            ${cardsHTML}
          </div>
        </div>
      `);
    }

    // Fusionner toutes les pages. Le dernier conteneur ne doit pas avoir page-break-after.
    const pagesHTML = pages
      .map((pageHTML, idx) => {
        // Ajouter un attribut data-last pour le dernier afin de supprimer le saut de page si besoin.
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
          .qr-card-small { width: 16%; height: 48%; }
          .qr-card-medium { width: 32%; height: 48%; }
          /* Pour le grand format, ajustez la hauteur à 31% afin d'afficher trois lignes de deux cartes chacune */
          .qr-card-large { width: 49%; height: 31%; }
          img { max-width: 100%; height: auto; }
          .manual-code { margin-top: 4px; font-size: 12px; font-weight: bold; text-align: center; }
        </style>
        <body>
          ${pagesHTML}
        </body>
      </html>
    `;
  };

  // Fonction pour imprimer (dialogue natif)
  const handlePrintAll = async () => {
    if (generatedTables.length === 0) return;

    setIsPrinting(true);
    try {
      const html = generatePrintHTML(generatedTables);
      await Print.printAsync({
        html,
        orientation: 'landscape',
        printerUrl: undefined, // Laisse le système choisir l'imprimante
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
      const html = generatePrintHTML([table]);
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

  // Fonction pour télécharger (PDF)
  const handleDownloadAll = async () => {
    if (generatedTables.length === 0) return;

    setIsDownloading(true);
    try {
      const html = generatePrintHTML(generatedTables);
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
      const html = generatePrintHTML([table]);
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

  const renderRestaurantPicker = () => (
    <Modal
      visible={showRestaurantPicker}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header 
          title="Choisir un restaurant"
          leftIcon="close-outline"
          onLeftPress={() => setShowRestaurantPicker(false)}
        />
        <ScrollView style={{ flex: 1 }}>
          {restaurants.map((restaurant: Restaurant) => (
            <TouchableOpacity
              key={restaurant.id}
              onPress={() => {
                setSelectedRestaurant(restaurant.id);
                setShowRestaurantPicker(false);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <View style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: COLORS.primary || '#3B82F6',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 12,
              }}>
                <Ionicons name="restaurant-outline" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: 4,
                }}>
                  {restaurant.name}
                </Text>
                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                }}>
                  {restaurant.address}, {restaurant.city}
                </Text>
              </View>
              {selectedRestaurant === restaurant.id && (
                <Ionicons name="checkmark-outline" size={24} color="#10B981" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderQRSizePicker = () => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 8,
        fontWeight: '500',
      }}>
        Taille du QR Code
      </Text>
      <View style={{
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        padding: 4,
      }}>
        {(Object.keys(QR_SIZES) as QRSize[]).map((size) => (
          <TouchableOpacity
            key={size}
            onPress={() => setQrSize(size)}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: qrSize === size ? '#FFFFFF' : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{
              fontSize: 14,
              fontWeight: qrSize === size ? '600' : '400',
              color: qrSize === size ? '#111827' : '#6B7280',
            }}>
              {QR_SIZES[size].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderTableCard = (table: Table) => (
    <Card key={table.id} style={{ marginBottom: 16 }}>
      <View style={{ alignItems: 'center', padding: 16 }}>
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          marginBottom: 16,
        }}>
          Table {table.number}
        </Text>
        
        <View style={{ marginBottom: 16 }}>
          <QRCode
            value={table.qrCodeUrl}
            size={QR_SIZES[qrSize].displaySize}
            backgroundColor="#FFFFFF"
            color="#000000"
            logo={APP_LOGO}
            logoSize={QR_SIZES[qrSize].logoSize}
            logoBackgroundColor="#FFFFFF"
            logoMargin={2}
            logoBorderRadius={4}
            quietZone={4}
          />
        </View>
        
        <View style={{
          backgroundColor: '#F3F4F6',
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}>
          <Text style={{
            fontSize: 12,
            color: '#6B7280',
            fontWeight: '500',
            marginBottom: 4,
          }}>
            Code manuel
          </Text>
          <Text style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: '#111827',
            fontFamily: 'monospace',
          }}>
            {table.manualCode}
          </Text>
        </View>
        
        <Text style={{
          fontSize: 12,
          color: '#9CA3AF',
          textAlign: 'center',
          marginBottom: 16,
        }}>
          Scannez le QR code ou saisissez le code manuel
        </Text>
        
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-around', 
          width: '100%',
          gap: 8,
        }}>
          <Button
            title="Aperçu"
            onPress={() => setPreviewTable(table)}
            variant="outline"
            size="small"
            style={{ flex: 1 }}
          />
          
          <Button
            title="Partager"
            onPress={() => handleShareTable(table)}
            variant="secondary"
            size="small"
            style={{ flex: 1 }}
          />
        </View>

        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-around', 
          width: '100%',
          gap: 8,
          marginTop: 8,
        }}>
          <Button
            title="Imprimer"
            onPress={() => handlePrintSingle(table)}
            variant="outline"
            size="small"
            style={{ flex: 1 }}
            loading={isPrinting}
          />
          
          <Button
            title="Télécharger"
            onPress={() => handleDownloadSingle(table)}
            variant="outline"
            size="small"
            style={{ flex: 1 }}
            loading={isDownloading}
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
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
        {previewTable && (
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            padding: 24,
            alignItems: 'center',
            maxWidth: 300,
            width: '100%',
          }}>
            <Text style={{
              fontSize: 20,
              fontWeight: '600',
              marginBottom: 16,
            }}>
              Table {previewTable.number}
            </Text>
            
            <View style={{ marginBottom: 16 }}>
              <QRCode
                value={previewTable.qrCodeUrl}
                size={150}
                backgroundColor="#FFFFFF"
                color="#000000"
                logo={APP_LOGO}
                logoSize={30}
                logoBackgroundColor="#FFFFFF"
                logoMargin={2}
                logoBorderRadius={4}
                quietZone={4}
              />
            </View>
            
            <View style={{
              backgroundColor: '#F3F4F6',
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 12,
                color: '#6B7280',
                fontWeight: '500',
                marginBottom: 4,
              }}>
                Code manuel
              </Text>
              <Text style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: '#111827',
                fontFamily: 'monospace',
              }}>
                {previewTable.manualCode}
              </Text>
            </View>
            
            <Text style={{
              fontSize: 12,
              color: '#9CA3AF',
              textAlign: 'center',
              marginBottom: 20,
            }}>
              Scannez le QR code ou saisissez le code manuel
            </Text>
            
            <Button
              title="Fermer"
              onPress={() => setPreviewTable(null)}
              variant="secondary"
            />
          </View>
        )}
      </View>
    </Modal>
  );

  if (isLoading && restaurants.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="QR Codes Tables" />
        <Loading fullScreen text="Chargement..." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="QR Codes Tables"
        rightIcon="settings-outline"
        onRightPress={() => setShowSettings(!showSettings)}
      />
      
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Configuration */}
        <Card style={{ margin: 16 }}>
          <View style={{ padding: 16 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <Ionicons name="qr-code-outline" size={24} color="#059669" />
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#111827',
                marginLeft: 8,
              }}>
                Générateur de QR Codes
              </Text>
            </View>
            
            <Text style={{
              fontSize: 14,
              color: '#6B7280',
              marginBottom: 20,
              lineHeight: 20,
            }}>
              Créez des QR codes pour vos tables et permettez à vos clients de scanner ou saisir un code manuel pour accéder au menu.
            </Text>

            {/* Indication des tables existantes */}
            {selectedRestaurant && existingTablesCount > 0 && (
              <View style={{
                backgroundColor: '#FEF3C7',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Ionicons name="information-circle-outline" size={20} color="#D97706" />
                <Text style={{
                  fontSize: 14,
                  color: '#92400E',
                  marginLeft: 8,
                  flex: 1,
                }}>
                  {existingTablesCount} table{existingTablesCount > 1 ? 's' : ''} existe{existingTablesCount > 1 ? 'nt' : ''} déjà pour ce restaurant
                </Text>
              </View>
            )}

            {/* Sélection du restaurant */}
            <TouchableOpacity
              onPress={() => setShowRestaurantPicker(true)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                backgroundColor: '#F3F4F6',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <View>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginBottom: 2,
                }}>
                  Restaurant
                </Text>
                <Text style={{
                  fontSize: 16,
                  color: '#111827',
                  fontWeight: '500',
                }}>
                  {selectedRestaurantData?.name || 'Sélectionner un restaurant'}
                </Text>
              </View>
              <Ionicons name="chevron-down-outline" size={20} color="#6B7280" />
            </TouchableOpacity>

            {/* Sélecteur de taille de QR Code */}
            {renderQRSizePicker()}

            {/* Configuration du nombre de tables */}
            <View style={{
              flexDirection: 'row',
              marginBottom: 16,
              gap: 12,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginBottom: 8,
                  fontWeight: '500',
                }}>
                  Nombre de tables
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F3F4F6',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  height: 44,
                }}>
                  <TouchableOpacity
                    onPress={() => setTableCount(Math.max(1, tableCount - 1))}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: '#FFFFFF',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="remove-outline" size={16} color="#6B7280" />
                  </TouchableOpacity>
                  <Text style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#111827',
                  }}>
                    {tableCount}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setTableCount(Math.min(50, tableCount + 1))}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: '#FFFFFF',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="add-outline" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {showSettings && (
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 12,
                    color: '#6B7280',
                    marginBottom: 8,
                    fontWeight: '500',
                  }}>
                    Numéro de départ
                  </Text>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F3F4F6',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    height: 44,
                  }}>
                    <TouchableOpacity
                      onPress={() => setStartNumber(Math.max(1, startNumber - 1))}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: '#FFFFFF',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="remove-outline" size={16} color="#6B7280" />
                    </TouchableOpacity>
                    <Text style={{
                      flex: 1,
                      textAlign: 'center',
                      fontSize: 16,
                      fontWeight: '600',
                      color: '#111827',
                    }}>
                      {startNumber}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setStartNumber(startNumber + 1)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: '#FFFFFF',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="add-outline" size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Boutons d'action */}
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Button
                  title={isGenerating ? 'Génération...' : 'Générer les QR Codes'}
                  onPress={handleGenerateTables}
                  loading={isGenerating}
                  disabled={!selectedRestaurant}
                  variant="primary"
                  style={{ flex: 2 }}
                />

                {selectedRestaurant && existingTablesCount > 0 && (
                  <Button
                    title="Remplacer"
                    onPress={handleReplaceTables}
                    loading={isGenerating}
                    disabled={!selectedRestaurant}
                    variant="destructive"
                    style={{ flex: 1 }}
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
                />
              )}

              {generatedTables.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Button
                    title={isPrinting ? 'Impression...' : 'Imprimer tout'}
                    onPress={handlePrintAll}
                    variant="secondary"
                    style={{ flex: 1 }}
                    loading={isPrinting}
                  />
                  <Button
                    title={isDownloading ? 'Téléchargement...' : 'Télécharger PDF'}
                    onPress={handleDownloadAll}
                    variant="outline"
                    style={{ flex: 1 }}
                    loading={isDownloading}
                  />
                </View>
              )}
            </View>
          </View>
        </Card>

        {/* Information du restaurant sélectionné */}
        {selectedRestaurantData && (
          <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
            }}>
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: '#059669',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 12,
              }}>
                <Ionicons name="restaurant-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: 2,
                }}>
                  {selectedRestaurantData.name}
                </Text>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                }}>
                  {selectedRestaurantData.address}, {selectedRestaurantData.city}
                </Text>
              </View>
              <View style={{
                backgroundColor: '#F3F4F6',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 4,
              }}>
                <Text style={{
                  fontSize: 10,
                  color: '#6B7280',
                  fontWeight: '500',
                }}>
                  {QR_SIZES[qrSize].label}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Liste des QR codes générés */}
        {generatedTables.length > 0 && (
          <View style={{ marginHorizontal: 16 }}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#111827',
              }}>
                QR Codes générés ({generatedTables.length})
              </Text>
            </View>

            {generatedTables.map(renderTableCard)}
          </View>
        )}

        {/* Message d'aide */}
        {generatedTables.length === 0 && (
          <Card style={{ margin: 16 }}>
            <View style={{
              alignItems: 'center',
              padding: 32,
            }}>
              <Ionicons name="qr-code-outline" size={64} color="#D1D5DB" />
              <Text style={{
                fontSize: 18,
                fontWeight: '500',
                color: '#111827',
                marginTop: 16,
                marginBottom: 8,
                textAlign: 'center',
              }}>
                Aucun QR code généré
              </Text>
              <Text style={{
                fontSize: 14,
                color: '#6B7280',
                textAlign: 'center',
                lineHeight: 20,
                marginBottom: 24,
              }}>
                Sélectionnez un restaurant et spécifiez le nombre de tables pour commencer
              </Text>
              
              <View style={{
                backgroundColor: '#EBF8FF',
                padding: 16,
                borderRadius: 8,
                width: '100%',
              }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#1E40AF',
                  marginBottom: 8,
                }}>
                  Comment ça marche :
                </Text>
                <Text style={{
                  fontSize: 12,
                  color: '#1E40AF',
                  lineHeight: 18,
                }}>
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
      </ScrollView>

      {/* Modals */}
      {renderRestaurantPicker()}
      {renderPreviewModal()}
    </View>
  );
}