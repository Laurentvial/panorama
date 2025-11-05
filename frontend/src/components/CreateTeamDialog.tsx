import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Plus } from 'lucide-react';
import api from '../utils/api';

interface CreateTeamDialogProps {
  onTeamCreated: () => void;
}

export function CreateTeamDialog({ onTeamCreated }: CreateTeamDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [teamFormData, setTeamFormData] = useState({ name: '' });

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await api.post('/api/teams/create/', teamFormData);
      setIsOpen(false);
      setTeamFormData({ name: '' });
      onTeamCreated();
    } catch (error) {
      console.error('Error creating team:', error);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="users-teams-icon users-teams-icon-with-margin" />
          Créer une équipe
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle équipe</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateTeam} className="users-teams-form">
          <div className="users-teams-form-field">
            <Label>Nom de l'équipe</Label>
            <Input
              value={teamFormData.name}
              onChange={(e) => setTeamFormData({ name: e.target.value })}
              placeholder="Ex: Équipe Paris"
              required
            />
          </div>
          
          <div className="users-teams-form-actions">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Créer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

