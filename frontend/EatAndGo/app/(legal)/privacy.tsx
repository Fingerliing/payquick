import React from 'react';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { PRIVACY_POLICY } from '@/constants/legal';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useLegalAcceptance } from '@/contexts/LegalAcceptanceContext';

export default function PrivacyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const fromModal = params.fromModal === 'true';
  const { acceptPrivacy } = useLegalAcceptance();

  const handleAccept = async () => {
    try {
      await acceptPrivacy();
      console.log('✅ Politique acceptée via Context');
      
      // Retourner à l'écran précédent
      router.back();
    } catch (error) {
      console.error('❌ Erreur lors de l\'acceptation:', error);
      alert('Erreur lors de l\'enregistrement. Veuillez réessayer.');
    }
  };

  return (
    <LegalDocument
      title={PRIVACY_POLICY.title}
      lastUpdate={PRIVACY_POLICY.lastUpdate}
      sections={PRIVACY_POLICY.sections}
      showAcceptButton={fromModal}
      onAccept={handleAccept}
      acceptButtonText="J'ai lu et j'accepte la politique"
    />
  );
}