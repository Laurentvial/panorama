import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { ACCESS_TOKEN } from '../utils/constants';
import { useIsMobile } from './ui/use-mobile';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { DateInput } from './ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import {
  ArrowLeft,
  X,
  Plus,
  Check,
  TrendingUp,
  Coins,
  Layers,
  DollarSign,
  Package,
  BarChart3,
  Briefcase,
  PiggyBank,
  Landmark,
  Gift,
  LifeBuoy,
  BadgePercent,
  Home,
  Wallet,
  Shield,
  Scale,
} from 'lucide-react';

type SexValue = '' | 'male' | 'female' | 'other';
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type PreferenceId =
  | 'stocks'
  | 'crypto'
  | 'etf'
  | 'currencies'
  | 'commodities'
  | 'indices';

const PREFERENCE_OPTIONS: Array<{
  id: PreferenceId;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'stocks', label: 'Actions', Icon: TrendingUp },
  { id: 'crypto', label: 'Cryptomonnaies', Icon: Coins },
  { id: 'etf', label: 'ETF', Icon: Layers },
  { id: 'currencies', label: 'Devises', Icon: DollarSign },
  { id: 'commodities', label: 'Matières premières', Icon: Package },
  { id: 'indices', label: 'Indices', Icon: BarChart3 },
];

