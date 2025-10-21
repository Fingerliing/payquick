import React, { useState } from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  View 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/contexts/AuthContext';
import { legalService } from '@/services/legalService';

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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const handleDownload = async () => {
    if (!user) {
      Alert.alert('Erreur', 'Vous devez être connecté pour exporter vos données');
      return;
    }

    Alert.alert(
      'Export de données',
      'Souhaitez-vous télécharger toutes vos données personnelles ?\n\nCela inclut : profil, commandes, préférences, et historique.',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Télécharger', 
          style: 'default',
          onPress: () => performDownload()
        }
      ]
    );
  };

  const performDownload = async () => {
    // Capturer user localement pour éviter les problèmes de nullabilité
    const currentUser = user;
    if (!currentUser) {
      Alert.alert('Erreur', 'Vous devez être connecté pour exporter vos données');
      return;
    }

    setLoading(true);
    setProgress('Récupération des données...');
    
    let fileUri: string | null = null;
    
    try {
      const userData = await legalService.exportUserData();
      
      setProgress('Préparation du fichier...');
      
      const jsonData = JSON.stringify(userData, null, 2);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `eatquicker_export_${currentUser.id}_${timestamp}.json`;
      fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Utiliser writeAsStringAsync - la méthode recommandée et stable
      await FileSystem.writeAsStringAsync(fileUri, jsonData, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setProgress('Export terminé !');

      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      const fileSizeKB = fileInfo.exists && fileInfo.size 
        ? (fileInfo.size / 1024).toFixed(2) 
        : '0';

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Télécharger mes données EatQuickeR',
          UTI: 'public.json',
        });
        
        Alert.alert(
          'Export réussi',
          `Vos données (${fileSizeKB} KB) ont été exportées.\n\nVous pouvez maintenant les sauvegarder ou les partager.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Export réussi',
          `Vos données ont été exportées dans :\n${filename}\n\nTaille: ${fileSizeKB} KB`,
          [{ text: 'OK' }]
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
        429: 'Vous avez atteint la limite d\'exports quotidiens. Veuillez réessayer demain.',
        401: 'Votre session a expiré. Veuillez vous reconnecter.',
        403: 'Vous n\'avez pas la permission d\'exporter ces données.',
        500: 'Erreur serveur. Veuillez réessayer dans quelques instants.',
        503: 'Le service d\'export est temporairement indisponible. Réessayez dans quelques minutes.',
      };
      
      let errorMessage = 'Impossible de télécharger vos données. Veuillez réessayer.';
      
      if (error.response?.status) {
        errorMessage = errorMessages[error.response.status] || errorMessage;
      } else if (!error.response) {
        errorMessage = 'Erreur de connexion. Vérifiez votre connexion internet.';
      }
      
      Alert.alert('Erreur', errorMessage);
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
      Alert.alert('Erreur', 'Vous devez être connecté pour exporter vos données');
      return;
    }

    Alert.alert(
      'Export par email',
      'Vous recevrez un email avec un lien de téléchargement sécurisé sous 48h.\n\nContinuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Confirmer', 
          onPress: async () => {
            setLoading(true);
            setProgress('Envoi de la demande...');
            
            try {
              await legalService.requestDataExport();
              Alert.alert(
                'Demande enregistrée',
                `Un email sera envoyé à ${currentUser.email} sous 48h avec vos données.`,
                [{ text: 'OK' }]
              );
              
              console.log(`Email export requested for user_id:${currentUser.id} at ${new Date().toISOString()}`);
              
            } catch (error: any) {
              console.error('Erreur lors de la demande d\'export:', error);
              
              let errorMessage = 'Impossible d\'enregistrer votre demande. Veuillez réessayer.';
              
              if (error.response?.status === 429) {
                errorMessage = 'Vous avez déjà une demande d\'export en cours. Veuillez patienter.';
              } else if (error.response?.status === 401) {
                errorMessage = 'Votre session a expiré. Veuillez vous reconnecter.';
              }
              
              Alert.alert('Erreur', errorMessage);
            } finally {
              setLoading(false);
              setProgress('');
            }
          }
        }
      ]
    );
  };

  const showOptions = () => {
    Alert.alert(
      'Export de données',
      'Comment souhaitez-vous recevoir vos données ?',
      [
        {
          text: 'Téléchargement direct',
          onPress: performDownload,
        },
        {
          text: 'Par email (sous 48h)',
          onPress: handleRequestEmailExport,
        },
        {
          text: 'Annuler',
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={showOptions}
        disabled={loading}
        activeOpacity={0.7}
        accessibilityLabel="Télécharger mes données personnelles"
        accessibilityHint="Exporter toutes vos données conformément au RGPD"
        accessibilityRole="button"
      >
        {loading ? (
          <>
            <ActivityIndicator size="small" color="#1E40AF" />
            <Text style={styles.buttonText}>
              {progress || 'Préparation...'}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="download-outline" size={20} color="#1E40AF" />
            <Text style={styles.buttonText}>Télécharger mes données</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.infoText}>
        <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
        {' '}Export conforme RGPD (Article 20)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#1E40AF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});