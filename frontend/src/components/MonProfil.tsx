import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../contexts/UserContext';
import { apiCall } from '../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { HiOutlineUser, HiOutlineCamera } from 'react-icons/hi';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import '../styles/PageHeader.css';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: { [key: string]: string } = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
};

/** Mon–Fri = travail, sam–dim = jour de repos (coche) — when API sends no schedule. */
const DEFAULT_WEEKDAY_SCHEDULE: { [key: string]: { start: string; end: string } } = {
  monday: { start: '09:00', end: '18:00' },
  tuesday: { start: '09:00', end: '18:00' },
  wednesday: { start: '09:00', end: '18:00' },
  thursday: { start: '09:00', end: '18:00' },
  friday: { start: '09:00', end: '18:00' },
};

function coalesceAvailabilitySchedule(
  s: { [key: string]: { start: string; end: string } } | null | undefined,
): { [key: string]: { start: string; end: string } } {
  if (s && Object.keys(s).length > 0) {
    return { ...s };
  }
  return { ...DEFAULT_WEEKDAY_SCHEDULE };
}

type ProfilePatchPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
  profilePhoto?: string;
  availabilitySchedule?: { [key: string]: { start: string; end: string } } | null;
};

function formStateFromUserDetailsPayload(data: ProfilePatchPayload) {
  const st = data.status;
  const status: 'online' | 'away' | 'offline' =
    st === 'online' || st === 'away' || st === 'offline' ? st : 'offline';
  return {
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
    status,
    availabilitySchedule: coalesceAvailabilitySchedule(data.availabilitySchedule),
  };
}

