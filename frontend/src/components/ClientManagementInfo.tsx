import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Edit, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface ClientManagementInfoProps {
  client: any;
  onEdit: () => void;
}

function CopyButton({ value, title = 'Copier' }: { value: string; title?: string }) {
  if (!value || value === '-') return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success('Copié dans le presse-papiers');
        } catch {
          toast.error('Impossible de copier');
        }
      }}
      title={title}
    >
      <Copy className="w-4 h-4" />
    </Button>
  );
}

export function ClientManagementInfo({ client, onEdit }: ClientManagementInfoProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="client-info-block-title font-bold">Gestion</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
        >
          <Edit className="w-4 h-4 mr-2" />
          Modifier
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="client-info-block-title text-slate-600 font-semibold mb-2 block">Gestionnaire</Label>
            {client?.managerName || client?.manager ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-slate-900">
                    {client.managerName || client.manager}
                  </p>
                  <CopyButton value={client.managerName || client.manager} />
                </div>
                {client?.managerEmail && (
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-slate-900">{client.managerEmail}</p>
                    <CopyButton value={client.managerEmail} />
                  </div>
                )}
                {client?.managerTeamName && (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-sm text-slate-600">
                      Équipe: <span className="text-lg font-bold text-slate-900">{client.managerTeamName}</span>
                    </p>
                    <CopyButton value={client.managerTeamName} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-500">Aucun gestionnaire assigné</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="client-info-block-title text-slate-600 font-semibold">Source</Label>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-slate-900">
                {client?.source || '-'}
              </p>
              <CopyButton value={client?.source} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

