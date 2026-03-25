import React from 'react';
import type { AppSettings } from '../../contexts/ThemeContext';
import type { LegalSlug } from './legalRoutes';
import { Link } from 'react-router-dom';

const h2: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: '#0f172a',
  margin: '28px 0 12px',
};

const p: React.CSSProperties = { margin: '0 0 14px' };

const placeholderBox: React.CSSProperties = {
  margin: '12px 0',
  padding: '12px 14px',
  background: '#f1f5f9',
  borderRadius: 8,
  border: '1px dashed #94a3b8',
  fontSize: 14,
};

function LegalPlaceholder({ children }: React.PropsWithChildren) {
  return <div style={placeholderBox}>{children}</div>;
}

function MultilineBlock({ text }: { text: string }) {
  const t = text.trim();
  if (!t) return null;
  return <p style={{ ...p, whiteSpace: 'pre-wrap' }}>{t}</p>;
}

type CompanyCountry = 'FR' | 'BE' | 'LU' | 'CH';

function normalizeCompanyCountry(raw: string | undefined | null): CompanyCountry {
  const c = (raw || 'FR').trim().toUpperCase();
  if (c === 'BE' || c === 'LU' || c === 'CH') return c;
  return 'FR';
}

/** Introduction sous « Identification de l’éditeur » selon le pays d’établissement (paramètres admin). */
function editorIdentificationIntroParagraph(cc: CompanyCountry): string {
  const intro =
    'Il est précisé aux utilisateurs du présent site l’identité des intervenants dans le cadre de sa réalisation et de son suivi. ';
  switch (cc) {
    case 'FR':
      return (
        intro +
        'L’Éditeur est établi en France. Les informations ci-dessous visent notamment à répondre aux articles 6-III et 19 ' +
        'de la loi pour la confiance dans l’économie numérique (LCEN).'
      );
    case 'CH':
      return (
        intro +
        'L’Éditeur est établi en Suisse. Le droit suisse impose en principe d’identifier clairement l’exploitant d’un site ou ' +
        'd’un service en ligne et de communiquer des coordonnées permettant de le contacter (notamment dans un cadre de pratique ' +
        'commerciale loyale et, le cas échéant, au titre du droit de la protection des données) ; validez les mentions avec votre conseil.'
      );
    case 'LU':
      return (
        intro +
        'L’Éditeur est établi au Luxembourg. Des obligations d’information du prestataire de services de la société de l’information ' +
        's’appliquent notamment en vertu de la loi du 14 août 2000 relative au commerce électronique, complétée par le droit ' +
        'applicable en matière de données personnelles le cas échéant ; faites préciser et adapter le texte avec votre conseil.'
      );
    case 'BE':
      return (
        intro +
        'L’Éditeur est établi en Belgique. Des obligations d’information équivalentes résultent notamment du livre XII « Commerce électronique » ' +
        'du Code de droit économique ainsi que des règles applicables en matière de protection des données lorsque celles-ci s’appliquent ; ' +
        'les présentes mentions doivent être complétées et vérifiées avec votre conseil.'
      );
    default:
      return (
        intro +
        'L’Éditeur est établi en France. Les informations ci-dessous visent notamment à répondre aux articles 6-III et 19 ' +
        'de la loi pour la confiance dans l’économie numérique (LCEN).'
      );
  }
}

/** Paragraphe d’introduction à la section « Hébergement » des mentions légales (même pays que l’éditeur). */
function hostingLegalIntroParagraph(cc: CompanyCountry): string {
  const base =
    'Le présent site et les données associées sont stockées sur des infrastructures fournies par un prestataire d’hébergement. ' +
    'L’Éditeur communique les coordonnées de cet hébergeur';
  switch (cc) {
    case 'FR':
      return base + ', notamment conformément à l’article 6-I 2° de la loi pour la confiance dans l’économie numérique (LCEN).';
    case 'CH':
      return (
        base +
        ', en application du droit suisse sur l’information des utilisateurs et l’exploitation de services en ligne (validez la formulation avec votre conseil).'
      );
    case 'LU':
      return (
        base +
        ', dans le respect des obligations applicables aux prestataires de services de la société de l’information en droit luxembourgeois (notamment la loi du 14 août 2000 sur le commerce électronique).'
      );
    case 'BE':
      return (
        base +
        ', conformément aux exigences du livre XII du Code de droit économique relatives au commerce électronique et aux informations à fournir.'
      );
    default:
      return base + ', notamment conformément à l’article 6-I 2° de la loi pour la confiance dans l’économie numérique (LCEN).';
  }
}

/** Section « Médiation » des mentions légales : texte centré sur le pays d’établissement. */
function mediationMentionsLegalesParagraph(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return (
        'En cas de litige avec un consommateur, le droit français applicable peut prévoir une procédure de médiation ou de résolution amiable ' +
        '(notamment recours à un médiateur de la consommation ou dispositif sectoriel). Les modalités varient selon le secteur ; les coordonnées utiles ' +
        'figurent ci-dessous lorsqu’elles ont été renseignées dans les paramètres de la plateforme.'
      );
    case 'BE':
      return (
        'En cas de litige avec un consommateur, le droit belge prévoit notamment des obligations d’information sur les voies de recours et, ' +
        'lorsque les conditions sont réunies, l’accès à un médiateur de la consommation conforme au livre XV du Code de droit économique. ' +
        'Les coordonnées du médiateur désigné figurent ci-dessous lorsqu’elles ont été renseignées dans les paramètres.'
      );
    case 'LU':
      return (
        'En cas de litige avec un consommateur, le droit luxembourgeois et, le cas échéant, le droit de l’Union européenne peuvent prévoir des dispositifs ' +
        'de médiation ou de résolution extrajudiciaire. Les coordonnées de l’instance ou du médiateur figurent ci-dessous lorsqu’elles ont été renseignées ' +
        'dans les paramètres.'
      );
    case 'CH':
      return (
        'En cas de litige avec un consommateur, les voies de recours et les procédures amiables ou extrajudiciaires s’apprécient selon le droit suisse ' +
        'applicable au contrat et au secteur d’activité. Les coordonnées utiles figurent ci-dessous lorsqu’elles ont été renseignées dans les paramètres. ' +
        'Lorsque des consommateurs situés dans l’Union européenne sont concernés, des règles ou plateformes communautaires peuvent en outre s’appliquer ; ' +
        'renseignez-vous auprès de votre conseil.'
      );
    default:
      return (
        'En cas de litige avec un consommateur, le droit français applicable peut prévoir une procédure de médiation ou de résolution amiable ' +
        '(notamment recours à un médiateur de la consommation ou dispositif sectoriel). Les coordonnées utiles figurent ci-dessous lorsqu’elles ont été renseignées.'
      );
  }
}

/** Autorité de protection des données mise en avant dans les mentions légales (pays d’établissement). */
function dataProtectionAuthorityForMentions(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return 'la Commission nationale de l’informatique et des libertés (CNIL)';
    case 'BE':
      return 'l’Autorité de protection des données (APD / GBA)';
    case 'LU':
      return 'la Commission nationale pour la protection des données (CNPD)';
    case 'CH':
      return 'le Préposé fédéral à la protection des données et à la transparence (PFPDT / EDÖB)';
    default:
      return 'la Commission nationale de l’informatique et des libertés (CNIL)';
  }
}

/** Section « Propriété intellectuelle » des mentions légales : références juridiques selon le pays d’établissement. */
function intellectualPropertyMentionsParagraphs(cc: CompanyCountry): { protection: string; infringement: string } {
  const commonElements =
    'Sauf mention contraire expresse, l’ensemble des éléments composant le site — notamment textes, graphismes, logos, ' +
    'icônes, photographies, vidéos, sons, architecture, charte graphique, logiciels et bases de données — sont protégés par ';
  const commonMiddle =
    '. Ces éléments sont la propriété exclusive de l’Éditeur ou de ses partenaires ayant concédé une licence. ' +
    'Toute reproduction, représentation, modification, publication, adaptation, traduction, exploitation ou diffusion, ' +
    'totale ou partielle, par quelque procédé que ce soit, sans l’autorisation écrite préalable de leurs titulaires, ' +
    'est interdite et susceptible de constituer une contrefaçon ou une atteinte aux droits des titulaires au sens ';
  switch (cc) {
    case 'FR':
      return {
        protection:
          commonElements +
          'le Code de la propriété intellectuelle et, le cas échéant, par les conventions internationales applicables',
        infringement:
          commonMiddle + 'des articles L.335-2 et suivants du Code de la propriété intellectuelle.',
      };
    case 'BE':
      return {
        protection:
          commonElements +
          'le droit belge de la propriété intellectuelle (notamment le livre XI du Code de droit économique et textes connexes) et, le cas échéant, par les conventions internationales applicables',
        infringement: commonMiddle + 'du droit belge applicable.',
      };
    case 'LU':
      return {
        protection:
          commonElements +
          'le droit luxembourgeois de la propriété intellectuelle et, le cas échéant, par les conventions internationales applicables',
        infringement: commonMiddle + 'du droit luxembourgeois applicable.',
      };
    case 'CH':
      return {
        protection:
          commonElements +
          'le droit suisse de la propriété intellectuelle (notamment la loi fédérale sur le droit d’auteur et les droits voisins) et, le cas échéant, par les conventions internationales applicables',
        infringement: commonMiddle + 'du droit suisse applicable.',
      };
    default:
      return {
        protection:
          commonElements +
          'le Code de la propriété intellectuelle et, le cas échéant, par les conventions internationales applicables',
        infringement:
          commonMiddle + 'des articles L.335-2 et suivants du Code de la propriété intellectuelle.',
      };
  }
}

