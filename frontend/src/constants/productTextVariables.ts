import type { AppSettings } from '../contexts/ThemeContext';

export type ProductTextVariable = {
  key: string;
  token: string;
  label: string;
};

const COMPANY_COUNTRY_LABELS: Record<string, string> = {
  FR: 'France',
  BE: 'Belgique',
  LU: 'Luxembourg',
  CH: 'Suisse',
  GR: 'Grèce',
};

export const PRODUCT_TEXT_VARIABLES: ProductTextVariable[] = [
  { key: 'platform_name', token: '{{platform_name}}', label: 'Nom de la plateforme' },
  { key: 'address', token: '{{address}}', label: 'Adresse' },
  { key: 'website', token: '{{website}}', label: 'Site web' },
  { key: 'email', token: '{{email}}', label: 'Email' },
  { key: 'legal_form', token: '{{legal_form}}', label: 'Forme juridique' },
  { key: 'share_capital', token: '{{share_capital}}', label: 'Capital social / apports' },
  { key: 'siren', token: '{{siren}}', label: "Identifiant d'entreprise (principal)" },
  { key: 'siret', token: '{{siret}}', label: "N° d'établissement" },
  { key: 'rcs', token: '{{rcs}}', label: 'Immatriculation registre du commerce' },
  { key: 'vat_number', token: '{{vat_number}}', label: 'Numéro de TVA' },
  { key: 'publication_director', token: '{{publication_director}}', label: 'Directeur de la publication' },
  { key: 'hosting_provider', token: '{{hosting_provider}}', label: 'Hébergeur' },
  { key: 'dpo_contact', token: '{{dpo_contact}}', label: 'Délégué à la protection des données' },
  { key: 'consumer_mediator', token: '{{consumer_mediator}}', label: 'Médiateur consommateurs' },
  { key: 'regulatory_mentions', token: '{{regulatory_mentions}}', label: 'Mentions réglementaires' },
  { key: 'company_country', token: '{{company_country}}', label: "Pays d'établissement" },
];

export function getProductVariableValues(
  settings: Partial<AppSettings> | null | undefined,
): Record<string, string> {
  const s = settings || {};
  const countryCode = (s.company_country || '').trim().toUpperCase();

  return {
    platform_name: (s.platform_name || '').trim(),
    address: (s.address || '').trim(),
    website: (s.website || '').trim(),
    email: (s.email || '').trim(),
    legal_form: (s.legal_form || '').trim(),
    share_capital: (s.share_capital || '').trim(),
    siren: (s.siren || '').trim(),
    siret: (s.siret || '').trim(),
    rcs: (s.rcs || '').trim(),
    vat_number: (s.vat_number || '').trim(),
    publication_director: (s.publication_director || '').trim(),
    hosting_provider: (s.hosting_provider || '').trim(),
    dpo_contact: (s.dpo_contact || '').trim(),
    consumer_mediator: (s.consumer_mediator || '').trim(),
    regulatory_mentions: (s.regulatory_mentions || '').trim(),
    company_country: countryCode ? (COMPANY_COUNTRY_LABELS[countryCode] || countryCode) : '',
  };
}
