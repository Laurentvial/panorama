import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useUsers } from '../hooks/useUsers';
import { useTeams } from '../hooks/useTeams';
import { CreateUserModal } from './CreateUserModal';

export function UsersTab() {
  const { users, deleteUser, toggleUserActive, refetch } = useUsers();
  const { teams } = useTeams();
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  async function handleDelete(userId: string) {
    try {
      await deleteUser(userId);
    } catch (error) {
      // Error already handled in the hook
    }
  }

  async function handleToggleActive(userId: string) {
    try {
      await toggleUserActive(userId);
    } catch (error) {
      // Error already handled in the hook
    }
  }

  function handleUserCreated() {
    setIsUserModalOpen(false);
    refetch();
  }

  return (
    <>
      <div className="users-teams-action-bar">
        <Button onClick={() => setIsUserModalOpen(true)}>
          <Plus className="users-teams-icon users-teams-icon-with-margin" />
          Créer un utilisateur
        </Button>
      </div>

      <CreateUserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onUserCreated={handleUserCreated}
      />

      <Card>
        <CardHeader>
          <CardTitle>Liste des utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="users-teams-table-container">
              <table className="users-teams-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Email</th>
                    <th>Rôle</th>
                    <th>Équipe</th>
                    <th>Statut</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const userTeam = teams.find(t => t.id === user.teamId);
                    
                    return (
                      <tr key={user.id}>
                        <td>
                          {user.firstName} {user.lastName}
                        </td>
                        <td className="users-teams-table-email">{user.email}</td>
                        <td>
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td>
                          {userTeam ? userTeam.name : '-'}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(user.id)}
                            className={user.active ? 'users-teams-status-active' : 'users-teams-status-inactive'}
                          >
                            {user.active ? 'Actif' : 'Inactif'}
                          </Button>
                        </td>
                        <td className="text-right">
                          <div className="users-teams-table-actions">
                            <Button variant="ghost" size="sm">
                              <Pencil className="users-teams-icon" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDelete(user.id)}
                              className="users-teams-delete-button"
                            >
                              <Trash2 className="users-teams-icon" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="users-teams-empty-message">Aucun utilisateur créé</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

