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
import api from "../utils/api";
import { toast } from "sonner";
import { useTeams } from "../hooks/useTeams";
import LoadingIndicator from "./LoadingIndicator";
import { Team } from "../types";
import "../styles/PlanningCalendar.css";

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
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "administrateur",
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

    try {
      // Map form data to Django API format
      await api.post("/api/users/create/", {
        username: formData.username,
        password: formData.password,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email || "",
        role: formData.role,
        teamId: formData.teamId || null,
      });

      toast.success("Utilisateur créé avec succès");
      // Reset form
      setFormData({
        firstName: "",
        lastName: "",
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "administrateur",
        teamId: "",
      });
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
    <div className="planning-modal-overlay" onClick={onClose}>
      <div className="planning-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="planning-modal-header">
          <h2 className="planning-modal-title">Créer un utilisateur</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="planning-modal-close"
            onClick={onClose}
          >
            <X className="planning-icon-md" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="planning-form">
          <div className="planning-form-field">
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

          <div className="planning-form-field">
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

          <div className="planning-form-field">
            <Label htmlFor="create-username">Username</Label>
            <Input
              id="create-username"
              type="text"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              required
            />
          </div>

          <div className="planning-form-field">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>

          <div className="planning-form-field">
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

          <div className="planning-form-field">
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

          <div className="planning-form-field">
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
                <SelectItem value="administrateur">
                  Administrateur
                </SelectItem>
                <SelectItem value="chef d'équipe">Chef d'équipe</SelectItem>
                <SelectItem value="gestionnaire">Gestionnaire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="planning-form-field">
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

          <div className="planning-form-actions">
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
