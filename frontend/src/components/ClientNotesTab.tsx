import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

interface ClientNotesTabProps {
  notes: any[];
  clientId: string;
  onRefresh: () => void | Promise<void>;
  onNoteCreated?: (note: any) => void;
}

export function ClientNotesTab({ notes: notesFromParent, clientId, onRefresh, onNoteCreated }: ClientNotesTabProps) {
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState<any[]>(notesFromParent);

  const loadNotes = useCallback(async () => {
    try {
      const notesData = await apiCall('/api/notes/');
      const notesArray = Array.isArray(notesData) ? notesData : ((notesData as any).notes ?? notesData ?? []);
      const clientNotes = notesArray
        .filter((n: any) => (n.clientId ?? n.client_id) === clientId)
        .sort((a: any, b: any) => {
          const dateA = new Date(a.created_at ?? a.createdAt ?? 0).getTime();
          const dateB = new Date(b.created_at ?? b.createdAt ?? 0).getTime();
          return dateB - dateA;
        });
      setNotes(clientNotes);
    } catch (err) {
      console.error('Error loading notes:', err);
    }
  }, [clientId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    const text = noteText.trim();
    if (!text) return;
    try {
      const created = await apiCall('/api/notes/create/', {
        method: 'POST',
        body: JSON.stringify({ text, clientId }),
      }) as any;
      toast.success('Note créée avec succès');
      setNoteText('');
      const raw = created?.document ?? created;
      const newNote = {
        id: raw?.id ?? `temp-${Date.now()}`,
        text: raw?.text ?? text,
        clientId: raw?.clientId ?? raw?.client_id ?? clientId,
        created_at: raw?.created_at ?? raw?.createdAt ?? new Date().toISOString(),
      };
      setNotes(prev => [newNote, ...prev]);
      onNoteCreated?.(newNote);
    } catch (error) {
      console.error('Error creating note:', error);
      toast.error('Erreur lors de la création de la note');
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Supprimer cette note ?')) return;
    
    try {
      await apiCall(`/api/notes/delete/${noteId}/`, { method: 'DELETE' });
      toast.success('Note supprimée avec succès');
      setNotes(prev => prev.filter(n => n.id !== noteId));
      onRefresh();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Erreur lors de la suppression de la note');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleCreateNote} className="space-y-3">
          <Label htmlFor="noteText">Ajouter une note</Label>
          <Textarea
            id="noteText"
            placeholder="Écrire une note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <Button type="submit" disabled={!noteText.trim()}>
            Ajouter la note
          </Button>
        </form>

        <div>
          <h3 className="text-sm font-medium mb-3">Notes du client</h3>
        {notes.length > 0 ? (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="flex items-center gap-2">
                <span className="text-sm text-slate-600 shrink-0">
                  {new Date(note.created_at || note.createdAt).toLocaleString('fr-FR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                <span className="flex-1 min-w-0">{note.text}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(note.id)}
                  className="text-red-600 text-sm shrink-0 hover:underline"
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Aucune note</p>
        )}
        </div>
      </CardContent>
    </Card>
  );
}

