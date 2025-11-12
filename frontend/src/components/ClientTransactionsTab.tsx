import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, X } from 'lucide-react';
import '../styles/PlanningCalendar.css';

interface ClientTransactionsTabProps {
  transactions: any[];
  onRefresh: () => void;
}

export function ClientTransactionsTab({ transactions, onRefresh }: ClientTransactionsTabProps) {
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en attente'
  });

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      // TODO: Implement transactions endpoint
      console.warn('Transactions endpoint not yet implemented');
      setIsTransactionDialogOpen(false);
      setTransactionForm({ type: 'depot', amount: '', description: '', status: 'en attente' });
      onRefresh();
    } catch (error) {
      console.error('Error creating transaction:', error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setIsTransactionDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une transaction
        </Button>
      </div>

      {isTransactionDialogOpen && (
        <div className="planning-modal-overlay" onClick={() => setIsTransactionDialogOpen(false)}>
          <div className="planning-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="planning-modal-header">
              <h2 className="planning-modal-title">Nouvelle transaction</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="planning-modal-close"
                onClick={() => setIsTransactionDialogOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleCreateTransaction} className="planning-form">
              <div className="planning-form-field">
                <Label>Type</Label>
                <Select value={transactionForm.type} onValueChange={(value) => setTransactionForm({ ...transactionForm, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="depot">Dépôt</SelectItem>
                    <SelectItem value="retrait">Retrait</SelectItem>
                    <SelectItem value="bonus">Bonus</SelectItem>
                    <SelectItem value="achat">Achat</SelectItem>
                    <SelectItem value="vente">Vente</SelectItem>
                    <SelectItem value="interets">Intérêts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="planning-form-field">
                <Label>Montant (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                  required
                />
              </div>
              <div className="planning-form-field">
                <Label>Description</Label>
                <Textarea
                  value={transactionForm.description}
                  onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                />
              </div>
              <div className="planning-form-field">
                <Label>Statut</Label>
                <Select value={transactionForm.status} onValueChange={(value) => setTransactionForm({ ...transactionForm, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en attente">En attente</SelectItem>
                    <SelectItem value="validé">Validé</SelectItem>
                    <SelectItem value="confirmé">Confirmé</SelectItem>
                    <SelectItem value="terminé">Terminé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="planning-form-actions">
                <Button type="button" variant="outline" onClick={() => setIsTransactionDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">Créer</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Montant</th>
                    <th className="text-left py-2 px-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-slate-100">
                      <td className="py-2 px-3">
                        {new Date(transaction.createdAt).toLocaleDateString('fr-FR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-2 px-3 capitalize">{transaction.type}</td>
                      <td className="py-2 px-3">{transaction.amount?.toLocaleString('fr-FR')} €</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-1 bg-slate-100 rounded text-xs">
                          {transaction.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucune transaction</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

