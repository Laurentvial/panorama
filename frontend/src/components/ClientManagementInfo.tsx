import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Edit } from 'lucide-react';

interface ClientManagementInfoProps {
  client: any;
  onEdit: () => void;
}

export function ClientManagementInfo({ client, onEdit }: ClientManagementInfoProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Gestion</CardTitle>
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
            <Label className="text-slate-600 font-semibold mb-2 block">Gestionnaire</Label>
            {client?.managerName || client?.manager ? (
              <>
                <p className="text-slate-900 font-medium">
                  {client.managerName || client.manager}
                </p>
                {client?.managerEmail && (
                  <p className="text-sm text-slate-500">{client.managerEmail}</p>
                )}
                {client?.managerTeamName && (
                  <div className="mt-2">
                    <p className="text-sm text-slate-600 font-medium">
                      Équipe: <span className="text-slate-700">{client.managerTeamName}</span>
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-500">Aucun gestionnaire assigné</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-600 font-semibold">Source</Label>
            <p className="text-slate-900">
              {client?.source || '-'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

