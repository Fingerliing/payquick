import React from 'react';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { PRIVACY_POLICY } from '@/constants/legal';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLegalAcceptance } from '@/contexts/LegalAcceptanceContext';

export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const fromModal = params.fromModal === 'true';
  const { acceptPrivacy } = useLegalAcceptance();

  const handleAccept = async () => {
    try {
      await acceptPrivacy();
      console.log('✅ Politique acceptée via Context');
      router.back();
    } catch (error) {
      console.error('❌ Erreur lors de l\'acceptation:', error);
      alert(t('legal.document.saveError'));
    }
  };

  return (
    <LegalDocument
      title={PRIVACY_POLICY.title}
      lastUpdate={PRIVACY_POLICY.lastUpdate}
      sections={PRIVACY_POLICY.sections}
      showAcceptButton={fromModal}
      onAccept={handleAccept}
      acceptButtonText={t('legal.document.acceptPrivacy')}
    />
  );
}