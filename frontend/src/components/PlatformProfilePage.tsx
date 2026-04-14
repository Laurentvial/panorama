import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { apiCall } from '../utils/api';
import { clientRequestPasswordReset } from '../utils/auth';
import { toast } from 'sonner';
import { Key, User, Camera, X } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { DateInput } from './ui/date-input';
import '../styles/PageHeader.css';
import '../styles/PlatformProfile.css';
import '../styles/PlatformPortfolio.css';
import '../styles/Modal.css';

const CIVILITY_OPTIONS = [
  { value: '', label: '—' },
  { value: 'Monsieur', label: 'Monsieur' },
  { value: 'Madame', label: 'Madame' },
  { value: 'Mademoiselle', label: 'Mademoiselle' },
  { value: 'Autre', label: 'Autre' },
];

const NATIONALITY_FLAGS: Record<string, string> = {
  France: '🇫🇷',
  Belgique: '🇧🇪',
  Suisse: '🇨🇭',
  Luxembourg: '🇱🇺',
  Canada: '🇨🇦',
  'États-Unis': '🇺🇸',
  'Royaume-Uni': '🇬🇧',
  Allemagne: '🇩🇪',
  Espagne: '🇪🇸',
  Italie: '🇮🇹',
  Portugal: '🇵🇹',
  Maroc: '🇲🇦',
  Algérie: '🇩🇿',
  Tunisie: '🇹🇳',
};

function formatBirthDate(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    if (value.includes('-')) {
      const [y, m, d] = value.split('-');
      return `${d}/${m}/${y}`;
    }
    if (value.includes('/')) return value;
    return value;
  } catch {
    return value || '-';
  }
}

function formatAddress(user: any): string {
  const parts: string[] = [];
  if (user?.address?.trim()) parts.push(user.address.trim());
  if (user?.postalCode?.trim() || user?.city?.trim()) {
    parts.push([user.postalCode, user.city].filter(Boolean).join(' ').trim());
  }
  return parts.length ? parts.join(', ') : '-';
}

