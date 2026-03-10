import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Pencil, ChevronDown, Copy } from 'lucide-react';
import { ClientManagementInfo } from './ClientManagementInfo';
import { EditClientManagementModal } from './EditClientManagementModal';
import { toast } from 'sonner';
import { cn } from './ui/utils';

import '../styles/Clients.css';

function CopyableField({
  label,
  value,
  display,
  valueClassName,
}: {
  label: string;
  value?: string | number; // value to copy (raw or formatted)
  display?: React.ReactNode; // optional custom display
  valueClassName?: string;
}) {
  const displayVal = display ?? value ?? '-';
  const copyVal = value != null && value !== '' ? String(value) : null;
  const canCopy = copyVal && copyVal !== '-';

  async function handleCopy() {
    if (!copyVal) return;
    try {
      await navigator.clipboard.writeText(copyVal);
      toast.success('Copié dans le presse-papiers');
    } catch {
      toast.error('Impossible de copier');
    }
  }

  return (
    <div>
      <Label className="text-slate-600">{label}</Label>
      <div className="flex items-center gap-2">
        <p className={cn('text-lg font-bold text-slate-900', valueClassName)}>{displayVal}</p>
        {canCopy && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleCopy}
            title="Copier"
          >
            <Copy className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface ClientInfoTabProps {
  client: any;
  onOpenEditPersonalInfo: () => void;
  onOpenEditPatrimonialInfo: () => void;
  onClientUpdated?: () => void;
}

export function ClientInfoTab({ client, onOpenEditPersonalInfo, onOpenEditPatrimonialInfo, onClientUpdated }: ClientInfoTabProps) {
  const [isPatrimonialOpen, setIsPatrimonialOpen] = useState(false);
  const [isEditManagementOpen, setIsEditManagementOpen] = useState(false);
  
  // Check if client has RIB data
  const hasRibData = client?.ribBankName || client?.ribAccountHolder || client?.ribBankCode || 
                     client?.ribBranchCode || client?.ribAccountNumber || client?.ribKey || 
                     client?.ribIban || client?.ribBic || client?.ribDomiciliation;

  return (
    <div className="space-y-6">
      {/* Personal Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="client-info-block-title font-bold">Informations personnelles</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenEditPersonalInfo}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Éditer
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <CopyableField label="Civilité" value={client.civility} />
            <CopyableField label="Prénom / Nom" value={client.firstName || client.lastName ? `${client.firstName || ''} ${client.lastName || ''}`.trim() : undefined} />
            <CopyableField label="Mot de passe" value={client.password} valueClassName="font-mono text-sm" />
            <CopyableField label="Téléphone" value={client.phone} />
            <CopyableField label="Portable" value={client.mobile} />
            <CopyableField label="E-mail" value={client.email} />
            <CopyableField
              label="Date de naissance"
              value={(() => {
                if (!client.birthDate) return undefined;
                const date = new Date(client.birthDate);
                if (isNaN(date.getTime())) return undefined;
                return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
              })()}
            />
            <CopyableField label="Lieu de naissance" value={client.birthPlace} />
            <CopyableField label="Adresse" value={client.address} />
            <CopyableField label="Code postal" value={client.postalCode} />
            <CopyableField label="Ville" value={client.city} />
            <CopyableField label="Nationalité" value={client.nationality} />
            <CopyableField label="Successeur" value={client.successor} />
            <CopyableField
              label="Date d'inscription"
              value={new Date(client.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            />
          </div>
        </CardContent>
      </Card>

      
      {/* Client Management Info and RIB Section - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Client Management Info */}
        {client && (
          <ClientManagementInfo 
            client={client}
            onEdit={() => setIsEditManagementOpen(true)}
          />
        )}

        {/* RIB Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="client-info-block-title font-bold">RIB</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenEditPersonalInfo}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Éditer
            </Button>
          </CardHeader>
          <CardContent>
            {!hasRibData ? (
              <p className="text-slate-500 text-center py-4">Aucun RIB renseigné pour ce client</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {client?.ribBankName && (
                  <CopyableField label="Banque" value={client.ribBankName} />
                )}
                {client?.ribAccountHolder && (
                  <CopyableField label="Titulaire" value={client.ribAccountHolder} />
                )}
                {client?.ribBankCode && (
                  <CopyableField label="Code banque" value={client.ribBankCode} valueClassName="font-mono text-sm" />
                )}
                {client?.ribBranchCode && (
                  <CopyableField label="Code guichet" value={client.ribBranchCode} valueClassName="font-mono text-sm" />
                )}
                {client?.ribAccountNumber && (
                  <CopyableField label="N° compte" value={client.ribAccountNumber} valueClassName="font-mono text-sm" />
                )}
                {client?.ribKey && (
                  <CopyableField label="Clé RIB" value={client.ribKey} valueClassName="font-mono text-sm" />
                )}
                {client?.ribIban && (
                  <CopyableField label="IBAN" value={client.ribIban} valueClassName="font-mono text-sm break-all" />
                )}
                {client?.ribBic && (
                  <CopyableField label="BIC" value={client.ribBic} valueClassName="font-mono text-sm" />
                )}
                {client?.ribDomiciliation && (
                  <CopyableField label="Domiciliation" value={client.ribDomiciliation} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fiche patrimoniale */}
      <Collapsible open={isPatrimonialOpen} onOpenChange={setIsPatrimonialOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between pb-6">
                <CardTitle className="client-info-block-title font-bold">Fiche patrimoniale</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEditPatrimonialInfo();
                    }}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Éditer
                  </Button>
                  <ChevronDown className={`client-chevron ${isPatrimonialOpen ? 'open' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Activité professionnelle */}
              <div className="space-y-4">
                <h3 className="client-info-block-title text-lg font-bold">Activité professionnelle</h3>
                <CopyableField label="Statut" value={client.professionalActivityStatus} />
                <CopyableField label="Commentaire" value={client.professionalActivityComment} />
              </div>

              {/* Métiers */}
              <div className="space-y-4">
                <h3 className="client-info-block-title text-lg font-bold">Métiers</h3>
                <div>
                  <Label className="text-slate-600">Métier(s)</Label>
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    {client.professions && client.professions.length > 0 ? (
                      <>
                        {client.professions.map((profession: string, index: number) => (
                          <div key={index} className="client-profession-badge">
                            <span>{profession}</span>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(client.professions.join(', '));
                              toast.success('Copié dans le presse-papiers');
                            } catch { toast.error('Impossible de copier'); }
                          }}
                          title="Copier"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </div>
                </div>
                <CopyableField label="Commentaire" value={client.professionsComment} />
              </div>

              {/* Patrimoine */}
              <div className="space-y-4">
                <h3 className="client-info-block-title text-lg font-bold">Patrimoine</h3>
                <CopyableField label="Banque" value={client.bankName} />
                
                <div className="grid grid-cols-2 gap-4">
                  <CopyableField
                    label="Compte courant (€)"
                    value={(client.currentAccount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  />
                  <CopyableField
                    label="Livret A/B (€)"
                    value={(client.livretAB || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  />
                  <CopyableField
                    label="PEA (€)"
                    value={(client.pea || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  />
                  <CopyableField
                    label="PEL (€)"
                    value={(client.pel || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  />
                  <CopyableField
                    label="LDD (€)"
                    value={(client.ldd || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="client-info-block-title font-semibold">Épargne</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <CopyableField
                      label="CEL (€)"
                      value={(client.cel || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    />
                    <CopyableField
                      label="CSL (€)"
                      value={(client.csl || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    />
                    <CopyableField
                      label="Compte titre (€)"
                      value={(client.securitiesAccount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    />
                    <CopyableField
                      label="Assurance-vie (€)"
                      value={(client.lifeInsurance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    />
                  </div>
                </div>

                <CopyableField label="Commentaire" value={client.savingsComment} />

                <CopyableField
                  label="Total du patrimoine (€)"
                  value={(client.totalWealth || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  valueClassName="text-lg font-bold"
                />
              </div>

              {/* Objectifs et expérience */}
              <div className="space-y-4">
                <h3 className="client-info-block-title text-lg font-bold">Objectifs et expérience</h3>
                <div>
                  <Label className="text-slate-600">Objectifs</Label>
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    {client.objectives && client.objectives.length > 0 ? (
                      <>
                        {client.objectives.map((obj: string, index: number) => (
                          <div key={index} className="client-badge">
                            {obj}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(client.objectives.join(', '));
                              toast.success('Copié dans le presse-papiers');
                            } catch { toast.error('Impossible de copier'); }
                          }}
                          title="Copier"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </div>
                </div>
                <CopyableField label="Commentaire" value={client.objectivesComment} />
                <div>
                  <Label className="text-slate-600">Expérience</Label>
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    {client.experience && client.experience.length > 0 ? (
                      <>
                        {client.experience.map((exp: string, index: number) => (
                          <div key={index} className="client-badge">
                            {exp}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(client.experience.join(', '));
                              toast.success('Copié dans le presse-papiers');
                            } catch { toast.error('Impossible de copier'); }
                          }}
                          title="Copier"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </div>
                </div>
                <CopyableField label="Commentaire" value={client.experienceComment} />
              </div>

              {/* Informations financières */}
              <div className="space-y-4">
                <h3 className="client-info-block-title text-lg font-bold">Informations financières</h3>
                <CopyableField
                  label="Défiscalisation"
                  value={client.taxOptimization !== undefined ? (client.taxOptimization ? 'Oui' : 'Non') : undefined}
                  display={client.taxOptimization !== undefined ? (client.taxOptimization ? 'Oui' : 'Non') : '-'}
                />
                <CopyableField label="Commentaire" value={client.taxOptimizationComment} />
                <CopyableField
                  label="Revenu annuel du foyer (€)"
                  value={(client.annualHouseholdIncome || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Edit Management Modal */}
      <EditClientManagementModal
        isOpen={isEditManagementOpen}
        onClose={() => setIsEditManagementOpen(false)}
        client={client}
        onClientUpdated={async () => {
          setIsEditManagementOpen(false);
          if (onClientUpdated) {
            await onClientUpdated();
          }
        }}
      />
    </div>
    
  );
}

