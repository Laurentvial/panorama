import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { ArrowLeft, Save, Key, Upload, FileText } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useUsers } from '../hooks/useUsers';
import { useTeams } from '../hooks/useTeams';
import { toast } from 'sonner';
import { PatrimonialFormModal } from './PatrimonialFormModal';

export function AddClient() {
  const navigate = useNavigate();
  const { users, loading: usersLoading } = useUsers();
  const { teams, loading: teamsLoading } = useTeams();
  const [loading, setLoading] = useState(false);
  const [isPatrimonialModalOpen, setIsPatrimonialModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    // Informations personnelles
    civility: '',
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    phone: '',
    mobile: '',
    platformAccess: true,
    active: true,
    template: '',
    support: '',
    birthDate: '',
    birthPlace: '',
    address: '',
    postalCode: '',
    city: '',
    nationality: '',
    successor: '',
    managerId: '',
    teamId: '',
    // Fiche patrimoniale (sera remplie via le modal)
    professionalActivityStatus: '',
    professionalActivityComment: '',
    professions: [] as string[],
    professionsComment: '',
    bankName: '',
    currentAccount: 0,
    livretAB: 0,
    pea: 0,
    pel: 0,
    ldd: 0,
    cel: 0,
    csl: 0,
    securitiesAccount: 0,
    lifeInsurance: 0,
    savingsComment: '',
    totalWealth: 0,
    objectives: [] as string[],
    objectivesComment: '',
    experience: [] as string[],
    experienceComment: '',
    taxOptimization: false,
    taxOptimizationComment: '',
    annualHouseholdIncome: 0,
  });

  function generateEasyPassword() {
    // Génère un mot de passe facile basé sur le nom/prénom si disponibles
    // Garantit minimum 6 caractères
    const firstName = formData.firstName.trim().toLowerCase();
    const lastName = formData.lastName.trim().toLowerCase();
    
    let easyPassword = 'Client123!';
    
    if (firstName && lastName) {
      // Utilise les 2 premières lettres du prénom et nom + un nombre + un caractère spécial
      const firstPart = firstName.substring(0, 2).toUpperCase();
      const lastPart = lastName.substring(0, 2).toUpperCase();
      const randomNum = Math.floor(Math.random() * 90) + 10; // 10-99
      easyPassword = `${firstPart}${lastPart}${randomNum}!`;
    } else if (firstName) {
      // Utilise les 2 premières lettres du prénom + un nombre à 3 chiffres + un caractère spécial
      const firstPart = firstName.substring(0, 2).toUpperCase();
      const randomNum = Math.floor(Math.random() * 900) + 100; // 100-999
      easyPassword = `${firstPart}${randomNum}!`;
    }
    
    // Vérification de sécurité : garantit au moins 6 caractères
    if (easyPassword.length < 6) {
      easyPassword = 'Client123!';
    }
    
    setFormData({
      ...formData,
      password: easyPassword
    });
    
    toast.success('Mot de passe généré');
  }

  function handlePatrimonialSave(patrimonialData: any) {
    setFormData({
      ...formData,
      ...patrimonialData
    });
    toast.success('Fiche patrimoniale enregistrée');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (formData.password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      setLoading(false);
      return;
    }

    try {
      await apiCall('/api/clients/create/', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      toast.success('Client créé avec succès');
      navigate('/clients');
    } catch (error: any) {
      console.error('Error creating client:', error);
      let errorMessage = 'Erreur lors de la création du client';
      
      if (error.response) {
        // Backend error response
        if (error.response.error) {
          errorMessage = error.response.error;
        } else if (error.response.detail) {
          errorMessage = error.response.detail;
        } else if (error.response.message) {
          errorMessage = error.response.message;
        }
        
        // Check for validation errors
        if (error.response.email) {
          errorMessage = `Email: ${Array.isArray(error.response.email) ? error.response.email[0] : error.response.email}`;
        } else if (error.response.fname) {
          errorMessage = `Prénom: ${Array.isArray(error.response.fname) ? error.response.fname[0] : error.response.fname}`;
        } else if (error.response.lname) {
          errorMessage = `Nom: ${Array.isArray(error.response.lname) ? error.response.lname[0] : error.response.lname}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/clients')}
          className="h-10 w-10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Nouveau client</h1>
          <p className="text-slate-600 mt-1">Remplissez le formulaire pour créer un nouveau client</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informations personnelles */}
        <Card>
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Photo de profil */}
            <div className="space-y-2">
              <Label>Photo de profil</Label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-slate-400" />
                </div>
                <Button type="button" variant="outline" size="sm">
                  <Upload className="w-4 h-4 mr-2" />
                  Télécharger une photo
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="civility">Civilité</Label>
                <Select
                  value={formData.civility}
                  onValueChange={(value) => setFormData({ ...formData, civility: value })}
                >
                  <SelectTrigger id="civility">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Monsieur">Monsieur</SelectItem>
                    <SelectItem value="Madame">Madame</SelectItem>
                    <SelectItem value="Mademoiselle">Mademoiselle</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  placeholder="Prénom du client"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Nom *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                  placeholder="Nom du client"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Nom d'utilisateur</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Nom d'utilisateur"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                placeholder="client@example.com"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="birthDate">Date de naissance</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthPlace">Lieu de naissance</Label>
                <Input
                  id="birthPlace"
                  value={formData.birthPlace}
                  onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                  placeholder="Lieu de naissance"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Adresse complète"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postalCode">Code postal</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  placeholder="75001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Paris"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nationality">Nationalité</Label>
                <Input
                  id="nationality"
                  value={formData.nationality}
                  onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                  placeholder="Française"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="successor">Successeur</Label>
              <Input
                id="successor"
                value={formData.successor}
                onChange={(e) => setFormData({ ...formData, successor: e.target.value })}
                placeholder="Nom du successeur"
              />
            </div>
          </CardContent>
        </Card>

        {/* Informations de contact */}
        <Card>
          <CardHeader>
            <CardTitle>Informations de contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="01 23 45 67 89"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">Portable</Label>
                <Input
                  id="mobile"
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Authentification */}
        <Card>
          <CardHeader>
            <CardTitle>Authentification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateEasyPassword}
                  className="h-8 text-xs"
                >
                  <Key className="w-3 h-3 mr-1" />
                  Générer
                </Button>
              </div>
              <Input
                id="password"
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                placeholder="Entrez le mot de passe"
                minLength={6}
              />
              <p className="text-xs text-slate-500">Minimum 6 caractères</p>
            </div>
          </CardContent>
        </Card>

        {/* Organisation */}
        <Card>
          <CardHeader>
            <CardTitle>Organisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="teamId">Équipe</Label>
                <Select
                  value={formData.teamId || 'none'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, teamId: value === 'none' ? '' : value })
                  }
                >
                  <SelectTrigger id="teamId">
                    <SelectValue placeholder="Sélectionner une équipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune équipe</SelectItem>
                    {teamsLoading ? (
                      <SelectItem value="loading" disabled>Chargement...</SelectItem>
                    ) : (
                      teams?.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="managerId">Gestionnaire</Label>
                <Select
                  value={formData.managerId || 'none'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, managerId: value === 'none' ? '' : value })
                  }
                >
                  <SelectTrigger id="managerId">
                    <SelectValue placeholder="Sélectionner un gestionnaire" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun gestionnaire</SelectItem>
                    {usersLoading ? (
                      <SelectItem value="loading" disabled>Chargement...</SelectItem>
                    ) : (
                      users?.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.firstName} {user.lastName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connexion et paramètres */}
        <Card>
          <CardHeader>
            <CardTitle>Connexion et paramètres</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="platformAccess"
                checked={formData.platformAccess}
                onChange={(e) => setFormData({ ...formData, platformAccess: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="platformAccess" className="cursor-pointer">
                Connexion à la plateforme
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="active" className="cursor-pointer">
                Activer / Désactiver
              </Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template">Template</Label>
                <Input
                  id="template"
                  value={formData.template}
                  onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                  placeholder="Template"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support">Support</Label>
                <Input
                  id="support"
                  value={formData.support}
                  onChange={(e) => setFormData({ ...formData, support: e.target.value })}
                  placeholder="Support"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fiche patrimoniale */}
        <Card>
          <CardHeader>
            <CardTitle>Fiche patrimoniale</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPatrimonialModalOpen(true)}
              className="w-full"
            >
              <FileText className="w-4 h-4 mr-2" />
              {formData.professionalActivityStatus ? 'Modifier la fiche patrimoniale' : 'Remplir la fiche patrimoniale'}
            </Button>
            {formData.professionalActivityStatus && (
              <p className="text-sm text-slate-500 mt-2">
                Fiche patrimoniale remplie ({formData.professions.length} métier(s), Patrimoine: {formData.totalWealth.toFixed(2)} €)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/clients')}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              'Création...'
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Créer le client
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Modal Fiche patrimoniale */}
      <PatrimonialFormModal
        isOpen={isPatrimonialModalOpen}
        onClose={() => setIsPatrimonialModalOpen(false)}
        onSave={handlePatrimonialSave}
        initialData={formData}
      />
    </div>
  );
}

export default AddClient;

