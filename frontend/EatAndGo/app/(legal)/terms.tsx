import React from 'react';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_OF_SERVICE } from '@/constants/legal';
import { useRouter } from 'expo-router';

export default function TermsScreen() {
  const router = useRouter();

  const handleAccept = () => {
    // Optionnel : Enregistrer l'acceptation
    console.log('CGU acceptées');
    router.back();
  };

  return (
    <LegalDocument
      title={TERMS_OF_SERVICE.title}
      lastUpdate={TERMS_OF_SERVICE.lastUpdate}
      sections={TERMS_OF_SERVICE.sections}
      showAcceptButton={true}
      onAccept={handleAccept}
    />
  );
}