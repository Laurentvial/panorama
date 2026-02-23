import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Plus, Pencil, Trash2, Key } from 'lucide-react';
import { useUsers } from '../hooks/useUsers';
import { useTeams } from '../hooks/useTeams';
import { CreateUserModal } from './CreateUserModal';
import { EditUserModal } from './EditUserModal';
import { ResetPasswordModal } from './ResetPasswordModal';
import { User } from '../types';
import LoadingIndicator from './LoadingIndicator';

export function UsersTab() {
  const { users, loading: usersLoading, error: usersError, deleteUser, toggleUserActive, refetch } = useUsers();
  const { teams, loading: teamsLoading } = useTeams();
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  async function handleDelete(userId: string) {
    try {
      await deleteUser(userId);
      await refetch();
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

  async function handleUserCreated() {
    await refetch();
    setIsUserModalOpen(false);
  }

  function handleEditClick(user: User) {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  }

  async function handleUserUpdated() {
    await refetch();
    setIsEditModalOpen(false);
    setSelectedUser(null);
  }

  function handleResetPasswordClick(user: User) {
    setSelectedUser(user);
    setIsResetPasswordModalOpen(true);
  }

  async function handlePasswordReset() {
    setIsResetPasswordModalOpen(false);
    setSelectedUser(null);
    await refetch();
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

      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onUserUpdated={handleUserUpdated}
      />

      <ResetPasswordModal
        isOpen={isResetPasswordModalOpen}
        onClose={() => {
          setIsResetPasswordModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onPasswordReset={handlePasswordReset}
      />

      <Card>
        <CardHeader>
          <CardTitle>Liste des utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading || teamsLoading ? (
            <LoadingIndicator />
          ) : usersError ? (
            <div className="users-teams-error-message">
              <p>Erreur lors du chargement des utilisateurs: {usersError.message}</p>
              <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-2">
                Réessayer
              </Button>
            </div>
          ) : users.length > 0 ? (
            <div className="users-teams-table-container">
              <table className="users-teams-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Photo</th>
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
                    const teamId = user.teamId ?? (user as any).team_id ?? null;
                    const teamName = user.teamName ?? (user as any).team_name ?? (teamId ? teams.find(t => String(t.id) === String(teamId))?.name : null) ?? null;
                    
                    return (
                      <tr key={user.id}>
                        <td className="users-teams-table-id">{user.id.substring(0, 8)}</td>
                        <td>
                          {user.profilePhoto ? (
                            <img
                              src={user.profilePhoto}
                              alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Photo'}
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 9999,
                                objectFit: 'cover',
                                border: '1px solid #e5e7eb',
                              }}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 9999,
                                background: '#f3f4f6',
                                border: '1px solid #e5e7eb',
                              }}
                            />
                          )}
                        </td>
                        <td>
                          {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email || `Utilisateur ${user.id}`}
                        </td>
                        <td className="users-teams-table-email">{user.email || user.username || '-'}</td>
                        <td>
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td>
                          {teamName || '-'}
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
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEditClick(user)}
                              title="Modifier"
                            >
                              <Pencil className="users-teams-icon" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleResetPasswordClick(user)}
                              title="Réinitialiser le mot de passe"
                            >
                              <Key className="users-teams-icon" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDelete(user.id)}
                              className="users-teams-delete-button"
                              title="Supprimer"
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
            <div className="users-teams-empty-message">
              <p>Aucun utilisateur trouvé</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

