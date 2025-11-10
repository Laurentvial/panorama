import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X } from 'lucide-react';
import api from '../utils/api';
import { toast } from 'sonner';
import { User } from '../types';
import { useTeams } from '../hooks/useTeams';
import LoadingIndicator from './LoadingIndicator';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUserUpdated: () => void;
}

export function EditUserModal({ isOpen, onClose, user, onUserUpdated }: EditUserModalProps) {
  const { teams } = useTeams();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    role: '',
    teamId: '',
  });

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        email: user.email || '',
        role: user.role || '',
        teamId: user.teamId || '',
      });
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);

    try {
      await api.put(`/api/users/${user.id}/update/`, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        username: formData.username,
        email: formData.email,
        role: formData.role,
        teamId: formData.teamId || null,
      });

      toast.success('Utilisateur mis à jour avec succès');
      onClose();
      onUserUpdated();
    } catch (error: any) {
      const data = error?.response?.data || {};
      const message = data.detail || Object.values(data).flat().join(', ') || 'Une erreur est survenue lors de la mise à jour';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div 
      className="users-team-modal-overlay"
      onClick={onClose}
    >
      <div 
        className="users-team-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="users-team-modal-header">
          <h2 className="users-team-modal-title">Modifier l'utilisateur</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="users-team-modal-close"
          >
            <X className="users-teams-icon" />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="users-team-modal-form">
          <div className="users-team-modal-form-row">
            <div className="users-team-modal-form-field">
              <Label htmlFor="edit-firstName">Prénom</Label>
              <Input
                id="edit-firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>
            
            <div className="users-team-modal-form-field">
              <Label htmlFor="edit-lastName">Nom</Label>
              <Input
                id="edit-lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="users-team-modal-form-field">
            <Label htmlFor="edit-username">Username</Label>
            <Input
              id="edit-username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className="users-team-modal-form-field">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="users-team-modal-form-row">
            <div className="users-team-modal-form-field">
              <Label htmlFor="edit-role">Rôle</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrateur">Administrateur</SelectItem>
                  <SelectItem value="chef d'équipe">Chef d'équipe</SelectItem>
                  <SelectItem value="gestionnaire">Gestionnaire</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="users-team-modal-form-field">
              <Label htmlFor="edit-teamId">Équipe</Label>
              <Select 
                value={formData.teamId || '__none__'} 
                onValueChange={(value) => setFormData({ ...formData, teamId: value === '__none__' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucune équipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucune équipe</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading && <LoadingIndicator />}
          
          <div className="users-team-modal-form-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

