/**
 * i18n — Initialisation i18next pour EatQuickeR.
 *
 * - Français comme langue source ET fallback.
 * - 10 langues cibles : en, es, eu, de, it, pt, nl, zh, ja, ar.
 * - Détection auto au premier lancement via expo-localization.
 * - Persistance gérée par LanguageContext (AsyncStorage), pas par i18next.
 * - L'arabe nécessite RTL → géré par LanguageContext (I18nManager).
 *
 * IMPORTANT : Hermes nécessite un polyfill Intl.PluralRules pour i18next.
 * On l'importe via `intl-pluralrules` côté top-level (cf. _layout.tsx).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import eu from './locales/eu.json';
import de from './locales/de.json';
import it from './locales/it.json';
import pt from './locales/pt.json';
import nl from './locales/nl.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ar from './locales/ar.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français',  nativeLabel: 'Français',   flag: '🇫🇷', rtl: false },
  { code: 'en', label: 'Anglais',   nativeLabel: 'English',    flag: '🇬🇧', rtl: false },
  { code: 'es', label: 'Espagnol',  nativeLabel: 'Español',    flag: '🇪🇸', rtl: false },
  { code: 'eu', label: 'Basque',    nativeLabel: 'Euskara',    flag: '🏴',  rtl: false },
  { code: 'de', label: 'Allemand',  nativeLabel: 'Deutsch',    flag: '🇩🇪', rtl: false },
  { code: 'it', label: 'Italien',   nativeLabel: 'Italiano',   flag: '🇮🇹', rtl: false },
  { code: 'pt', label: 'Portugais', nativeLabel: 'Português',  flag: '🇵🇹', rtl: false },
  { code: 'nl', label: 'Néerlandais', nativeLabel: 'Nederlands', flag: '🇳🇱', rtl: false },
  { code: 'zh', label: 'Chinois',   nativeLabel: '中文',        flag: '🇨🇳', rtl: false },
  { code: 'ja', label: 'Japonais',  nativeLabel: '日本語',       flag: '🇯🇵', rtl: false },
  { code: 'ar', label: 'Arabe',     nativeLabel: 'العربية',     flag: '🇸🇦', rtl: true  },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const SUPPORTED_LANGUAGE_CODES: LanguageCode[] =
  SUPPORTED_LANGUAGES.map((l) => l.code);

export function isRTL(code: string): boolean {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.rtl ?? false;
}

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4', // Hermes-safe
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
      eu: { translation: eu },
      de: { translation: de },
      it: { translation: it },
      pt: { translation: pt },
      nl: { translation: nl },
      zh: { translation: zh },
      ja: { translation: ja },
      ar: { translation: ar },
    },
    lng: 'fr',
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false, // React échappe déjà
    },
    react: {
      useSuspense: false, // Compat AsyncStorage init
    },
    returnNull: false,
  });

export default i18n;
