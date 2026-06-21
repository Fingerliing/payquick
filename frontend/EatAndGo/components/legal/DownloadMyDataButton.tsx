import React, { useMemo, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { legalService } from '@/services/legalService';
import { useAppTheme, type AppColors } from '@/utils/designSystem';

export interface ExportedUserData {
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    date_joined: string;
    role: 'client' | 'restaurateur';
  };
  profile: any;
  orders: any[];
  restaurants?: any[];
  preferences?: any;
  exportedAt: string;
  exportVersion: string;
}

export function DownloadMyDataButton() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const handleDownload = async () => {
    if (!user) {
      Alert.alert(t('common.error'), t('legal.downloadMyData.errors.notLoggedIn'));
      return;
    }

    Alert.alert(
      t('legal.downloadMyData.confirmTitle'),
      t('legal.downloadMyData.confirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('legal.downloadMyData.download'),
          style: 'default',
          onPress: () => performDownload(),
        },
      ],
    );
  };

  const performDownload = async () => {
    // Capturer user localement pour éviter les problèmes de nullabilité
    const currentUser = user;
    if (!currentUser) {
      Alert.alert(t('common.error'), t('legal.downloadMyData.errors.notLoggedIn'));
      return;
    }

    setLoading(true);
    setProgress(t('legal.downloadMyData.progress.fetching'));

    let fileUri: string | null = null;

    try {
      const userData = await legalService.exportUserData();

      setProgress(t('legal.downloadMyData.progress.preparing'));

      const jsonData = JSON.stringify(userData, null, 2);

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `eatquicker_export_${currentUser.id}_${timestamp}.json`;
      fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Utiliser writeAsStringAsync - la méthode recommandée et stable
      await FileSystem.writeAsStringAsync(fileUri, jsonData, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setProgress(t('legal.downloadMyData.progress.done'));

      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      const fileSizeKB = fileInfo.exists && fileInfo.size
        ? (fileInfo.size / 1024).toFixed(2)
        : '0';

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: t('legal.downloadMyData.shareDialogTitle'),
          UTI: 'public.json',
        });

        Alert.alert(
          t('legal.downloadMyData.success.title'),
          t('legal.downloadMyData.success.message', { size: fileSizeKB }),
          [{ text: t('common.ok') }],
        );
      } else {
        Alert.alert(
          t('legal.downloadMyData.success.title'),
          t('legal.downloadMyData.success.messageFallback', { filename, size: fileSizeKB }),
          [{ text: t('common.ok') }],
        );
      }

      if (__DEV__) {
        console.log(`Export de données effectué pour ${currentUser.email} à ${new Date().toISOString()}`);
      } else {
        console.log(`Data export completed for user_id:${currentUser.id} at ${new Date().toISOString()}`);
      }

    } catch (error: any) {
      console.error('Erreur lors du téléchargement:', error);

      const errorMessages: Record<number, string> = {
        429: t('legal.downloadMyData.errors.rateLimit'),
        401: t('legal.downloadMyData.errors.sessionExpired'),
        403: t('legal.downloadMyData.errors.forbidden'),
        500: t('legal.downloadMyData.errors.serverError'),
        503: t('legal.downloadMyData.errors.serviceUnavailable'),
      };

      let errorMessage = t('legal.downloadMyData.errors.generic');

      if (error.response?.status) {
        errorMessage = errorMessages[error.response.status] || errorMessage;
      } else if (!error.response) {
        errorMessage = t('legal.downloadMyData.errors.connection');
      }

      Alert.alert(t('common.error'), errorMessage);
    } finally {
      if (fileUri) {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch (cleanupError) {
          console.warn('Échec du nettoyage du fichier temporaire:', cleanupError);
        }
      }

      setLoading(false);
      setProgress('');
    }
  };

  const handleRequestEmailExport = async () => {
    // Capturer user localement
    const currentUser = user;
    if (!currentUser) {
      Alert.alert(t('common.error'), t('legal.downloadMyData.errors.notLoggedIn'));
      return;
    }

    Alert.alert(
      t('legal.downloadMyData.email.title'),
      t('legal.downloadMyData.email.confirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setLoading(true);
            setProgress(t('legal.downloadMyData.progress.sending'));

            try {
              await legalService.requestDataExport();
              Alert.alert(
                t('legal.downloadMyData.email.successTitle'),
                t('legal.downloadMyData.email.successMessage', { email: currentUser.email }),
                [{ text: t('common.ok') }],
              );

              console.log(`Email export requested for user_id:${currentUser.id} at ${new Date().toISOString()}`);

            } catch (error: any) {
              console.error('Erreur lors de la demande d\'export:', error);

              let errorMessage = t('legal.downloadMyData.errors.emailRequestFailed');

              if (error.response?.status === 429) {
                errorMessage = t('legal.downloadMyData.errors.emailPending');
              } else if (error.response?.status === 401) {
                errorMessage = t('legal.downloadMyData.errors.sessionExpired');
              }

              Alert.alert(t('common.error'), errorMessage);
            } finally {
              setLoading(false);
              setProgress('');
            }
          },
        },
      ],
    );
  };

  const showOptions = () => {
    Alert.alert(
      t('legal.downloadMyData.options.title'),
      t('legal.downloadMyData.options.message'),
      [
        {
          text: t('legal.downloadMyData.options.direct'),
          onPress: performDownload,
        },
        {
          text: t('legal.downloadMyData.options.email'),
          onPress: handleRequestEmailExport,
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={showOptions}
        disabled={loading}
        activeOpacity={0.7}
        accessibilityLabel={t('legal.downloadMyData.a11y.label')}
        accessibilityHint={t('legal.downloadMyData.a11y.hint')}
        accessibilityRole="button"
      >
        {loading ? (
          <>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.buttonText}>
              {progress || t('legal.downloadMyData.progress.preparingShort')}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="download-outline" size={20} color={colors.primary} />
            <Text style={styles.buttonText}>{t('legal.downloadMyData.cta')}</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.infoText}>
        <Ionicons name="information-circle-outline" size={14} color={colors.text.secondary} />
        {' '}{t('legal.downloadMyData.gdprNotice')}
      </Text>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      gap: 8,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.variants.primary[50],
      padding: 16,
      borderRadius: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.variants.primary[200],
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    infoText: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 18,
    },
  });