export function PlatformProfilePage() {
  const navigate = useNavigate();
  const { currentUser, refreshUser } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSending, setPasswordSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    mobile: '',
    address: '',
    postalCode: '',
    city: '',
    civility: '',
    birthDate: '',
    birthPlace: '',
    nationality: '',
    profilePhoto: null as File | null,
    profilePhotoPreview: '' as string,
  });

  const openEditModal = () => {
    if (currentUser) {
      setEditForm({
        firstName: currentUser.fname || currentUser.firstName || '',
        lastName: currentUser.lname || currentUser.lastName || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        mobile: currentUser.mobile || '',
        address: currentUser.address || '',
        postalCode: currentUser.postalCode || currentUser.postal_code || '',
        city: currentUser.city || '',
        civility: currentUser.civility || '',
        birthDate: currentUser.birthDate || currentUser.birth_date || '',
        birthPlace: currentUser.birthPlace || currentUser.birth_place || '',
        nationality: currentUser.nationality || '',
        profilePhoto: null,
        profilePhotoPreview: currentUser.profilePhoto || '',
      });
      setEditModalOpen(true);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La photo ne doit pas dépasser 5 Mo');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner une image');
        return;
      }
      setEditForm((prev) => ({
        ...prev,
        profilePhoto: file,
        profilePhotoPreview: URL.createObjectURL(file),
      }));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const hasFile = !!editForm.profilePhoto;
      const payload: Record<string, string> = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim(),
        mobile: editForm.mobile.trim(),
        address: editForm.address.trim(),
        postalCode: editForm.postalCode.trim(),
        city: editForm.city.trim(),
        civility: editForm.civility.trim(),
        birthDate: editForm.birthDate || '',
        birthPlace: editForm.birthPlace.trim(),
        nationality: editForm.nationality.trim(),
      };

      if (hasFile) {
        const formData = new FormData();
        Object.entries(payload).forEach(([k, v]) => formData.append(k, v));
        formData.append('profilePhoto', editForm.profilePhoto!);
        await apiCall('/api/client/identity/', {
          method: 'PATCH',
          body: formData,
          headers: {},
        });
      } else {
        await apiCall('/api/client/identity/', {
          method: 'PATCH',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      }
      toast.success('Profil mis à jour avec succès');
      await refreshUser();
      setEditModalOpen(false);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      toast.error(err?.message || 'Erreur lors de la mise à jour du profil');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    const email = currentUser?.email?.trim();
    if (!email) {
      toast.error('Adresse e-mail introuvable');
      return;
    }
    setPasswordSending(true);
    try {
      await clientRequestPasswordReset(email);
      toast.success('Un e-mail de réinitialisation a été envoyé à votre adresse');
      setPasswordModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de l\'envoi de l\'e-mail');
    } finally {
      setPasswordSending(false);
    }
  };

  const fullName =
    `${currentUser?.fname || currentUser?.firstName || ''} ${currentUser?.lname || currentUser?.lastName || ''}`.trim() ||
    '-';
  const birthDisplay =
    currentUser?.birthDate || currentUser?.birth_date
      ? `${formatBirthDate(currentUser.birthDate || currentUser.birth_date)}${currentUser?.birthPlace || currentUser?.birth_place ? ` - ${currentUser.birthPlace || currentUser.birth_place}` : ''}`
      : '-';
  const nationalityDisplay = currentUser?.nationality || '-';
  const nationalityFlag = nationalityDisplay !== '-' ? NATIONALITY_FLAGS[nationalityDisplay] || '' : '';

  return (
    <div className="platform-profile-page">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1 className="platform-portfolioPageTitle">Mon profil</h1>
      </div>

      {/* Photo de profil */}
      <Card className="platform-profile-card">
        <CardContent className="platform-profile-photo-section">
          <div className="platform-profile-photo-wrapper">
            {currentUser?.profilePhoto ? (
              <img
                src={currentUser.profilePhoto}
                alt="Photo de profil"
                className="platform-profile-photo"
              />
            ) : (
              <div className="platform-profile-photo-placeholder">
                <User size={48} />
              </div>
            )}
          </div>
          <div className="platform-profile-photo-text">
            <p>
              Personnalisez votre compte à l&apos;aide d&apos;une photo. Votre photo de profil
              apparaîtra sur les applications et appareils qui utilisent votre compte.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openEditModal}
              className="platform-profile-change-photo-btn"
            >
              <Camera size={16} />
              Changer de photo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Succession */}
      <Card className="platform-profile-card">
        <CardContent style={{ padding: 0 }}>
          <div className="platform-profile-succession-section">
            <div>
              <h3 className="platform-profile-section-title">Succession</h3>
              <p className="platform-profile-section-subtitle">Transfert de propriété</p>
            </div>
            <button
              type="button"
              className="platform-profile-consult-link"
              onClick={() => navigate('/platform/transfert-propriete')}
            >
              Consulter
            </button>
          </div>
          <div className="platform-profile-succession-actions">
            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              className="platform-profile-link"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Key size={16} />
              Modifier le mot de passe
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Détails personnels */}
      <Card className="platform-profile-card">
        <CardContent className="platform-profile-details-section">
          <div className="platform-profile-details-header">
            <h3 className="platform-profile-section-title">Informations personnelles</h3>
            <button type="button" className="platform-profile-edit-link" onClick={openEditModal}>
              Modifier mon profil
            </button>
          </div>
          <div className="platform-profile-details-list">
            <DetailRow label="Nom complet" value={fullName} />
            <DetailRow label="E-mail" value={currentUser?.email || '-'} />
            <DetailRow label="Téléphone" value={currentUser?.phone || '-'} />
            <DetailRow label="Portable" value={currentUser?.mobile || '-'} />
            <DetailRow label="Adresse" value={formatAddress(currentUser)} />
            <DetailRow label="Civilité" value={currentUser?.civility || '-'} />
            <DetailRow label="Date & Lieu de naissance" value={birthDisplay} />
            <DetailRow
              label="Nationalité"
              value={
                nationalityFlag && nationalityDisplay !== '-'
                  ? `${nationalityFlag} ${nationalityDisplay}`
                  : nationalityDisplay
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Modal Modifier mon profil */}
      {editModalOpen && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Modifier mon profil</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => setEditModalOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleSaveProfile} className="modal-form">
              <div className="platform-profile-edit-form">
                <div className="platform-profile-edit-photo-row">
                  <div className="platform-profile-edit-photo-preview">
                    {editForm.profilePhotoPreview ? (
                      <img src={editForm.profilePhotoPreview} alt="Aperçu" />
                    ) : (
                      <User size={40} />
                    )}
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera size={14} />
                      Changer de photo
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
                <div className="platform-profile-edit-fields">
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="firstName">Prénom</Label>
                    <Input
                      id="firstName"
                      value={editForm.firstName}
                      onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="lastName">Nom</Label>
                    <Input
                      id="lastName"
                      value={editForm.lastName}
                      onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field platform-profile-edit-field-full">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="phone">Téléphone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="mobile">Portable</Label>
                    <Input
                      id="mobile"
                      type="tel"
                      value={editForm.mobile}
                      onChange={(e) => setEditForm((p) => ({ ...p, mobile: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field platform-profile-edit-field-full">
                    <Label htmlFor="address">Adresse</Label>
                    <Input
                      id="address"
                      value={editForm.address}
                      onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="postalCode">Code postal</Label>
                    <Input
                      id="postalCode"
                      value={editForm.postalCode}
                      onChange={(e) => setEditForm((p) => ({ ...p, postalCode: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="city">Ville</Label>
                    <Input
                      id="city"
                      value={editForm.city}
                      onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label>Civilité</Label>
                    <Select
                      value={editForm.civility || 'none'}
                      onValueChange={(v) => setEditForm((p) => ({ ...p, civility: v === 'none' ? '' : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {CIVILITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value || 'none'} value={o.value || 'none'}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="birthDate">Date de naissance</Label>
                    <DateInput
                      value={editForm.birthDate}
                      onChange={(v) => setEditForm((p) => ({ ...p, birthDate: v }))}
                      placeholder="JJ/MM/AAAA"
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="birthPlace">Lieu de naissance</Label>
                    <Input
                      id="birthPlace"
                      value={editForm.birthPlace}
                      onChange={(e) => setEditForm((p) => ({ ...p, birthPlace: e.target.value }))}
                    />
                  </div>
                  <div className="platform-profile-edit-field">
                    <Label htmlFor="nationality">Nationalité</Label>
                    <Input
                      id="nationality"
                      value={editForm.nationality}
                      onChange={(e) => setEditForm((p) => ({ ...p, nationality: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Modifier le mot de passe */}
      {passwordModalOpen && (
        <div className="modal-overlay" onClick={() => setPasswordModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '28rem' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Key className="planning-icon-md" />
                <h2 className="modal-title">Modifier le mot de passe</h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => setPasswordModalOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <div className="modal-form">
              <div className="modal-form-field">
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  Un e-mail contenant un lien de réinitialisation sera envoyé à votre adresse :{' '}
                  <strong>{currentUser?.email}</strong>
                </p>
              </div>
              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={() => setPasswordModalOpen(false)} disabled={passwordSending}>
                  Annuler
                </Button>
                <Button onClick={handleRequestPasswordReset} disabled={passwordSending}>
                  {passwordSending ? 'Envoi...' : 'Envoyer l\'e-mail'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="platform-profile-detail-row">
      <span className="platform-profile-detail-label">{label}</span>
      <span className="platform-profile-detail-value">{value || '-'}</span>
    </div>
  );
}

export default PlatformProfilePage;