/** Paragraphe type sur juridictions compétentes / clause de for B2B selon le pays d’établissement (paramètres admin). */
function jurisdictionB2BForumParagraph(cc: CompanyCountry): string {
  switch (cc) {
    case 'BE':
      return (
        'Pour les litiges opposant l’Éditeur à un professionnel (relations B2B), le droit belge — notamment le Code judiciaire ' +
        'et les règles de droit international privé applicables — détermine les juridictions compétentes et les conditions de validité ' +
        'd’une clause attributive de juridiction, sous réserve des règles impératives lorsque le cocontractant est un consommateur. ' +
        'Le tribunal ou la cour à retenir et toute clause d’élection de for doivent être précisés avec votre conseil.'
      );
    case 'LU':
      return (
        'Pour les litiges opposant l’Éditeur à un professionnel (relations B2B), le droit luxembourgeois fixe les règles de compétence ' +
        'judiciaire et les clauses d’élection de for, en tenant compte le cas échéant du droit de l’Union européenne. ' +
        'Indiquez le for définitif et les juridictions compétentes avec votre conseil.'
      );
    case 'CH':
      return (
        'Pour les litiges opposant l’Éditeur à un professionnel (relations B2B), le droit suisse — notamment le code de procédure civile ' +
        'et la loi sur le droit international privé — régit la compétence des autorités et les clauses de for entre entreprises. ' +
        'Le canton, le tribunal compétent et la formulation contractuelle doivent être confirmés avec votre conseil.'
      );
    case 'FR':
    default:
      return (
        'Pour les litiges opposant l’Éditeur à un professionnel (relations B2B), les juridictions compétentes et la validité ' +
        'd’une clause attributive de juridiction s’apprécient selon le droit français (notamment le Code de commerce et le Code ' +
        'de procédure civile), sous réserve des règles d’ordre public et des accords particuliers conclus avec vos cocontractants. ' +
        'Précisez le tribunal ou la cour retenus et toute clause d’élection de for avec votre conseil.'
      );
  }
}

function editorCountryLabel(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return 'France';
    case 'BE':
      return 'Belgique';
    case 'LU':
      return 'Luxembourg';
    case 'CH':
      return 'Suisse';
    default:
      return 'France';
  }
}

/** Incipit conflits de lois / consommateurs — mentions légales §10. */
function mentionsConflictOfLawsConsumerPhrase(cc: CompanyCountry): string {
  if (cc === 'CH') {
    return 'notamment lorsque des consommateurs situés dans l’Union européenne ou d’autres États sont concernés';
  }
  return 'notamment lorsque des consommateurs situés dans un autre État de l’Espace économique européen ou en Suisse sont concernés';
}

function privacyLegalFrameworkIntro(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return (
        'Les traitements sont mis en œuvre conformément au Règlement (UE) 2016/679 du 27 avril 2016 (RGPD) lorsque celui-ci s’applique, ' +
        'à la loi « Informatique et Libertés » ainsi qu’aux autres textes français applicables. Le présent texte doit être adapté et validé avec votre conseil selon votre situation.'
      );
    case 'BE':
      return (
        'Les traitements sont mis en œuvre conformément au RGPD et au droit belge complémentaire en matière de protection des données ' +
        '(notamment la loi du 30 juillet 2018 portant création de l’APD et dispositions connexes). Faites valider la présente politique avec votre conseil.'
      );
    case 'LU':
      return (
        'Les traitements sont mis en œuvre conformément au RGPD et au droit luxembourgeois applicable ' +
        '(notamment la loi modifiée du 1er août 2018 organisant la CNPD). Faites valider la présente politique avec votre conseil.'
      );
    case 'CH':
      return (
        'Les traitements sont principalement régis par la loi fédérale suisse sur la protection des données (LPD) et les prescriptions du PFPDT. ' +
        'Lorsque le RGPD ou le droit de l’UE s’appliquent en outre (par exemple en cas d’offre active de biens ou services vers l’Union européenne), ' +
        'leurs dispositions peuvent compléter le régime suisse ; votre conseil précisera le droit applicable au cas par cas. Faites valider ce texte avec votre conseil.'
      );
    default:
      return privacyLegalFrameworkIntro('FR');
  }
}

function cguApplicableLawLead(cc: CompanyCountry): string {
  const droit =
    cc === 'FR' ? 'français' : cc === 'BE' ? 'belge' : cc === 'LU' ? 'luxembourgeois' : 'suisse';
  const pays = editorCountryLabel(cc);
  return (
    `Les CGU sont soumises au droit ${droit} (l’Éditeur est établi en ${pays}) et, le cas échéant, aux règles impératives protectrices du consommateur dans l’État où ce dernier réside. ` +
    'En l’absence de règlement amiable, les juridictions ou instances compétentes sont celles déterminées par ces règles ; précisez-les avec votre conseil.'
  );
}

function cguConsumerMediationInfo(cc: CompanyCountry): string {
  if (cc === 'CH') {
    return (
      'Lorsque le droit suisse applicable ou des engagements internationaux le prévoient, le consommateur peut disposer de voies de médiation ou de réclamation après une prise de contact préalable avec le service de l’Éditeur. ' +
      'Les coordonnées du médiateur ou de l’instance désignée figurent ci-dessous lorsqu’elles ont été renseignées.'
    );
  }
  return (
    'Lorsque le droit applicable le prévoit pour un consommateur éligible (notamment au sein de l’Union européenne), celui-ci peut avoir accès à une médiation ou à une procédure extrajudiciaire après une réclamation préalable auprès du service de l’Éditeur. ' +
    'Les coordonnées du médiateur ou de l’instance désignée figurent ci-dessous lorsqu’elles ont été renseignées.'
  );
}

function cguModificationConsumerLaw(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return (
        'Pour les consommateurs, toute clause modificative substantielle pourra, le cas échéant, être portée à votre connaissance selon les modalités prévues par le Code de la consommation lorsque celui-ci s’applique.'
      );
    case 'BE':
      return (
        'Pour les consommateurs, toute clause modificative substantielle pourra, le cas échéant, être portée à votre connaissance selon les modalités prévues par le droit belge ' +
        '(livre VI du Code de droit économique relatif au marché et à la protection des consommateurs) lorsque celui-ci s’applique.'
      );
    case 'LU':
      return (
        'Pour les consommateurs, toute clause modificative substantielle pourra, le cas échéant, être portée à votre connaissance selon les modalités prévues par le droit luxembourgeois de la consommation lorsque celui-ci s’applique.'
      );
    case 'CH':
      return (
        'Pour les consommateurs au sens du droit suisse, toute modification substantielle des CGU pourra, le cas échéant, devoir être communiquée selon les règles applicables à votre secteur (y compris lois fédérales et cantonales) ; renseignez-vous auprès de votre conseil.'
      );
    default:
      return cguModificationConsumerLaw('FR');
  }
}

function privacyMarketingLawClause(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return (
        'intérêt légitime uniquement dans les hypothèses prévues par le Code de la consommation et le Code des postes et des communications électroniques — à affiner avec votre conseil.'
      );
    case 'BE':
      return (
        'intérêt légitime uniquement dans les hypothèses prévues par le droit belge (livre XII du Code de droit économique et droit des communications électroniques) — à affiner avec votre conseil.'
      );
    case 'LU':
      return (
        'intérêt légitime uniquement dans les hypothèses prévues par le droit luxembourgeois en matière de prospection et de communications électroniques — à affiner avec votre conseil.'
      );
    case 'CH':
      return (
        'consentement ou autre fondement prévu par la LPD et le droit suisse sur la concurrence et les pratiques commerciales (p. ex. LCD) selon les cas — à affiner avec votre conseil.'
      );
    default:
      return privacyMarketingLawClause('FR');
  }
}

function privacyProcessorClause(cc: CompanyCountry): string {
  if (cc === 'CH') {
    return (
      'Nous pouvons recourir à des mandataires ou prestataires de traitement agissant pour notre compte selon les instructions prévues par la LPD et, lorsque le RGPD s’applique en parallèle, selon l’article 28 du RGPD ' +
      ': hébergement ou sous-traitance technique, envoi d’emails ou SMS, outils de messagerie, support, sécurité, paiement le cas échéant, etc. Des garanties contractuelles appropriées sont prévues.'
    );
  }
  return (
    'Nous pouvons recourir à des sous-traitants agissant pour notre compte et selon nos instructions (article 28 du RGPD lorsque celui-ci s’applique) : hébergement ou infogérance, envoi d’emails ou SMS, ' +
    'outils de messagerie, support technique, analyse de sécurité, solution de paiement le cas échéant, etc. Nous nous assurons que des garanties contractuelles appropriées sont mises en place.'
  );
}

