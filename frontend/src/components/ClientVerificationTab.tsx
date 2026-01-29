import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, Clock, FileText, Image as ImageIcon } from 'lucide-react';

interface ClientVerificationTabProps {
  client: any;
}

const SEX_LABELS: Record<string, string> = {
  male: 'Homme',
  female: 'Femme',
  other: 'Autre',
};

const TRADING_OBJECTIVE_LABELS: Record<string, string> = {
  short_term: 'Rendements à court terme',
  extra_income: 'Revenus supplémentaires',
  future_planning: "Planification de l'avenir (éducation des enfants, retraite, etc.)",
  save_house: 'Épargne pour une maison',
};

const COMPLIANCE_LABELS: Record<string, string> = {
  admin_or_shareholder_10pct: "Un administrateur ou un actionnaire à 10 % d'une société cotée en bourse.",
  brokerage_employee: 'Employé par une société de courtage ou une bourse de valeurs.',
  public_official: 'Un responsable public de haut niveau, actuel ou ancien, élu ou nommé.',
  none: "Aucune de ces options ne s'applique.",
};

const FUNDS_SOURCES_LABELS: Record<string, string> = {
  salary: 'Salaire',
  investments: 'Investissements',
  savings: 'Économies',
  retirement: 'Retraite',
  inheritance: 'Héritage',
  severance: 'Indemnité de départ',
  other: 'Autre',
};

const PREFERENCE_LABELS: Record<string, string> = {
  stocks: 'Actions',
  crypto: 'Cryptomonnaies',
  etf: 'ETF',
  currencies: 'Devises',
  commodities: 'Matières premières',
  indices: 'Indices',
};

const KYC_STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'En attente', icon: <Clock className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-800' },
  submitted: { label: 'Soumis', icon: <FileText className="w-4 h-4" />, color: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Approuvé', icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejeté', icon: <XCircle className="w-4 h-4" />, color: 'bg-red-100 text-red-800' },
};

