import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { apiCall, clearApiCache } from '../utils/api';
import '../styles/PageHeader.css';
import '../styles/PlatformProfile.css';
import '../styles/PlatformTransfertPropriete.css';
import '../styles/PlatformPortfolio.css';

interface SuccessorForm {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  sharePercentage: string;
  identityDocument: File | null;
  identityDocumentPreview?: string;
}

const emptySuccessor = (): SuccessorForm => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  country: '',
  sharePercentage: '',
  identityDocument: null,
});

function toForm(s: any): SuccessorForm {
  if (!s || typeof s !== 'object') {
    return emptySuccessor();
  }
  const share = s.sharePercentage ?? s.share_percentage;
  return {
    id: s.id,
    firstName: (s.firstName ?? s.first_name ?? '').toString(),
    lastName: (s.lastName ?? s.last_name ?? '').toString(),
    email: (s.email ?? '').toString(),
    phone: (s.phone ?? '').toString(),
    address: (s.address ?? '').toString(),
    postalCode: (s.postalCode ?? s.postal_code ?? '').toString(),
    city: (s.city ?? '').toString(),
    country: (s.country ?? '').toString(),
    sharePercentage: share !== undefined && share !== null ? String(share) : '',
    identityDocument: null,
    identityDocumentPreview: (s.identityDocument ?? s.identity_document ?? '').toString(),
  };
}

function trim(s: string): string {
  return (s || '').trim();
}