export function MonProfil() {
  const { currentUser, refreshUser } = useUser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'offline' as 'online' | 'away' | 'offline',
    availabilitySchedule: { ...DEFAULT_WEEKDAY_SCHEDULE },
  });
  
  const [profilePhoto, setProfilePhoto] = useState<string>('');
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);

  useEffect(() => {
    if (currentUser) {
      setFormData({
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        status: currentUser.status || 'offline',
        availabilitySchedule: coalesceAvailabilitySchedule(currentUser.availabilitySchedule),
      });
      setProfilePhoto(currentUser.profilePhoto || '');
    }
  }, [currentUser]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDayScheduleChange = (day: string, field: 'start' | 'end', value: string) => {
    // Ensure format is HH:MM (24h format)
    const timeValue = value.split(':').slice(0, 2).join(':');
    setFormData(prev => ({
      ...prev,
      availabilitySchedule: {
        ...prev.availabilitySchedule,
        [day]: {
          ...(prev.availabilitySchedule[day] || { start: '09:00', end: '18:00' }),
          [field]: timeValue,
        },
      },
    }));
  };

  const handleTimeSelectChange = (day: string, field: 'start' | 'end', hour: string, minute: string) => {
    const timeValue = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    setFormData(prev => ({
      ...prev,
      availabilitySchedule: {
        ...prev.availabilitySchedule,
        [day]: {
          ...(prev.availabilitySchedule[day] || { start: '09:00', end: '18:00' }),
          [field]: timeValue,
        },
      },
    }));
  };

  const handleDayOffToggle = (day: string, isOff: boolean) => {
    setFormData(prev => {
      const newSchedule = { ...prev.availabilitySchedule };
      if (isOff) {
        // Remove day from schedule when marked as off
        delete newSchedule[day];
      } else {
        // Add day with default times when not off
        newSchedule[day] = { start: '09:00', end: '18:00' };
      }
      return {
        ...prev,
        availabilitySchedule: newSchedule,
      };
    });
  };

  const isDayOff = (day: string) => {
    return !formData.availabilitySchedule[day];
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
      setProfilePhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('first_name', formData.firstName);
      formDataToSend.append('last_name', formData.lastName);
      formDataToSend.append('email', formData.email);
      formDataToSend.append('phone', formData.phone);
      formDataToSend.append('status', formData.status);
      formDataToSend.append('availabilitySchedule', JSON.stringify(formData.availabilitySchedule));
      
      if (profilePhotoFile) {
        formDataToSend.append('profilePhoto', profilePhotoFile);
      }

      const updated = (await apiCall('/api/user/profile/', {
        method: 'PATCH',
        body: formDataToSend,
        headers: {}, // Don't set Content-Type, browser will set it with boundary for FormData
      })) as ProfilePatchPayload;

      // Apply server response immediately (GET /user/current/ was cached; refreshUser is fixed too).
      setFormData(formStateFromUserDetailsPayload(updated));
      if (typeof updated.profilePhoto === 'string' && updated.profilePhoto.length > 0) {
        setProfilePhoto(updated.profilePhoto);
      } else {
        setProfilePhoto(currentUser?.profilePhoto || '');
      }
      setProfilePhotoFile(null);
      await refreshUser();
      toast.success('Profil mis à jour avec succès');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour du profil');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = () => {
    const firstName = formData.firstName || '';
    const lastName = formData.lastName || '';
    if (firstName || lastName) {
      return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
    }
    if (formData.email) {
      return formData.email[0].toUpperCase();
    }
    return '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <div
      className="mon-profil-container relative"
      style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}
    >
      {saving && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mon-profil-saving-panel flex min-w-[min(100vw-2rem,20rem)] flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card shadow-lg">
            <LoadingIndicator />
            <p className="m-0 w-full text-center text-sm font-medium text-foreground">Enregistrement en cours…</p>
          </div>
        </div>
      )}
      <div className="page-header-section">
        <h1 className="page-title">Mon Profil</h1>
        <p className="page-subtitle">Gérez vos informations personnelles et votre disponibilité</p>
      </div>

      <form onSubmit={handleSubmit} aria-busy={saving}>
        <div className="grid gap-6">
          {/* Informations personnelles */}
          <Card>
            <CardHeader>
              <CardTitle>Informations personnelles</CardTitle>
              <CardDescription>Modifiez vos informations de base</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Photo de profil — flex + gap inline (grid gap pouvait ne pas s’appliquer selon le parent) */}
              <div
                className="flex flex-row flex-nowrap items-center"
                style={{ gap: '2rem' }}
              >
                <div
                  className="relative shrink-0"
                  style={{ width: 72, minWidth: 72, maxWidth: 72, height: 72, flexShrink: 0 }}
                >
                  {/*
                    img global reset (index.css) sets height: auto + max-width: 100%, which
                    can stretch the parent into a tall non-square box; rounded-full then looks
                    like a vertical oval. Keep a fixed square container + explicit img sizing.
                  */}
                  <div
                    className="overflow-hidden rounded-full bg-muted"
                    style={{ width: 72, height: 72, aspectRatio: 1, flexShrink: 0 }}
                  >
                    {profilePhoto ? (
                      <img
                        src={profilePhoto}
                        alt={
                          [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim() ||
                          'Photo de profil'
                        }
                        decoding="async"
                        style={{
                          display: 'block',
                          width: 72,
                          height: 72,
                          maxWidth: 72,
                          minHeight: 72,
                          objectFit: 'cover',
                          objectPosition: 'center',
                        }}
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
                        style={{ width: 72, height: 72 }}
                      >
                        {getInitials() || <HiOutlineUser className="h-5 w-5" />}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 z-10 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors shadow-sm"
                    title="Changer la photo"
                  >
                    <HiOutlineCamera className="w-3 h-3" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </div>
                <div className="min-w-0" style={{ flex: '1 1 0', minWidth: 0 }}>
                  <p className="text-sm font-medium mb-1">Photo de profil</p>
                  <p className="text-sm text-muted-foreground mb-3">JPG, PNG ou GIF. Max 5 Mo</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2"
                  >
                    <HiOutlineCamera className="w-4 h-4" />
                    {profilePhoto ? 'Modifier la photo' : 'Ajouter une photo'}
                  </Button>
                </div>
              </div>

              {/* Nom et Prénom */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    required
                    placeholder="Votre prénom"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    required
                    placeholder="Votre nom"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                  placeholder="votre.email@example.com"
                />
              </div>

              {/* Téléphone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
            </CardContent>
          </Card>

          {/* Statut et disponibilité */}
          <Card>
            <CardHeader>
              <CardTitle>Statut et disponibilité</CardTitle>
              <CardDescription>Définissez votre statut et vos horaires de disponibilité pour le chat</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Statut */}
              <div className="space-y-2">
                <Label htmlFor="status">Statut d'activité</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'online' | 'away' | 'offline') => handleInputChange('status', value)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">En ligne</SelectItem>
                    <SelectItem value="away">Absent</SelectItem>
                    <SelectItem value="offline">Déconnecté</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Ce statut sera visible par vos clients dans le chat
                </p>
              </div>

              {/* Horaires de disponibilité */}
              <div className="space-y-4">
                <Label>Horaires de disponibilité</Label>
                <p className="text-sm text-muted-foreground">
                  Définissez vos heures de disponibilité pour chaque jour de la semaine (format 24h). Cochez les jours où vous ne travaillez pas.
                </p>
                <div className="space-y-3">
                  {DAYS.map((day) => {
                    const dayIsOff = isDayOff(day);
                    const schedule = formData.availabilitySchedule[day] || { start: '09:00', end: '18:00' };
                    const startTime = schedule.start.split(':');
                    const endTime = schedule.end.split(':');
                    const startHour = startTime[0] || '09';
                    const startMinute = startTime[1] || '00';
                    const endHour = endTime[0] || '18';
                    const endMinute = endTime[1] || '00';
                    
                    // Generate hour and minute options
                    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
                    const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
                    
                    return (
                      <div key={day} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={`day-off-${day}`}
                            checked={dayIsOff}
                            onCheckedChange={(checked) => handleDayOffToggle(day, checked === true)}
                          />
                          <Label 
                            htmlFor={`day-off-${day}`} 
                            className="text-sm font-medium cursor-pointer flex-1"
                          >
                            {DAY_LABELS[day]} {dayIsOff && <span className="text-muted-foreground">(Jour de repos)</span>}
                          </Label>
                        </div>
                        {!dayIsOff && (
                          <div className="grid grid-cols-[1fr_1fr] gap-4 items-center ml-7">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">De</Label>
                              <Select
                                value={startHour}
                                onValueChange={(value) => handleTimeSelectChange(day, 'start', value, startMinute)}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {hours.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-sm font-medium">:</span>
                              <Select
                                value={startMinute}
                                onValueChange={(value) => handleTimeSelectChange(day, 'start', startHour, value)}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {minutes.filter((_, i) => i % 5 === 0).map((m) => (
                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">À</Label>
                              <Select
                                value={endHour}
                                onValueChange={(value) => handleTimeSelectChange(day, 'end', value, endMinute)}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {hours.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-sm font-medium">:</span>
                              <Select
                                value={endMinute}
                                onValueChange={(value) => handleTimeSelectChange(day, 'end', endHour, value)}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {minutes.filter((_, i) => i % 5 === 0).map((m) => (
                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Boutons d'action */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                if (currentUser) {
                  setFormData({
                    firstName: currentUser.firstName || '',
                    lastName: currentUser.lastName || '',
                    email: currentUser.email || '',
                    phone: currentUser.phone || '',
                    status: currentUser.status || 'offline',
                    availabilitySchedule: coalesceAvailabilitySchedule(currentUser.availabilitySchedule),
                  });
                  setProfilePhoto(currentUser.profilePhoto || '');
                  setProfilePhotoFile(null);
                }
              }}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default MonProfil;
