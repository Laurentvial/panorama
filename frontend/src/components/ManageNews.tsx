import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Plus, Search, Trash2, Pencil, X, ExternalLink, Download, Newspaper } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import '../styles/Modal.css';
import '../styles/PageHeader.css';

export function ManageNews() {
  const [newsPosts, setNewsPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isApiDialogOpen, setIsApiDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [apiArticles, setApiArticles] = useState<any[]>([]);
  const [loadingApi, setLoadingApi] = useState(false);
  const [selectedArticles, setSelectedArticles] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    sourceName: '',
    articleUrl: '',
    image: null as File | null,
    published: true
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [shouldRemoveImage, setShouldRemoveImage] = useState(false);

  useEffect(() => {
    loadNewsPosts();
  }, []);

  async function loadNewsPosts() {
    try {
      setLoading(true);
      const data = await apiCall('/api/news/all/');
      setNewsPosts((data as any).news || []);
    } catch (error) {
      console.error('Error loading news posts:', error);
      toast.error('Erreur lors du chargement des actualités');
    } finally {
      setLoading(false);
    }
  }

  async function fetchNewsFromApi() {
    try {
      setLoadingApi(true);
      setSelectedArticles(new Set());
      const data = await apiCall('/api/news/fetch-from-api/');
      setApiArticles((data as any).articles || []);
      setIsApiDialogOpen(true);
    } catch (error: any) {
      console.error('Error fetching news from API:', error);
      toast.error(error.message || 'Erreur lors de la récupération des actualités');
    } finally {
      setLoadingApi(false);
    }
  }

  async function importArticleFromApi(article: any) {
    try {
      await apiCall('/api/news/import-from-api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ article })
      });
      toast.success('Actualité importée avec succès');
      setIsApiDialogOpen(false);
      loadNewsPosts();
    } catch (error: any) {
      console.error('Error importing article:', error);
      toast.error(error.message || 'Erreur lors de l\'importation');
    }
  }

  function toggleArticleSelection(index: number) {
    const newSelected = new Set(selectedArticles);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedArticles(newSelected);
  }

  function selectAllArticles() {
    if (selectedArticles.size === apiArticles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(apiArticles.map((_, index) => index)));
    }
  }

  async function bulkImportArticles() {
    if (selectedArticles.size === 0) {
      toast.error('Veuillez sélectionner au moins un article');
      return;
    }

    try {
      setImporting(true);
      const articlesToImport = Array.from(selectedArticles).map(index => apiArticles[index]);
      const response = await apiCall('/api/news/bulk-import-from-api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ articles: articlesToImport })
      });
      
      const successCount = (response as any).success_count || 0;
      const errorCount = (response as any).error_count || 0;
      
      if (successCount > 0) {
        toast.success(`${successCount} actualité(s) importée(s) avec succès`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} erreur(s) lors de l'importation`);
      }
      
      setIsApiDialogOpen(false);
      setSelectedArticles(new Set());
      loadNewsPosts();
    } catch (error: any) {
      console.error('Error bulk importing articles:', error);
      toast.error(error.message || 'Erreur lors de l\'importation en masse');
    } finally {
      setImporting(false);
    }
  }

  function handleOpenDialog(post?: any) {
    if (post) {
      setEditingPost(post);
      setFormData({
        title: post.title || '',
        content: post.content || '',
        sourceName: post.sourceName || '',
        articleUrl: post.articleUrl || '',
        image: null,
        published: post.published !== false
      });
      setImagePreview(post.imageUrl || null);
      setShouldRemoveImage(false);
    } else {
      setEditingPost(null);
      setFormData({
        title: '',
        content: '',
        sourceName: '',
        articleUrl: '',
        image: null,
        published: true
      });
      setImagePreview(null);
      setShouldRemoveImage(false);
    }
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
    setEditingPost(null);
    setFormData({
      title: '',
      content: '',
      sourceName: '',
      articleUrl: '',
      image: null,
      published: true
    });
    setImagePreview(null);
    setShouldRemoveImage(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('content', formData.content);
      formDataToSend.append('sourceName', formData.sourceName);
      formDataToSend.append('articleUrl', formData.articleUrl);
      formDataToSend.append('published', formData.published.toString());
      if (formData.image) {
        formDataToSend.append('image', formData.image);
      }
      if (editingPost && shouldRemoveImage && !formData.image) {
        formDataToSend.append('removeImage', 'true');
      }

      if (editingPost) {
        await apiCall(`/api/news/${editingPost.id}/update/`, {
          method: 'PUT',
          body: formDataToSend
        });
        toast.success('Actualité modifiée avec succès');
      } else {
        await apiCall('/api/news/create/', {
          method: 'POST',
          body: formDataToSend
        });
        toast.success('Actualité créée avec succès');
      }
      handleCloseDialog();
      loadNewsPosts();
    } catch (error: any) {
      console.error('Error saving news post:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, image: file });
      setShouldRemoveImage(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleRemoveImage() {
    setFormData({ ...formData, image: null });
    setImagePreview(null);
    setShouldRemoveImage(true);
  }

  async function handleDelete(postId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette actualité ?')) return;
    
    try {
      await apiCall(`/api/news/${postId}/delete/`, { method: 'DELETE' });
      toast.success('Actualité supprimée avec succès');
      loadNewsPosts();
    } catch (error) {
      console.error('Error deleting news post:', error);
      toast.error('Erreur lors de la suppression');
    }
  }

  const filteredPosts = newsPosts.filter(post => {
    const searchLower = searchTerm.toLowerCase();
    return (
      post.title?.toLowerCase().includes(searchLower) ||
      post.content?.toLowerCase().includes(searchLower) ||
      post.authorName?.toLowerCase().includes(searchLower)
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
      <div className="page-header">
        <div className="page-title-section">
          <h1 className="page-title">Gestion des Actualités</h1>
          <p className="page-subtitle">Gérer les actualités affichées sur la plateforme</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchNewsFromApi} variant="outline" disabled={loadingApi}>
            <Download className="w-4 h-4 mr-2" />
            {loadingApi ? 'Chargement...' : 'Importer des actualités'}
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Créer une actualité
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              className="pl-10"
              placeholder="Rechercher par titre, contenu, auteur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* News Posts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Actualités ({filteredPosts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredPosts.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Aucune actualité trouvée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-slate-700" style={{ width: '120px', minWidth: '120px' }}>Image</th>
                    <th className="text-left p-2 font-medium text-slate-700">Titre</th>
                    <th className="text-left p-2 font-medium text-slate-700">Auteur</th>
                    <th className="text-left p-2 font-medium text-slate-700" style={{ maxWidth: '300px', width: '300px' }}>Contenu</th>
                    <th className="text-left p-2 font-medium text-slate-700">Date</th>
                    <th className="text-left p-2 font-medium text-slate-700">Statut</th>
                    <th className="text-right p-2 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post) => (
                    <tr key={post.id} className="border-b hover:bg-slate-50">
                      <td className="p-2" style={{ width: '120px', minWidth: '120px' }}>
                        {post.imageUrl ? (
                          <img src={post.imageUrl} alt={post.title} className="w-24 h-24 object-cover rounded" />
                        ) : (
                          <div className="w-24 h-24 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">
                            Pas d'image
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-medium max-w-xs">{post.title}</td>
                      <td className="p-2">{post.authorName || 'Admin'}</td>
                      <td className="p-2 text-slate-600 truncate" style={{ maxWidth: '300px', width: '300px' }} title={post.content}>{post.content}</td>
                      <td className="p-2 text-slate-600 text-sm">
                        {new Date(post.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="p-2">
                        {post.published ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Publié</span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-sm">Brouillon</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(post)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(post.id)}
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
        <div className="modal-overlay" onClick={handleCloseDialog}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '40rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingPost ? 'Modifier l\'actualité' : 'Créer une nouvelle actualité'}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={handleCloseDialog}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-form-field">
                <Label htmlFor="title">Titre *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="sourceName">Source (site)</Label>
                <Input
                  id="sourceName"
                  value={formData.sourceName}
                  onChange={(e) => setFormData({ ...formData, sourceName: e.target.value })}
                  placeholder="Ex: Les Echos"
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="articleUrl">Lien de l'article</Label>
                <Input
                  id="articleUrl"
                  value={formData.articleUrl}
                  onChange={(e) => setFormData({ ...formData, articleUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="content">Contenu *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={8}
                  required
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="image">Image</Label>
                {imagePreview && (
                  <div className="mb-2 relative">
                    <img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded border" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveImage}
                      className="absolute top-0 right-0 bg-red-500 text-white hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="cursor-pointer"
                />
              </div>
              <div className="modal-form-field">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="published"
                    checked={formData.published}
                    onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="published">Publier immédiatement</Label>
                </div>
              </div>
              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Annuler
                </Button>
                <Button type="submit">
                  {editingPost ? 'Modifier' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Articles disponibles (flux RSS) */}
      {isApiDialogOpen && (
        <div className="modal-overlay" onClick={() => setIsApiDialogOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '50rem', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 className="modal-title flex items-center gap-2">
                <Newspaper className="w-5 h-5" />
                Actualités financières disponibles
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => setIsApiDialogOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <div className="p-6">
              {apiArticles.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Aucune actualité trouvée</p>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedArticles.size === apiArticles.length && apiArticles.length > 0}
                        onChange={selectAllArticles}
                        className="w-4 h-4"
                      />
                      <Label className="cursor-pointer">
                        Tout sélectionner ({selectedArticles.size}/{apiArticles.length})
                      </Label>
                    </div>
                    <Button
                      onClick={bulkImportArticles}
                      disabled={selectedArticles.size === 0 || importing}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {importing ? 'Importation...' : `Importer ${selectedArticles.size} sélectionné(s)`}
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {apiArticles.map((article: any, index: number) => (
                      <Card key={index} className={selectedArticles.has(index) ? 'border-blue-500 border-2' : ''}>
                        <CardContent className="pt-6">
                          <div className="flex gap-4">
                            <div className="flex items-start pt-1">
                              <input
                                type="checkbox"
                                checked={selectedArticles.has(index)}
                                onChange={() => toggleArticleSelection(index)}
                                className="w-4 h-4 mt-1"
                              />
                            </div>
                            {article.urlToImage && (
                              <div className="flex-shrink-0">
                                <img
                                  src={article.urlToImage}
                                  alt={article.title}
                                  className="w-24 h-24 object-cover rounded"
                                  style={{ maxWidth: '96px', maxHeight: '96px' }}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-lg mb-2 break-words">{article.title}</h3>
                              <p className="text-slate-600 text-sm mb-2 line-clamp-2 break-words">{article.description}</p>
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="text-xs text-slate-500">
                                  <span>{article.source?.name || 'Source inconnue'}</span>
                                  {article.publishedAt && (
                                    <span className="ml-2">
                                      {new Date(article.publishedAt).toLocaleDateString('fr-FR')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {article.url && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => window.open(article.url, '_blank')}
                                    >
                                      <ExternalLink className="w-4 h-4 mr-1" />
                                      Voir
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => importArticleFromApi(article)}
                                  >
                                    <Download className="w-4 h-4 mr-1" />
                                    Importer
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
