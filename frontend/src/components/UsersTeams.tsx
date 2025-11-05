import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Plus, Users as UsersIcon, Pencil, Trash2, Eye, UserPlus } from 'lucide-react';
import { apiCall } from '../utils/api';

interface UsersTeamsProps {
  user: any;
}

export function UsersTeams({ user: currentUser }: UsersTeamsProps) {
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isTeamDetailOpen, setIsTeamDetailOpen] = useState(false);
  const [teamFormData, setTeamFormData] = useState({ name: '' });
  const [userFormData, setUserFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    mobile: '',
    role: 'gestionnaire',
    teamId: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [teamsData, usersData] = await Promise.all([
        apiCall('/teams'),
        apiCall('/users')
      ]);
      
      setTeams(teamsData.teams || []);
      setUsers(usersData.users || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await apiCall('/teams', {
        method: 'POST',
        body: JSON.stringify(teamFormData)
      });
      
      setIsTeamDialogOpen(false);
      setTeamFormData({ name: '' });
      loadData();
    } catch (error) {
      console.error('Error creating team:', error);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    
    if (userFormData.password !== userFormData.confirmPassword) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }
    
    try {
      await apiCall('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(userFormData)
      });
      
      setIsUserDialogOpen(false);
      setUserFormData({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        mobile: '',
        role: 'gestionnaire',
        teamId: ''
      });
      loadData();
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Erreur lors de la création de l\'utilisateur');
    }
  }

  async function handleDeleteTeam(teamId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette équipe ?')) return;
    
    try {
      await apiCall(`/teams/${teamId}`, { method: 'DELETE' });
      loadData();
    } catch (error) {
      console.error('Error deleting team:', error);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    
    try {
      await apiCall(`/users/${userId}`, { method: 'DELETE' });
      loadData();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  }

  async function handleToggleUserActive(userId: string) {
    try {
      await apiCall(`/users/${userId}/toggle-active`, { method: 'POST' });
      loadData();
    } catch (error) {
      console.error('Error toggling user status:', error);
    }
  }

  async function viewTeamDetails(teamId: string) {
    try {
      const data = await apiCall(`/teams/${teamId}`);
      setSelectedTeam(data);
      setIsTeamDetailOpen(true);
    } catch (error) {
      console.error('Error loading team details:', error);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Utilisateurs / Équipes</h1>
        <p className="text-slate-600">Gestion des utilisateurs et des équipes</p>
      </div>

      <Tabs defaultValue="teams" className="space-y-6">
        <TabsList>
          <TabsTrigger value="teams">Équipes</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
        </TabsList>

        {/* Teams Tab */}
        <TabsContent value="teams" className="space-y-6">
          <div className="flex justify-end">
            <Dialog open={isTeamDialogOpen} onOpenChange={setIsTeamDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer une équipe
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nouvelle équipe</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom de l'équipe</Label>
                    <Input
                      value={teamFormData.name}
                      onChange={(e) => setTeamFormData({ name: e.target.value })}
                      placeholder="Ex: Équipe Paris"
                      required
                    />
                  </div>
                  
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsTeamDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit">Créer</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Liste des équipes</CardTitle>
            </CardHeader>
            <CardContent>
              {teams.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4">ID</th>
                        <th className="text-left py-3 px-4">Nom</th>
                        <th className="text-left py-3 px-4">Date de création</th>
                        <th className="text-right py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((team) => (
                        <tr key={team.id} className="border-b border-slate-100">
                          <td className="py-3 px-4 text-slate-500">{team.id.substring(0, 8)}...</td>
                          <td className="py-3 px-4">{team.name}</td>
                          <td className="py-3 px-4">
                            {new Date(team.createdAt).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => viewTeamDetails(team.id)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDeleteTeam(team.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucune équipe créée</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex justify-end">
            <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer un utilisateur
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nouvel utilisateur</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Prénom</Label>
                      <Input
                        value={userFormData.firstName}
                        onChange={(e) => setUserFormData({ ...userFormData, firstName: e.target.value })}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Nom</Label>
                      <Input
                        value={userFormData.lastName}
                        onChange={(e) => setUserFormData({ ...userFormData, lastName: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={userFormData.email}
                      onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Mot de passe</Label>
                      <Input
                        type="password"
                        value={userFormData.password}
                        onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Confirmer mot de passe</Label>
                      <Input
                        type="password"
                        value={userFormData.confirmPassword}
                        onChange={(e) => setUserFormData({ ...userFormData, confirmPassword: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Téléphone</Label>
                      <Input
                        type="tel"
                        value={userFormData.phone}
                        onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Portable</Label>
                      <Input
                        type="tel"
                        value={userFormData.mobile}
                        onChange={(e) => setUserFormData({ ...userFormData, mobile: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Rôle</Label>
                      <Select value={userFormData.role} onValueChange={(value) => setUserFormData({ ...userFormData, role: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="administrateur">Administrateur</SelectItem>
                          <SelectItem value="chef d'équipe">Chef d'équipe</SelectItem>
                          <SelectItem value="gestionnaire">Gestionnaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Équipe</Label>
                      <Select value={userFormData.teamId} onValueChange={(value) => setUserFormData({ ...userFormData, teamId: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une équipe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Aucune équipe</SelectItem>
                          {teams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit">Créer</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Liste des utilisateurs</CardTitle>
            </CardHeader>
            <CardContent>
              {users.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4">Nom</th>
                        <th className="text-left py-3 px-4">Email</th>
                        <th className="text-left py-3 px-4">Rôle</th>
                        <th className="text-left py-3 px-4">Équipe</th>
                        <th className="text-left py-3 px-4">Statut</th>
                        <th className="text-right py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const userTeam = teams.find(t => t.id === user.teamId);
                        
                        return (
                          <tr key={user.id} className="border-b border-slate-100">
                            <td className="py-3 px-4">
                              {user.firstName} {user.lastName}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{user.email}</td>
                            <td className="py-3 px-4">
                              <Badge variant="outline">{user.role}</Badge>
                            </td>
                            <td className="py-3 px-4">
                              {userTeam ? userTeam.name : '-'}
                            </td>
                            <td className="py-3 px-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleUserActive(user.id)}
                                className={user.active ? 'text-green-600' : 'text-red-600'}
                              >
                                {user.active ? 'Actif' : 'Inactif'}
                              </Button>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <Button variant="ghost" size="sm">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
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
                <p className="text-sm text-slate-500">Aucun utilisateur créé</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Team Detail Dialog */}
      <Dialog open={isTeamDetailOpen} onOpenChange={setIsTeamDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTeam?.team?.name}</DialogTitle>
          </DialogHeader>
          
          {selectedTeam && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-3">Membres de l'équipe</h3>
                {selectedTeam.members && selectedTeam.members.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTeam.members.map((member: any) => (
                      <div key={member.userId} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                        <div>
                          <p>{member.userData?.firstName} {member.userData?.lastName}</p>
                          <p className="text-sm text-slate-600">{member.userData?.role}</p>
                        </div>
                        {member.isLeader && (
                          <Badge>Chef d'équipe</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucun membre dans cette équipe</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
