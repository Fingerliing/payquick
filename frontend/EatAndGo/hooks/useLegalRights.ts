import { useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useLegalRights() {
  const [loading, setLoading] = useState(false);

  const requestDataDeletion = async () => {
    Alert.alert(
      'Supprimer mes données',
      'Êtes-vous sûr de vouloir supprimer définitivement toutes vos données ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // Appel API pour supprimer les données
              // await api.deleteUserData();
              
              // Nettoyer le stockage local
              await AsyncStorage.clear();
              
              Alert.alert(
                'Demande enregistrée',
                'Votre demande de suppression a été prise en compte. Vous recevrez une confirmation par email.',
              );
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de traiter votre demande.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const requestDataExport = async () => {
    setLoading(true);
    try {
      // Appel API pour demander l'export
      // await api.requestDataExport();
      
      Alert.alert(
        'Demande enregistrée',
        'Votre export de données sera disponible sous 48h. Vous recevrez un email avec le lien de téléchargement.',
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de traiter votre demande.');
    } finally {
      setLoading(false);
    }
  };

  const requestDataRectification = async (data: any) => {
    setLoading(true);
    try {
      // Appel API pour corriger les données
      // await api.updateUserData(data);
      
      Alert.alert('Succès', 'Vos données ont été mises à jour.');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de mettre à jour vos données.');
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    requestDataDeletion,
    requestDataExport,
    requestDataRectification,
  };
}