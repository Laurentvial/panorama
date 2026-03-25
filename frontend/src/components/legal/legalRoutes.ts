export const LEGAL_SLUGS = [
  'mentions-legales',
  'conditions-utilisation',
  'politique-confidentialite',
  'politique-cookies',
] as const;

export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: '/legal/mentions-legales', label: 'Mentions légales' },
  { href: '/legal/conditions-utilisation', label: "Conditions d'utilisation" },
  { href: '/legal/politique-confidentialite', label: 'Politique de confidentialité' },
  { href: '/legal/politique-cookies', label: 'Politique cookies' },
];
