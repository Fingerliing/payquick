import React from 'react';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_OF_SERVICE } from '@/constants/legal';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLegalAcceptance } from '@/contexts/LegalAcceptanceContext';

export default function TermsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const fromModal = params.fromModal === 'true';
  const { acceptTerms } = useLegalAcceptance();

  const handleAccept = async () => {
    try {
      await acceptTerms();
      console.log('✅ CGU acceptées via Context');
      router.back();
    } catch (error) {
      console.error('❌ Erreur lors de l\'acceptation:', error);
      alert(t('legal.document.saveError'));
    }
  };

  return (
    <LegalDocument
      title={TERMS_OF_SERVICE.title}
      lastUpdate={TERMS_OF_SERVICE.lastUpdate}
      sections={TERMS_OF_SERVICE.sections}
      showAcceptButton={fromModal}
      onAccept={handleAccept}
      acceptButtonText={t('legal.document.acceptTerms')}
    />
  );
}