export function ClientVerificationTab({ client }: ClientVerificationTabProps) {
  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return date;
    }
  };

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return date;
    }
  };

  return (
    <div className="space-y-6">
      {/* Étape 1: Identité */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étape 1 : Identité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-600">Prénom</Label>
              <p className="mt-1">{client.firstName || client.fname || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Deuxième prénom</Label>
              <p className="mt-1">{client.middleName || client.middle_name || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Nom de famille</Label>
              <p className="mt-1">{client.lastName || client.lname || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Sexe</Label>
              <p className="mt-1">{client.sex ? SEX_LABELS[client.sex] || client.sex : '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Date de naissance</Label>
              <p className="mt-1">{formatDate(client.birthDate || client.birth_date)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Étape 2: Adresse */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étape 2 : Adresse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-slate-600">Adresse</Label>
              <p className="mt-1">{client.address || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Code postal</Label>
              <p className="mt-1">{client.postalCode || client.postal_code || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Ville</Label>
              <p className="mt-1">{client.city || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Étape 3: Profil */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étape 3 : Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-600">Profession principale</Label>
              <p className="mt-1">{client.primaryProfession || client.primary_profession || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Nom de l'employeur</Label>
              <p className="mt-1">{client.employerName || client.employer_name || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Revenu annuel net</Label>
              <p className="mt-1">{client.annualNetIncome || client.annual_net_income || '-'}</p>
            </div>
            <div>
              <Label className="text-slate-600">Total des liquidités</Label>
              <p className="mt-1">{client.totalLiquidities || client.total_liquidities || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Étape 4: Préférences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étape 4 : Préférences</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label className="text-slate-600">Préférences de trading</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {client.preferences && Array.isArray(client.preferences) && client.preferences.length > 0 ? (
                client.preferences.map((pref: string) => (
                  <Badge key={pref} variant="outline">
                    {PREFERENCE_LABELS[pref] || pref}
                  </Badge>
                ))
              ) : (
                <p className="text-slate-500">Aucune préférence sélectionnée</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Étape 5: Objectifs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étape 5 : Objectifs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-600">Objectif principal de trading</Label>
            <p className="mt-1">
              {client.tradingObjective
                ? TRADING_OBJECTIVE_LABELS[client.tradingObjective] || client.tradingObjective
                : '-'}
            </p>
          </div>
          <div>
            <Label className="text-slate-600">Montant prévu d'investissement (12 mois)</Label>
            <p className="mt-1">{client.plannedInvestment12m || client.planned_investment_12m || '-'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Étape 6: Conformité */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étape 6 : Conformité</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label className="text-slate-600">Réponses de conformité</Label>
            <div className="mt-2 space-y-2">
              {client.complianceFamilyFlags &&
              Array.isArray(client.complianceFamilyFlags) &&
              client.complianceFamilyFlags.length > 0 ? (
                client.complianceFamilyFlags.map((flag: string) => (
                  <div key={flag} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                    <p className="text-sm">{COMPLIANCE_LABELS[flag] || flag}</p>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">Aucune réponse fournie</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Étape 7: Sources de fonds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Étape 7 : Sources de revenus</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label className="text-slate-600">Sources de fonds</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {client.fundsSources && Array.isArray(client.fundsSources) && client.fundsSources.length > 0 ? (
                client.fundsSources.map((source: string) => (
                  <Badge key={source} variant="outline">
                    {FUNDS_SOURCES_LABELS[source] || source}
                  </Badge>
                ))
              ) : (
                <p className="text-slate-500">Aucune source sélectionnée</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Étape 8: KYC */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Étape 8 : Vérification KYC</span>
            {client.kycStatus && (
              <Badge className={KYC_STATUS_LABELS[client.kycStatus]?.color || 'bg-gray-100 text-gray-800'}>
                <span className="flex items-center gap-1">
                  {KYC_STATUS_LABELS[client.kycStatus]?.icon}
                  {KYC_STATUS_LABELS[client.kycStatus]?.label || client.kycStatus}
                </span>
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-600">Pièce d'identité (recto)</Label>
              {client.identityDocument ? (
                <div className="mt-2">
                  <a
                    href={client.identityDocument}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Voir le document</span>
                  </a>
                </div>
              ) : (
                <p className="mt-1 text-slate-500">Non fourni</p>
              )}
            </div>
            <div>
              <Label className="text-slate-600">Pièce d'identité (verso)</Label>
              {client.identityDocumentVerso ? (
                <div className="mt-2">
                  <a
                    href={client.identityDocumentVerso}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Voir le document</span>
                  </a>
                </div>
              ) : (
                <p className="mt-1 text-slate-500">Non fourni</p>
              )}
            </div>
            <div>
              <Label className="text-slate-600">Justificatif de domicile</Label>
              {client.proofOfAddress || client.proof_of_address ? (
                <div className="mt-2">
                  <a
                    href={client.proofOfAddress || client.proof_of_address}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Voir le document</span>
                  </a>
                </div>
              ) : (
                <p className="mt-1 text-slate-500">Non fourni</p>
              )}
            </div>
            <div>
              <Label className="text-slate-600">Selfie avec pièce d'identité</Label>
              {client.selfiePhoto || client.selfie_photo ? (
                <div className="mt-2">
                  <a
                    href={client.selfiePhoto || client.selfie_photo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Voir la photo</span>
                  </a>
                </div>
              ) : (
                <p className="mt-1 text-slate-500">Non fourni</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <Label className="text-slate-600">Date de soumission</Label>
              <p className="mt-1">{formatDateTime(client.kycSubmittedAt || client.kyc_submitted_at)}</p>
            </div>
            <div>
              <Label className="text-slate-600">Date de révision</Label>
              <p className="mt-1">{formatDateTime(client.kycReviewedAt || client.kyc_reviewed_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
