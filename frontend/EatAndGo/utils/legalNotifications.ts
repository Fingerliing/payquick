import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const LEGAL_VERSION_KEY = 'legal_version';
const CURRENT_LEGAL_VERSION = '1.0.0'; // À incrémenter à chaque modification

interface LegalUpdate {
  version: string;
  date: string;
  changes: string[];
}

export const checkLegalUpdates = async (): Promise<boolean> => {
  try {
    const storedVersion = await AsyncStorage.getItem(LEGAL_VERSION_KEY);
    
    if (!storedVersion || storedVersion !== CURRENT_LEGAL_VERSION) {
      return true; // Mise à jour nécessaire
    }
    
    return false;
  } catch (error) {
    console.error('Erreur lors de la vérification des mises à jour:', error);
    return false;
  }
};

export const markLegalAsRead = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(LEGAL_VERSION_KEY, CURRENT_LEGAL_VERSION);
    await AsyncStorage.setItem(
      `legal_accepted_${CURRENT_LEGAL_VERSION}`,
      new Date().toISOString()
    );
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
  }
};

export const showLegalUpdateAlert = (onAccept: () => void): void => {
  Alert.alert(
    'Mise à jour des conditions',
    'Nos conditions d\'utilisation et notre politique de confidentialité ont été mises à jour. Veuillez les consulter avant de continuer.',
    [
      {
        text: 'Lire les modifications',
        onPress: onAccept,
      },
    ],
    { cancelable: false }
  );
};