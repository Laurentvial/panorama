import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
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
  conversationId?: string | null;
};

type Conversation = {
  id: string;
  subject: string;
  lastMessageAt?: string | null;
  lastMessagePreview?: string;
};

type RequestItem = {
  id: string; // `${clientId}:${conversationId}`
  clientId: string;
  conversationId: string;
  clientName: string;
  subject: string;
  lastMessageAt?: string | null;
  lastMessagePreview?: string;
};

export function Messagerie() {
  const { currentUser } = useUser();
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
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

  const visibleClientIdsKey = useMemo(() => visibleClients.map((c) => c.id).join(','), [visibleClients]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedRequestId) || null,
    [requests, selectedRequestId],
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

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const conversationLists = await Promise.all(
        visibleClients.map(async (c) => {
          try {
            const data = await apiCall(`/api/clients/${c.id}/conversations/`);
            return { client: c, conversations: (data?.conversations || []) as Conversation[] };
          } catch (e) {
            console.error('Error loading conversations for client:', c.id, e);
            return { client: c, conversations: [] as Conversation[] };
          }
        }),
      );

      const all: RequestItem[] = conversationLists.flatMap(({ client, conversations }) => {
        const clientName =
          (client.fullName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email || client.id).trim();
        return conversations.map((conv) => ({
          id: `${client.id}:${conv.id}`,
          clientId: client.id,
          conversationId: conv.id,
          clientName,
          subject: conv.subject || 'Conversation',
          lastMessageAt: conv.lastMessageAt,
          lastMessagePreview: conv.lastMessagePreview,
        }));
      });

      all.sort((a, b) => {
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tb - ta;
      });

      setRequests(all);

      setSelectedRequestId((prev) => {
        if (prev && all.some((r) => r.id === prev)) return prev;
        return all.length > 0 ? all[0].id : '';
      });
    } catch (error) {
      console.error('Error loading requests:', error);
      setRequests([]);
      setSelectedRequestId('');
    } finally {
      setLoadingRequests(false);
    }
  }

  async function loadChat(clientId: string, conversationId: string) {
    setLoadingChat(true);
    try {
      const data = await apiCall(`/api/clients/${clientId}/conversations/${conversationId}/messages/`);
      setChatMessages((data?.messages || []) as ChatMessage[]);
    } catch (error) {
      console.error('Error loading chat:', error);
    } finally {
      setLoadingChat(false);
    }
  }

  async function sendChatMessage() {
    const text = draft.trim();
    if (!selectedRequest || !text) return;
    setSending(true);
    try {
      await apiCall(
        `/api/clients/${selectedRequest.clientId}/conversations/${selectedRequest.conversationId}/messages/`,
        {
          method: 'POST',
          body: JSON.stringify({ message: text }),
        },
      );
      setDraft('');
      // Always reload after send to avoid response-shape issues (admin/manager/client).
      await loadChat(selectedRequest.clientId, selectedRequest.conversationId);
      await loadRequests(); // keep ordering up-to-date
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
    // when visible clients set changes, reload requests
    if (loadingClients) return;
    if (!visibleClients.length) {
      setRequests([]);
      setSelectedRequestId('');
      setChatMessages([]);
      return;
    }
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingClients, visibleClientIdsKey]);

  useEffect(() => {
    if (!selectedRequest) {
      setChatMessages([]);
      return;
    }
    loadChat(selectedRequest.clientId, selectedRequest.conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequestId]);

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
          <p className="page-subtitle">Demandes clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await loadClients();
              await loadRequests();
            }}
            disabled={loadingClients || loadingRequests}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex items-center gap-2">
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4" style={{ minHeight: 560 }}>
            {/* Left: requests */}
            <div className="border rounded-lg bg-white" style={{ width: 360, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="px-3 py-2 border-b bg-slate-50 text-sm text-slate-600">
                {loadingRequests ? 'Chargement…' : `${requests.length} demande(s)`}
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {loadingClients || loadingRequests ? (
                  <div className="p-3 text-sm text-slate-500">Chargement…</div>
                ) : requests.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">Aucune demande.</div>
                ) : (
                  requests.map((r) => {
                    const isActive = r.id === selectedRequestId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSelectedRequestId(r.id);
                          setDraft('');
                          setChatMessages([]);
                        }}
                        className="w-full text-left px-3 py-3 border-b hover:bg-slate-50"
                        style={{
                          background: isActive ? 'rgba(2, 6, 23, 0.04)' : 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <div className="text-sm font-semibold text-slate-900 truncate">{r.clientName}</div>
                        <div className="text-xs text-slate-600 truncate">{r.subject}</div>
                        {r.lastMessagePreview ? (
                          <div className="text-xs text-slate-500 truncate mt-1">{r.lastMessagePreview}</div>
                        ) : (
                          <div className="text-xs text-slate-400 truncate mt-1">—</div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: conversation */}
            <div className="flex-1 border rounded-lg bg-white" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="px-3 py-2 border-b bg-slate-50 text-sm text-slate-700 truncate">
                {selectedRequest ? `${selectedRequest.clientName} — ${selectedRequest.subject}` : 'Sélectionnez une demande'}
              </div>

              <div ref={listRef} className="p-3 bg-slate-50" style={{ flex: 1, overflowY: 'auto' }}>
                {!selectedRequest ? (
                  <div className="text-sm text-slate-500">Sélectionnez une demande à gauche.</div>
                ) : loadingChat ? (
                  <div className="text-sm text-slate-500">Chargement…</div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-sm text-slate-500">Aucun message pour le moment.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {chatMessages.map((m) => {
                      // Treat any non-client sender as "us" (manager/admin).
                      const isMe = m.sender !== 'client';
                      return (
                        <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[80%]">
                            <div
                              className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                                isMe ? 'bg-primary text-primary-foreground' : 'bg-white border'
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
                className="p-3 border-t flex gap-2 items-end bg-white"
              >
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={selectedRequest ? 'Écrire un message…' : 'Sélectionnez une demande…'}
                  disabled={!selectedRequest || sending}
                  rows={2}
                />
                <Button type="submit" disabled={!selectedRequest || sending || !draft.trim()}>
                  <Send className="w-4 h-4 mr-2" />
                  Envoyer
                </Button>
                <Button type="button" variant="outline" onClick={() => loadRequests()} disabled={loadingRequests}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rafraîchir
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