function isRowBlank(s: SuccessorForm): boolean {
  if (s.id) return false;
  return (
    !trim(s.firstName) &&
    !trim(s.lastName) &&
    !trim(s.email) &&
    !trim(s.phone) &&
    !trim(s.address) &&
    !trim(s.postalCode) &&
    !trim(s.city) &&
    !trim(s.country) &&
    !trim(String(s.sharePercentage ?? '')) &&
    !s.identityDocument &&
    !trim(String(s.identityDocumentPreview ?? ''))
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSuccessorRow(s: SuccessorForm, label: string): string | null {
  if (!trim(s.firstName)) return `${label} : le prénom est obligatoire.`;
  if (!trim(s.lastName)) return `${label} : le nom est obligatoire.`;
  if (!trim(s.email)) return `${label} : l'e-mail est obligatoire.`;
  if (!EMAIL_RE.test(trim(s.email))) return `${label} : l'e-mail n'est pas valide.`;
  if (!trim(s.phone)) return `${label} : le téléphone est obligatoire.`;
  if (!trim(s.address)) return `${label} : l'adresse est obligatoire.`;
  if (!trim(s.postalCode)) return `${label} : le code postal est obligatoire.`;
  if (!trim(s.city)) return `${label} : la ville est obligatoire.`;
  if (!trim(s.country)) return `${label} : le pays est obligatoire.`;
  const shareRaw = trim(String(s.sharePercentage ?? ''));
  if (!shareRaw) return `${label} : la répartition des parts est obligatoire.`;
  const pct = parseInt(shareRaw, 10);
  if (Number.isNaN(pct) || String(pct) !== shareRaw) {
    return `${label} : la répartition des parts doit être un nombre entier entre 0 et 100.`;
  }
  if (pct < 0 || pct > 100) {
    return `${label} : la répartition des parts doit être comprise entre 0 et 100 %.`;
  }
  const hasDoc = Boolean(s.identityDocument) || Boolean(trim(String(s.identityDocumentPreview ?? '')));
  if (!s.id && !hasDoc) {
    return `${label} : veuillez joindre une pièce d'identité (CNI ou passeport).`;
  }
  return null;
}

type SaveFeedback = { type: 'success' | 'error'; message: string } | null;

export function PlatformTransfertProprietePage() {
  const navigate = useNavigate();
  const [successors, setSuccessors] = useState<SuccessorForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiCall('/api/client/successors/');
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data?.successors ?? []);
        if (list.length === 0) {
          setSuccessors([emptySuccessor()]);
        } else {
          setSuccessors(list.map(toForm));
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error loading successors:', err);
          toast.error(err?.message || 'Erreur lors du chargement');
          setSuccessors([emptySuccessor()]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const updateSuccessor = (index: number, updates: Partial<SuccessorForm>) => {
    setSaveFeedback(null);
    setSuccessors((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  const addSuccessor = () => {
    setSaveFeedback(null);
    setSuccessors((prev) => [...prev, emptySuccessor()]);
  };

  const handleDeleteSuccessor = async (index: number) => {
    setSaveFeedback(null);
    const s = successors[index];
    if (s.id) {
      try {
        await apiCall(`/api/client/successors/${s.id}/`, { method: 'DELETE' });
        clearApiCache('/api/client/successors');
        toast.success('Successeur supprimé');
      } catch (err: any) {
        toast.error(err?.message || 'Erreur lors de la suppression');
        return;
      }
    }
    setSuccessors((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [emptySuccessor()];
    });
  };

  const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    setSaveFeedback(null);
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Le document ne doit pas dépasser 10 Mo');
        return;
      }
      updateSuccessor(index, {
        identityDocument: file,
        identityDocumentPreview: URL.createObjectURL(file),
      });
    }
  };

  const handleSave = async () => {
    setSaveFeedback(null);

    const indicesToSave = successors
      .map((s, i) => (isRowBlank(s) ? -1 : i))
      .filter((i) => i >= 0);

    if (indicesToSave.length === 0) {
      const msg = 'Veuillez renseigner au moins un successeur avec les informations complètes, ou supprimez les lignes entièrement vides.';
      setSaveFeedback({ type: 'error', message: msg });
      toast.error(msg);
      return;
    }

    for (const i of indicesToSave) {
      const label = `Successeur ${i + 1}`;
      const err = validateSuccessorRow(successors[i], label);
      if (err) {
        setSaveFeedback({ type: 'error', message: err });
        toast.error(err);
        return;
      }
    }

    setSaving(true);
    try {
      const nextState = [...successors];
      for (const i of indicesToSave) {
        const s = successors[i];
        const payload = {
          firstName: s.firstName.trim(),
          lastName: s.lastName.trim(),
          email: s.email.trim(),
          phone: s.phone.trim(),
          address: s.address.trim(),
          postalCode: s.postalCode.trim(),
          city: s.city.trim(),
          country: s.country.trim(),
          sharePercentage: String(s.sharePercentage ?? '').trim() ? parseInt(String(s.sharePercentage), 10) : 0,
        };

        const hasFile = !!s.identityDocument;
        let response: any;

        if (s.id) {
          if (hasFile) {
            const formData = new FormData();
            Object.entries(payload).forEach(([k, v]) => formData.append(k, String(v ?? '')));
            formData.append('identityDocument', s.identityDocument!);
            response = await apiCall(`/api/client/successors/${s.id}/`, {
              method: 'PATCH',
              body: formData,
              headers: {},
            });
          } else {
            response = await apiCall(`/api/client/successors/${s.id}/`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } else if (hasFile) {
          const formData = new FormData();
          Object.entries(payload).forEach(([k, v]) => formData.append(k, String(v ?? '')));
          formData.append('identityDocument', s.identityDocument!);
          response = await apiCall('/api/client/successors/', {
            method: 'POST',
            body: formData,
            headers: {},
          });
        } else {
          response = await apiCall('/api/client/successors/', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (response == null || typeof response !== 'object') {
          throw new Error('Réponse serveur invalide.');
        }
        nextState[i] = toForm(response);
      }

      setSuccessors(nextState.length > 0 ? nextState : [emptySuccessor()]);
      clearApiCache('/api/client/successors');
      const okMsg = 'Vos informations ont bien été enregistrées.';
      setSaveFeedback({ type: 'success', message: okMsg });
      toast.success('Successeurs enregistrés avec succès');
    } catch (err: any) {
      console.error('Error saving successors:', err);
      const msg = err?.message || 'Erreur lors de l\'enregistrement';
      setSaveFeedback({ type: 'error', message: msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="platform-profile-page">
        <div className="page-header" style={{ marginBottom: '24px' }}>
          <h1 className="platform-portfolioPageTitle">Transfert de propriété</h1>
        </div>
        <p style={{ color: 'var(--muted-foreground)' }}>Chargement...</p>
      </div>
    );
  }

  return (
    <div className="platform-profile-page platform-transfert-page">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1 className="platform-portfolioPageTitle">Transfert de propriété</h1>
      </div>
      <p style={{ marginBottom: 24, color: 'var(--muted-foreground)' }}>
        Gérez vos successeurs et la répartition de vos parts.
      </p>

      {successors.map((s, index) => (
        <Card key={s.id || `new-${index}`} className="platform-transfert-successor-card">
          <CardContent className="platform-transfert-successor-content">
            <div className="platform-transfert-successor-header">
              <h3 className="platform-transfert-successor-title">Successeur</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteSuccessor(index)}
                className="platform-transfert-delete-btn"
                title="Supprimer ce successeur"
              >
                <Trash2 size={16} />
              </Button>
            </div>

            <div className="platform-transfert-fields-row platform-transfert-fields-two">
              <div className="platform-transfert-field">
                <Label htmlFor={`firstName-${index}`}>Prénom</Label>
                <Input
                  id={`firstName-${index}`}
                  value={s.firstName}
                  onChange={(e) => updateSuccessor(index, { firstName: e.target.value })}
                  placeholder="Prénom"
                />
              </div>
              <div className="platform-transfert-field">
                <Label htmlFor={`lastName-${index}`}>Nom</Label>
                <Input
                  id={`lastName-${index}`}
                  value={s.lastName}
                  onChange={(e) => updateSuccessor(index, { lastName: e.target.value })}
                  placeholder="Nom"
                />
              </div>
            </div>

            <div className="platform-transfert-field">
              <Label htmlFor={`email-${index}`}>E-mail</Label>
              <Input
                id={`email-${index}`}
                type="email"
                value={s.email}
                onChange={(e) => updateSuccessor(index, { email: e.target.value })}
                placeholder="E-mail"
              />
            </div>

            <div className="platform-transfert-field">
              <Label htmlFor={`phone-${index}`}>Téléphone</Label>
              <Input
                id={`phone-${index}`}
                type="tel"
                value={s.phone}
                onChange={(e) => updateSuccessor(index, { phone: e.target.value })}
                placeholder="Téléphone"
              />
            </div>

            <div className="platform-transfert-field">
              <Label htmlFor={`address-${index}`}>Adresse</Label>
              <Input
                id={`address-${index}`}
                value={s.address}
                onChange={(e) => updateSuccessor(index, { address: e.target.value })}
                placeholder="Adresse"
              />
            </div>

            <div className="platform-transfert-fields-row platform-transfert-fields-three">
              <div className="platform-transfert-field">
                <Label htmlFor={`postalCode-${index}`}>CP</Label>
                <Input
                  id={`postalCode-${index}`}
                  value={s.postalCode}
                  onChange={(e) => updateSuccessor(index, { postalCode: e.target.value })}
                  placeholder="CP"
                />
              </div>
              <div className="platform-transfert-field">
                <Label htmlFor={`city-${index}`}>Ville</Label>
                <Input
                  id={`city-${index}`}
                  value={s.city}
                  onChange={(e) => updateSuccessor(index, { city: e.target.value })}
                  placeholder="Ville"
                />
              </div>
              <div className="platform-transfert-field">
                <Label htmlFor={`country-${index}`}>Pays</Label>
                <Input
                  id={`country-${index}`}
                  value={s.country}
                  onChange={(e) => updateSuccessor(index, { country: e.target.value })}
                  placeholder="Pays"
                />
              </div>
            </div>

            <div className="platform-transfert-field">
              <Label htmlFor={`sharePercentage-${index}`}>Répartition des parts</Label>
              <Input
                id={`sharePercentage-${index}`}
                type="number"
                min={0}
                max={100}
                value={s.sharePercentage}
                onChange={(e) => updateSuccessor(index, { sharePercentage: e.target.value })}
                placeholder="Pourcentage des parts (%)"
              />
            </div>

            <div className="platform-transfert-field">
              <Label>Documents</Label>
              <p className="platform-transfert-doc-hint">
                Carte Nationale d&apos;identité ou Passeport
              </p>
              <div className="platform-transfert-file-row">
                <input
                  ref={(el) => { fileInputRefs.current[index] = el; }}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => handleFileChange(index, e)}
                  style={{ display: 'none' }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRefs.current[index]?.click()}
                >
                  Choisir un fichier
                </Button>
                <span className="platform-transfert-file-name">
                  {s.identityDocument?.name ?? (s.identityDocumentPreview ? 'Fichier sélectionné' : 'Aucun fichier choisi')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="platform-transfert-footer">
        {saveFeedback ? (
          <div
            role="status"
            aria-live="polite"
            className={
              saveFeedback.type === 'success'
                ? 'platform-transfert-feedback platform-transfert-feedback--success'
                : 'platform-transfert-feedback platform-transfert-feedback--error'
            }
          >
            {saveFeedback.message}
          </div>
        ) : null}
        <div className="platform-transfert-actions">
          <Button
            type="button"
            variant="outline"
            onClick={addSuccessor}
            className="platform-transfert-add-btn"
          >
            <Plus size={16} />
            Successeur
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="platform-transfert-save-btn"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <button
        type="button"
        className="platform-profile-link"
        onClick={() => navigate('/platform/profile')}
        style={{ marginTop: 24 }}
      >
        ← Retour au profil
      </button>
    </div>
  );
}
