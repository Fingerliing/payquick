import React from 'react';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { PRIVACY_POLICY } from '@/constants/legal';

export default function PrivacyScreen() {
  return (
    <LegalDocument
      title={PRIVACY_POLICY.title}
      lastUpdate={PRIVACY_POLICY.lastUpdate}
      sections={PRIVACY_POLICY.sections}
    />
  );
}