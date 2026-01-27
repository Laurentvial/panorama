import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { X } from "lucide-react";
import { apiCall } from "../utils/api";
import { toast } from "sonner";
import { useTeams } from "../hooks/useTeams";
import LoadingIndicator from "./LoadingIndicator";
import { Team } from "../types";
import "../styles/Modal.css";

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: () => void;
}

export function CreateUserModal({
  isOpen,
  onClose,
  onUserCreated,
}: CreateUserModalProps) {
  const { teams = [] as Team[], loading: teamsLoading } = useTeams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "admin",
    teamId: "",
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      setLoading(false);
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères");
      setLoading(false);
      return;
    }

    // Validate email is provided
    if (!formData.email) {
      setError("L'email est requis");
      setLoading(false);
      return;
    }

    try {
      const payload = new FormData();
      payload.append('email', formData.email);
      payload.append('password', formData.password);
      payload.append('first_name', formData.firstName);
      payload.append('last_name', formData.lastName);
      payload.append('phone', formData.phone || '');
      payload.append('role', formData.role);
      payload.append('teamId', formData.teamId || '');
      if (profilePhoto) {
        payload.append('profilePhoto', profilePhoto);
      }

      await apiCall("/api/users/create/", {
        method: 'POST',
        body: payload,
      });

      toast.success("Utilisateur créé avec succès");
      // Reset form
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        role: "admin",
        teamId: "",
      });
      setProfilePhoto(null);
      setProfilePhotoPreview(null);
      onClose();
      onUserCreated();
    } catch (err: any) {
      console.error("Create user error:", err);
      const data = err?.response?.data || {};
      const message =
        data.detail ||
        Object.values(data).flat().join(", ") ||
        "Une erreur est survenue lors de la création";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Créer un utilisateur</h2>
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
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-form-field">
            <Label>Photo (optionnel)</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {profilePhotoPreview ? (
                <img
                  src={profilePhotoPreview}
                  alt="Aperçu"
                  style={{ width: 56, height: 56, borderRadius: 9999, objectFit: 'cover', border: '1px solid #e5e7eb' }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 9999, background: '#f3f4f6', border: '1px solid #e5e7eb' }} />
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="file"
                  id="create-user-profilePhoto"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                      toast.error('Veuillez sélectionner une image');
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("L'image ne doit pas dépasser 5MB");
                      return;
                    }
                    setProfilePhoto(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setProfilePhotoPreview(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('create-user-profilePhoto')?.click()}
                >
                  {profilePhoto ? 'Changer la photo' : 'Importer une photo'}
                </Button>
                {profilePhoto && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setProfilePhoto(null);
                      setProfilePhotoPreview(null);
                      const input = document.getElementById('create-user-profilePhoto') as HTMLInputElement | null;
                      if (input) input.value = '';
                    }}
                  >
                    Retirer
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-firstName">Prénom</Label>
            <Input
              id="create-firstName"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              required
            />
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-lastName">Nom</Label>
            <Input
              id="create-lastName"
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              required
            />
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              placeholder="email@example.com"
            />
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-phone">Téléphone</Label>
            <Input
              id="create-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="+33 6 12 34 56 78"
            />
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-password">Mot de passe</Label>
            <Input
              id="create-password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
            />
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="create-confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  confirmPassword: e.target.value,
                })
              }
              required
            />
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-role">Rôle</Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData({ ...formData, role: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  Administrateur
                </SelectItem>
                <SelectItem value="teamleader">Chef d'équipe</SelectItem>
                <SelectItem value="gestionnaire">Gestionnaire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="modal-form-field">
            <Label htmlFor="create-teamId">Équipe (optionnel)</Label>
            <Select
              value={formData.teamId || "none"}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  teamId: value === "none" ? "" : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucune équipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune équipe</SelectItem>
                {teams &&
                  teams.length > 0 &&
                  teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {loading && <LoadingIndicator />}

          <div className="modal-form-actions">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
