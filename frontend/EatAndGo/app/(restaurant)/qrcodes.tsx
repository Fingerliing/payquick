import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  RefreshControl,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS
} from '@/utils/designSystem';
import { router } from 'expo-router';

type ScreenType = 'mobile' | 'tablet' | 'desktop';
type QRSize = 'small' | 'medium' | 'large';

type AlertItem = {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
};
const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const pushAlert = useCallback(
    (variant: AlertItem['variant'], title: string | undefined, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts(prev => [{ id, variant, title, message }, ...prev]);
    }, []
  );
  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);
  return { alerts, pushAlert, dismissAlert };
};

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

const QR_SIZES: Record<QRSize, QRSizeConfig> = {
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

  // 🔔 alertes
  const { alerts, pushAlert, dismissAlert } = useAlerts();

  // Prompts/confirmations via AlertWithAction
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [conflictStage, setConflictStage] = useState<0 | 1 | 2>(0);
  const [suggestPrompt, setSuggestPrompt] = useState<null | { suggested: number, maxNumber: number, count: number }>(null);

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

  // ── Chargement du logo en base64 ─────────────────────────────────────────
  // Le logo doit être disponible AVANT chaque impression / téléchargement
  // pour qu'il apparaisse à la fois dans le QR (overlay) et dans l'en-tête
  // de chaque carte du PDF. `ensureLogoLoaded` retourne le data URI pour
  // éviter le piège du state React asynchrone : on ne peut pas faire
  // `await setLogoBase64(...)` puis `generateHTML()` et compter sur la
  // nouvelle valeur — `generateHTML` lirait l'ancienne valeur du closure.
  const loadLogoBase64 = useCallback(async (): Promise<string> => {
    try {
      const asset = Asset.fromModule(APP_LOGO);
      await asset.downloadAsync();
      const localUri = asset.localUri || asset.uri;
      if (!localUri) return '';
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64',
      });
      return `data:image/png;base64,${base64}`;
    } catch (err) {
      console.warn('Erreur chargement du logo en base64:', err);
      return '';
    }
  }, []);

  const ensureLogoLoaded = useCallback(async (): Promise<string> => {
    if (logoBase64) return logoBase64;
    const dataUri = await loadLogoBase64();
    if (dataUri) setLogoBase64(dataUri);
    return dataUri;
  }, [logoBase64, loadLogoBase64]);

  useEffect(() => {
    // Pré-chargement au montage : l'aperçu et les boutons sont immédiatement
    // utilisables. Si l'utilisateur clique très vite, ensureLogoLoaded prend
    // le relais et awaite avant l'impression.
    (async () => {
      const dataUri = await loadLogoBase64();
      if (dataUri) setLogoBase64(dataUri);
    })();
  }, [loadLogoBase64]);

  // ── Capture des QR codes via react-native-qrcode-svg ─────────────────────
  // STRATÉGIE :
  // On rend (offscreen, en haute résolution) un QR par table avec le prop
  // `logo={APP_LOGO}` — c'est react-native-qrcode-svg qui compose nativement
  // le QR + logo en un seul SVG. On capture ensuite chaque SVG en PNG base64
  // via `toDataURL()`, et on embarque ces data URIs dans le HTML d'impression.
  //
  // Avantages vs ancienne approche (qrserver.com + overlay <img> en CSS) :
  //  - Le logo est intégré dans le QR au moment du rendu (pas un overlay
  //    CSS qui peut être mal positionné par le moteur d'impression).
  //  - Pas de dépendance réseau au moment de l'impression (qrserver.com).
  //  - Le rendu imprimé est identique à l'affichage à l'écran (WYSIWYG).
  const qrPrintRefs = useRef<Map<string | number, any>>(new Map());

  const captureOneQRAsBase64 = useCallback(
    (tableId: string | number): Promise<string> => {
      return new Promise((resolve) => {
        const ref = qrPrintRefs.current.get(tableId);
        if (!ref || typeof ref.toDataURL !== 'function') {
          resolve('');
          return;
        }
        try {
          ref.toDataURL((base64: string) => {
            if (!base64) {
              resolve('');
              return;
            }
            // react-native-qrcode-svg retourne du base64 brut sans préfixe
            const dataUri = base64.startsWith('data:')
              ? base64
              : `data:image/png;base64,${base64}`;
            resolve(dataUri);
          });
        } catch (err) {
          console.warn(`Capture QR table ${tableId} échouée:`, err);
          resolve('');
        }
      });
    },
    [],
  );

  const captureAllQRsAsBase64 = useCallback(
    async (tables: Table[]): Promise<Map<string | number, string>> => {
      const result = new Map<string | number, string>();
      await Promise.all(
        tables.map(async (table) => {
          const dataUri = await captureOneQRAsBase64(table.id);
          if (dataUri) result.set(table.id, dataUri);
        }),
      );
      return result;
    },
    [captureOneQRAsBase64],
  );

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
      // 🆕 Auto-affichage : si des tables existent déjà, on les peuple
      // directement dans generatedTables. L'utilisateur n'a plus besoin
      // de cliquer sur "Charger les tables existantes".
      if (tablesArray.length > 0) {
        setGeneratedTables(tablesArray);
        // 🆕 Auto-suggestion du prochain numéro disponible pour faciliter
        // l'ajout de tables. L'utilisateur peut toujours overrider via
        // l'icône Settings dans le header.
        const numbers = tablesArray
          .map(t => parseInt((t as any).number, 10))
          .filter(n => !isNaN(n));
        const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
        setStartNumber(maxNumber + 1);
      } else {
        setGeneratedTables([]);
        setStartNumber(1);
      }
    } catch (error: any) {
      // On garde 0 par défaut, et on vide la liste affichée
      setExistingTablesCount(0);
      setGeneratedTables([]);
      setStartNumber(1);
    }
  };

  const selectedRestaurantData = restaurants.find((r: Restaurant) => r.id === selectedRestaurant);

  const handleGenerateTables = async () => {
    if (!selectedRestaurant) {
      pushAlert('error', 'Erreur', 'Veuillez sélectionner un restaurant');
      return;
    }

    setIsGenerating(true);
    try {
      const tables = await createTables(selectedRestaurant, tableCount, startNumber);
      const createdCount = Array.isArray(tables) ? tables.length : tableCount;
      // 🆕 Recharger la liste complète depuis le backend pour fusionner
      // anciennes + nouvelles tables, et recomputer le prochain startNumber.
      // Sans ça, setGeneratedTables(tables) écraserait les tables existantes
      // dans l'affichage alors qu'elles sont toujours en base.
      await checkExistingTables();
      pushAlert(
        'success',
        existingTablesCount > 0 ? 'Tables ajoutées' : 'Tables créées',
        `${createdCount} table(s) ${existingTablesCount > 0 ? 'ajoutée' : 'créée'}${createdCount > 1 ? 's' : ''} avec succès !`,
      );
    } catch (error: any) {
      console.error('Erreur lors de la génération des tables:', error);

      if (error?.message?.includes('400') || error?.message?.includes('exist') || error?.message?.includes('conflit')) {
        // Étape 1 : proposer "Remplacer" directement, ou "Plus d’options"
        setConflictStage(1);
      } else {
        pushAlert('error', 'Erreur', error?.message || 'Erreur lors de la génération des QR codes');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReplaceTables = async () => {
    if (!selectedRestaurant) return;
    setReplaceConfirmOpen(true);
  };

  const performReplace = async () => {
    if (!selectedRestaurant) return;

    setIsGenerating(true);
    try {
      const existingTables = await loadRestaurantTables(selectedRestaurant);
      const tablesArray = Array.isArray(existingTables) ? existingTables : [];

      if (tablesArray.length > 0) {
        const deletePromises = tablesArray.map(table => deleteTable(table.id));
        await Promise.all(deletePromises);
      }

      // 🆕 Pour un remplacement, on repart toujours à 1 (clean slate) —
      // peu importe le startNumber auto-rempli pour l'ajout. L'utilisateur
      // peut ensuite ajouter des tables au-delà via le bouton "Ajouter".
      const newTables = await createTables(selectedRestaurant, tableCount, 1);

      setGeneratedTables(newTables);
      setExistingTablesCount(newTables.length);
      // Recomputer le prochain startNumber suggéré pour de futurs ajouts.
      setStartNumber(newTables.length + 1);

      pushAlert(
        'success',
        'Remplacement réussi',
        `${tablesArray.length > 0 ? `${tablesArray.length} table(s) supprimée(s) et ` : ''}${newTables.length} nouvelle(s) table(s) créée(s) !`
      );
    } catch (error: any) {
      console.error('Erreur lors du remplacement:', error);
      pushAlert('error', 'Erreur', error?.message || 'Erreur lors du remplacement des tables');
    } finally {
      setIsGenerating(false);
      setReplaceConfirmOpen(false);
    }
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
        pushAlert('success', 'Tables chargées', `${tablesArray.length} table(s) existante(s) ont été chargées.`);
      } else {
        setExistingTablesCount(0);
        pushAlert('info', 'Aucune table', 'Aucune table trouvée pour ce restaurant.');
      }
    } catch (error: any) {
      console.error('Erreur chargement tables:', error);

      if (error?.message?.includes('404') || error?.response?.status === 404) {
        setExistingTablesCount(0);
        pushAlert('info', 'Aucune table', 'Aucune table trouvée pour ce restaurant.');
      } else {
        pushAlert('error', 'Erreur', 'Impossible de charger les tables existantes.');
      }
    } finally {
      setIsGenerating(false);
      setConflictStage(0);
    }
  };

  const suggestNewStartNumber = async () => {
    if (!selectedRestaurant) return;

    try {
      const existingTables = await loadRestaurantTables(selectedRestaurant);
      const tablesArray = Array.isArray(existingTables) ? existingTables : [];

      if (tablesArray.length > 0) {
        const maxNumber = Math.max(...tablesArray.map(t => parseInt((t as any).number) || 0));
        const suggestedStart = maxNumber + 1;
        setSuggestPrompt({ suggested: suggestedStart, maxNumber, count: tablesArray.length });
      } else {
        setStartNumber(1);
        pushAlert('info', 'Info', 'Aucune table existante trouvée. Le numéro de départ reste à 1.');
      }
    } catch (error: any) {
      if (error?.message?.includes('404') || error?.response?.status === 404) {
        setStartNumber(1);
        pushAlert('info', 'Info', 'Aucune table existante trouvée. Vous pouvez commencer au numéro 1.');
      } else {
        pushAlert('error', 'Erreur', 'Impossible de vérifier les tables existantes.');
      }
    } finally {
      setConflictStage(0);
    }
  };

  const promptForStartNumber = () => {
    setShowSettings(true);
    pushAlert('info', 'Choisir un numéro', 'Utilisez les boutons +/- pour ajuster le numéro de départ, puis générez à nouveau.');
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
      pushAlert('error', 'Erreur', 'Impossible de partager ce QR code.');
    }
  };

  const generateOptimizedPrintHTML = (
    tables: Table[],
    size: QRSize = qrSize,
    logoOverride?: string,
    qrDataUrlMap?: Map<string | number, string>,
  ) => {
    const sizeConfig = QR_SIZES[size];
    // logoOverride > state React : évite le piège du closure obsolète quand
    // on vient d'appeler ensureLogoLoaded() juste avant cette fonction.
    const effectiveLogo = logoOverride || logoBase64;

    /**
     * Génère le HTML pour le QR code d'une table.
     *  - Si la capture native a réussi (data URI dans qrDataUrlMap), on
     *    utilise directement le PNG (QR + logo déjà composés ensemble).
     *  - Sinon, on retombe sur l'ancien chemin (qrserver.com + overlay
     *    logo en CSS) comme filet de sécurité.
     */
    const generateOptimizedQRCodeSVG = (
      table: Table,
      url: string,
      qrPxSize: number,
    ) => {
      const capturedDataUri = qrDataUrlMap?.get(table.id);

      // ── Chemin privilégié : QR capturé en RAM avec logo natif intégré ────
      if (capturedDataUri) {
        return `
          <div style="width: ${qrPxSize}px; height: ${qrPxSize}px; margin: 0 auto;">
            <img src="${capturedDataUri}"
                 width="${qrPxSize}" height="${qrPxSize}"
                 style="display: block; image-rendering: -webkit-optimize-contrast;"
                 alt="QR Code" />
          </div>
        `;
      }

      // ── Fallback : qrserver.com + overlay logo (cas où la capture échoue) ─
      const qrData = encodeURIComponent(url);
      const logoSize = Math.round(qrPxSize * 0.22);
      const logoBoxSize = logoSize + 6;
      const logoOverlay = effectiveLogo
        ? `<img src="${effectiveLogo}"
                width="${logoBoxSize}" height="${logoBoxSize}"
                style="position: absolute;
                       top: 50%; left: 50%;
                       margin-top: -${Math.round(logoBoxSize / 2)}px;
                       margin-left: -${Math.round(logoBoxSize / 2)}px;
                       background: #FFFFFF;
                       padding: 3px;
                       border-radius: 6px;
                       box-sizing: border-box;
                       display: block;
                       z-index: 10;
                       image-rendering: -webkit-optimize-contrast;"
                alt="Logo" />`
        : '';
      return `
        <div style="position: relative; width: ${qrPxSize}px; height: ${qrPxSize}px; margin: 0 auto;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=${qrPxSize}x${qrPxSize}&data=${qrData}&format=png&ecc=H&margin=8"
               width="${qrPxSize}" height="${qrPxSize}"
               style="display: block; position: relative; z-index: 1; image-rendering: -webkit-optimize-contrast;"
               alt="QR Code" />
          ${logoOverlay}
        </div>
      `;
    };

    const buildOptimizedQRCard = (table: Table) => {
      // Tailles textuelles selon le format de page
      const brandFontSize = size === 'small' ? '9px' : size === 'medium' ? '11px' : '13px';
      const brandLogoPx = size === 'small' ? 14 : size === 'medium' ? 18 : 22;
      const tableFontSize = size === 'small' ? '12px' : size === 'medium' ? '14px' : '16px';
      const codeBgFontSize = size === 'small' ? '8px' : size === 'medium' ? '10px' : '11px';
      const codeFontSize = size === 'small' ? '9px' : size === 'medium' ? '11px' : '12px';
      const hintFontSize = size === 'small' ? '6px' : size === 'medium' ? '7px' : '8px';

      // 🆕 En-tête de marque EatQuickeR : logo image (si chargé) + texte.
      // Le texte est toujours présent ; le logo s'ajoute si dispo.
      const brandLogo = effectiveLogo
        ? `<img src="${effectiveLogo}" width="${brandLogoPx}" height="${brandLogoPx}" style="display: inline-block; vertical-align: middle; margin-right: 4px;" alt="EatQuickeR" />`
        : '';

      return `
        <div class="qr-card qr-card-${size}" style="width: ${sizeConfig.cardWidth}; height: ${sizeConfig.cardHeight};">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 3px; flex-shrink: 0;">
            ${brandLogo}
            <span style="font-size: ${brandFontSize}; font-weight: 700; color: #1E2A78; letter-spacing: 0.3px;">EatQuickeR</span>
          </div>
          <div style="font-size: ${tableFontSize}; font-weight: bold; color: #111827; margin-bottom: 4px; flex-shrink: 0;">Table ${table.number}</div>
          <div style="display: flex; justify-content: center; align-items: center; flex: 1; margin: 2px 0;">
            ${generateOptimizedQRCodeSVG(table, (table as any).qrCodeUrl, sizeConfig.printSize)}
          </div>
          <div style="font-size: ${codeBgFontSize}; color: #666; background: #f8f9fa; padding: 2px 4px; border-radius: 2px; margin-bottom: 2px; flex-shrink: 0;">
            <span style="font-family: monospace; font-weight: bold; font-size: ${codeFontSize}; color: #111827;">${(table as any).manualCode}</span>
          </div>
          <div style="font-size: ${hintFontSize}; color: #999; line-height: 1.1; flex-shrink: 0;">Scanner ou saisir</div>
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
      const logo = await ensureLogoLoaded();
      // 🆕 Capture chaque QR rendu en RAM (avec logo natif intégré) en PNG
      // base64. La map est passée à generateOptimizedPrintHTML qui choisit
      // le PNG capturé plutôt que qrserver.com + overlay CSS.
      const qrDataUrls = await captureAllQRsAsBase64(generatedTables);
      const html = generateOptimizedPrintHTML(generatedTables, qrSize, logo, qrDataUrls);
      await Print.printAsync({
        html,
        orientation: 'landscape',
        printerUrl: undefined,
      });
    } catch (error) {
      console.error('Erreur impression:', error);
      pushAlert('error', 'Erreur', 'Impossible d’imprimer les QR codes');
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintSingle = async (table: Table) => {
    setIsPrinting(true);
    try {
      const logo = await ensureLogoLoaded();
      const qrDataUrls = await captureAllQRsAsBase64([table]);
      const html = generateOptimizedPrintHTML([table], qrSize, logo, qrDataUrls);
      await Print.printAsync({
        html,
        orientation: 'landscape',
        printerUrl: undefined,
      });
    } catch (error) {
      console.error('Erreur impression:', error);
      pushAlert('error', 'Erreur', 'Impossible d’imprimer le QR code');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadAll = async () => {
    if (generatedTables.length === 0) return;

    setIsDownloading(true);
    try {
      const logo = await ensureLogoLoaded();
      const qrDataUrls = await captureAllQRsAsBase64(generatedTables);
      const html = generateOptimizedPrintHTML(generatedTables, qrSize, logo, qrDataUrls);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
      });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      pushAlert('error', 'Erreur', 'Impossible de générer le PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSingle = async (table: Table) => {
    setIsDownloading(true);
    try {
      const logo = await ensureLogoLoaded();
      const qrDataUrls = await captureAllQRsAsBase64([table]);
      const html = generateOptimizedPrintHTML([table], qrSize, logo, qrDataUrls);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
      });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      pushAlert('error', 'Erreur', 'Impossible de générer le PDF');
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
      pushAlert('error', 'Erreur', 'Échec du rafraîchissement.');
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

    alertsContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
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
          value={(table as any).qrCodeUrl}
          size={QR_SIZES[qrSize].displaySize}
          backgroundColor={COLORS.surface}
          color={COLORS.text.primary}
          ecl="H"
          quietZone={16}
          logo={APP_LOGO}
          logoSize={QR_SIZES[qrSize].displaySize * 0.22}
          logoBackgroundColor={COLORS.surface}
          logoMargin={2}
          logoBorderRadius={6}
        />
      </View>

      <View style={styles.manualCodeContainer}>
        <Text style={styles.manualCodeLabel}>
          Code manuel
        </Text>
        <Text style={styles.manualCode}>
          {(table as any).manualCode}
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
            leftIcon={<Ionicons name="eye-outline" size={16} color={COLORS.primary} />}
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
            leftIcon={<Ionicons name="share-outline" size={16} color={COLORS.text.primary} />}
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
            leftIcon={<Ionicons name="print-outline" size={16} color={COLORS.primary} />}
          />

          <Button
            title="Télécharger"
            onPress={() => handleDownloadSingle(table)}
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            loading={isDownloading}
            leftIcon={<Ionicons name="download-outline" size={16} color={COLORS.primary} />}
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
                value={(previewTable as any).qrCodeUrl}
                size={150}
                backgroundColor={COLORS.surface}
                color={COLORS.text.primary}
                ecl="H"
                quietZone={16}
                logo={APP_LOGO}
                logoSize={33}
                logoBackgroundColor={COLORS.surface}
                logoMargin={2}
                logoBorderRadius={6}
              />
            </View>

            <View style={styles.modalManualCodeContainer}>
              <Text style={styles.modalManualCodeLabel}>
                Code manuel
              </Text>
              <Text style={styles.modalManualCode}>
                {(previewTable as any).manualCode}
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
      <View style={styles.container}>
        <Header title="QR Codes Tables" />
        <Loading fullScreen text="Chargement..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="QR Codes Tables"
        rightIcon="settings-outline"
        onRightPress={() => setShowSettings(!showSettings)}
      />

      {/* 🔔 Bannières d’alertes */}
      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map(a => (
            <InlineAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id)}
            />
          ))}
        </View>
      )}

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

              {/* Configuration du nombre de tables — toujours visible.
                  Quand des tables existent, "Numéro de départ" est auto-rempli
                  avec le prochain numéro disponible (cf. checkExistingTables).
                  L'utilisateur peut overrider via l'icône Settings du header. */}
              <View style={styles.controlsRow}>
                <View style={styles.controlGroup}>
                  <Text style={styles.controlLabel}>
                    {existingTablesCount > 0 ? 'Nombre de tables à ajouter' : 'Nombre de tables'}
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
                {/* 🆕 Bouton "Générer" / "Ajouter" toujours visible.
                    Label adapté selon qu'on crée from scratch ou qu'on ajoute. */}
                {selectedRestaurant && (
                  <View style={styles.actionsRow}>
                    <Button
                      title={
                        isGenerating
                          ? 'Génération...'
                          : existingTablesCount > 0
                            ? `Ajouter ${tableCount} table${tableCount > 1 ? 's' : ''}`
                            : 'Générer les QR Codes'
                      }
                      onPress={handleGenerateTables}
                      loading={isGenerating}
                      disabled={!selectedRestaurant}
                      style={{
                        backgroundColor: COLORS.primary,
                        flex: 1,
                      }}
                      textStyle={{ color: COLORS.surface }}
                      leftIcon={
                        <Ionicons
                          name={existingTablesCount > 0 ? 'add-circle-outline' : 'qr-code-outline'}
                          size={16}
                          color={COLORS.surface}
                        />
                      }
                    />
                  </View>
                )}

                {/* 🆕 Bouton "Remplacer" full-width uniquement si des tables existent */}
                {selectedRestaurant && existingTablesCount > 0 && (
                  <Button
                    title="Remplacer toutes les tables"
                    onPress={handleReplaceTables}
                    loading={isGenerating}
                    disabled={!selectedRestaurant}
                    fullWidth
                    variant="outline"
                    style={{
                      borderColor: COLORS.error,
                    }}
                    textStyle={{ color: COLORS.error }}
                    leftIcon={<Ionicons name="refresh-outline" size={16} color={COLORS.error} />}
                  />
                )}

                {/* 🚫 "Charger les tables existantes" supprimé — l'auto-chargement
                       dans checkExistingTables (cf. plus haut) le rend inutile. */}

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
                      leftIcon={<Ionicons name="print-outline" size={16} color={COLORS.text.primary} />}
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
                      leftIcon={<Ionicons name="download-outline" size={16} color={COLORS.secondary} />}
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

                  <Pressable
                    style={styles.helpCard}
                    onPress={() => router.push('/help/help' as any)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: getResponsiveValue(SPACING.xs, screenType) }}>
                      <Ionicons name="help-circle-outline" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.helpTitle}>
                        Comment ça marche ?
                      </Text>
                      <Ionicons name="arrow-forward" size={14} color={COLORS.primary} style={{ marginLeft: 'auto' }} />
                    </View>
                    <Text style={styles.helpText}>
                      • Choisissez votre restaurant{'\n'}
                      • Sélectionnez la taille des QR codes{'\n'}
                      • Indiquez le nombre de tables{'\n'}
                      • Générez les QR codes{'\n'}
                      • Imprimez ou téléchargez en PDF{'\n'}
                      • Vos clients pourront scanner ou saisir le code manuel
                    </Text>
                  </Pressable>
                </View>
              </Card>
            )}

          </View>
        </View>
      </ScrollView>

      {/* 🆕 QR codes haute résolution rendus offscreen pour la capture PNG.
          react-native-qrcode-svg compose nativement QR + logo en un seul
          SVG ; on récupère un data URI via toDataURL() au moment d'imprimer.
          Le HTML d'impression embarque ce PNG tel quel — pas d'overlay,
          pas de dépendance qrserver.com. */}
      {generatedTables.length > 0 && (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            left: -99999,
            top: -99999,
            width: 1,
            height: 1,
            overflow: 'hidden',
            opacity: 0,
          }}
        >
          {generatedTables.map((table) => {
            const hdSize = QR_SIZES[qrSize].printSize * 2; // 2x pour qualité d'impression
            return (
              <QRCode
                key={`print-hd-${table.id}`}
                value={(table as any).qrCodeUrl || ''}
                size={hdSize}
                backgroundColor="#FFFFFF"
                color="#000000"
                ecl="H"
                quietZone={16}
                logo={APP_LOGO}
                logoSize={Math.round(hdSize * 0.22)}
                logoBackgroundColor="#FFFFFF"
                logoMargin={2}
                logoBorderRadius={6}
                getRef={(c) => {
                  if (c) {
                    qrPrintRefs.current.set(table.id, c);
                  }
                }}
              />
            );
          })}
        </View>
      )}

      {/* Modals */}
      {renderRestaurantPicker()}
      {renderPreviewModal()}

      {/* 🔶 Confirmation: Remplacer toutes les tables */}
      {replaceConfirmOpen && (
        <View style={{ paddingHorizontal: layoutConfig.containerPadding, paddingTop: getResponsiveValue(SPACING.sm, screenType) }}>
          <AlertWithAction
            variant="warning"
            title="Confirmer le remplacement"
            message={`Voulez-vous vraiment remplacer les tables existantes ?\n\nCette action va :\n• Supprimer toutes les tables existantes\n• Créer ${tableCount} nouvelles tables (1 à ${tableCount})\n\nCette action est irréversible.`}
            secondaryButton={{
              text: 'Annuler',
              onPress: () => setReplaceConfirmOpen(false),
            }}
            primaryButton={{
              text: 'Remplacer',
              onPress: performReplace,
              variant: 'danger',
            }}
          />
        </View>
      )}

      {/* ⚠️ Conflit à la génération — étape 1 */}
      {conflictStage === 1 && (
        <View style={{ paddingHorizontal: layoutConfig.containerPadding, paddingTop: getResponsiveValue(SPACING.sm, screenType) }}>
          <AlertWithAction
            variant="warning"
            title="Conflit détecté"
            message="Certaines tables existent déjà avec ces numéros. Que souhaitez-vous faire ?"
            secondaryButton={{
              text: 'Plus d’options',
              onPress: () => setConflictStage(2),
            }}
            primaryButton={{
              text: 'Remplacer',
              onPress: handleReplaceTables,
              variant: 'danger',
            }}
          />
        </View>
      )}

      {/* ⚙️ Conflit — étape 2 : autres options */}
      {conflictStage === 2 && (
        <View style={{ paddingHorizontal: layoutConfig.containerPadding, paddingTop: getResponsiveValue(SPACING.sm, screenType) }}>
          <AlertWithAction
            variant="info"
            title="Options disponibles"
            message="Vous pouvez charger les tables existantes ou choisir un autre numéro de départ."
            secondaryButton={{
              text: 'Autre numéro',
              onPress: () => suggestNewStartNumber(),
            }}
            primaryButton={{
              text: 'Charger existantes',
              onPress: () => loadExistingTables(),
            }}
          />
        </View>
      )}

      {/* 💡 Numéro suggéré */}
      {suggestPrompt && (
        <View style={{ paddingHorizontal: layoutConfig.containerPadding, paddingTop: getResponsiveValue(SPACING.sm, screenType) }}>
          <AlertWithAction
            variant="info"
            title="Numéro suggéré"
            message={`Il y a déjà ${suggestPrompt.count} table(s) (jusqu'au numéro ${suggestPrompt.maxNumber}).\n\nCommencer au numéro ${suggestPrompt.suggested} ?`}
            secondaryButton={{
              text: 'Choisir autre',
              onPress: () => {
                setSuggestPrompt(null);
                promptForStartNumber();
              },
            }}
            primaryButton={{
              text: 'Accepter',
              onPress: () => {
                setStartNumber(suggestPrompt.suggested);
                setSuggestPrompt(null);
                pushAlert('success', 'Numéro mis à jour', `Le numéro de départ a été changé pour ${suggestPrompt.suggested}.`);
              },
            }}
          />
        </View>
      )}
    </View>
  );
}