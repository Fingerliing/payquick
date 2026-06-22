import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  RefreshControl,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import { Table } from '@/types/table';
import { Restaurant } from '@/types/restaurant';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';
type QRSize = 'small' | 'medium' | 'large';

// ════════════════════════════════════════════════════════════════════════════
// COULEURS FIGÉES DU PDF
// ════════════════════════════════════════════════════════════════════════════
// Le PDF imprimé est un livrable physique qui ne suit JAMAIS le thème de
// l'app. La marque EatQuickeR doit y apparaître en navy + blanc, et le QR
// code doit rester fond blanc / encre noire pour être scannable par toutes
// les caméras (un QR sur fond sombre peut faire échouer le scan).
const PDF_COLORS = {
  brand: '#1E2A78',
  text: '#111827',
  textMuted: '#666',
  textFaint: '#999',
  codeBg: '#f8f9fa',
  white: '#FFFFFF',
  black: '#000000',
} as const;

// ════════════════════════════════════════════════════════════════════════════
// ALERTS HOOK
// ════════════════════════════════════════════════════════════════════════════
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
      setAlerts((prev) => [{ id, variant, title, message }, ...prev]);
    },
    [],
  );
  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);
  return { alerts, pushAlert, dismissAlert };
};

// ════════════════════════════════════════════════════════════════════════════
// CONFIG QR SIZES
// ════════════════════════════════════════════════════════════════════════════
interface QRSizeConfig {
  /** Clé i18n pour le label (avec pluralisation sur perPage) */
  labelKey: 'small' | 'medium' | 'large';
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
    labelKey: 'small',
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
    labelKey: 'medium',
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
    labelKey: 'large',
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

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function QRCodesScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();

  const {
    restaurants,
    createTables,
    loadRestaurantTables,
    deleteTable,
    isLoading,
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

  const { alerts, pushAlert, dismissAlert } = useAlerts();

  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [conflictStage, setConflictStage] = useState<0 | 1 | 2>(0);
  const [suggestPrompt, setSuggestPrompt] = useState<null | {
    suggested: number;
    maxNumber: number;
    count: number;
  }>(null);

  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Configuration responsive
  const layoutConfig = useMemo(
    () => ({
      containerPadding: getResponsiveValue(SPACING.container, screenType),
      maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
      isTabletLandscape: screenType === 'tablet' && width > 1000,
      cardColumns: getResponsiveValue({ mobile: 1, tablet: 2, desktop: 3 }, screenType),
    }),
    [screenType, width],
  );

  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType, layoutConfig),
    [colors, isDark, screenType, layoutConfig],
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Helper pour les labels de tailles QR (avec pluralisation CLDR sur perPage)
  // ──────────────────────────────────────────────────────────────────────────
  const getQrSizeLabel = useCallback(
    (size: QRSize): string => {
      const config = QR_SIZES[size];
      return t(`restaurantQrCodes.sizes.${config.labelKey}`, {
        count: config.perPage,
      });
    },
    [t],
  );

