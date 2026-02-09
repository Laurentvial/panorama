import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DateInput } from './ui/date-input';
import { Upload, X } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/Modal.css';
import '../styles/Clients.css';

interface EditPersonalInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: any;
  clientId: string;
  onUpdate: (updatedClient: any) => void;
}

export function EditPersonalInfoModal({
  isOpen,
  onClose,
  client,
  clientId,
  onUpdate
}: EditPersonalInfoModalProps) {
  const [editPersonalInfoForm, setEditPersonalInfoForm] = useState({
    civility: '',
    firstName: '',
    lastName: '',
    password: '',
    phone: '',
    mobile: '',
    email: '',
    birthDate: '',
    birthPlace: '',
    address: '',
    postalCode: '',
    city: '',
    nationality: '',
    successor: '',
    ribBankName: '',
    ribAccountHolder: '',
    ribBankCode: '',
    ribBranchCode: '',
    ribAccountNumber: '',
    ribKey: '',
    ribIban: '',
    ribBic: '',
    ribDomiciliation: '',
    profilePhoto: null as File | null,
    profilePhotoPreview: '' as string | null,
    removeProfilePhoto: false
  });

  // Initialize form when modal opens or client changes
  React.useEffect(() => {
    if (isOpen && client) {
      setEditPersonalInfoForm({
        civility: client.civility || '',
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        password: client.password || '',
        phone: client.phone || '',
        mobile: client.mobile || '',
        email: client.email || '',
        birthDate: client.birthDate || '',
        birthPlace: client.birthPlace || '',
        address: client.address || '',
        postalCode: client.postalCode || '',
        city: client.city || '',
        nationality: client.nationality || '',
        successor: client.successor || '',
        ribBankName: client.ribBankName || '',
        ribAccountHolder: client.ribAccountHolder || '',
        ribBankCode: client.ribBankCode || '',
        ribBranchCode: client.ribBranchCode || '',
        ribAccountNumber: client.ribAccountNumber || '',
        ribKey: client.ribKey || '',
        ribIban: client.ribIban || '',
        ribBic: client.ribBic || '',
        ribDomiciliation: client.ribDomiciliation || '',
        profilePhoto: null,
        profilePhotoPreview: client.profilePhoto || null,
        removeProfilePhoto: false
      });
    }
  }, [isOpen, client]);

  function handlePhotoChangeEdit(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Veuillez sélectionner un fichier image');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La taille du fichier ne doit pas dépasser 5MB');
        return;
      }
      
      setEditPersonalInfoForm({
        ...editPersonalInfoForm,
        profilePhoto: file,
        profilePhotoPreview: URL.createObjectURL(file),
        removeProfilePhoto: false // Reset remove flag when new photo is selected
      });
    }
  }

  async function handleUpdatePersonalInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    
    try {
      const payload: any = {
        civility: editPersonalInfoForm.civility || '',
        firstName: editPersonalInfoForm.firstName || '',
        lastName: editPersonalInfoForm.lastName || '',
        password: editPersonalInfoForm.password || '',
        phone: editPersonalInfoForm.phone || '',
        mobile: editPersonalInfoForm.mobile || '',
        email: editPersonalInfoForm.email || '',
        birthDate: editPersonalInfoForm.birthDate || '',
        birthPlace: editPersonalInfoForm.birthPlace || '',
        address: editPersonalInfoForm.address || '',
        postalCode: editPersonalInfoForm.postalCode || '',
        city: editPersonalInfoForm.city || '',
        nationality: editPersonalInfoForm.nationality || '',
        successor: editPersonalInfoForm.successor || '',
        ribBankName: editPersonalInfoForm.ribBankName || '',
        ribAccountHolder: editPersonalInfoForm.ribAccountHolder || '',
        ribBankCode: editPersonalInfoForm.ribBankCode || '',
        ribBranchCode: editPersonalInfoForm.ribBranchCode || '',
        ribAccountNumber: editPersonalInfoForm.ribAccountNumber || '',
        ribKey: editPersonalInfoForm.ribKey || '',
        ribIban: editPersonalInfoForm.ribIban || '',
        ribBic: editPersonalInfoForm.ribBic || '',
        ribDomiciliation: editPersonalInfoForm.ribDomiciliation || ''
      };

      let response;
      if (editPersonalInfoForm.profilePhoto) {
        // Use FormData for file upload
        const formDataToSend = new FormData();
        Object.keys(payload).forEach(key => {
          formDataToSend.append(key, payload[key]);
        });
        formDataToSend.append('profilePhoto', editPersonalInfoForm.profilePhoto);
        
        response = await apiCall(`/api/clients/${clientId}/`, {
          method: 'PATCH',
          body: formDataToSend
        });
      } else if (editPersonalInfoForm.removeProfilePhoto) {
        // Use FormData to send removeProfilePhoto flag
        const formDataToSend = new FormData();
        Object.keys(payload).forEach(key => {
          formDataToSend.append(key, payload[key]);
        });
        formDataToSend.append('removeProfilePhoto', 'true');
        
        response = await apiCall(`/api/clients/${clientId}/`, {
          method: 'PATCH',
          body: formDataToSend
        });
      } else {
        // Use JSON for regular update
        response = await apiCall(`/api/clients/${clientId}/`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      if (response?.client) {
        onUpdate(response.client);
        onClose();
        toast.success('Informations personnelles mises à jour avec succès');
      }
    } catch (error: any) {
      console.error('Error updating personal info:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour des informations');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '42rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 className="modal-title">Modifier les informations personnelles</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="modal-close"
            onClick={onClose}
          >
            <X className="planning-icon-md" />
          </Button>
        </div>
        <form onSubmit={handleUpdatePersonalInfo} className="modal-form">
          {/* Photo de profil */}
          <div className="modal-form-field">
            <Label>Photo de profil</Label>
            <div className="flex items-center gap-4">
              {(editPersonalInfoForm.profilePhotoPreview || (client?.profilePhoto && !editPersonalInfoForm.removeProfilePhoto)) ? (
                <div className="client-profile-photo-container">
                  <img 
                    src={editPersonalInfoForm.profilePhotoPreview || client?.profilePhoto} 
                    alt="Preview" 
                    className="client-profile-photo-preview"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditPersonalInfoForm({
                        ...editPersonalInfoForm,
                        profilePhoto: null,
                        profilePhotoPreview: null,
                        removeProfilePhoto: true
                      });
                    }}
                    className="client-profile-photo-remove-btn"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <div>
                <input
                  type="file"
                  id="editProfilePhoto"
                  accept="image/*"
                  onChange={handlePhotoChangeEdit}
                  className="hidden"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => document.getElementById('editProfilePhoto')?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {editPersonalInfoForm.profilePhoto ? 'Changer la photo' : 'Télécharger une photo'}
                </Button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div className="modal-form-field">
              <Label htmlFor="editCivility">Civilité</Label>
              <Select
                value={editPersonalInfoForm.civility}
                onValueChange={(value) => setEditPersonalInfoForm({ ...editPersonalInfoForm, civility: value })}
              >
                <SelectTrigger id="editCivility">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Monsieur">Monsieur</SelectItem>
                  <SelectItem value="Madame">Madame</SelectItem>
                  <SelectItem value="Mademoiselle">Mademoiselle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="modal-form-field">
              <Label htmlFor="editFirstName">Prénom</Label>
              <Input
                id="editFirstName"
                value={editPersonalInfoForm.firstName}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, firstName: e.target.value })}
                placeholder="Prénom du client"
              />
            </div>

            <div className="modal-form-field">
              <Label htmlFor="editLastName">Nom</Label>
              <Input
                id="editLastName"
                value={editPersonalInfoForm.lastName}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, lastName: e.target.value })}
                placeholder="Nom du client"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          </div>

          <div className="modal-form-field">
            <Label htmlFor="editPassword">Mot de passe</Label>
            <Input
              id="editPassword"
              value={editPersonalInfoForm.password}
              onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, password: e.target.value })}
              placeholder="Mot de passe"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div className="modal-form-field">
              <Label htmlFor="editPhone">Téléphone</Label>
              <Input
                id="editPhone"
                value={editPersonalInfoForm.phone}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, phone: e.target.value })}
                placeholder="Téléphone"
              />
            </div>

            <div className="modal-form-field">
              <Label htmlFor="editMobile">Portable</Label>
              <Input
                id="editMobile"
                value={editPersonalInfoForm.mobile}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, mobile: e.target.value })}
                placeholder="Portable"
              />
            </div>
          </div>

          <div className="modal-form-field">
            <Label htmlFor="editEmail">E-mail</Label>
            <Input
              id="editEmail"
              type="email"
              value={editPersonalInfoForm.email}
              onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, email: e.target.value })}
              placeholder="E-mail"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div className="modal-form-field">
              <Label htmlFor="editBirthDate">Date de naissance</Label>
              <DateInput
                id="editBirthDate"
                value={editPersonalInfoForm.birthDate}
                onChange={(value) => setEditPersonalInfoForm({ ...editPersonalInfoForm, birthDate: value })}
              />
            </div>

            <div className="modal-form-field">
              <Label htmlFor="editBirthPlace">Lieu de naissance</Label>
              <Input
                id="editBirthPlace"
                value={editPersonalInfoForm.birthPlace}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, birthPlace: e.target.value })}
                placeholder="Lieu de naissance"
              />
            </div>
          </div>

          <div className="modal-form-field">
            <Label htmlFor="editAddress">Adresse</Label>
            <Input
              id="editAddress"
              value={editPersonalInfoForm.address}
              onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, address: e.target.value })}
              placeholder="Adresse"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div className="modal-form-field">
              <Label htmlFor="editPostalCode">Code postal</Label>
              <Input
                id="editPostalCode"
                value={editPersonalInfoForm.postalCode}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, postalCode: e.target.value })}
                placeholder="Code postal"
              />
            </div>

            <div className="modal-form-field">
              <Label htmlFor="editCity">Ville</Label>
              <Input
                id="editCity"
                value={editPersonalInfoForm.city}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, city: e.target.value })}
                placeholder="Ville"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div className="modal-form-field">
              <Label htmlFor="editNationality">Nationalité</Label>
              <Input
                id="editNationality"
                value={editPersonalInfoForm.nationality}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, nationality: e.target.value })}
                placeholder="Nationalité"
              />
            </div>

            <div className="modal-form-field">
              <Label htmlFor="editSuccessor">Successeur</Label>
              <Input
                id="editSuccessor"
                value={editPersonalInfoForm.successor}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, successor: e.target.value })}
                placeholder="Successeur"
              />
            </div>
          </div>

          {/* RIB Section */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>RIB</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div className="modal-form-field">
                <Label htmlFor="editRibBankName">Banque</Label>
                <Input
                  id="editRibBankName"
                  value={editPersonalInfoForm.ribBankName}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribBankName: e.target.value })}
                  placeholder="Nom de la banque"
                />
              </div>

              <div className="modal-form-field">
                <Label htmlFor="editRibAccountHolder">Titulaire</Label>
                <Input
                  id="editRibAccountHolder"
                  value={editPersonalInfoForm.ribAccountHolder}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribAccountHolder: e.target.value })}
                  placeholder="Titulaire du compte"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
              <div className="modal-form-field">
                <Label htmlFor="editRibBankCode">Code banque</Label>
                <Input
                  id="editRibBankCode"
                  value={editPersonalInfoForm.ribBankCode}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribBankCode: e.target.value })}
                  placeholder="12345"
                  maxLength={5}
                />
              </div>

              <div className="modal-form-field">
                <Label htmlFor="editRibBranchCode">Code guichet</Label>
                <Input
                  id="editRibBranchCode"
                  value={editPersonalInfoForm.ribBranchCode}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribBranchCode: e.target.value })}
                  placeholder="12345"
                  maxLength={5}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
              <div className="modal-form-field">
                <Label htmlFor="editRibAccountNumber">N° compte</Label>
                <Input
                  id="editRibAccountNumber"
                  value={editPersonalInfoForm.ribAccountNumber}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribAccountNumber: e.target.value })}
                  placeholder="12345678901"
                  maxLength={11}
                />
              </div>

              <div className="modal-form-field">
                <Label htmlFor="editRibKey">Clé RIB</Label>
                <Input
                  id="editRibKey"
                  value={editPersonalInfoForm.ribKey}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribKey: e.target.value })}
                  placeholder="12"
                  maxLength={2}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
              <div className="modal-form-field">
                <Label htmlFor="editRibIban">IBAN</Label>
                <Input
                  id="editRibIban"
                  value={editPersonalInfoForm.ribIban}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribIban: e.target.value })}
                  placeholder="FR76 1234 5678 9012 3456 7890 123"
                  maxLength={34}
                />
              </div>

              <div className="modal-form-field">
                <Label htmlFor="editRibBic">BIC</Label>
                <Input
                  id="editRibBic"
                  value={editPersonalInfoForm.ribBic}
                  onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribBic: e.target.value })}
                  placeholder="ABCDEFGHIJK"
                  maxLength={11}
                />
              </div>
            </div>

            <div className="modal-form-field" style={{ marginTop: '1rem' }}>
              <Label htmlFor="editRibDomiciliation">Domiciliation</Label>
              <Input
                id="editRibDomiciliation"
                value={editPersonalInfoForm.ribDomiciliation}
                onChange={(e) => setEditPersonalInfoForm({ ...editPersonalInfoForm, ribDomiciliation: e.target.value })}
                placeholder="Domiciliation"
              />
            </div>
          </div>

          <div className="modal-form-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditPersonalInfoModal;

