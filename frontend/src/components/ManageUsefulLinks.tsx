import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Plus, Search, Trash2, Pencil, X, ExternalLink } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import '../styles/PlanningCalendar.css';

export function ManageUsefulLinks() {
  const [usefulLinks, setUsefulLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    category: '',
    default: false
  });

  useEffect(() => {
    loadUsefulLinks();
  }, []);

  async function loadUsefulLinks() {
    try {
      setLoading(true);
      const data = await apiCall('/api/useful-links/');
      setUsefulLinks((data as any).usefulLinks || []);
    } catch (error) {
      console.error('Error loading useful links:', error);
      toast.error('Erreur lors du chargement des liens utiles');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenDialog(link?: any) {
    if (link) {
      setEditingLink(link);
      setFormData({
        name: link.name || '',
        url: link.url || '',
        description: link.description || '',
        category: link.category || '',
        default: link.default || false
      });
    } else {
      setEditingLink(null);
      setFormData({
        name: '',
        url: '',
        description: '',
        category: '',
        default: false
      });
    }
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
    setEditingLink(null);
    setFormData({
      name: '',
      url: '',
      description: '',
      category: '',
      default: false
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingLink) {
        await apiCall(`/api/useful-links/${editingLink.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
          headers: { 'Content-Type': 'application/json' }
        });
        toast.success('Lien utile modifié avec succès');
      } else {
        await apiCall('/api/useful-links/create/', {
          method: 'POST',
          body: JSON.stringify(formData),
          headers: { 'Content-Type': 'application/json' }
        });
        toast.success('Lien utile créé avec succès');
      }
      handleCloseDialog();
      loadUsefulLinks();
    } catch (error: any) {
      console.error('Error saving useful link:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(linkId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce lien utile ?')) return;
    
    try {
      await apiCall(`/api/useful-links/${linkId}/delete/`, { method: 'DELETE' });
      toast.success('Lien utile supprimé avec succès');
      loadUsefulLinks();
    } catch (error) {
      console.error('Error deleting useful link:', error);
      toast.error('Erreur lors de la suppression');
    }
  }

  const filteredLinks = usefulLinks.filter(link => {
    const searchLower = searchTerm.toLowerCase();
    return (
      link.name?.toLowerCase().includes(searchLower) ||
      link.url?.toLowerCase().includes(searchLower) ||
      link.description?.toLowerCase().includes(searchLower) ||
      link.category?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingIndicator />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestion des Liens Utiles</h1>
          <p className="text-slate-600 mt-1">Gérer les liens utiles disponibles pour les clients</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un lien utile
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              className="pl-10"
              placeholder="Rechercher par nom, URL, description, catégorie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Useful Links Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Liens Utiles ({filteredLinks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLinks.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Aucun lien utile trouvé</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-slate-700">Nom</th>
                    <th className="text-left p-2 font-medium text-slate-700">URL</th>
                    <th className="text-left p-2 font-medium text-slate-700">Description</th>
                    <th className="text-left p-2 font-medium text-slate-700">Catégorie</th>
                    <th className="text-left p-2 font-medium text-slate-700">Par défaut</th>
                    <th className="text-right p-2 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLinks.map((link) => (
                    <tr key={link.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-medium">{link.name}</td>
                      <td className="p-2">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {link.url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="p-2 text-slate-600 max-w-md truncate">{link.description}</td>
                      <td className="p-2">
                        {link.category && (
                          <span className="px-2 py-1 bg-slate-100 rounded text-sm">
                            {link.category}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {link.default ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Oui</span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-sm">Non</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(link)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(link.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      {isDialogOpen && (
        <div className="planning-modal-overlay" onClick={handleCloseDialog}>
          <div className="planning-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
            <div className="planning-modal-header">
              <h2 className="planning-modal-title">
                {editingLink ? 'Modifier le lien utile' : 'Créer un nouveau lien utile'}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="planning-modal-close"
                onClick={handleCloseDialog}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="planning-form">
              <div className="planning-form-field">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="planning-form-field">
                <Label htmlFor="url">URL *</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                  required
                />
              </div>
              <div className="planning-form-field">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="planning-form-field">
                <Label htmlFor="category">Catégorie</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="planning-form-field">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="default"
                    checked={formData.default}
                    onChange={(e) => setFormData({ ...formData, default: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="default">Disponible par défaut pour tous les clients</Label>
                </div>
              </div>
              <div className="planning-form-actions">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Annuler
                </Button>
                <Button type="submit">
                  {editingLink ? 'Modifier' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

