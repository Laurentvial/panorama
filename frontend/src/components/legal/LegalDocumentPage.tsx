import React from 'react';
import { useParams } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import NotFound from '../NotFound';
import { isLegalSlug } from './legalRoutes';
import { LEGAL_TITLES, LegalDocumentBody } from './legalBodies';
import { LegalDocumentShell } from './LegalDocumentShell';

export default function LegalDocumentPage() {
  const { docId } = useParams<{ docId: string }>();
  const { settings } = useTheme();

  if (!docId || !isLegalSlug(docId)) {
    return <NotFound />;
  }

  return (
    <LegalDocumentShell title={LEGAL_TITLES[docId]}>
      <LegalDocumentBody slug={docId} settings={settings} />
    </LegalDocumentShell>
  );
}
