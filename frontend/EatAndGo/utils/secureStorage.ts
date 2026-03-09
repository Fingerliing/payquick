/**
 * secureStorage.ts
 *
 * Wrapper transparent sur expo-secure-store.
 *
 * - iOS  : Keychain Services (chiffré par l'OS, lié au bundle)
 * - Android : EncryptedSharedPreferences via Android Keystore
 * - Web  : AsyncStorage (pas de Keystore disponible côté navigateur —
 *          acceptable car le web n'est pas la cible principale de l'app)
 *
 * API identique à AsyncStorage { getItem, setItem, removeItem }
 * pour permettre une migration sans changer les call-sites.
 *
 * Limite expo-secure-store : 2 048 octets par valeur.
 * Les JWT EatQuickeR font ~500–900 octets — largement dans la limite.
 * Si un token dépasse la limite, on tombe en fallback AsyncStorage
 * avec un warning (ne bloque pas l'app en prod mais doit être corrigé).
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SECURE_STORE_LIMIT = 2048;

// expo-secure-store n'est pas disponible sur web
const isSecureStoreAvailable = Platform.OS !== 'web';

/**
 * Sanitise la clé pour expo-secure-store :
 * seuls [A-Za-z0-9._-] sont autorisés.
 */
function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function getItem(key: string): Promise<string | null> {
  const safeKey = sanitizeKey(key);
  if (!isSecureStoreAvailable) {
    return AsyncStorage.getItem(safeKey);
  }
  try {
    return await SecureStore.getItemAsync(safeKey);
  } catch (err) {
    console.warn(`[secureStorage] getItem("${key}") fallback AsyncStorage:`, err);
    return AsyncStorage.getItem(safeKey);
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const safeKey = sanitizeKey(key);
  if (!isSecureStoreAvailable) {
    await AsyncStorage.setItem(safeKey, value);
    return;
  }
  if (value.length > SECURE_STORE_LIMIT) {
    console.warn(
      `[secureStorage] Valeur trop grande pour SecureStore (${value.length} > ${SECURE_STORE_LIMIT}), ` +
      `fallback AsyncStorage pour la clé "${key}". Réduire la taille du token.`
    );
    await AsyncStorage.setItem(safeKey, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(safeKey, value);
  } catch (err) {
    console.warn(`[secureStorage] setItem("${key}") fallback AsyncStorage:`, err);
    await AsyncStorage.setItem(safeKey, value);
  }
}

async function removeItem(key: string): Promise<void> {
  const safeKey = sanitizeKey(key);
  if (!isSecureStoreAvailable) {
    await AsyncStorage.removeItem(safeKey);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(safeKey);
  } catch {
    // L'item n'existe peut-être pas — pas d'erreur à remonter
  }
  // Nettoyage du fallback AsyncStorage aussi (migration)
  await AsyncStorage.removeItem(safeKey).catch(() => {});
}

const secureStorage = { getItem, setItem, removeItem };
export default secureStorage;