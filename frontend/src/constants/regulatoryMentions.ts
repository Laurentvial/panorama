export type CompanyCountryCode = 'FR' | 'BE' | 'LU' | 'CH' | 'GR';

export type RegulatoryMentionOption = {
  value: string;
  label: string;
};

export const REGULATORY_COUNTRY_LABELS: Record<CompanyCountryCode, string> = {
  FR: 'France',
  BE: 'Belgique',
  LU: 'Luxembourg',
  CH: 'Suisse',
  GR: 'Grèce',
};

function option(
  country: CompanyCountryCode,
  authority: string,
  description: string,
): RegulatoryMentionOption {
  const value = `${authority} (${description})`;
  return {
    value,
    label: `${REGULATORY_COUNTRY_LABELS[country]} - ${authority} (${description})`,
  };
}

export const REGULATORY_CUSTOM_VALUE = '__custom__';

export const REGULATORY_MENTIONS_BY_COUNTRY: Record<CompanyCountryCode, RegulatoryMentionOption[]> = {
  FR: [
    option(
      'FR',
      'ORIAS',
      'Organisme pour le Registre unique des Intermédiaires en Assurance, Banque et Finance',
    ),
    option('FR', 'AMF', 'Autorité des marchés financiers'),
    option('FR', 'ACPR', 'Autorité de contrôle prudentiel et de résolution'),
  ],
  BE: [
    option('BE', 'FSMA', 'Autorité des services et marchés financiers'),
  ],
  LU: [
    option('LU', 'CSSF', 'Commission de surveillance du secteur financier'),
  ],
  CH: [
    option('CH', 'FINMA', 'Autorité fédérale de surveillance des marchés financiers'),
  ],
  GR: [
    option('GR', 'HCMC', 'Commission hellénique du marché des capitaux'),
  ],
};

export const REGULATORY_COUNTRY_ORDER: CompanyCountryCode[] = ['FR', 'BE', 'LU', 'CH', 'GR'];

export function getAllRegulatoryOptions(): RegulatoryMentionOption[] {
  return REGULATORY_COUNTRY_ORDER.flatMap(
    (code) => REGULATORY_MENTIONS_BY_COUNTRY[code],
  );
}

export function getRegulatoryOptionsForCountry(
  country: string,
): RegulatoryMentionOption[] {
  const code = country.toUpperCase() as CompanyCountryCode;
  return REGULATORY_MENTIONS_BY_COUNTRY[code] ?? [];
}

export function resolveRegulatorySelectValue(
  mentions: string,
): string {
  const trimmed = mentions.trim();
  if (!trimmed) return '';

  const options = getAllRegulatoryOptions();
  const exact = options.find((o) => o.value === trimmed);
  if (exact) return exact.value;

  const authorityPrefix = trimmed.split(/[\s(]/)[0]?.toUpperCase();
  const byAuthority = options.find((o) => o.value.toUpperCase().startsWith(`${authorityPrefix} (`));
  if (byAuthority) return byAuthority.value;

  return REGULATORY_CUSTOM_VALUE;
}