export function PlatformAccountVerification() {
  const { currentUser, refreshUser } = useUser();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    sex: '' as SexValue,
    birthDate: '',
    address: '',
    postalCode: '',
    city: '',
  });
  const [preferences, setPreferences] = useState<PreferenceId[]>([]);
  const [tradingObjective, setTradingObjective] = useState('');
  const [plannedInvestment12m, setPlannedInvestment12m] = useState('');
  const [complianceFamilyFlags, setComplianceFamilyFlags] = useState<string[]>([]);
  const [fundsSources, setFundsSources] = useState<string[]>([]);
  const [primaryProfession, setPrimaryProfession] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [annualNetIncome, setAnnualNetIncome] = useState('');
  const [totalLiquidities, setTotalLiquidities] = useState('');

  // Use platform button variant (same as Login "Se connecter")

  const getClientAuth = (): { token: string; storage: Storage } | null => {
    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
    const sessionUserType = sessionStorage.getItem('userType');
    if (sessionToken && (sessionUserType === 'client' || sessionToken.startsWith('client_'))) {
      return { token: sessionToken, storage: sessionStorage };
    }

    const localToken = localStorage.getItem(ACCESS_TOKEN);
    const localUserType = localStorage.getItem('userType');
    if (localToken && (localUserType === 'client' || localToken.startsWith('client_'))) {
      return { token: localToken, storage: localStorage };
    }

    return null;
  };

  const patchClientIdentity = async (payload: Record<string, any>) => {
    const auth = getClientAuth();
    if (!auth) {
      toast.error('Veuillez vous reconnecter.');
      navigate('/login');
      throw new Error('Missing client auth');
    }

    // @ts-ignore - Vite environment variables
    const apiUrl = import.meta.env.VITE_URL || 'http://127.0.0.1:8000';
    const res = await fetch(`${apiUrl}/api/client/identity/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error || data?.detail || 'Erreur lors de l’enregistrement.';
      throw new Error(message);
    }

    if (data?.client) {
      auth.storage.setItem('clientData', JSON.stringify(data.client));
      auth.storage.setItem('userType', 'client');
    }

    return data;
  };

  useEffect(() => {
    if (!currentUser) return;
    const firstName = (currentUser.firstName || currentUser.fname || '').toString();
    const lastName = (currentUser.lastName || currentUser.lname || '').toString();
    const middleName = (currentUser.middleName || currentUser.middle_name || '').toString();
    const sex = ((currentUser.sex || '') as SexValue) || ('' as SexValue);
    const birthDate = (currentUser.birthDate || currentUser.birth_date || '').toString();
    const address = (currentUser.address || '').toString();
    const postalCode = (currentUser.postalCode || currentUser.postal_code || '').toString();
    const city = (currentUser.city || '').toString();
    const prefs = (currentUser.preferences || []) as any;
    const objective = (currentUser.tradingObjective || '').toString();
    const invest12m = (currentUser.plannedInvestment12m || '').toString();
    const compliance = (currentUser.complianceFamilyFlags || []) as any;
    const sources = (currentUser.fundsSources || []) as any;
    const profession = (currentUser.primaryProfession || '').toString();
    const employer = (currentUser.employerName || currentUser.employer_name || '').toString();
    const income = (currentUser.annualNetIncome || '').toString();
    const liquidities = (currentUser.totalLiquidities || '').toString();

    setForm((prev) => ({
      ...prev,
      firstName: prev.firstName || firstName,
      lastName: prev.lastName || lastName,
      middleName: prev.middleName || middleName,
      sex: prev.sex || sex,
      birthDate: prev.birthDate || birthDate,
      address: prev.address || address,
      postalCode: prev.postalCode || postalCode,
      city: prev.city || city,
    }));

    if (Array.isArray(prefs) && preferences.length === 0) {
      setPreferences(prefs as PreferenceId[]);
    }
    if (!tradingObjective && objective) setTradingObjective(objective);
    if (!plannedInvestment12m && invest12m) setPlannedInvestment12m(invest12m);
    if (Array.isArray(compliance) && complianceFamilyFlags.length === 0) setComplianceFamilyFlags(compliance as string[]);
    if (Array.isArray(sources) && fundsSources.length === 0) setFundsSources(sources as string[]);
    if (!primaryProfession && profession) setPrimaryProfession(profession);
    if (!employerName && employer) setEmployerName(employer);
    if (!annualNetIncome && income) setAnnualNetIncome(income);
    if (!totalLiquidities && liquidities) setTotalLiquidities(liquidities);
  }, [currentUser]);

  const progress = useMemo(() => {
    // Values inspired by screenshots
    if (step === 1) return { percent: 15, label: 'Identité' };
    if (step === 2) return { percent: 25, label: 'Adresse' };
    if (step === 3) return { percent: 30, label: 'Préférences' };
    if (step === 4) return { percent: 35, label: 'Objectifs' };
    if (step === 5) return { percent: 55, label: 'Conformité' };
    if (step === 6) return { percent: 65, label: 'Fonds' };
    return { percent: 85, label: 'Profil' };
  }, [step]);

  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const sex = form.sex;
    const birthDate = form.birthDate;

    if (!firstName || !lastName) {
      toast.error('Veuillez renseigner votre prénom et votre nom de famille.');
      return;
    }
    if (!sex) {
      toast.error('Veuillez sélectionner votre sexe.');
      return;
    }
    if (!birthDate) {
      toast.error('Veuillez renseigner votre date de naissance.');
      return;
    }

    try {
      setSubmitting(true);
      await patchClientIdentity({
        firstName,
        middleName: form.middleName.trim(),
        lastName,
        sex,
        birthDate,
      });

      await refreshUser();
      toast.success('Informations enregistrées.');
      setStep(2);
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const address = form.address.trim();
    const postalCode = form.postalCode.trim();
    const city = form.city.trim();

    if (!address) {
      toast.error('Veuillez renseigner votre adresse.');
      return;
    }
    if (!postalCode) {
      toast.error('Veuillez renseigner votre code postal.');
      return;
    }
    if (!city) {
      toast.error('Veuillez renseigner votre ville.');
      return;
    }

    try {
      setSubmitting(true);
      await patchClientIdentity({
        address,
        postalCode,
        city,
      });

      await refreshUser();
      toast.success('Adresse enregistrée.');
      setStep(3);
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreferencesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preferences.length === 0) {
      toast.error('Veuillez sélectionner au moins une préférence.');
      return;
    }

    try {
      setSubmitting(true);
      await patchClientIdentity({ preferences });
      await refreshUser();
      toast.success('Préférences enregistrées.');
      setStep(4);
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePreference = (id: PreferenceId) => {
    setPreferences((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleMulti = (value: string, setFn: React.Dispatch<React.SetStateAction<string[]>>) => {
    setFn((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  };

  const handleGoalsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradingObjective) {
      toast.error('Veuillez sélectionner votre objectif principal.');
      return;
    }
    if (!plannedInvestment12m) {
      toast.error('Veuillez sélectionner un montant prévu.');
      return;
    }
    try {
      setSubmitting(true);
      await patchClientIdentity({ tradingObjective, plannedInvestment12m });
      await refreshUser();
      setStep(5);
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplianceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (complianceFamilyFlags.length === 0) {
      toast.error('Veuillez répondre à la question de conformité.');
      return;
    }
    try {
      setSubmitting(true);
      await patchClientIdentity({ complianceFamilyFlags });
      await refreshUser();
      setStep(6);
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFundsSourcesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fundsSources.length === 0) {
      toast.error('Veuillez sélectionner au moins une source de fonds.');
      return;
    }
    try {
      setSubmitting(true);
      await patchClientIdentity({ fundsSources });
      await refreshUser();
      setStep(7);
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryProfession) {
      toast.error('Veuillez sélectionner votre profession.');
      return;
    }
    if (!employerName.trim()) {
      toast.error('Veuillez renseigner le nom de votre employeur.');
      return;
    }
    if (!annualNetIncome) {
      toast.error('Veuillez sélectionner votre revenu annuel net.');
      return;
    }
    if (!totalLiquidities) {
      toast.error('Veuillez sélectionner le montant de vos liquidités.');
      return;
    }
    try {
      setSubmitting(true);
      await patchClientIdentity({ primaryProfession, employerName: employerName.trim(), annualNetIncome, totalLiquidities });
      await refreshUser();
      toast.success('Informations enregistrées.');
      navigate('/platform');
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 7) setStep(6);
    else if (step === 6) setStep(5);
    else if (step === 5) setStep(4);
    else if (step === 4) setStep(3);
    else if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
    else navigate('/platform');
  };

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: 980, margin: '0 auto' }}>
      {/* Top progress header (inspired by screenshot) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button
          type="button"
          onClick={handleBack}
          aria-label="Retour"
          style={{ border: 'none', background: 'transparent', padding: 8, cursor: 'pointer' }}
        >
          <ArrowLeft size={22} />
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{progress.percent}% Terminer</div>
          <div style={{ width: '60%', maxWidth: 420, height: 3, backgroundColor: '#e5e7eb', borderRadius: 999 }}>
            <div style={{ width: `${progress.percent}%`, height: '100%', backgroundColor: '#22c55e', borderRadius: 999 }} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/platform')}
          aria-label="Fermer"
          style={{ border: 'none', background: 'transparent', padding: 8, cursor: 'pointer' }}
        >
          <X size={22} />
        </button>
      </div>

      <Card style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' }}>
        <CardHeader style={{ paddingBottom: 8 }}>
          <div className="platform-page-title">
            {step === 3
              ? 'Sélectionnez vos préférences pour personnaliser votre expérience'
              : step === 4
                ? 'Quel de ces énoncés décrit le mieux votre principal objectif de trading avec nous ?'
                : step === 5
                  ? 'Êtes-vous ou l’un de vos proches membres de la famille :'
                  : step === 6
                    ? 'Quelles sont vos principales sources de fonds ?'
                    : step === 7
                      ? 'Informations financières'
                      : 'Vérifier votre compte'}
          </div>
        </CardHeader>

        <CardContent style={{ paddingTop: 10 }}>
          {step === 1 ? (
            <form onSubmit={handleIdentitySubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="middleName">Deuxième prénom</Label>
                  <Input
                    id="middleName"
                    value={form.middleName}
                    onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                    placeholder="(optionnel)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom de famille</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sex">Quel est votre sexe ?</Label>
                  <Select value={form.sex} onValueChange={(value) => setForm({ ...form, sex: value as SexValue })}>
                    <SelectTrigger id="sex">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Homme</SelectItem>
                      <SelectItem value="female">Femme</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthDate">Quelle est votre date de naissance ?</Label>
                  <DateInput
                    id="birthDate"
                    value={form.birthDate}
                    onChange={(value) => setForm({ ...form, birthDate: value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
                <Button type="submit" disabled={submitting} variant="platform">
                  {submitting ? 'Enregistrement...' : 'Suivant'}
                </Button>
              </div>
            </form>
          ) : step === 2 ? (
            <form onSubmit={handleAddressSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Numéro et rue"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Code postal</Label>
                  <Input
                    id="postalCode"
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    placeholder="75001"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Ville</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Paris"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
                <Button type="submit" disabled={submitting} variant="platform">
                  {submitting ? 'Enregistrement...' : 'Suivant'}
                </Button>
              </div>
            </form>
          ) : step === 3 ? (
            <form onSubmit={handlePreferencesSubmit}>
              <div style={{ marginTop: 6 }}>
                {PREFERENCE_OPTIONS.map(({ id, label, Icon }) => {
                  const selected = preferences.includes(id);
                  return (
                    <div
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '18px 8px',
                        borderTop: '1px solid #eef2f7',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 26, display: 'flex', justifyContent: 'center' }}>
                          <Icon size={18} className="text-slate-600" />
                        </div>
                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => togglePreference(id)}
                        aria-label={selected ? 'Retirer' : 'Ajouter'}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '999px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: selected ? 'none' : '1px solid #cbd5e1',
                          backgroundColor: selected ? '#16a34a' : 'transparent',
                          color: selected ? '#fff' : '#0f172a',
                          cursor: 'pointer',
                        }}
                      >
                        {selected ? <Check size={18} /> : <Plus size={18} />}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
                <Button type="submit" disabled={submitting} variant="platform">
                  {submitting ? 'Enregistrement...' : 'Suivant'}
                </Button>
              </div>
            </form>
          ) : step === 4 ? (
            <form onSubmit={handleGoalsSubmit} className="space-y-10">
              {/* Objective */}
              <div>
                <div style={{ marginTop: 6 }}>
                  {[
                    { id: 'short_term', label: 'Rendements à court terme', Icon: TrendingUp },
                    { id: 'extra_income', label: 'Revenus supplémentaires', Icon: Wallet },
                    { id: 'future_planning', label: "Planification de l'avenir (éducation des enfants, retraite, etc.)", Icon: Home },
                    { id: 'save_house', label: 'Épargne pour une maison', Icon: Home },
                  ].map(({ id, label, Icon }) => {
                    const selected = tradingObjective === id;
                    return (
                      <div
                        key={id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '18px 8px',
                          borderTop: '1px solid #eef2f7',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 26, display: 'flex', justifyContent: 'center' }}>
                            <Icon size={18} className="text-slate-600" />
                          </div>
                          <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTradingObjective(id)}
                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: selected ? 'none' : '1px solid #cbd5e1',
                            backgroundColor: selected ? '#16a34a' : 'transparent',
                            color: selected ? '#fff' : '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          {selected ? <Check size={18} /> : <Plus size={18} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Planned investment */}
              <div>
                <div className="platform-page-title" style={{ marginTop: 18, fontSize: 'clamp(18px, 2vw, 22px)' }}>
                  Quel montant prévoyez–vous d’investir au cours des 12 prochains mois ?
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>au cours de cette année.</div>
                <div style={{ marginTop: 10 }}>
                  {[
                    'Au-delà de 1 million de $',
                    '500 000 $ – 1 million de $',
                    '200 000 $ – 500 000 $',
                    '50 000 $ – 200 000 $',
                    '10 000 $ – 50 000 $',
                    '10 000 $ ou moins',
                  ].map((label) => {
                    const selected = plannedInvestment12m === label;
                    return (
                      <div
                        key={label}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '18px 8px',
                          borderTop: '1px solid #eef2f7',
                        }}
                      >
                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>
                        <button
                          type="button"
                          onClick={() => setPlannedInvestment12m(label)}
                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: selected ? 'none' : '1px solid #cbd5e1',
                            backgroundColor: selected ? '#16a34a' : 'transparent',
                            color: selected ? '#fff' : '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          {selected ? <Check size={18} /> : <Plus size={18} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
                <Button type="submit" disabled={submitting} variant="platform">
                  {submitting ? 'Enregistrement...' : 'Suivant'}
                </Button>
              </div>
            </form>
          ) : step === 5 ? (
            <form onSubmit={handleComplianceSubmit} className="space-y-5">
              <div style={{ color: '#64748b', fontSize: 13 }}>Cela ne concerne pas la plupart des personnes.</div>
              {[
                { id: 'admin_or_shareholder_10pct', label: "Un administrateur ou un actionnaire à 10 % d'une société cotée en bourse.", Icon: BadgePercent },
                { id: 'brokerage_employee', label: 'Employé par une société de courtage ou une bourse de valeurs.', Icon: Scale },
                { id: 'public_official', label: 'Un responsable public de haut niveau, actuel ou ancien, élu ou nommé.', Icon: Shield },
                { id: 'none', label: "Aucune de ces options ne s'applique.", Icon: Check },
              ].map((o) => (
                <label key={o.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 6px' }}>
                  <Checkbox
                    checked={complianceFamilyFlags.includes(o.id)}
                    onCheckedChange={() => {
                      // Make "none" mutually exclusive
                      setComplianceFamilyFlags((prev) => {
                        if (o.id === 'none') return prev.includes('none') ? [] : ['none'];
                        const next = prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev.filter((x) => x !== 'none'), o.id];
                        return next;
                      });
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#0f172a' }}>{o.label}</div>
                  </div>
                </label>
              ))}

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
                <Button type="submit" disabled={submitting || complianceFamilyFlags.length === 0} variant="platform">
                  {submitting ? 'Enregistrement...' : 'Suivant'}
                </Button>
              </div>
            </form>
          ) : step === 6 ? (
            <form onSubmit={handleFundsSourcesSubmit}>
              <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                Votre réponse sera considérée comme la source de fonds pour vos investissements.
              </div>
              <div style={{ marginTop: 12 }}>
                {[
                  { id: 'salary', label: 'Salaire', Icon: Briefcase },
                  { id: 'investments', label: 'Investissements', Icon: TrendingUp },
                  { id: 'savings', label: 'Économies', Icon: PiggyBank },
                  { id: 'retirement', label: 'Retraite', Icon: Landmark },
                  { id: 'inheritance', label: 'Héritage', Icon: Gift },
                  { id: 'social_security', label: 'Carte de sécurité sociale', Icon: Shield },
                  { id: 'phone_assistance', label: 'Assistance téléphonique', Icon: LifeBuoy },
                  { id: 'severance', label: 'Indemnité de départ', Icon: BadgePercent },
                  { id: 'other', label: 'Autre', Icon: Plus },
                ].map(({ id, label, Icon }) => {
                  const selected = fundsSources.includes(id);
                  return (
                    <div
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '18px 8px',
                        borderTop: '1px solid #eef2f7',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 26, display: 'flex', justifyContent: 'center' }}>
                          <Icon size={18} className="text-slate-600" />
                        </div>
                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleMulti(id, setFundsSources)}
                        aria-label={selected ? 'Retirer' : 'Ajouter'}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '999px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: selected ? 'none' : '1px solid #cbd5e1',
                          backgroundColor: selected ? '#16a34a' : 'transparent',
                          color: selected ? '#fff' : '#0f172a',
                          cursor: 'pointer',
                        }}
                      >
                        {selected ? <Check size={18} /> : <Plus size={18} />}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
                <Button type="submit" disabled={submitting || fundsSources.length === 0} variant="platform">
                  {submitting ? 'Enregistrement...' : 'Suivant'}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleProfileSubmit} className="space-y-8">
              <div>
                <div className="platform-page-title" style={{ fontSize: 'clamp(18px, 2vw, 22px)' }}>
                  Quelle est votre profession principale ?
                </div>
                <div style={{ marginTop: 10 }}>
                  <Select value={primaryProfession} onValueChange={setPrimaryProfession}>
                    <SelectTrigger>
                      <SelectValue placeholder="Profession" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'Comptabilité',
                        'Agriculture',
                        'Architecture/Ingénierie',
                        'Défense/Armes',
                        'Arts/Design',
                        'BTP',
                        'Services informatiques',
                        'Conseil',
                        'Services de bourse et de change',
                      ].map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2" style={{ marginTop: 14 }}>
                  <Label htmlFor="employerName">Nom de votre employeur ?</Label>
                  <Input
                    id="employerName"
                    value={employerName}
                    onChange={(e) => setEmployerName(e.target.value)}
                    placeholder="Ex: Société ABC"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="platform-page-title" style={{ fontSize: 'clamp(18px, 2vw, 22px)' }}>
                  Quel est votre revenu annuel net après les dépenses ?
                </div>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>(en USD)</div>
                <div style={{ marginTop: 10 }}>
                  {[
                    'De 1 à 5 millions de dollars',
                    '500 000 $ – 1 million de dollars',
                    '200 000 $ – 500 000 $',
                    '50 000 $ – 200 000 $',
                    '10 000 $ – 50 000 $',
                    '10 000 $ ou moins',
                  ].map((label) => {
                    const selected = annualNetIncome === label;
                    return (
                      <div
                        key={label}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '18px 8px',
                          borderTop: '1px solid #eef2f7',
                        }}
                      >
                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>
                        <button
                          type="button"
                          onClick={() => setAnnualNetIncome(label)}
                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: selected ? 'none' : '1px solid #cbd5e1',
                            backgroundColor: selected ? '#16a34a' : 'transparent',
                            color: selected ? '#fff' : '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          {selected ? <Check size={18} /> : <Plus size={18} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="platform-page-title" style={{ fontSize: 'clamp(18px, 2vw, 22px)' }}>
                  Quel est le montant total de vos disponibilités et de vos liquidités ?
                </div>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                  Cela comprend les comptes d’épargne, les comptes de courtage, etc.
                </div>
                <div style={{ marginTop: 10 }}>
                  {[
                    'De 1 à 5 millions de dollars',
                    '500 000 $ – 1 million de dollars',
                    '200 000 $ – 500 000 $',
                    '50 000 $ – 200 000 $',
                    '10 000 $ – 50 000 $',
                    '10 000 $ ou moins',
                  ].map((label) => {
                    const selected = totalLiquidities === label;
                    return (
                      <div
                        key={label}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '18px 8px',
                          borderTop: '1px solid #eef2f7',
                        }}
                      >
                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>
                        <button
                          type="button"
                          onClick={() => setTotalLiquidities(label)}
                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: selected ? 'none' : '1px solid #cbd5e1',
                            backgroundColor: selected ? '#16a34a' : 'transparent',
                            color: selected ? '#fff' : '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          {selected ? <Check size={18} /> : <Plus size={18} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
                <Button
                  type="submit"
                  disabled={submitting || !primaryProfession || !employerName.trim() || !annualNetIncome || !totalLiquidities}
                  variant="platform"
                >
                  {submitting ? 'Enregistrement...' : 'Terminer la vérification'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

