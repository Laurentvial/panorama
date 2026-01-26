import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Send, RefreshCw, MessageCircle } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useUser } from '../contexts/UserContext';
import '../styles/PageHeader.css';

type Client = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  managerUserDetailsId?: string | null;
  managerName?: string;
};

type ChatMessage = {
  id: string;
  sender: 'client' | 'manager' | string;
  message: string;
  createdAt?: string;
};

export function Messagerie() {
  const { currentUser } = useUser();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';

  const visibleClients = useMemo(() => {
    if (isAdmin) return clients;
    const myUserDetailsId = currentUser?.id;
    if (!myUserDetailsId) return clients;
    return clients.filter((c) => c.managerUserDetailsId === myUserDetailsId);
  }, [clients, currentUser?.id, isAdmin]);

  const selectedClient = useMemo(
    () => visibleClients.find((c) => c.id === selectedClientId) || null,
    [visibleClients, selectedClientId],
  );

  async function loadClients() {
    setLoadingClients(true);
    try {
      const data = await apiCall('/api/clients/');
      setClients((data?.clients || []) as Client[]);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoadingClients(false);
    }
  }

  async function loadChat(clientId: string) {
    setLoadingChat(true);
    try {
      const data = await apiCall(`/api/clients/${clientId}/chat/`);
      setChatMessages((data?.messages || []) as ChatMessage[]);
    } catch (error) {
      console.error('Error loading chat:', error);
    } finally {
      setLoadingChat(false);
    }
  }

  async function sendChatMessage() {
    const clientId = selectedClientId;
    const text = draft.trim();
    if (!clientId || !text) return;
    setSending(true);
    try {
      const res = await apiCall(`/api/clients/${clientId}/chat/`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      const newMsg = res?.message as ChatMessage | undefined;
      setDraft('');
      if (newMsg) {
        setChatMessages((prev) => [...prev, newMsg]);
      } else {
        await loadChat(clientId);
      }
    } catch (error) {
      console.error('Error sending chat message:', error);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    loadChat(selectedClientId);
    const interval = window.setInterval(() => loadChat(selectedClientId), 10000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, [chatMessages.length]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title-section">
          <h1 className="page-title">Messagerie</h1>
          <p className="page-subtitle">Chat avec les clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadClients()} disabled={loadingClients}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Chat client
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="text-sm text-slate-600">Sélectionnez un client</div>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClients ? 'Chargement…' : 'Choisir un client'} />
              </SelectTrigger>
              <SelectContent>
                {visibleClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {(c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || c.id).trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedClient && (
              <div className="text-xs text-slate-500">
                Gestionnaire: {selectedClient.managerName || '—'}
              </div>
            )}
          </div>

          <div
            ref={listRef}
            className="border rounded-lg p-3 bg-slate-50"
            style={{ height: 420, overflowY: 'auto' }}
          >
            {!selectedClientId ? (
              <div className="text-sm text-slate-500">Choisissez un client pour afficher la conversation.</div>
            ) : loadingChat ? (
              <div className="text-sm text-slate-500">Chargement…</div>
            ) : chatMessages.length === 0 ? (
              <div className="text-sm text-slate-500">Aucun message pour le moment.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {chatMessages.map((m) => {
                  const isMe = m.sender === 'manager';
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%]`}>
                        <div
                          className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                            isMe ? 'bg-slate-900 text-white' : 'bg-white border'
                          }`}
                        >
                          {m.message}
                        </div>
                        {m.createdAt && (
                          <div className={`mt-1 text-[11px] text-slate-400 ${isMe ? 'text-right' : 'text-left'}`}>
                            {new Date(m.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendChatMessage();
            }}
            className="flex gap-2"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={selectedClientId ? 'Écrire un message…' : 'Sélectionnez un client…'}
              disabled={!selectedClientId || sending}
            />
            <Button type="submit" disabled={!selectedClientId || sending || !draft.trim()}>
              <Send className="w-4 h-4 mr-2" />
              Envoyer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectedClientId && loadChat(selectedClientId)}
              disabled={!selectedClientId || loadingChat}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Rafraîchir
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
