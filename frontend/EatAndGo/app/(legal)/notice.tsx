import React from 'react';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { LEGAL_NOTICE } from '@/constants/legal';

export default function LegalNoticeScreen() {
  return (
    <LegalDocument
      title={LEGAL_NOTICE.title}
      lastUpdate={LEGAL_NOTICE.lastUpdate}
      sections={LEGAL_NOTICE.sections}
    />
  );
}