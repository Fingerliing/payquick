import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TERMS_ACCEPTED_KEY = '@legal_terms_temp_accepted';
const PRIVACY_ACCEPTED_KEY = '@legal_privacy_temp_accepted';

interface LegalAcceptanceContextType {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  setTermsAccepted: (value: boolean) => void;
  setPrivacyAccepted: (value: boolean) => void;
  acceptTerms: () => Promise<void>;
  acceptPrivacy: () => Promise<void>;
  resetAcceptances: () => Promise<void>;
  isLoading: boolean;
}

const LegalAcceptanceContext = createContext<LegalAcceptanceContextType | undefined>(undefined);

export function LegalAcceptanceProvider({ children }: { children: React.ReactNode }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Charger l'état au démarrage
  useEffect(() => {
    loadAcceptanceState();
  }, []);

  const loadAcceptanceState = async () => {
    try {
      const [terms, privacy] = await Promise.all([
        AsyncStorage.getItem(TERMS_ACCEPTED_KEY),
        AsyncStorage.getItem(PRIVACY_ACCEPTED_KEY),
      ]);

      if (terms === 'true') {
        console.log('✅ CGU chargées du storage');
        setTermsAccepted(true);
      }
      if (privacy === 'true') {
        console.log('✅ Politique chargée du storage');
        setPrivacyAccepted(true);
      }
    } catch (error) {
      console.error('❌ Erreur chargement acceptations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const acceptTerms = async () => {
    try {
      await AsyncStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
      setTermsAccepted(true);
      console.log('✅ CGU acceptées et enregistrées');
    } catch (error) {
      console.error('❌ Erreur enregistrement CGU:', error);
      throw error;
    }
  };

  const acceptPrivacy = async () => {
    try {
      await AsyncStorage.setItem(PRIVACY_ACCEPTED_KEY, 'true');
      setPrivacyAccepted(true);
      console.log('✅ Politique acceptée et enregistrée');
    } catch (error) {
      console.error('❌ Erreur enregistrement politique:', error);
      throw error;
    }
  };

  const resetAcceptances = async () => {
    try {
      await AsyncStorage.multiRemove([TERMS_ACCEPTED_KEY, PRIVACY_ACCEPTED_KEY]);
      setTermsAccepted(false);
      setPrivacyAccepted(false);
      console.log('🔄 Acceptations réinitialisées');
    } catch (error) {
      console.error('❌ Erreur réinitialisation:', error);
      throw error;
    }
  };

  return (
    <LegalAcceptanceContext.Provider
      value={{
        termsAccepted,
        privacyAccepted,
        setTermsAccepted,
        setPrivacyAccepted,
        acceptTerms,
        acceptPrivacy,
        resetAcceptances,
        isLoading,
      }}
    >
      {children}
    </LegalAcceptanceContext.Provider>
  );
}

export function useLegalAcceptance() {
  const context = useContext(LegalAcceptanceContext);
  if (context === undefined) {
    throw new Error('useLegalAcceptance must be used within a LegalAcceptanceProvider');
  }
  return context;
}