function privacyRightsSectionTitle(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return '8. Vos droits (RGPD et loi « Informatique et Libertés »)';
    case 'BE':
    case 'LU':
      return '8. Vos droits (RGPD et droit national)';
    case 'CH':
      return '8. Vos droits (LPD et droit applicable)';
    default:
      return privacyRightsSectionTitle('FR');
  }
}

function privacyOppositionProspectionLaw(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return 'les conditions du Code de la consommation ;';
    case 'BE':
      return 'les conditions prévues par le droit belge de la consommation et des communications commerciales ;';
    case 'LU':
      return 'les conditions prévues par le droit luxembourgeois applicable ;';
    case 'CH':
      return 'les conditions prévues par le droit suisse applicable (y compris LCD / LCarte lorsque pertinent) ;';
    default:
      return privacyOppositionProspectionLaw('FR');
  }
}

function privacyDpaWebsite(cc: CompanyCountry): { href: string; label: string } {
  switch (cc) {
    case 'FR':
      return { href: 'https://www.cnil.fr', label: 'www.cnil.fr' };
    case 'BE':
      return { href: 'https://www.dataprotectionauthority.be', label: 'www.dataprotectionauthority.be' };
    case 'LU':
      return { href: 'https://cnpd.public.lu', label: 'cnpd.public.lu' };
    case 'CH':
      return { href: 'https://www.edoeb.admin.ch', label: 'www.edoeb.admin.ch' };
    default:
      return privacyDpaWebsite('FR');
  }
}

function privacyJurisdictionFooter(cc: CompanyCountry): string {
  if (cc === 'CH') {
    return (
      'Vous pouvez également saisir la juridiction civile compétente selon le droit suisse et, lorsque le RGPD ou le droit de l’UE s’appliquent par ailleurs, les juridictions prévues par ces textes ; renseignez-vous auprès de votre conseil.'
    );
  }
  return (
    'Vous pouvez également saisir la juridiction compétente selon les règles de droit de l’Union européenne ou nationales applicables (lieu de résidence, siège du responsable, nature du litige).'
  );
}

function privacyBreachNotificationParagraph(cc: CompanyCountry): string {
  if (cc === 'CH') {
    return (
      'En cas de violation de données personnelles susceptible d’engendrer un risque pour les personnes concernées, nous documentons l’incident et appliquons les obligations prévues par la LPD ' +
      '(notification à l’autorité de contrôle, information des personnes concernées lorsque la loi l’exige).'
    );
  }
  return (
    'En cas de violation de données susceptible d’engendrer un risque pour vos droits et libertés, nous documentons l’incident, nous pouvons notifier l’autorité de contrôle et, lorsque le risque est élevé, vous en informer dans les meilleurs délais conformément aux articles 33 et 34 du RGPD.'
  );
}

function cookiesLegalFrameworkParagraph(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return (
        'Les règles applicables combinent le RGPD lorsqu’il s’applique, la loi « Informatique et Libertés » et le droit français transposition du paquet « télécom » / directive ePrivacy en matière de cookies ; suivez les lignes directrices de la CNIL.'
      );
    case 'BE':
      return (
        'Les règles applicables combinent le RGPD et le droit belge relatif aux cookies et aux communications électroniques (transposition du paquet « télécom ») ; suivez les orientations de l’APD.'
      );
    case 'LU':
      return (
        'Les règles applicables combinent le RGPD et le droit luxembourgeois relatif aux cookies et aux communications électroniques ; suivez les orientations de la CNPD.'
      );
    case 'CH':
      return (
        'Les règles applicables sont en premier lieu la LPD et les recommandations du PFPDT sur les traceurs. Lorsque vous ciblez des personnes dans l’Union européenne, le RGPD et le droit européen des cookies peuvent s’appliquer en parallèle ; validez votre dispositif avec votre conseil.'
      );
    default:
      return cookiesLegalFrameworkParagraph('FR');
  }
}

function cookiesBannerEquivalenceLead(cc: CompanyCountry): string {
  switch (cc) {
    case 'FR':
      return 'Les boutons « Refuser » et « Accepter » doivent être présentés avec un degré d’importance équivalent lorsque le droit applicable l’exige (recommandations de la CNIL).';
    case 'BE':
      return 'Les boutons « Refuser » et « Accepter » doivent être présentés avec un degré d’importance équivalent lorsque le droit applicable l’exige (bonnes pratiques de l’APD).';
    case 'LU':
      return 'Les boutons « Refuser » et « Accepter » doivent être présentés avec un degré d’importance équivalent lorsque le droit applicable l’exige (orientations de la CNPD).';
    case 'CH':
      return 'Les options d’acceptation et de refus doivent être claires, lisibles et non trompeuses selon le droit suisse et les recommandations du PFPDT ; adaptez le bandeau avec votre conseil.';
    default:
      return cookiesBannerEquivalenceLead('FR');
  }
}

function cookiesPersonalDataLawParagraph(cc: CompanyCountry): string {
  if (cc === 'CH') {
    return (
      'Les cookies et traceurs peuvent conduire à la collecte d’informations permettant de vous identifier directement ou indirectement (adresse IP, identifiant unique, croisement avec d’autres données). ' +
      'Ces traitements relèvent en principe de la LPD ; lorsque le RGPD s’applique en outre, ses règles sont également prises en compte.'
    );
  }
  return (
    'Les cookies et traceurs peuvent conduire à la collecte d’informations permettant de vous identifier directement ou indirectement (adresse IP, identifiant unique, croisement avec d’autres données). ' +
    'Ces traitements relèvent du RGPD lorsqu’il s’applique, complété par le droit national sur les communications électroniques et les traceurs.'
  );
}

function privacyPurposesSectionTitle(cc: CompanyCountry): string {
  if (cc === 'CH') {
    return '5. Finalités du traitement et bases légales (LPD ; RGPD lorsque applicable)';
  }
  return '5. Finalités du traitement et bases légales (article 6 du RGPD)';
}

function displayName(settings: AppSettings | null): string {
  const n = (settings?.platform_name || '').trim();
  if (n && n.toLowerCase() !== 'panorama') return n;
  return "l'éditeur du site";
}

export const LEGAL_TITLES: Record<LegalSlug, string> = {
  'mentions-legales': 'Mentions légales',
  'conditions-utilisation': "Conditions générales d'utilisation du site",
  'politique-confidentialite': 'Politique de confidentialité',
  'politique-cookies': 'Politique de cookies',
};