  // Sépare le label combiné "Petit (24/page)" en { name, count } pour pouvoir
  // afficher le nombre de pages sur une 2e ligne dans le sélecteur de taille.
  // Gère les parenthèses ASCII () et pleine chasse （）. Fallback : si la langue
  // n'utilise pas de parenthèses, tout reste sur la 1re ligne (count = '').
  const getQrSizeParts = useCallback(
    (size: QRSize): { name: string; count: string } => {
      const full = getQrSizeLabel(size);
      const match = full.match(/^(.*?)\s*[(（]([^)）]*)[)）]\s*$/);
      if (match) {
        return { name: match[1].trim(), count: match[2].trim() };
      }
      return { name: full, count: '' };
    },
    [getQrSizeLabel],
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Auto-sélection du restaurant unique
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (restaurants.length === 1) {
      setSelectedRestaurant(restaurants[0].id);
    }
  }, [restaurants]);

  // ──────────────────────────────────────────────────────────────────────────
  // Chargement du logo en base64
  // ──────────────────────────────────────────────────────────────────────────
  const loadLogoBase64 = useCallback(async (): Promise<string> => {
    try {
      const asset = Asset.fromModule(APP_LOGO);
      await asset.downloadAsync();
      const localUri = asset.localUri || asset.uri;
      if (!localUri) return '';
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
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
    (async () => {
      const dataUri = await loadLogoBase64();
      if (dataUri) setLogoBase64(dataUri);
    })();
  }, [loadLogoBase64]);

  // ──────────────────────────────────────────────────────────────────────────
  // Capture des QR codes via react-native-qrcode-svg.toDataURL()
  // ──────────────────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────────
  // Tables existantes : vérification + auto-population
  // ──────────────────────────────────────────────────────────────────────────
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
      if (tablesArray.length > 0) {
        setGeneratedTables(tablesArray);
        const numbers = tablesArray
          .map((tab) => parseInt((tab as any).number, 10))
          .filter((n) => !isNaN(n));
        const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
        setStartNumber(maxNumber + 1);
      } else {
        setGeneratedTables([]);
        setStartNumber(1);
      }
    } catch {
      setExistingTablesCount(0);
      setGeneratedTables([]);
      setStartNumber(1);
    }
  };

  const selectedRestaurantData = restaurants.find(
    (r: Restaurant) => r.id === selectedRestaurant,
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Génération / remplacement / chargement / suggestion
  // ──────────────────────────────────────────────────────────────────────────
  const handleGenerateTables = async () => {
    if (!selectedRestaurant) {
      pushAlert(
        'error',
        t('common.error'),
        t('restaurantQrCodes.errors.selectRestaurant'),
      );
      return;
    }

    setIsGenerating(true);
    try {
      const tables = await createTables(selectedRestaurant, tableCount, startNumber);
      const createdCount = Array.isArray(tables) ? tables.length : tableCount;
      const wasAdding = existingTablesCount > 0;
      await checkExistingTables();
      pushAlert(
        'success',
        wasAdding
          ? t('restaurantQrCodes.feedback.tablesAddedTitle')
          : t('restaurantQrCodes.feedback.tablesCreatedTitle'),
        wasAdding
          ? t('restaurantQrCodes.feedback.tablesAddedMessage', { count: createdCount })
          : t('restaurantQrCodes.feedback.tablesCreatedMessage', { count: createdCount }),
      );
    } catch (error: any) {
      console.error('Erreur lors de la génération des tables:', error);
      if (
        error?.message?.includes('400') ||
        error?.message?.includes('exist') ||
        error?.message?.includes('conflit')
      ) {
        setConflictStage(1);
      } else {
        pushAlert(
          'error',
          t('common.error'),
          error?.message || t('restaurantQrCodes.errors.generationFailed'),
        );
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
        const deletePromises = tablesArray.map((table) => deleteTable(table.id));
        await Promise.all(deletePromises);
      }

      const newTables = await createTables(selectedRestaurant, tableCount, 1);

      setGeneratedTables(newTables);
      setExistingTablesCount(newTables.length);
      setStartNumber(newTables.length + 1);

      pushAlert(
        'success',
        t('restaurantQrCodes.feedback.replaceSuccessTitle'),
        tablesArray.length > 0
          ? t('restaurantQrCodes.feedback.replaceSuccessMessage', {
              deleted: tablesArray.length,
              created: newTables.length,
            })
          : t('restaurantQrCodes.feedback.replaceCreatedMessage', {
              count: newTables.length,
            }),
      );
    } catch (error: any) {
      console.error('Erreur lors du remplacement:', error);
      pushAlert(
        'error',
        t('common.error'),
        error?.message || t('restaurantQrCodes.errors.replaceFailed'),
      );
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
        pushAlert(
          'success',
          t('restaurantQrCodes.feedback.tablesLoadedTitle'),
          t('restaurantQrCodes.feedback.tablesLoadedMessage', { count: tablesArray.length }),
        );
      } else {
        setExistingTablesCount(0);
        pushAlert(
          'info',
          t('restaurantQrCodes.feedback.noTableTitle'),
          t('restaurantQrCodes.feedback.noTableForRestaurant'),
        );
      }
    } catch (error: any) {
      console.error('Erreur chargement tables:', error);
      if (error?.message?.includes('404') || error?.response?.status === 404) {
        setExistingTablesCount(0);
        pushAlert(
          'info',
          t('restaurantQrCodes.feedback.noTableTitle'),
          t('restaurantQrCodes.feedback.noTableForRestaurant'),
        );
      } else {
        pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.loadFailed'));
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
        const maxNumber = Math.max(
          ...tablesArray.map((tab) => parseInt((tab as any).number) || 0),
        );
        const suggestedStart = maxNumber + 1;
        setSuggestPrompt({ suggested: suggestedStart, maxNumber, count: tablesArray.length });
      } else {
        setStartNumber(1);
        pushAlert(
          'info',
          t('restaurantQrCodes.feedback.infoTitle'),
          t('restaurantQrCodes.feedback.noExistingStartsAt1'),
        );
      }
    } catch (error: any) {
      if (error?.message?.includes('404') || error?.response?.status === 404) {
        setStartNumber(1);
        pushAlert(
          'info',
          t('restaurantQrCodes.feedback.infoTitle'),
          t('restaurantQrCodes.feedback.noExistingCanStartAt1'),
        );
      } else {
        pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.checkFailed'));
      }
    } finally {
      setConflictStage(0);
    }
  };

  const promptForStartNumber = () => {
    setShowSettings(true);
    pushAlert(
      'info',
      t('restaurantQrCodes.feedback.chooseNumberTitle'),
      t('restaurantQrCodes.feedback.chooseNumberMessage'),
    );
  };

  const handleShareTable = async (table: Table) => {
    try {
      const message = t('restaurantQrCodes.share.message', {
        number: table.number,
        restaurant: selectedRestaurantData?.name ?? '',
        code: (table as any).manualCode,
        url: (table as any).qrCodeUrl,
      });
      await Share.share({
        message,
        title: t('restaurantQrCodes.share.title', { number: table.number }),
      });
    } catch (error) {
      console.error('Erreur partage:', error);
      pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.shareFailed'));
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // HTML d'impression PDF — couleurs HARDCODÉES (identité marque + scannabilité)
  // ──────────────────────────────────────────────────────────────────────────
  const generateOptimizedPrintHTML = (
    tables: Table[],
    size: QRSize = qrSize,
    logoOverride?: string,
    qrDataUrlMap?: Map<string | number, string>,
  ) => {
    const sizeConfig = QR_SIZES[size];
    const effectiveLogo = logoOverride || logoBase64;

    const scanOrEnterLabel = t('restaurantQrCodes.pdf.scanOrEnter');
    const tableLabel = t('restaurantQrCodes.pdf.tableLabel'); // "Table" prefix

    const generateOptimizedQRCodeSVG = (
      table: Table,
      url: string,
      qrPxSize: number,
    ) => {
      const capturedDataUri = qrDataUrlMap?.get(table.id);

      // ── Chemin privilégié : QR capturé en RAM ─────────────────────────────
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

      // ── Fallback : qrserver.com + overlay logo ────────────────────────────
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
                       background: ${PDF_COLORS.white};
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
      const brandFontSize = size === 'small' ? '9px' : size === 'medium' ? '11px' : '13px';
      const brandLogoPx = size === 'small' ? 14 : size === 'medium' ? 18 : 22;
      const tableFontSize = size === 'small' ? '12px' : size === 'medium' ? '14px' : '16px';
      const codeBgFontSize = size === 'small' ? '8px' : size === 'medium' ? '10px' : '11px';
      const codeFontSize = size === 'small' ? '9px' : size === 'medium' ? '11px' : '12px';
      const hintFontSize = size === 'small' ? '6px' : size === 'medium' ? '7px' : '8px';

      const brandLogo = effectiveLogo
        ? `<img src="${effectiveLogo}" width="${brandLogoPx}" height="${brandLogoPx}" style="display: inline-block; vertical-align: middle; margin-right: 4px;" alt="EatQuickeR" />`
        : '';

      return `
        <div class="qr-card qr-card-${size}" style="width: ${sizeConfig.cardWidth}; height: ${sizeConfig.cardHeight};">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 3px; flex-shrink: 0;">
            ${brandLogo}
            <span style="font-size: ${brandFontSize}; font-weight: 700; color: ${PDF_COLORS.brand}; letter-spacing: 0.3px;">EatQuickeR</span>
          </div>
          <div style="font-size: ${tableFontSize}; font-weight: bold; color: ${PDF_COLORS.text}; margin-bottom: 4px; flex-shrink: 0;">${tableLabel} ${table.number}</div>
          <div style="display: flex; justify-content: center; align-items: center; flex: 1; margin: 2px 0;">
            ${generateOptimizedQRCodeSVG(table, (table as any).qrCodeUrl, sizeConfig.printSize)}
          </div>
          <div style="font-size: ${codeBgFontSize}; color: ${PDF_COLORS.textMuted}; background: ${PDF_COLORS.codeBg}; padding: 2px 4px; border-radius: 2px; margin-bottom: 2px; flex-shrink: 0;">
            <span style="font-family: monospace; font-weight: bold; font-size: ${codeFontSize}; color: ${PDF_COLORS.text};">${(table as any).manualCode}</span>
          </div>
          <div style="font-size: ${hintFontSize}; color: ${PDF_COLORS.textFaint}; line-height: 1.1; flex-shrink: 0;">${scanOrEnterLabel}</div>
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
          ? pageHTML.replace(
              '<div class="page-container">',
              '<div class="page-container last-page">',
            )
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

  // ──────────────────────────────────────────────────────────────────────────
  // Actions impression / téléchargement
  // ──────────────────────────────────────────────────────────────────────────
  const handlePrintAll = async () => {
    if (generatedTables.length === 0) return;
    setIsPrinting(true);
    try {
      const logo = await ensureLogoLoaded();
      const qrDataUrls = await captureAllQRsAsBase64(generatedTables);
      const html = generateOptimizedPrintHTML(generatedTables, qrSize, logo, qrDataUrls);
      await Print.printAsync({ html, orientation: 'landscape', printerUrl: undefined });
    } catch (error) {
      console.error('Erreur impression:', error);
      pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.printAllFailed'));
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
      await Print.printAsync({ html, orientation: 'landscape', printerUrl: undefined });
    } catch (error) {
      console.error('Erreur impression:', error);
      pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.printOneFailed'));
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
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.pdfFailed'));
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
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.pdfFailed'));
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
      pushAlert('error', t('common.error'), t('restaurantQrCodes.errors.refreshFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Tailles d'icônes responsive
  // ──────────────────────────────────────────────────────────────────────────
  const iconSize = getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType);
  const qrIconSize = getResponsiveValue({ mobile: 24, tablet: 26, desktop: 28 }, screenType);
  const emptyIconSize = getResponsiveValue({ mobile: 64, tablet: 80, desktop: 96 }, screenType);

  // ──────────────────────────────────────────────────────────────────────────
  // Sous-renders
  // ──────────────────────────────────────────────────────────────────────────
  const renderRestaurantPicker = () => (
    <Modal
      visible={showRestaurantPicker}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.pickerContainer}>
        <Header
          title={t('restaurantQrCodes.restaurantPicker.title')}
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
              android_ripple={{ color: colors.primary + '20', borderless: false }}
            >
              <View style={styles.pickerOptionAvatar}>
                <Ionicons
                  name="restaurant-outline"
                  size={iconSize + 8}
                  color={colors.text.inverse}
                />
              </View>
              <View style={styles.pickerOptionContent}>
                <Text style={styles.pickerOptionName}>{restaurant.name}</Text>
                <Text style={styles.pickerOptionAddress}>
                  {restaurant.address}, {restaurant.city}
                </Text>
              </View>
              {selectedRestaurant === restaurant.id && (
                <Ionicons name="checkmark-outline" size={iconSize + 8} color={colors.success} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderQRSizePicker = () => (
    <View style={styles.qrSizePicker}>
      <Text style={styles.qrSizeLabel}>{t('restaurantQrCodes.controls.qrSize')}</Text>
      <View style={styles.qrSizeButtons}>
        {(Object.keys(QR_SIZES) as QRSize[]).map((size) => {
          const { name, count } = getQrSizeParts(size);
          const active = qrSize === size;
          return (
            <Pressable
              key={size}
              onPress={() => setQrSize(size)}
              style={[styles.qrSizeButton, active && styles.qrSizeButtonActive]}
              android_ripple={{ color: colors.secondary + '20', borderless: false }}
            >
              <Text
                style={[
                  styles.qrSizeButtonText,
                  active && styles.qrSizeButtonTextActive,
                ]}
              >
                {name}
              </Text>
              {count ? (
                <Text
                  style={[
                    styles.qrSizeButtonCount,
                    active && styles.qrSizeButtonCountActive,
                  ]}
                >
                  {count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderTableCard = (table: Table) => (
    <Card key={table.id} style={styles.qrCard}>
      <Text style={styles.tableTitle}>
        {t('restaurantQrCodes.card.tableTitle', { number: table.number })}
      </Text>

      <View style={styles.qrCodeContainer}>
        {/*
          QR foreground/background HARDCODÉS en blanc/noir pour rester
          scannable même quand l'app est en dark mode. Un QR sur fond
          sombre fait échouer beaucoup de caméras de téléphone.
        */}
        <QRCode
          value={(table as any).qrCodeUrl}
          size={QR_SIZES[qrSize].displaySize}
          backgroundColor={PDF_COLORS.white}
          color={PDF_COLORS.black}
          ecl="H"
          quietZone={16}
          logo={APP_LOGO}
          logoSize={QR_SIZES[qrSize].displaySize * 0.22}
          logoBackgroundColor={PDF_COLORS.white}
          logoMargin={2}
          logoBorderRadius={6}
        />
      </View>

      <View style={styles.manualCodeContainer}>
        <Text style={styles.manualCodeLabel}>
          {t('restaurantQrCodes.card.manualCodeLabel')}
        </Text>
        <Text style={styles.manualCode}>{(table as any).manualCode}</Text>
      </View>

      <Text style={styles.instruction}>
        {t('restaurantQrCodes.card.instruction')}
      </Text>

      <View style={styles.qrActions}>
        <View style={styles.qrActionsRow}>
          <Button
            title={t('restaurantQrCodes.actions.preview')}
            onPress={() => setPreviewTable(table)}
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            leftIcon={<Ionicons name="eye-outline" size={16} color={colors.primary} />}
          />
          <Button
            title={t('restaurantQrCodes.actions.share')}
            onPress={() => handleShareTable(table)}
            style={{
              flex: 1,
              backgroundColor: colors.secondary,
              borderColor: colors.secondary,
            }}
            textStyle={{ color: colors.text.primary }}
            size="sm"
            leftIcon={<Ionicons name="share-outline" size={16} color={colors.text.primary} />}
          />
        </View>

        <View style={styles.qrActionsRow}>
          <Button
            title={t('restaurantQrCodes.actions.print')}
            onPress={() => handlePrintSingle(table)}
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            loading={isPrinting}
            leftIcon={<Ionicons name="print-outline" size={16} color={colors.primary} />}
          />
          <Button
            title={t('restaurantQrCodes.actions.download')}
            onPress={() => handleDownloadSingle(table)}
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            loading={isDownloading}
            leftIcon={<Ionicons name="download-outline" size={16} color={colors.primary} />}
          />
        </View>
      </View>
    </Card>
  );

  const renderPreviewModal = () => (
    <Modal visible={!!previewTable} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        {previewTable && (
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('restaurantQrCodes.card.tableTitle', { number: previewTable.number })}
            </Text>

            <View style={styles.modalQRContainer}>
              <QRCode
                value={(previewTable as any).qrCodeUrl}
                size={150}
                backgroundColor={PDF_COLORS.white}
                color={PDF_COLORS.black}
                ecl="H"
                quietZone={16}
                logo={APP_LOGO}
                logoSize={33}
                logoBackgroundColor={PDF_COLORS.white}
                logoMargin={2}
                logoBorderRadius={6}
              />
            </View>

            <View style={styles.modalManualCodeContainer}>
              <Text style={styles.modalManualCodeLabel}>
                {t('restaurantQrCodes.card.manualCodeLabel')}
              </Text>
              <Text style={styles.modalManualCode}>
                {(previewTable as any).manualCode}
              </Text>
            </View>

            <Text style={styles.modalInstruction}>
              {t('restaurantQrCodes.card.instruction')}
            </Text>

            <Button
              title={t('restaurantDailyMenu.close')}
              onPress={() => setPreviewTable(null)}
              style={{ backgroundColor: colors.secondary }}
              textStyle={{ color: colors.text.primary }}
            />
          </View>
        )}
      </View>
    </Modal>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Loading initial
  // ──────────────────────────────────────────────────────────────────────────
  if (isLoading && restaurants.length === 0) {
    return (
      <View style={styles.container}>
        <Header
          title={t('restaurantNav.qrcodes')}
          showLanguageSwitcher
          showThemeSwitcher
        />
        <Loading fullScreen text={t('restaurantHome.empty.loading')} />
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rendu principal
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Header
        title={t('restaurantNav.qrcodes')}
        rightIcon="settings-outline"
        onRightPress={() => setShowSettings(!showSettings)}
        showLanguageSwitcher
        showThemeSwitcher
      />

      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map((a) => (
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
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.scrollContent}>
            {/* Configuration */}
            <Card style={styles.configCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="qr-code-outline" size={qrIconSize} color={colors.secondary} />
                <Text style={styles.sectionTitle}>
                  {t('restaurantQrCodes.generator.sectionTitle')}
                </Text>
              </View>

              <Text style={styles.description}>
                {t('restaurantQrCodes.generator.description')}
              </Text>

              {/* Indication tables existantes */}
              {selectedRestaurant && existingTablesCount > 0 && (
                <View style={styles.warningCard}>
                  <Ionicons
                    name="information-circle-outline"
                    size={iconSize + 4}
                    color={colors.warning}
                  />
                  <Text style={styles.warningText}>
                    {t('restaurantQrCodes.warnings.existingTables', {
                      count: existingTablesCount,
                    })}
                  </Text>
                </View>
              )}

              {/* Sélection restaurant */}
              <Pressable
                onPress={() => setShowRestaurantPicker(true)}
                style={styles.restaurantSelector}
                android_ripple={{ color: colors.primary + '20', borderless: false }}
              >
                <View style={styles.restaurantInfo}>
                  <Text style={styles.restaurantLabel}>
                    {t('restaurantQrCodes.generator.restaurantLabel')}
                  </Text>
                  <Text style={styles.restaurantName}>
                    {selectedRestaurantData?.name ||
                      t('restaurantQrCodes.generator.selectPlaceholder')}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-down-outline"
                  size={iconSize + 4}
                  color={colors.text.secondary}
                />
              </Pressable>

              {/* Sélecteur de taille */}
              {renderQRSizePicker()}

              {/* Contrôles numériques */}
              <View style={styles.controlsRow}>
                <View style={styles.controlGroup}>
                  <Text style={styles.controlLabel}>
                    {existingTablesCount > 0
                      ? t('restaurantQrCodes.controls.tablesToAdd')
                      : t('restaurantQrCodes.controls.tablesCount')}
                  </Text>
                  <View style={styles.controlContainer}>
                    <Pressable
                      onPress={() => setTableCount(Math.max(1, tableCount - 1))}
                      style={styles.controlButton}
                    >
                      <Ionicons name="remove-outline" size={iconSize} color={colors.text.secondary} />
                    </Pressable>
                    <Text style={styles.controlValue}>{tableCount}</Text>
                    <Pressable
                      onPress={() => setTableCount(Math.min(50, tableCount + 1))}
                      style={styles.controlButton}
                    >
                      <Ionicons name="add-outline" size={iconSize} color={colors.text.secondary} />
                    </Pressable>
                  </View>
                </View>

                {showSettings && (
                  <View style={styles.controlGroup}>
                    <Text style={styles.controlLabel}>
                      {t('restaurantQrCodes.controls.startNumber')}
                    </Text>
                    <View style={styles.controlContainer}>
                      <Pressable
                        onPress={() => setStartNumber(Math.max(1, startNumber - 1))}
                        style={styles.controlButton}
                      >
                        <Ionicons name="remove-outline" size={iconSize} color={colors.text.secondary} />
                      </Pressable>
                      <Text style={styles.controlValue}>{startNumber}</Text>
                      <Pressable
                        onPress={() => setStartNumber(startNumber + 1)}
                        style={styles.controlButton}
                      >
                        <Ionicons name="add-outline" size={iconSize} color={colors.text.secondary} />
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>

              {/* Boutons d'action */}
              <View style={styles.actionsSection}>
                {selectedRestaurant && (
                  <View style={styles.actionsRow}>
                    <Button
                      title={
                        isGenerating
                          ? t('restaurantQrCodes.actions.generating')
                          : existingTablesCount > 0
                            ? t('restaurantQrCodes.actions.addTables', { count: tableCount })
                            : t('restaurantQrCodes.actions.generate')
                      }
                      onPress={handleGenerateTables}
                      loading={isGenerating}
                      disabled={!selectedRestaurant}
                      style={{
                        backgroundColor: colors.primary,
                        flex: 1,
                      }}
                      textStyle={{ color: colors.text.inverse }}
                      leftIcon={
                        <Ionicons
                          name={existingTablesCount > 0 ? 'add-circle-outline' : 'qr-code-outline'}
                          size={16}
                          color={colors.text.inverse}
                        />
                      }
                    />
                  </View>
                )}

                {selectedRestaurant && existingTablesCount > 0 && (
                  <Button
                    title={t('restaurantQrCodes.actions.replaceAll')}
                    onPress={handleReplaceTables}
                    loading={isGenerating}
                    disabled={!selectedRestaurant}
                    fullWidth
                    variant="outline"
                    style={{ borderColor: colors.error }}
                    textStyle={{ color: colors.error }}
                    leftIcon={<Ionicons name="refresh-outline" size={16} color={colors.error} />}
                  />
                )}

                {generatedTables.length > 0 && (
                  <View style={styles.actionsRow}>
                    <Button
                      title={
                        isPrinting
                          ? t('restaurantQrCodes.actions.printing')
                          : t('restaurantQrCodes.actions.printAll')
                      }
                      onPress={handlePrintAll}
                      style={{
                        backgroundColor: colors.secondary,
                        borderColor: colors.secondary,
                        flex: 1,
                      }}
                      textStyle={{ color: colors.text.primary }}
                      loading={isPrinting}
                      leftIcon={<Ionicons name="print-outline" size={16} color={colors.text.primary} />}
                    />
                    <Button
                      title={
                        isDownloading
                          ? t('restaurantQrCodes.actions.downloading')
                          : t('restaurantQrCodes.actions.downloadPdf')
                      }
                      onPress={handleDownloadAll}
                      variant="outline"
                      style={{ flex: 1, borderColor: colors.secondary }}
                      textStyle={{ color: colors.secondary }}
                      loading={isDownloading}
                      leftIcon={
                        <Ionicons name="download-outline" size={16} color={colors.secondary} />
                      }
                    />
                  </View>
                )}
              </View>
            </Card>

            {/* Info restaurant sélectionné */}
            {selectedRestaurantData && (
              <Card style={styles.selectedRestaurantCard}>
                <View style={styles.restaurantCardContent}>
                  <View style={styles.restaurantAvatar}>
                    <Ionicons
                      name="restaurant-outline"
                      size={iconSize + 4}
                      color={colors.text.inverse}
                    />
                  </View>
                  <View style={styles.restaurantDetails}>
                    <Text style={styles.restaurantCardName}>{selectedRestaurantData.name}</Text>
                    <Text style={styles.restaurantAddress}>
                      {selectedRestaurantData.address}, {selectedRestaurantData.city}
                    </Text>
                  </View>
                  <View style={styles.sizeBadge}>
                    <Text style={styles.sizeBadgeText}>{getQrSizeLabel(qrSize)}</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Liste QR codes */}
            {generatedTables.length > 0 && (
              <View>
                <View style={styles.qrListHeader}>
                  <Text style={styles.qrListTitle}>
                    {t('restaurantQrCodes.list.title', { count: generatedTables.length })}
                  </Text>
                </View>
                {generatedTables.map(renderTableCard)}
              </View>
            )}

            {/* État vide + help */}
            {generatedTables.length === 0 && (
              <Card style={styles.configCard}>
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name="qr-code-outline"
                      size={emptyIconSize}
                      color={colors.secondary}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {t('restaurantQrCodes.empty.title')}
                  </Text>
                  <Text style={styles.emptyMessage}>
                    {t('restaurantQrCodes.empty.message')}
                  </Text>

                  <Pressable
                    style={styles.helpCard}
                    onPress={() => router.push('/help/help' as any)}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: getResponsiveValue(SPACING.xs, screenType),
                      }}
                    >
                      <Ionicons
                        name="help-circle-outline"
                        size={16}
                        color={colors.primary}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.helpTitle}>
                        {t('restaurantQrCodes.help.title')}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={14}
                        color={colors.primary}
                        style={{ marginLeft: 'auto' }}
                      />
                    </View>
                    <Text style={styles.helpText}>
                      {t('restaurantQrCodes.help.steps')}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            )}
          </View>
        </View>
      </ScrollView>

      {/* QR codes haute résolution rendus offscreen pour la capture PNG */}
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
            const hdSize = QR_SIZES[qrSize].printSize * 2;
            return (
              <QRCode
                key={`print-hd-${table.id}`}
                value={(table as any).qrCodeUrl || ''}
                size={hdSize}
                backgroundColor={PDF_COLORS.white}
                color={PDF_COLORS.black}
                ecl="H"
                quietZone={16}
                logo={APP_LOGO}
                logoSize={Math.round(hdSize * 0.22)}
                logoBackgroundColor={PDF_COLORS.white}
                logoMargin={2}
                logoBorderRadius={6}
                getRef={(c) => {
                  if (c) qrPrintRefs.current.set(table.id, c);
                }}
              />
            );
          })}
        </View>
      )}

      {renderRestaurantPicker()}
      {renderPreviewModal()}

      {/* Confirmation : remplacer toutes les tables */}
      {replaceConfirmOpen && (
        <View
          style={{
            paddingHorizontal: layoutConfig.containerPadding,
            paddingTop: getResponsiveValue(SPACING.sm, screenType),
          }}
        >
          <AlertWithAction
            variant="warning"
            title={t('restaurantQrCodes.conflicts.replaceTitle')}
            message={t('restaurantQrCodes.conflicts.replaceMessage', { count: tableCount })}
            secondaryButton={{
              text: t('common.cancel'),
              onPress: () => setReplaceConfirmOpen(false),
            }}
            primaryButton={{
              text: t('restaurantQrCodes.actions.replace'),
              onPress: performReplace,
              variant: 'danger',
            }}
          />
        </View>
      )}

      {/* Conflit étape 1 */}
      {conflictStage === 1 && (
        <View
          style={{
            paddingHorizontal: layoutConfig.containerPadding,
            paddingTop: getResponsiveValue(SPACING.sm, screenType),
          }}
        >
          <AlertWithAction
            variant="warning"
            title={t('restaurantQrCodes.conflicts.conflictTitle')}
            message={t('restaurantQrCodes.conflicts.conflictMessage')}
            secondaryButton={{
              text: t('restaurantQrCodes.conflicts.moreOptions'),
              onPress: () => setConflictStage(2),
            }}
            primaryButton={{
              text: t('restaurantQrCodes.actions.replace'),
              onPress: handleReplaceTables,
              variant: 'danger',
            }}
          />
        </View>
      )}

      {/* Conflit étape 2 */}
      {conflictStage === 2 && (
        <View
          style={{
            paddingHorizontal: layoutConfig.containerPadding,
            paddingTop: getResponsiveValue(SPACING.sm, screenType),
          }}
        >
          <AlertWithAction
            variant="info"
            title={t('restaurantQrCodes.conflicts.optionsTitle')}
            message={t('restaurantQrCodes.conflicts.optionsMessage')}
            secondaryButton={{
              text: t('restaurantQrCodes.conflicts.otherNumber'),
              onPress: () => suggestNewStartNumber(),
            }}
            primaryButton={{
              text: t('restaurantQrCodes.conflicts.loadExisting'),
              onPress: () => loadExistingTables(),
            }}
          />
        </View>
      )}

      {/* Numéro suggéré */}
      {suggestPrompt && (
        <View
          style={{
            paddingHorizontal: layoutConfig.containerPadding,
            paddingTop: getResponsiveValue(SPACING.sm, screenType),
          }}
        >
          <AlertWithAction
            variant="info"
            title={t('restaurantQrCodes.suggest.title')}
            message={t('restaurantQrCodes.suggest.message', {
              count: suggestPrompt.count,
              max: suggestPrompt.maxNumber,
              suggested: suggestPrompt.suggested,
            })}
            secondaryButton={{
              text: t('restaurantQrCodes.suggest.choose'),
              onPress: () => {
                setSuggestPrompt(null);
                promptForStartNumber();
              },
            }}
            primaryButton={{
              text: t('restaurantQrCodes.suggest.accept'),
              onPress: () => {
                setStartNumber(suggestPrompt.suggested);
                setSuggestPrompt(null);
                pushAlert(
                  'success',
                  t('restaurantQrCodes.feedback.numberUpdatedTitle'),
                  t('restaurantQrCodes.feedback.numberUpdatedMessage', {
                    number: suggestPrompt.suggested,
                  }),
                );
              },
            }}
          />
        </View>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STYLES (fabrique theme-aware)
// ════════════════════════════════════════════════════════════════════════════
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ScreenType,
  layoutConfig: { containerPadding: number; maxContentWidth: number | undefined },
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    content: {
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center',
      width: '100%',
    },

    scrollContent: { padding: layoutConfig.containerPadding },

    // Cards génériques (config, selected restaurant)
    configCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.light,
      ...shadows.sm,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    sectionTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600',
      // Section title en or chaud en dark — cohérent avec les autres écrans
      color: isDark ? colors.text.golden : colors.text.primary,
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
    },

    description: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      lineHeight: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
    },

    warningCard: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : colors.warning + '10',
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.warning + '40',
    },

    warningText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: colors.warning,
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      flex: 1,
    },

    // Sélecteur de restaurant (compact)
    restaurantSelector: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    restaurantInfo: { flex: 1 },

    restaurantLabel: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    restaurantName: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 17, desktop: 18 }, screenType),
      color: colors.text.primary,
      fontWeight: '500',
    },

    // Sélecteur taille QR
    qrSizePicker: { marginBottom: getResponsiveValue(SPACING.md, screenType) },

    qrSizeLabel: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      fontWeight: '500',
    },

    qrSizeButtons: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.xs, screenType) / 2,
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    qrSizeButton: {
      flex: 1,
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
    },

    qrSizeButtonActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.secondary,
    },

    qrSizeButtonText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '400',
      color: colors.text.secondary,
    },

    qrSizeButtonTextActive: {
      color: isDark ? colors.text.golden : colors.secondary,
      fontWeight: '600',
    },

    qrSizeButtonCount: {
      fontSize: getResponsiveValue({ mobile: 11, tablet: 12, desktop: 13 }, screenType),
      fontWeight: '400',
      color: colors.text.light,
      marginTop: 2,
      textAlign: 'center',
    },

    qrSizeButtonCountActive: {
      color: isDark ? colors.text.golden : colors.secondary,
    },

    // Contrôles numériques
    controlsRow: {
      flexDirection: screenType === 'mobile' ? 'column' : 'row',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    controlGroup: { flex: 1 },

    controlLabel: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      fontWeight: '500',
    },

    controlContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      height: getResponsiveValue({ mobile: 44, tablet: 48, desktop: 52 }, screenType),
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    controlButton: {
      width: getResponsiveValue({ mobile: 30, tablet: 32, desktop: 36 }, screenType),
      height: getResponsiveValue({ mobile: 30, tablet: 32, desktop: 36 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 15, tablet: 16, desktop: 18 }, screenType),
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    controlValue: {
      flex: 1,
      textAlign: 'center',
      fontSize: getResponsiveValue({ mobile: 16, tablet: 17, desktop: 18 }, screenType),
      fontWeight: '600',
      color: colors.text.primary,
    },

    // Actions
    actionsSection: {
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    actionsRow: {
      flexDirection: screenType === 'mobile' ? 'column' : 'row',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    // Carte restaurant sélectionné
    selectedRestaurantCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.light,
      ...shadows.sm,
    },

    restaurantCardContent: { flexDirection: 'row', alignItems: 'center' },

    restaurantAvatar: {
      width: getResponsiveValue({ mobile: 40, tablet: 44, desktop: 48 }, screenType),
      height: getResponsiveValue({ mobile: 40, tablet: 44, desktop: 48 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
      backgroundColor: colors.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    restaurantDetails: { flex: 1 },

    restaurantCardName: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    restaurantAddress: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.secondary,
    },

    sizeBadge: {
      backgroundColor: colors.background,
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    sizeBadgeText: {
      fontSize: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
      color: colors.text.secondary,
      fontWeight: '500',
    },

    // Liste des QR codes
    qrListHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    qrListTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600',
      color: isDark ? colors.text.golden : colors.text.primary,
    },

    // Carte QR individuelle
    qrCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.light,
      ...shadows.sm,
    },

    tableTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    // QR container : FOND BLANC FIXE même en dark (sinon le QR n'est pas
    // scannable correctement)
    qrCodeContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: PDF_COLORS.white,
      padding: getResponsiveValue(SPACING.sm, screenType),
    },

    manualCodeContainer: {
      backgroundColor: colors.background,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    manualCodeLabel: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.secondary,
      fontWeight: '500',
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    manualCode: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '700',
      color: colors.text.primary,
      fontFamily: 'monospace',
    },

    instruction: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.light,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    qrActions: { width: '100%', gap: getResponsiveValue(SPACING.xs, screenType) },

    qrActionsRow: {
      flexDirection: 'row',
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    // État vide
    emptyContainer: {
      alignItems: 'center',
      padding: getResponsiveValue({ mobile: 32, tablet: 40, desktop: 48 }, screenType),
    },

    emptyIcon: { marginBottom: getResponsiveValue(SPACING.lg, screenType) },

    emptyTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '500',
      color: isDark ? colors.text.golden : colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center',
    },

    emptyMessage: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    helpCard: {
      backgroundColor: isDark
        ? 'rgba(99, 102, 241, 0.12)'
        : colors.primary + '08',
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.md,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.primary + (isDark ? '50' : '20'),
    },

    helpTitle: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '600',
      color: isDark ? colors.text.golden : colors.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    helpText: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: isDark ? colors.text.secondary : colors.primary,
      lineHeight: getResponsiveValue({ mobile: 18, tablet: 19, desktop: 20 }, screenType),
    },

    // Modal preview
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.lg, screenType),
    },

    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.xl, screenType),
      alignItems: 'center',
      maxWidth: getResponsiveValue({ mobile: 300, tablet: 400, desktop: 500 }, screenType),
      width: '100%',
      maxHeight: '80%',
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
    },

    modalTitle: {
      fontSize: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
      fontWeight: '600',
      color: isDark ? colors.text.golden : colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    // Preview QR container : FOND BLANC FIXE
    modalQRContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: PDF_COLORS.white,
      borderRadius: BORDER_RADIUS.md,
    },

    modalManualCodeContainer: {
      backgroundColor: colors.background,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    modalManualCodeLabel: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.secondary,
      fontWeight: '500',
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    modalManualCode: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '700',
      color: colors.text.primary,
      fontFamily: 'monospace',
    },

    modalInstruction: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.light,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    // Picker de restaurant (modal pageSheet)
    pickerContainer: { flex: 1, backgroundColor: colors.background },

    pickerOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },

    pickerOptionAvatar: {
      width: getResponsiveValue({ mobile: 50, tablet: 56, desktop: 60 }, screenType),
      height: getResponsiveValue({ mobile: 50, tablet: 56, desktop: 60 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 25, tablet: 28, desktop: 30 }, screenType),
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    pickerOptionContent: { flex: 1 },

    pickerOptionName: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    pickerOptionAddress: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: colors.text.secondary,
    },

    alertsContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
    },
  });
};