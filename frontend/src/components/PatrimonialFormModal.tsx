import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { X, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface PatrimonialFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
}

export function PatrimonialFormModal({ isOpen, onClose, onSave, initialData }: PatrimonialFormModalProps) {
  const [formData, setFormData] = useState({
    professionalActivityStatus: initialData?.professionalActivityStatus || '',
    professionalActivityComment: initialData?.professionalActivityComment || '',
    professions: initialData?.professions || [],
    professionsComment: initialData?.professionsComment || '',
    bankName: initialData?.bankName || '',
    currentAccount: initialData?.currentAccount || 0,
    livretAB: initialData?.livretAB || 0,
    pea: initialData?.pea || 0,
    pel: initialData?.pel || 0,
    ldd: initialData?.ldd || 0,
    cel: initialData?.cel || 0,
    csl: initialData?.csl || 0,
    securitiesAccount: initialData?.securitiesAccount || 0,
    lifeInsurance: initialData?.lifeInsurance || 0,
    savingsComment: initialData?.savingsComment || '',
    totalWealth: initialData?.totalWealth || 0,
    objectives: initialData?.objectives || [],
    objectivesComment: initialData?.objectivesComment || '',
    experience: initialData?.experience || [],
    experienceComment: initialData?.experienceComment || '',
    taxOptimization: initialData?.taxOptimization || false,
    taxOptimizationComment: initialData?.taxOptimizationComment || '',
    annualHouseholdIncome: initialData?.annualHouseholdIncome || 0,
  });

  const [newProfession, setNewProfession] = useState('');

  function addProfession() {
    if (newProfession.trim()) {
      setFormData({
        ...formData,
        professions: [...formData.professions, newProfession.trim()]
      });
      setNewProfession('');
    }
  }

  function removeProfession(index: number) {
    setFormData({
      ...formData,
      professions: formData.professions.filter((_, i) => i !== index)
    });
  }

  function toggleObjective(objective: string) {
    const objectives = formData.objectives.includes(objective)
      ? formData.objectives.filter(o => o !== objective)
      : [...formData.objectives, objective];
    setFormData({ ...formData, objectives });
  }

  function toggleExperience(exp: string) {
    const experience = formData.experience.includes(exp)
      ? formData.experience.filter(e => e !== exp)
      : [...formData.experience, exp];
    setFormData({ ...formData, experience });
  }

  function calculateTotalWealth() {
    const total = 
      (parseFloat(formData.currentAccount.toString()) || 0) +
      (parseFloat(formData.livretAB.toString()) || 0) +
      (parseFloat(formData.pea.toString()) || 0) +
      (parseFloat(formData.pel.toString()) || 0) +
      (parseFloat(formData.ldd.toString()) || 0) +
      (parseFloat(formData.cel.toString()) || 0) +
      (parseFloat(formData.csl.toString()) || 0) +
      (parseFloat(formData.securitiesAccount.toString()) || 0) +
      (parseFloat(formData.lifeInsurance.toString()) || 0);
    
    setFormData({ ...formData, totalWealth: total });
  }

  function handleSave() {
    calculateTotalWealth();
    onSave(formData);
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fiche patrimoniale</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Activité professionnelle */}
          <Card>
            <CardHeader>
              <CardTitle>Activité professionnelle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select
                  value={formData.professionalActivityStatus}
                  onValueChange={(value) => setFormData({ ...formData, professionalActivityStatus: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aucune">Aucune</SelectItem>
                    <SelectItem value="En activité">En activité</SelectItem>
                    <SelectItem value="Salarié(e)">Salarié(e)</SelectItem>
                    <SelectItem value="Entrepreneur">Entrepreneur</SelectItem>
                    <SelectItem value="Profession libérale">Profession libérale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea
                  value={formData.professionalActivityComment}
                  onChange={(e) => setFormData({ ...formData, professionalActivityComment: e.target.value })}
                  placeholder="Commentaire sur l'activité professionnelle"
                />
              </div>
            </CardContent>
          </Card>

          {/* Métiers */}
          <Card>
            <CardHeader>
              <CardTitle>Métiers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Métier(s)</Label>
                <div className="flex gap-2">
                  <Input
                    value={newProfession}
                    onChange={(e) => setNewProfession(e.target.value)}
                    placeholder="Ajouter un métier"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addProfession())}
                  />
                  <Button type="button" onClick={addProfession} size="icon">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.professions.map((profession, index) => (
                    <div key={index} className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full">
                      <span>{profession}</span>
                      <button
                        type="button"
                        onClick={() => removeProfession(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea
                  value={formData.professionsComment}
                  onChange={(e) => setFormData({ ...formData, professionsComment: e.target.value })}
                  placeholder="Commentaire sur les métiers"
                />
              </div>
            </CardContent>
          </Card>

          {/* Patrimoine */}
          <Card>
            <CardHeader>
              <CardTitle>Patrimoine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Banque</Label>
                <Input
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="Nom de la banque"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Compte courant (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.currentAccount}
                    onChange={(e) => setFormData({ ...formData, currentAccount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Livret A/B (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.livretAB}
                    onChange={(e) => setFormData({ ...formData, livretAB: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PEA (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.pea}
                    onChange={(e) => setFormData({ ...formData, pea: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PEL (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.pel}
                    onChange={(e) => setFormData({ ...formData, pel: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>LDD (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.ldd}
                    onChange={(e) => setFormData({ ...formData, ldd: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Épargne</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CEL (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.cel}
                      onChange={(e) => setFormData({ ...formData, cel: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CSL (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.csl}
                      onChange={(e) => setFormData({ ...formData, csl: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Compte titre (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.securitiesAccount}
                      onChange={(e) => setFormData({ ...formData, securitiesAccount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Assurance-vie (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.lifeInsurance}
                      onChange={(e) => setFormData({ ...formData, lifeInsurance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea
                  value={formData.savingsComment}
                  onChange={(e) => setFormData({ ...formData, savingsComment: e.target.value })}
                  placeholder="Commentaire sur l'épargne"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Total du patrimoine (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.totalWealth}
                  onChange={(e) => setFormData({ ...formData, totalWealth: parseFloat(e.target.value) || 0 })}
                  readOnly
                  className="bg-slate-50"
                />
                <Button type="button" variant="outline" size="sm" onClick={calculateTotalWealth}>
                  Calculer automatiquement
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Objectifs et expérience */}
          <Card>
            <CardHeader>
              <CardTitle>Objectifs et expérience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Objectifs</Label>
                <div className="flex flex-wrap gap-2">
                  {['Epargne', 'Fructifier', 'Succession'].map((obj) => (
                    <button
                      key={obj}
                      type="button"
                      onClick={() => toggleObjective(obj)}
                      className={`px-4 py-2 rounded-lg border ${
                        formData.objectives.includes(obj)
                          ? 'bg-blue-100 border-blue-500 text-blue-700'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}
                    >
                      {obj}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea
                  value={formData.objectivesComment}
                  onChange={(e) => setFormData({ ...formData, objectivesComment: e.target.value })}
                  placeholder="Commentaire sur les objectifs"
                />
              </div>
              <div className="space-y-2">
                <Label>Expérience</Label>
                <div className="flex flex-wrap gap-2">
                  {['Bourse', 'Livrets', 'Placements', 'Risque'].map((exp) => (
                    <button
                      key={exp}
                      type="button"
                      onClick={() => toggleExperience(exp)}
                      className={`px-4 py-2 rounded-lg border ${
                        formData.experience.includes(exp)
                          ? 'bg-blue-100 border-blue-500 text-blue-700'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}
                    >
                      {exp}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea
                  value={formData.experienceComment}
                  onChange={(e) => setFormData({ ...formData, experienceComment: e.target.value })}
                  placeholder="Commentaire sur l'expérience"
                />
              </div>
            </CardContent>
          </Card>

          {/* Informations financières */}
          <Card>
            <CardHeader>
              <CardTitle>Informations financières</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Défiscalisation</Label>
                <Select
                  value={formData.taxOptimization ? 'Oui' : 'Non'}
                  onValueChange={(value) => setFormData({ ...formData, taxOptimization: value === 'Oui' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Non">Non</SelectItem>
                    <SelectItem value="Oui">Oui</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea
                  value={formData.taxOptimizationComment}
                  onChange={(e) => setFormData({ ...formData, taxOptimizationComment: e.target.value })}
                  placeholder="Commentaire sur la défiscalisation"
                />
              </div>
              <div className="space-y-2">
                <Label>Revenu annuel du foyer (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.annualHouseholdIncome}
                  onChange={(e) => setFormData({ ...formData, annualHouseholdIncome: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="button" onClick={handleSave}>
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