export function LegalDocumentBody({
  slug,
  settings,
}: {
  slug: LegalSlug;
  settings: AppSettings | null;
}) {
  const name = displayName(settings);
  const addr = (settings?.address || '').trim();
  const email = (settings?.email || '').trim();
  const website = (settings?.website || '').trim();
  const companyCountry = normalizeCompanyCountry(settings?.company_country);

  if (slug === 'mentions-legales') {
    const legalForm = (settings?.legal_form || '').trim();
    const shareCapital = (settings?.share_capital || '').trim();
    const sirenVal = (settings?.siren || '').trim();
    const siretVal = (settings?.siret || '').trim();
    const rcsVal = (settings?.rcs || '').trim();
    const vatNumberVal = (settings?.vat_number || '').trim();
    const regulatoryVal = (settings?.regulatory_mentions || '').trim();
    const publicationDirectorVal = (settings?.publication_director || '').trim();
    const hostingVal = (settings?.hosting_provider || '').trim();
    const dpoVal = (settings?.dpo_contact || '').trim();
    const mediatorVal = (settings?.consumer_mediator || '').trim();
    const ipMentions = intellectualPropertyMentionsParagraphs(companyCountry);
    const hasCompanyRegistrationInfo = Boolean(
      legalForm || shareCapital || sirenVal || siretVal || rcsVal || vatNumberVal
    );

    return (
      <>
        <section>
          <h2 style={h2}>1. Identification de l&apos;éditeur</h2>
          <p style={p}>{editorIdentificationIntroParagraph(companyCountry)}</p>
          <p style={p}>
            Le présent site est édité par <strong>{name}</strong>, ci-après « l&apos;Éditeur ».
          </p>
          {addr ? (
            <p style={p}>
              <strong>Siège social / adresse de correspondance :</strong> {addr}
            </p>
          ) : (
            <LegalPlaceholder>
              <strong>[À compléter]</strong> Adresse complète du siège social ou du principal établissement.
            </LegalPlaceholder>
          )}
          {email ? (
            <p style={p}>
              <strong>Contact :</strong>{' '}
              <a href={`mailto:${email}`} style={{ color: '#2563eb' }}>
                {email}
              </a>{' '}
              (réclamations, support, demandes liées au site).
            </p>
          ) : (
            <LegalPlaceholder>
              <strong>[À compléter]</strong> Adresse email et, le cas échéant, numéro de téléphone pour
              contacter l&apos;Éditeur.
            </LegalPlaceholder>
          )}
          {website ? (
            <p style={p}>
              <strong>Site public :</strong>{' '}
              <a href={website} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                {website}
              </a>
            </p>
          ) : null}
          {hasCompanyRegistrationInfo ? (
            <>
              {legalForm ? (
                <p style={p}>
                  <strong>Forme juridique :</strong> {legalForm}
                </p>
              ) : null}
              {shareCapital ? (
                <p style={p}>
                  <strong>Capital social :</strong> {shareCapital}
                </p>
              ) : null}
              {sirenVal ? (
                <p style={p}>
                  <strong>Identifiant d&apos;entreprise :</strong> {sirenVal}
                </p>
              ) : null}
              {siretVal ? (
                <p style={p}>
                  <strong>N° d&apos;établissement ou succursale :</strong> {siretVal}
                </p>
              ) : null}
              {rcsVal ? (
                <p style={p}>
                  <strong>Registre du commerce (ou équivalent) :</strong> {rcsVal}
                </p>
              ) : null}
              {vatNumberVal ? (
                <p style={p}>
                  <strong>Numéro de TVA / identifiant TVA :</strong> {vatNumberVal}
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        <section>
          <h2 style={h2}>2. Directeur de la publication</h2>
          <p style={p}>
            La direction de la publication du site est assurée par la personne physique ou morale désignée
            comme telle, responsable du contrôle éditorial des contenus mis en ligne sur le site.
          </p>
          {publicationDirectorVal ? (
            <p style={p}>
              <strong>Directeur de la publication :</strong> {publicationDirectorVal}
            </p>
          ) : null}
        </section>

        <section>
          <h2 style={h2}>3. Hébergement du site</h2>
          <p style={p}>{hostingLegalIntroParagraph(companyCountry)}</p>
          {hostingVal ? <MultilineBlock text={hostingVal} /> : null}
        </section>

        <section>
          <h2 style={h2}>4. Propriété intellectuelle</h2>
          <p style={p}>{ipMentions.protection}.</p>
          <p style={p}>{ipMentions.infringement}</p>
          <p style={p}>
            Les marques et logotypes figurant sur le site sont des signes distinctifs déposés ou non ; toute
            reproduction non autorisée est prohibée.
          </p>
        </section>

        <section>
          <h2 style={h2}>5. Liens hypertextes</h2>
          <p style={p}>
            Le site peut contenir des liens hypertextes renvoyant vers des sites internet édités par des
            tiers. L&apos;Éditeur n&apos;exerce aucun contrôle sur ces sites et décline toute responsabilité
            quant à leur contenu, leur caractère publicitaire, leurs pratiques en matière de données
            personnelles ou leurs conditions d&apos;utilisation.
          </p>
          <p style={p}>
            La création de liens hypertextes vers le présent site, notamment par technique de framing ou
            deep-linking, est soumise à l&apos;accord préalable et écrit de l&apos;Éditeur, sauf usage strictement
            privé et non commercial.
          </p>
        </section>

        <section>
          <h2 style={h2}>6. Données à caractère personnel</h2>
          <p style={p}>
            Les traitements de données personnelles mis en œuvre via le site (création de compte, navigation,
            formulaires, cookies et traceurs le cas échéant) sont décrits dans la{' '}
            <Link to="/legal/politique-confidentialite" style={{ color: '#2563eb' }}>
              Politique de confidentialité
            </Link>
            . Vous y trouverez notamment les finalités des traitements, les durées de conservation, vos droits
            (accès, rectification, opposition, etc.) et les modalités pour les exercer auprès de l&apos;Éditeur
            ou auprès de {dataProtectionAuthorityForMentions(companyCountry)}, autorité de contrôle compétente
            lorsque l&apos;Éditeur est établi dans le pays sélectionné dans les paramètres de la plateforme.
          </p>
          {dpoVal ? (
            <>
              <p style={{ ...p, marginBottom: 6 }}>
                <strong>Délégué à la protection des données (DPO) :</strong>
              </p>
              <MultilineBlock text={dpoVal} />
            </>
          ) : null}
        </section>

        <section>
          <h2 style={h2}>7. Cookies et traceurs</h2>
          <p style={p}>
            Lors de la consultation du site, des cookies ou traceurs similaires peuvent être déposés sur
            votre terminal, sous réserve de votre consentement lorsque la réglementation l&apos;exige. Les
            modalités d&apos;information et de gestion du consentement sont détaillées dans la{' '}
            <Link to="/legal/politique-cookies" style={{ color: '#2563eb' }}>
              Politique cookies
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 style={h2}>8. Limitation de responsabilité et mise à jour des contenus</h2>
          <p style={p}>
            L&apos;Éditeur s&apos;efforce de fournir des informations exactes et à jour sur le site. Toutefois,
            des erreurs ou omissions peuvent survenir. Les contenus sont fournis « en l&apos;état », sans
            garantie expresse ou implicite de quelque nature que ce soit quant à leur exhaustivité, leur
            exactitude ou leur adéquation à un usage particulier.
          </p>
          <p style={p}>
            L&apos;Éditeur ne saurait être tenu responsable des dommages directs ou indirects résultant de
            l&apos;accès ou de l&apos;utilisation du site, de l&apos;impossibilité d&apos;y accéder, ou du fait
            de se fier aux informations publiées, dans la limite des dispositions légales et réglementaires
            applicables.
          </p>
          {regulatoryVal ? (
            <>
              <p style={{ ...p, marginBottom: 6 }}>
                <strong>Informations réglementaires complémentaires :</strong>
              </p>
              <MultilineBlock text={regulatoryVal} />
            </>
          ) : null}
        </section>

        <section>
          <h2 style={h2}>9. Règlement des litiges et médiation</h2>
          <p style={p}>{mediationMentionsLegalesParagraph(companyCountry)}</p>
          {mediatorVal ? (
            <>
              <p style={{ ...p, marginBottom: 6 }}>
                <strong>Médiateur de la consommation :</strong>
              </p>
              <MultilineBlock text={mediatorVal} />
            </>
          ) : null}
          <p style={p}>
            Le consommateur peut également consulter la plateforme européenne de règlement en ligne des
            litiges (RLL) à l&apos;adresse :{' '}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
              https://ec.europa.eu/consumers/odr
            </a>
            .
          </p>
        </section>

        <section>
          <h2 style={h2}>10. Droit applicable</h2>
          <p style={p}>
            Les présentes mentions légales sont régies par le droit du pays dans lequel l&apos;Éditeur est
            établi ou, le cas échéant, par les règles de conflits de lois applicables (
            {mentionsConflictOfLawsConsumerPhrase(companyCountry)}). Aux fins des présentes pages,
            l&apos;Éditeur est réputé établi dans le pays sélectionné dans les paramètres de la plateforme (
            {editorCountryLabel(companyCountry)}).
          </p>
          <p style={p}>{jurisdictionB2BForumParagraph(companyCountry)}</p>
        </section>
      </>
    );
  }

  if (slug === 'conditions-utilisation') {
    const mediatorCgu = (settings?.consumer_mediator || '').trim();
    const regulatoryCgu = (settings?.regulatory_mentions || '').trim();

    return (
      <>
        <section>
          <h2 style={h2}>1. Objet et champ d&apos;application</h2>
          <p style={p}>
            Les présentes conditions générales d&apos;utilisation (ci-après les « CGU ») régissent
            l&apos;accès et l&apos;utilisation du site internet, de l&apos;application ou de tout service en
            ligne édité par <strong>{name}</strong> (ci-après « l&apos;Éditeur »), ainsi que les
            fonctionnalités mises à disposition des utilisateurs (ci-après les « Services »).
          </p>
          <p style={p}>
            Les CGU constituent un accord entre l&apos;Éditeur et toute personne accédant aux Services («
            l&apos;Utilisateur », « vous »). Elles complètent les éventuelles conditions particulières,
            mandats, contrats-cadres ou formulaires d&apos;adhésion applicables aux produits ou services
            distribués, lesquels priment en cas de contradiction expresse sur leur objet spécifique.
          </p>
          <p style={p}>
            Les{' '}
            <Link to="/legal/mentions-legales" style={{ color: '#2563eb' }}>
              mentions légales
            </Link>
            , la{' '}
            <Link to="/legal/politique-confidentialite" style={{ color: '#2563eb' }}>
              politique de confidentialité
            </Link>{' '}
            et la{' '}
            <Link to="/legal/politique-cookies" style={{ color: '#2563eb' }}>
              politique cookies
            </Link>{' '}
            font partie intégrante de la documentation d&apos;information à laquelle vous êtes référé.
          </p>
        </section>

        <section>
          <h2 style={h2}>2. Acceptation et opposabilité</h2>
          <p style={p}>
            L&apos;utilisation des Services emporte acceptation pleine et entière des CGU en vigueur au jour
            de ladite utilisation. Si vous n&apos;acceptez pas l&apos;ensemble des stipulations, vous devez
            cesser d&apos;accéder au site et ne pas créer de compte.
          </p>
          <p style={p}>
            L&apos;Éditeur se réserve le droit de modifier les CGU ; les modalités de mise à jour figurent à
            la section 12. {cguModificationConsumerLaw(companyCountry)}
          </p>
        </section>

        <section>
          <h2 style={h2}>3. Conditions d&apos;accès et d&apos;éligibilité</h2>
          <p style={p}>
            Les Services sont ouverts aux personnes physiques ou morales disposant de la capacité juridique
            requise pour contracter lorsque la création d&apos;un compte ou la souscription implique des
            obligations financières ou réglementées.
          </p>
          <p style={p}>
            L&apos;Utilisateur déclare que les informations communiquées à l&apos;Éditeur sont sincères,
            exactes et à jour. Il s&apos;engage à mettre à jour sans délai ses coordonnées lorsque nécessaire.
          </p>
        </section>

        <section>
          <h2 style={h2}>4. Disponibilité, maintenance et évolution des Services</h2>
          <p style={p}>
            L&apos;Éditeur met en œuvre des moyens raisonnables pour assurer l&apos;accessibilité continue des
            Services. Toutefois, l&apos;accès peut être interrompu ou limité pour opérations de maintenance
            programmée ou d&apos;urgence, mise à jour, évolution fonctionnelle, mise à niveau de sécurité ou
            cas de force majeure au sens du droit applicable au contrat et au pays de l&apos;Éditeur.
          </p>
          <p style={p}>
            L&apos;Éditeur ne garantit ni une disponibilité ininterrompue, ni l&apos;absence totale
            d&apos;erreurs, de bugs ou de vulnérabilités. Les interruptions ne donnent lieu à aucune indemnité
            sauf disposition légale impérative contraire.
          </p>
        </section>

        <section>
          <h2 style={h2}>5. Compte Utilisateur</h2>
          <p style={p}>
            Certaines fonctionnalités requièrent la création d&apos;un compte sécurisé. L&apos;Utilisateur
            choisit des identifiants (adresse électronique, numéro de téléphone, etc.) et un mot de passe ou
            tout autre moyen d&apos;authentification proposé (code à usage unique, etc.) qu&apos;il s&apos;engage
            à conserver confidentiels.
          </p>
          <p style={p}>
            Toute opération effectuée depuis le compte après authentification est réputée avoir été réalisée
            par l&apos;Utilisateur, sauf notification immédiate à l&apos;Éditeur en cas de perte, vol ou usage
            frauduleux des identifiants.
          </p>
          <p style={p}>
            L&apos;Éditeur peut suspendre ou clôturer un compte en cas de violation des CGU, de suspicion de
            fraude, d&apos;inactivité prolongée lorsque les règles internes le prévoient, ou pour respecter
            une obligation légale, après notification lorsque la loi l&apos;exige.
          </p>
        </section>

        <section>
          <h2 style={h2}>6. Règles d&apos;utilisation et obligations de l&apos;Utilisateur</h2>
          <p style={p}>L&apos;Utilisateur s&apos;interdit notamment de :</p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 22 }}>
            <li style={{ marginBottom: 8 }}>
              porter atteinte aux droits de l&apos;Éditeur ou de tiers (propriété intellectuelle, vie privée,
              image, honneur et réputation) ;
            </li>
            <li style={{ marginBottom: 8 }}>
              usurper l&apos;identité d&apos;autrui ou fournir de fausses informations ;
            </li>
            <li style={{ marginBottom: 8 }}>
              tenter d&apos;accéder sans autorisation à tout ou partie des systèmes, réseaux, bases de données,
              comptes ou données d&apos;autres utilisateurs ;
            </li>
            <li style={{ marginBottom: 8 }}>
              introduire des virus, vers, chevaux de Troie, scripts malveillants ou tout code susceptible
              d&apos;endommager ou de surcharger les Services ;
            </li>
            <li style={{ marginBottom: 8 }}>
              extraire de manière massive, scraper ou exploiter les contenus par des moyens automatisés sans
              accord écrit préalable (sauf exceptions légales) ;
            </li>
            <li style={{ marginBottom: 8 }}>
              utiliser les Services à des fins illicites, frauduleuses, de démarchage non autorisé ou contraires
              aux présentes ;
            </li>
            <li style={{ marginBottom: 8 }}>
              perturber le bon fonctionnement des Services ou surcharger délibérément l&apos;infrastructure ;
            </li>
            <li style={{ marginBottom: 8 }}>
              revendre, louer ou céder l&apos;accès au compte sans l&apos;accord de l&apos;Éditeur.
            </li>
          </ul>
          <p style={p}>
            Tout manquement peut entraîner la suspension immédiate de l&apos;accès, la résiliation du compte,
            la suppression de contenus illicites et, le cas échéant, la saisine des autorités compétentes.
          </p>
        </section>

        <section>
          <h2 style={h2}>7. Contenus, information générale et absence de conseil personnalisé</h2>
          <p style={p}>
            Les contenus publiés sur les Services (textes, graphiques, simulations, fiches produits, actualités,
            etc.) ont une vocation informative générale. Ils ne constituent pas, sauf mention expresse et
            selon des modalités contractuelles distinctes, un conseil personnalisé en investissement,
            fiscalité, juridique ou comptable.
          </p>
          <p style={p}>
            L&apos;Utilisateur reconnaît disposer de la compétence et, le cas échéant, du conseil extérieur
            nécessaires pour prendre ses décisions en fonction de sa situation personnelle, de son objectif de
            placement, de son exposition au risque et de sa législation applicable.
          </p>
          {regulatoryCgu ? (
            <>
              <p style={{ ...p, marginBottom: 6 }}>
                <strong>Mentions réglementaires :</strong>
              </p>
              <MultilineBlock text={regulatoryCgu} />
            </>
          ) : null}
        </section>

        <section>
          <h2 style={h2}>8. Propriété intellectuelle</h2>
          <p style={p}>
            Les éléments du site et des Services (logiciels, interfaces, charte graphique, textes, bases de
            données, marques, logos) sont protégés par le droit de la propriété intellectuelle et demeurent
            la propriété de l&apos;Éditeur ou de ses concédants.
          </p>
          <p style={p}>
            Sous réserve de dispositions impératives (copie privée, citation, etc.), toute reproduction,
            représentation, adaptation ou exploitation non autorisée est interdite et peut être poursuivie.
          </p>
        </section>

        <section>
          <h2 style={h2}>9. Liens hypertextes et sites tiers</h2>
          <p style={p}>
            Les Services peuvent contenir des liens vers des sites tiers. L&apos;Éditeur ne maîtrise pas ces
            sites et décline toute responsabilité quant à leurs contenus, leurs politiques de données ou leurs
            pratiques commerciales. L&apos;activation d&apos;un lien externe se fait sous votre seule
            responsabilité.
          </p>
        </section>

        <section>
          <h2 style={h2}>10. Limitation et exclusion de responsabilité</h2>
          <p style={p}>
            Dans toute la mesure permise par les textes applicables, l&apos;Éditeur ne pourra être tenu
            responsable des dommages indirects ou immatériels tels que perte de données, perte de chance, perte
            de bénéfice, atteinte à l&apos;image ou préjudice commercial, sauf faute lourde ou dol avérés si la
            loi l&apos;impose.
          </p>
          <p style={p}>
            L&apos;Utilisateur est seul responsable de l&apos;usage qu&apos;il fait des Services et des
            décisions prises sur la base des informations disponibles. Il veille à la sécurité de ses
            terminaux et de ses connexions (antivirus, mises à jour, réseaux Wi-Fi sécurisés).
          </p>
          <p style={p}>
            Les montants et indemnisations éventuellement dus par l&apos;Éditeur, le cas échéant, seront, sauf
            disposition impérative, limités aux seuls dommages directs prouvés, dans la limite stipulée par le
            droit applicable.
          </p>
        </section>

        <section>
          <h2 style={h2}>11. Données personnelles et cookies</h2>
          <p style={p}>
            Les traitements de données à caractère personnel réalisés via les Services sont détaillés dans la{' '}
            <Link to="/legal/politique-confidentialite" style={{ color: '#2563eb' }}>
              Politique de confidentialité
            </Link>
            . Les traceurs sont présentés dans la{' '}
            <Link to="/legal/politique-cookies" style={{ color: '#2563eb' }}>
              Politique cookies
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 style={h2}>12. Modification des CGU et information</h2>
          <p style={p}>
            L&apos;Éditeur peut adapter les CGU pour tenir compte de l&apos;évolution des Services, des
            technologies ou du cadre juridique. La version à jour est accessible en permanence sur le site.
            Pour les Utilisateurs connectés, une information dans l&apos;espace personnel, par email ou par
            bandeau d&apos;information pourra compléter cette publication lorsque le contexte l&apos;exige.
          </p>
          <p style={p}>
            La poursuite d&apos;utilisation des Services après la date d&apos;effet des CGU modifiées vaut
            acceptation des nouvelles stipulations, sauf opposition ou droit de résiliation lorsque la loi
            accorde une faculté plus protectrice au consommateur.
          </p>
        </section>

        <section>
          <h2 style={h2}>13. Durée et fin de l&apos;accès</h2>
          <p style={p}>
            Les CGU s&apos;appliquent pendant toute la durée d&apos;utilisation des Services. La clôture du
            compte ou la cessation d&apos;accès met fin à l&apos;exécution des obligations réciproques,
            sans préjudice des dispositions qui survivent par leur nature (propriété intellectuelle,
            responsabilité, litiges, données archivées selon la durée légale).
          </p>
        </section>

        <section>
          <h2 style={h2}>14. Droit applicable, langue et règlement des différends</h2>
          <p style={p}>{cguApplicableLawLead(companyCountry)}</p>
          <p style={p}>{cguConsumerMediationInfo(companyCountry)}</p>
          {mediatorCgu ? (
            <>
              <p style={{ ...p, marginBottom: 6 }}>
                <strong>Médiateur de la consommation :</strong>
              </p>
              <MultilineBlock text={mediatorCgu} />
            </>
          ) : null}
          <p style={p}>
            La langue des présentes CGU est le français. En cas de traduction à titre gracieux, seule la version
            française prévaut entre les parties.
          </p>
        </section>

        <section>
          <h2 style={h2}>15. Dispositions diverses</h2>
          <p style={p}>
            Si une clause est jugée nulle ou inapplicable, les autres clauses conservent leur force obligatoire
            dans la limite de l&apos;économie générale du contrat.
          </p>
          <p style={p}>
            L&apos;absence d&apos;exercice par l&apos;Éditeur d&apos;un droit prévu aux CGU ne vaut pas
            renonciation à s&apos;en prévaloir ultérieurement.
          </p>
        </section>
      </>
    );
  }

  if (slug === 'politique-confidentialite') {
    const dpoPrivacy = (settings?.dpo_contact || '').trim();
    const dpaW = privacyDpaWebsite(companyCountry);

    return (
      <>
        <section>
          <h2 style={h2}>1. Objet et référence juridique</h2>
          <p style={p}>
            La présente politique de confidentialité décrit la manière dont{' '}
            <strong>{name}</strong> (ci-après « le Responsable du traitement », « nous » ou « notre »)
            collecte et traite les données à caractère personnel des personnes concernées (« vous ») dans le
            cadre de la consultation du site ou de l&apos;application et de l&apos;utilisation des services
            associés (ci-après ensemble les « Services »).
          </p>
          <p style={p}>{privacyLegalFrameworkIntro(companyCountry)}</p>
          <p style={p}>
            Pour les traceurs et dispositifs similaires (cookies, identifiants publicitaires, etc.), des
            précisions complémentaires figurent dans la{' '}
            <Link to="/legal/politique-cookies" style={{ color: '#2563eb' }}>
              Politique cookies
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 style={h2}>2. Responsable du traitement et point de contact</h2>
          <p style={p}>
            Le responsable du traitement des données traitées via les Services est :{' '}
            <strong>{name}</strong>.
          </p>
          {addr ? (
            <p style={p}>
              <strong>Adresse de correspondance :</strong> {addr}
            </p>
          ) : (
            <LegalPlaceholder>
              <strong>[À compléter]</strong> Adresse postale complète du responsable du traitement.
            </LegalPlaceholder>
          )}
          {email ? (
            <p style={p}>
              <strong>Contact « vie privée » :</strong>{' '}
              <a href={`mailto:${email}`} style={{ color: '#2563eb' }}>
                {email}
              </a>
              . Pour exercer vos droits ou obtenir des informations sur vos données, nous vous invitons à nous
              écrire en précisant l&apos;objet de votre demande et, le cas échéant, votre identifiant client.
            </p>
          ) : (
            <LegalPlaceholder>
              <strong>[À compléter]</strong> Adresse email dédiée aux demandes relatives aux données personnelles
              (et coordonnées téléphoniques le cas échéant).
            </LegalPlaceholder>
          )}
          {dpoPrivacy ? (
            <>
              <p style={{ ...p, marginBottom: 6, marginTop: 12 }}>
                <strong>Délégué à la protection des données (DPO) :</strong>
              </p>
              <MultilineBlock text={dpoPrivacy} />
            </>
          ) : null}
        </section>

        <section>
          <h2 style={h2}>3. Catégories de données personnelles collectées</h2>
          <p style={p}>
            Selon votre utilisation des Services (visite simple, création de compte, souscription, échange de
            messages, téléversement de documents, parrainage, etc.), nous pouvons être amenés à traiter les
            catégories de données suivantes, de manière non exhaustive :
          </p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 22 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Identité et état civil :</strong> civilité, nom, prénom, date ou année de naissance le cas
              échéant ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Coordonnées :</strong> adresse postale, email, numéro de téléphone fixe ou mobile ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Compte et authentification :</strong> identifiant, mot de passe sous forme dérivée /
              hachée, préférences de connexion (ex. : résultat OTP, jetons de session) ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Données relatives à la relation contractuelle :</strong> souscriptions, opérations,
              positions, historiques de transactions ou instructions légitimement transmises via la plateforme ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Échanges et contenus que vous nous transmettez :</strong> messages, pièces jointes,
              documents d&apos;identité ou justificatifs lorsque la réglementation ou le suivi du dossier
              l&apos;exige ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Données de navigation et techniques :</strong> journaux de connexion, adresse IP,
              identifiants d&apos;appareil ou de session, type de navigateur, horodatage, URL de référence,
              erreurs techniques ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Données de sécurité et prévention de la fraude :</strong> événements liés à
              l&apos;authentification, anomalies d&apos;usage, listes de blocage ou de vigilance lorsque la
              loi l&apos;autorise ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Données issues de tiers :</strong> informations transmises par un partenaire, un
              co-contractant ou une autorité, dans le strict respect des bases légales applicables.
            </li>
          </ul>
          <p style={p}>
            En tant qu&apos;établissement exerçant des activités de banque d&apos;investissement et services
            connexes, nous ne collectons pas de données de santé ou d&apos;autres catégories particulières à
            des fins commerciales courantes. Toutefois, lorsque le RGPD s&apos;applique, certaines informations
            peuvent être qualifiées de <strong>données sensibles au sens de l&apos;article 9</strong> (par exemple
            données révélant l&apos;origine ethnique figurant sur une pièce d&apos;identité collectée pour les
            obligations de connaissance client, ou données biométriques si un dispositif d&apos;identification
            à distance ou de vérification d&apos;identité certifié en fait usage). Ces traitements sont limités
            au <strong>strict nécessaire</strong> pour respecter nos <strong>obligations légales et
            réglementaires</strong> (notamment lutte contre le blanchiment et le financement du terrorisme,
            prévention de la fraude, conformité sur les marchés financiers), pour des{' '}
            <strong>missions d&apos;intérêt public</strong>{' '}
            ou sur d&apos;autres bases prévues à l&apos;article 9 § 2 lorsque la loi l&apos;exige. Lorsqu&apos;un{' '}
            <strong>consentement explicite</strong> est requis, il est recueilli séparément et de manière
            documentée. Pour un traitement régi par le droit suisse (LPD), des catégories de données
            particulièrement protégées peuvent s&apos;apprécier différemment ; adaptez cette mention avec votre
            conseil selon vos filières et instruments.
          </p>
          <p style={p}>
            Les Services ne s&apos;adressent pas aux personnes mineures non émancipées sans le consentement ou
            l&apos;autorisation des titulaires de l&apos;autorité parentale lorsque la loi l&apos;exige. Si vous
            avez connaissance du traitement de données d&apos;un mineur sans base légale suffisante, contactez-nous.
          </p>
        </section>

        <section>
          <h2 style={h2}>4. Origine des données et caractère obligatoire</h2>
          <p style={p}>
            La plupart des données sont collectées directement auprès de vous, lors de votre inscription, de la
            saisie de formulaires, de vos échanges avec nos équipes ou du chargement de documents. Certaines
            données peuvent être générées automatiquement (logs) ou complétées à partir de sources autorisées.
          </p>
          <p style={p}>
            Lorsque la loi ou l&apos;exécution du contrat l&apos;impose, le caractère obligatoire ou facultatif
            des réponses est indiqué au moment de la collecte. À défaut d&apos;informations nécessaires,
            certaines fonctionnalités peuvent être indisponibles ou le traitement peut être refusé dans la limite
            permise par la loi.
          </p>
        </section>

        <section>
          <h2 style={h2}>{privacyPurposesSectionTitle(companyCountry)}</h2>
          <p style={p}>
            Chaque traitement repose sur au moins une base légale parmi : l&apos;exécution d&apos;un contrat
            dont vous êtes partie ou de mesures précontractuelles ; le respect d&apos;une obligation légale à
            laquelle nous sommes soumis ; notre intérêt légitime ; ou votre consentement lorsque celui-ci est
            requis.
          </p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 22 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Gestion des comptes et fourniture des Services</strong> — création, authentification,
              accès aux espaces personnels, suivi de la relation, facturation ou justificatifs lorsque
              applicable :{' '}
              <em>exécution du contrat</em> et, le cas échéant, <em>mesures précontractuelles</em>.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Communications relatives au service</strong> — notifications techniques, alertes de
              sécurité, mises à jour ou réponses à vos demandes : <em>exécution du contrat</em> et, pour
              certaines communications non strictement nécessaires au contrat, <em>intérêt légitime</em> ou{' '}
              <em>consentement</em> selon le contexte.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Obligations légales et réglementaires</strong> — conservation de preuves, lutte contre le
              blanchiment et la fraude lorsque applicable, réponses aux réquisitions administratives ou
              judiciaires : <em>obligation légale</em>.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Sécurité des systèmes d&apos;information</strong> — détection d&apos;incidents,
              sauvegardes, analyse de logs, renforcement des contrôles d&apos;accès : <em>intérêt légitime</em>{' '}
              (sécurité du service et des utilisateurs).
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Prospection commerciale par voie électronique</strong> (emails, SMS, notifications
              marketing) lorsque de tels envois sont mis en œuvre : en principe <em>consentement</em> ou{' '}
              {privacyMarketingLawClause(companyCountry)}
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Mesure d&apos;audience et traceurs</strong> non strictement nécessaires :{' '}
              <em>consentement</em> lorsque requis ; voir la{' '}
              <Link to="/legal/politique-cookies" style={{ color: '#2563eb' }}>
                Politique cookies
              </Link>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 style={h2}>6. Destinataires, sous-traitance et transferts</h2>
          <p style={p}>
            Vos données sont destinées aux personnes autorisées au sein de notre organisation (services
            informatiques, conformité, relation client, etc.) dans la limite de leurs attributions et sur la
            base du « besoin d&apos;en connaître » (need-to-know).
          </p>
          <p style={p}>{privacyProcessorClause(companyCountry)}</p>
          <p style={p}>
            Nous ne vendons pas vos données personnelles. Nous pouvons être amenés à communiquer certaines
            données à des autorités publiques (juges, services fiscaux, autorités de contrôle) lorsque la loi
            nous y contraint ou nous y autorise de manière expresse.
          </p>
        </section>

        <section>
          <h2 style={h2}>7. Durées de conservation</h2>
          <p style={p}>
            Les données ne sont pas conservées au-delà de la durée nécessaire aux finalités pour lesquelles
            elles ont été collectées, augmentée le cas échéant des délais légaux de prescription, d&apos;opposition,
            de réclamation ou d&apos;obligation comptable ou fiscale.
          </p>
          <p style={p}>À titre indicatif, sans préjudice de vos obligations légales propres :</p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 22 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Données de compte actif :</strong> pendant toute la durée de la relation contractuelle ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Après clôture de compte :</strong> purge ou anonymisation dans des délais compatibles avec
              les obligations légales et la prescription ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Journaux de connexion et de sécurité :</strong> durée limitée, sauf conservation
              allongée en cas de litige ou d&apos;obligation spécifique ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Preuves et litiges :</strong> conservation jusqu&apos;à désignation des droits ou prescription
              applicable.
            </li>
          </ul>
        </section>

        <section>
          <h2 style={h2}>{privacyRightsSectionTitle(companyCountry)}</h2>
          {companyCountry === 'CH' ? (
            <p style={p}>
              Les droits listés ci-dessous reprennent la logique du RGPD lorsque celui-ci s&apos;applique à votre
              cas. Pour un traitement essentiellement régi par le droit suisse, les droits prévus par la LPD
              (information, accès, rectification, annulation, opposition, portabilité dans les hypothèses
              légales, etc.) s&apos;exercent auprès du responsable du traitement ; en cas de doute sur le régime
              applicable, consultez votre conseil.
            </p>
          ) : null}
          <p style={p}>Vous disposez des droits suivants, dans les conditions et limites prévues par la loi :</p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 22 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Droit d&apos;accès</strong> : obtenir la confirmation du traitement et une copie
              des données vous concernant ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Droit de rectification</strong> : faire corriger des données inexactes ou incomplètes ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Droit à l&apos;effacement</strong> (« droit à l&apos;oubli ») : dans les cas prévus
              par l&apos;article 17 du RGPD ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Droit à la limitation</strong> du traitement dans les situations visées à l&apos;article
              18 du RGPD ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Droit à la portabilité</strong> : recevoir les données que vous avez fournies dans un
              format structuré et couramment utilisé et les transmettre à un autre responsable, lorsque le
              traitement est fondé sur le consentement ou le contrat et mis en œuvre par des moyens automatisés ;
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Droit d&apos;opposition</strong> : notamment au traitement fondé sur l&apos;intérêt
              légitime ou à des fins de prospection ; vous pouvez refuser la prospection commerciale dans{' '}
              {privacyOppositionProspectionLaw(companyCountry)}
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Droit de retirer votre consentement</strong> à tout moment, sans affecter la licéité du
              traitement fondé sur le consentement avant son retrait ;
            </li>
            {companyCountry === 'FR' ? (
              <li style={{ marginBottom: 8 }}>
                <strong>Directives relatives au sort des données après le décès</strong> : conformément à la loi
                « Informatique et Libertés ».
              </li>
            ) : null}
          </ul>
          <p style={p}>
            Vous pouvez exercer ces droits en nous contactant aux coordonnées indiquées à la section 2. Une
            pièce d&apos;identité peut être demandée en cas de doute raisonnable sur votre identité, afin de
            protéger vos données contre tout accès frauduleux.
          </p>
          <p style={p}>
            Nous nous efforçons de répondre dans un délai d&apos;un mois à compter de la réception de la demande,
            prolongeable de deux mois compte tenu de la complexité ou du nombre de demandes ; vous serez informé
            de toute prolongation et des motifs du report.
          </p>
          <p style={p}>
            Vous avez également le droit d&apos;introduire une réclamation auprès de{' '}
            {dataProtectionAuthorityForMentions(companyCountry)} (
            <a href={dpaW.href} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
              {dpaW.label}
            </a>
            ), autorité de contrôle de référence lorsque l&apos;Éditeur est établi en{' '}
            {editorCountryLabel(companyCountry)} (paramètres de la plateforme). Pour les situations
            transfrontières ou les responsables multiples, la compétence de l&apos;autorité peut varier ;{' '}
            renseignez-vous auprès de votre conseil.
          </p>
          <p style={p}>{privacyJurisdictionFooter(companyCountry)}</p>
        </section>

        <section>
          <h2 style={h2}>9. Mesures de sécurité et violations de données</h2>
          <p style={p}>
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées au regard de
            l&apos;état des connaissances, des coûts de mise en œuvre, de la nature, du contexte et des finalités
            du traitement, afin d&apos;assurer un niveau de sécurité adapté au risque (pseudonymisation,
            chiffrement lorsque pertinent, contrôle d&apos;accès, journalisation, sauvegarde, sensibilisation du
            personnel, etc.).
          </p>
          <p style={p}>{privacyBreachNotificationParagraph(companyCountry)}</p>
        </section>

        <section>
          <h2 style={h2}>10. Décision automatisée et profilage</h2>
          <p style={p}>
            Sauf mention expresse et information préalable dédiée, nous ne réalisons pas de décisions
            produisant des effets juridiques ou vous affectant de manière significative exclusivement sur le
            fondement d&apos;un traitement automatisé, y compris le profilage, au sens de l&apos;article 22 du
            RGPD.
          </p>
        </section>

        <section>
          <h2 style={h2}>11. Évolution de la présente politique</h2>
          <p style={p}>
            Nous pouvons modifier la présente politique pour refléter l&apos;évolution de nos pratiques, de nos
            Services ou du cadre juridique. La version à jour est celle publiée sur le site avec sa date de mise
            à jour lorsque nous l&apos;indiquons. En cas de changement substantiel, une information plus visible
            pourra être utilisée (bandeau, email, notification dans l&apos;espace connecté) lorsque la loi ou le
            bon sens l&apos;exigent.
          </p>
        </section>
      </>
    );
  }

  /* politique-cookies */
  return (
    <>
      <section>
        <h2 style={h2}>1. Objet et cadre juridique</h2>
        <p style={p}>
          La présente politique décrit l&apos;usage des cookies et traceurs sur les sites et applications édités
          par <strong>{name}</strong> (ci-après « nous » ou « l&apos;Éditeur »), ainsi que les modalités dont
          vous disposez pour accepter ou refuser ces traceurs.
        </p>
        <p style={p}>
          Elle doit être lue conjointement avec la{' '}
          <Link to="/legal/politique-confidentialite" style={{ color: '#2563eb' }}>
            Politique de confidentialité
          </Link>
          , qui précise le responsable du traitement, les droits dont vous bénéficiez sur vos données
          personnelles et les autres traitements réalisés hors simple dépôt de cookies lorsque ceux-ci
          impliquent des données personnelles.
        </p>
        <p style={p}>{cookiesLegalFrameworkParagraph(companyCountry)}</p>
      </section>

      <section>
        <h2 style={h2}>2. Qu&apos;est-ce qu&apos;un cookie ou traceur ?</h2>
        <p style={p}>
          Un <strong>cookie</strong> est un petit fichier texte déposé sur le disque dur de votre terminal
          (ordinateur, tablette, smartphone) par le serveur d&apos;un site ou par un tiers lorsque vous consultez un
          contenu en ligne. Il contient souvent un identifiant, une durée de vie et des informations liées à votre
          navigation.
        </p>
        <p style={p}>
          Au sens large, on parle également de <strong>traceurs</strong> pour désigner d&apos;autres technologies
          équivalentes : fichiers « flash », résultat du fingerprinting (empreinte du navigateur), balises web
          invisibles (« pixels »), identifiants stockés dans le <strong>stockage local</strong> du navigateur
          (par exemple <em>localStorage</em> ou <em>sessionStorage</em>) lorsqu&apos;ils ont la même finalité
          qu&apos;un cookie.
        </p>
        <p style={p}>
          Les cookies et traceurs <strong>« first party »</strong> sont déposés par l&apos;Éditeur du site que
          vous consultez ; les cookies <strong>« third party »</strong> le sont par un domaine tiers (régie
          publicitaire, réseau social, outil d&apos;analyse, etc.).
        </p>
      </section>

      <section>
        <h2 style={h2}>3. Finalités des traceurs et typologie</h2>
        <p style={p}>Nous classons usuellement les traceurs selon les finalités suivantes :</p>
        <ul style={{ margin: '0 0 14px', paddingLeft: 22 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Cookies strictement nécessaires</strong> (souvent qualifiés « techniques » ou « essentiels »)
            : indispensables à la fourniture du service expressément demandé par l&apos;utilisateur (ex. :
            maintien de session après authentification, mémorisation du contenu d&apos;un panier, équilibrage de
            charge, sécurisation des échanges). Ils peuvent souvent être déposés sans consentement préalable
            lorsqu&apos;ils ne dépassent pas cette stricte nécessité, selon les critères du droit applicable
            (ex. doctrine de l&apos;autorité de protection des données de votre pays) ;
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Cookies de mesure d&apos;audience</strong> : statistiques de fréquentation, pages vues,
            parcours — lorsqu&apos;ils ne sont pas strictement nécessaires, le consentement est en principe requis,
            sauf exemption encadrée (ex. : outil purement audience, finalité limitée, durée courte, etc. selon
            les précisions légales et la configuration de l&apos;outil) ;
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Cookies de personnalisation</strong> mémorisant vos choix d&apos;affichage ou de langue lorsque
            ce n&apos;est pas indispensable au service de base ;
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Cookies publicitaires ou de réseaux sociaux</strong> : ciblage, remarketing, partage de
            boutons incitant à la collecte par un tiers, etc. — en principe soumis au consentement préalable.
          </li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>4. Traceurs effectivement utilisés sur cette plateforme (présentation générale)</h2>
        <p style={p}>
          Sur l&apos;interface consultée, un bandeau d&apos;information vous propose d&apos;accepter ou de refuser
          les cookies non indispensables lorsque notre configuration le nécessite du point de vue légal. Votre
          réponse (<em>accepted</em> ou <em>declined</em>) ainsi qu&apos;une date peuvent être enregistrées
          <strong>localement dans votre navigateur</strong> (clés{' '}
          <code style={{ fontSize: 13 }}>cookieConsent</code> et{' '}
          <code style={{ fontSize: 13 }}>cookieConsentDate</code> via le mécanisme <em>localStorage</em>) afin
          de mémoriser votre choix sans vous le redemander à chaque chargement immédiat de page.
        </p>
        <p style={p}>
          Ce stockage local joue un rôle comparable à un cookie « persistant » pour la seule finalité de
          conserver vos préférences relatives au consentement. Il ne transmet pas ces informations à nos serveurs
          par ce seul mécanisme. D&apos;autres traceurs éventuels (tiers ou côté serveur), s&apos;ils sont un jour
          activés sur la plateforme, seront décrits et documentés conformément au droit applicable avant toute
          mise en production significative.
        </p>
        <p style={p}>
          Les jetons d&apos;authentification (session client ou administrateur) nécessaires pour sécuriser
          votre compte peuvent être stockés par le navigateur (cookies de session ou stockage sécurisé) : ils
          relèvent en principe de la stricte fourniture du service.
        </p>
      </section>

      <section>
        <h2 style={h2}>5. Consentement, refus et équivalence des choix</h2>
        <p style={p}>
          Lorsque la loi l&apos;exige, tout cookie ou traceur non indispensable ne doit pas être déposé ou lu
          avant que vous n&apos;ayez exprimé un{' '}
          <strong>consentement libre, spécifique, éclairé et univoque</strong>.
          Le simple fait de poursuivre la navigation sans interaction sur un bandeau n&apos;équivaut pas, en
          principe, à un consentement valide pour ces catégories.
        </p>
        <p style={p}>
          {cookiesBannerEquivalenceLead(companyCountry)} Le refus ne doit pas être rendu plus complexe que
          l&apos;acceptation (pas de liens cachés ou de multiples étapes obligatoires pour refuser).
        </p>
        <p style={p}>
          Vous pouvez retirer à tout moment un consentement déjà donné ; le retrait est sans effet rétroactif sur
          la licéité du traitement effectué avant le retrait, mais implique l&apos;arrêt du dépôt ou de la lecture
          des traceurs concernés dès que possible.
        </p>
      </section>

      <section>
        <h2 style={h2}>6. Durée de validité des traceurs</h2>
        <p style={p}>
          La <strong>durée de vie</strong> d&apos;un cookie peut être limitée à la session de navigation (cookie
          de « session », supprimé à la fermeture du navigateur selon les réglages) ou s&apos;étendre sur plusieurs
          mois (cookie « persistant » avec date d&apos;expiration fixée).
        </p>
        <p style={p}>
          Les choix de consentement enregistrés dans le stockage local de votre navigateur restent stockés tant
          que vous ne les effacez pas manuellement et que le navigateur ne les purge pas (mode privé,
          paramètres de confidentialité, réinitialisation).
        </p>
      </section>

      <section>
        <h2 style={h2}>7. Paramétrage du navigateur et désactivation</h2>
        <p style={p}>
          Vous pouvez à tout moment configurer votre logiciel de navigation pour que l&apos;enregistrement de
          cookies soit proposé avant acceptation, systématiquement refusé, ou limité à certains émetteurs. Les
          modalités diffèrent selon le navigateur ; consultez les pages d&apos;aide de Chrome, Firefox, Safari,
          Edge, etc.
        </p>
        <p style={p}>
          Le blocage systématique de tous les cookies peut dégrader voire empêcher l&apos;accès à certaines
          fonctionnalités (connexion sécurisée, espaces personnels, mémorisation de préférences légitimes).
        </p>
        <p style={p}>
          Pour réinitialiser uniquement les préférences de ce site relatives au bandeau cookies, supprimez les
          données locales associées au domaine dans les paramètres du navigateur : le bandeau pourra alors
          réapparaître lors d&apos;une prochaine visite.
        </p>
      </section>

      <section>
        <h2 style={h2}>8. Données personnelles, destinataires et transferts</h2>
        <p style={p}>{cookiesPersonalDataLawParagraph(companyCountry)}</p>
        <p style={p}>
          Les destinataires peuvent inclure l&apos;Éditeur, ses sous-traitants techniques (hébergeur,
          prestataire d&apos;analyse si activé) et, le cas échéant, des partenaires publicitaires. Tout
          transfert hors de votre zone juridique applicable doit être encadré par des garanties appropriées
          (clauses types, décision d&apos;adéquation, etc.).
        </p>
      </section>

      <section>
        <h2 style={h2}>9. Vos droits</h2>
        <p style={p}>
          Pour les données traitées via cookies sous notre responsabilité, vous pouvez exercer vos droits
          d&apos;accès, de rectification, d&apos;opposition, d&apos;effacement, de limitation et, le cas
          échéant, les autres droits prévus par le droit applicable (voir notre{' '}
          <Link to="/legal/politique-confidentialite" style={{ color: '#2563eb' }}>
            Politique de confidentialité
          </Link>
          ). Vous pouvez saisir {dataProtectionAuthorityForMentions(companyCountry)} (autorité de référence
          pour un Éditeur établi en {editorCountryLabel(companyCountry)} — voir aussi les coordonnées détaillées dans la
          Politique de confidentialité).
        </p>
      </section>

      <section>
        <h2 style={h2}>10. Mise à jour</h2>
        <p style={p}>
          La présente politique peut être modifiée pour tenir compte de l&apos;évolution des outils de mesure,
          des partenariats techniques ou du cadre légal. La version applicable est celle publiée en ligne au
          moment de votre consultation. En cas de changement substantiel, une information sur le site ou dans
          l&apos;espace connecté pourra être utilisée.
        </p>
      </section>
    </>
  );
}
