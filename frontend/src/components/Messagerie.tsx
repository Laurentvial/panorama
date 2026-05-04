import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Send, RefreshCw, Sparkles, Pencil, Trash2 } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { useUser } from '../contexts/UserContext';
import { toast } from 'sonner';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [reformulating, setReformulating] = useState(false);
  const [draft, setDraft] = useState('');
  const [newConversationClientId, setNewConversationClientId] = useState('');
  const [newConversationSubject, setNewConversationSubject] = useState('');
  const [newConversationMessage, setNewConversationMessage] = useState('');
  const [newConversationError, setNewConversationError] = useState('');
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Backend /api/clients/ already filters by permissions (admin/teamleader/gestionnaire)
  const visibleClients = useMemo(() => clients, [clients]);
  const visibleClientIdsKey = useMemo(() => visibleClients.map((c) => c.id).join(','), [visibleClients]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedRequestId) || null,
    [requests, selectedRequestId],
  );
  const requestedClientId = searchParams.get('clientId') || '';
  const requestedConversationId = searchParams.get('conversationId') || '';
  const requestedMode = searchParams.get('mode') || '';
  const isNewConversationMode = requestedMode === 'new' && !!newConversationClientId;
  const requestedClient = useMemo(
    () => clients.find((c) => c.id === newConversationClientId) || null,
    [clients, newConversationClientId],
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
        if (requestedMode === 'new' && requestedClientId) return '';
        return all.length > 0 ? all[0].id : '';
      });
      return all;
    } catch (error) {
      console.error('Error loading requests:', error);
      setRequests([]);
      setSelectedRequestId('');
      return [] as RequestItem[];
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

  async function reformulateDraft() {
    const text = draft.trim();
    if (!text) return;
    setReformulating(true);
    try {
      const res = await apiCall('/api/messages/reformulate/', {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      const reformed = res?.text;
      if (reformed && typeof reformed === 'string') {
        setDraft(reformed);
      } else if (res?.error) {
        console.error('Reformulation error:', res.error);
        alert(res.error);
      }
    } catch (error) {
      console.error('Error reformulating message:', error);
      alert('Erreur lors de la reformulation.');
    } finally {
      setReformulating(false);
    }
  }

  async function updateMessage(messageId: string, newText: string) {
    if (!selectedRequest || !newText.trim()) return;
    try {
      await apiCall(
        `/api/clients/${selectedRequest.clientId}/conversations/${selectedRequest.conversationId}/messages/${messageId}/`,
        { method: 'PATCH', body: JSON.stringify({ message: newText.trim() }) },
      );
      setEditingMessageId(null);
      setEditingText('');
      clearApiCache(`/api/clients/${selectedRequest.clientId}/conversations/`);
      await loadChat(selectedRequest.clientId, selectedRequest.conversationId);
      await loadRequests();
    } catch (e) {
      console.error('Error updating message:', e);
      alert('Erreur lors de la modification.');
    }
  }

  async function deleteMessage(messageId: string) {
    if (!selectedRequest) return;
    if (!window.confirm('Supprimer ce message ?')) return;
    setDeletingMessageId(messageId);
    try {
      await apiCall(
        `/api/clients/${selectedRequest.clientId}/conversations/${selectedRequest.conversationId}/messages/${messageId}/`,
        { method: 'DELETE' },
      );
      setDeletingMessageId(null);
      clearApiCache(`/api/clients/${selectedRequest.clientId}/conversations/`);
      await loadChat(selectedRequest.clientId, selectedRequest.conversationId);
      await loadRequests();
    } catch (e) {
      console.error('Error deleting message:', e);
      setDeletingMessageId(null);
      alert('Erreur lors de la suppression.');
    }
  }

  async function sendChatMessage() {
    const text = draft.trim();
    if (!selectedRequest || !text) return;
    setSending(true);
    try {
      const res = await apiCall(
        `/api/clients/${selectedRequest.clientId}/conversations/${selectedRequest.conversationId}/messages/`,
        {
          method: 'POST',
          body: JSON.stringify({ message: text }),
        },
      );
      setDraft('');
      // Invalider le cache pour forcer un rechargement frais
      clearApiCache(`/api/clients/${selectedRequest.clientId}/conversations/`);
      // Ajouter le nouveau message immédiatement (réponse API) ou recharger en secours
      const newMsg = res?.message as ChatMessage | undefined;
      if (newMsg) {
        setChatMessages((prev) => [...prev, newMsg]);
      } else {
        await loadChat(selectedRequest.clientId, selectedRequest.conversationId);
      }
      await loadRequests(); // met à jour l'ordre dans la liste
    } catch (error) {
      console.error('Error sending chat message:', error);
    } finally {
      setSending(false);
    }
  }

  function clearNewConversationMode(clientId: string, conversationId: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('clientId', clientId);
    nextParams.set('conversationId', conversationId);
    nextParams.delete('mode');
    setSearchParams(nextParams, { replace: true });
  }

  async function createConversation() {
    const subject = newConversationSubject.trim();
    const message = newConversationMessage.trim();
    if (!newConversationClientId) {
      setNewConversationError('Client introuvable.');
      return;
    }
    if (!subject || !message) {
      setNewConversationError('Le sujet et le message sont requis.');
      return;
    }
    setCreatingConversation(true);
    setNewConversationError('');
    try {
      const response = await apiCall(`/api/clients/${newConversationClientId}/conversations/`, {
        method: 'POST',
        body: JSON.stringify({ subject, message }),
      });

      clearApiCache(`/api/clients/${newConversationClientId}/conversations/`);
      const refreshedRequests = await loadRequests();
      const conversationId = response?.conversation?.id as string | undefined;
      const requestId =
        (conversationId && refreshedRequests.find((r) => r.id === `${newConversationClientId}:${conversationId}`)?.id) ||
        refreshedRequests.find((r) => r.clientId === newConversationClientId)?.id;

      if (requestId) {
        setSelectedRequestId(requestId);
        setChatMessages([]);
        setDraft('');
      }
      if (conversationId) {
        clearNewConversationMode(newConversationClientId, conversationId);
      }
      setNewConversationSubject('');
      setNewConversationMessage('');
      setNewConversationClientId('');
      toast.success('Conversation créée avec succès.');
    } catch (error) {
      console.error('Error creating conversation:', error);
      setNewConversationError('Impossible de créer la conversation.');
      toast.error('Impossible de créer la conversation.');
    } finally {
      setCreatingConversation(false);
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
    if (requestedMode !== 'new') {
      setNewConversationClientId('');
      setNewConversationError('');
      return;
    }

    if (!requestedClientId) {
      setNewConversationClientId('');
      setNewConversationError('Client manquant pour créer une nouvelle conversation.');
      return;
    }

    const hasRequestedClient = clients.some((client) => client.id === requestedClientId);
    if (!loadingClients && clients.length > 0 && !hasRequestedClient) {
      setNewConversationClientId('');
      setNewConversationError('Le client demandé est introuvable.');
      return;
    }

    setSelectedRequestId('');
    setChatMessages([]);
    setDraft('');
    setNewConversationError('');
    setNewConversationClientId((previousClientId) => {
      if (previousClientId !== requestedClientId) {
        setNewConversationSubject('');
        setNewConversationMessage('');
      }
      return requestedClientId;
    });
  }, [requestedMode, requestedClientId, clients, loadingClients]);

  useEffect(() => {
    if (!requests.length) return;
    if (requestedMode === 'new') return;
    if (!requestedClientId || !requestedConversationId) return;

    const targetId = `${requestedClientId}:${requestedConversationId}`;
    if (!requests.some((r) => r.id === targetId)) return;
    if (selectedRequestId === targetId) return;

    setSelectedRequestId(targetId);
    setDraft('');
    setChatMessages([]);
  }, [requests, requestedClientId, requestedConversationId, selectedRequestId, requestedMode]);

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
                          if (requestedMode === 'new') {
                            clearNewConversationMode(r.clientId, r.conversationId);
                          }
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
                {isNewConversationMode
                  ? `Nouveau message — ${requestedClient?.fullName || `${requestedClient?.firstName || ''} ${requestedClient?.lastName || ''}`.trim() || requestedClient?.email || 'Client'}`
                  : selectedRequest
                    ? `${selectedRequest.clientName} — ${selectedRequest.subject}`
                    : 'Sélectionnez une demande'}
              </div>

              <div ref={listRef} className="p-3 bg-slate-50" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {isNewConversationMode ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">Nouveau message client</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {requestedClient
                          ? `${requestedClient.fullName || `${requestedClient.firstName || ''} ${requestedClient.lastName || ''}`.trim() || requestedClient.email || requestedClient.id}`
                          : 'Client introuvable'}
                      </div>
                    </div>
                    {newConversationError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {newConversationError}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">
                        Renseignez un sujet et un premier message pour créer la conversation.
                      </div>
                    )}
                  </div>
                ) : !selectedRequest ? (
                  <div className="text-sm text-slate-500">Sélectionnez une demande à gauche.</div>
                ) : loadingChat ? (
                  <div className="flex-1 flex items-center justify-center min-h-[200px]">
                    <LoadingIndicator />
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-sm text-slate-500">Aucun message pour le moment.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {chatMessages.map((m) => {
                      const isMe = m.sender !== 'client';
                      const isEditing = editingMessageId === m.id;
                      const isDeleting = deletingMessageId === m.id;
                      return (
                        <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[80%] group/message">
                            {isEditing ? (
                              <div className="px-3 py-2 rounded-xl bg-white border border-primary/30">
                                <Textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  rows={3}
                                  className="text-sm mb-2"
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingMessageId(null);
                                      setEditingText('');
                                    }}
                                  >
                                    Annuler
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => updateMessage(m.id, editingText)}
                                    disabled={!editingText.trim()}
                                  >
                                    Enregistrer
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                                  isMe ? 'bg-primary text-accent-foreground' : 'bg-white border'
                                }`}
                              >
                                {m.message}
                              </div>
                            )}
                            {!isEditing && (
                              <div className={`mt-1 flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {m.createdAt && (
                                  <span className="text-[11px] text-slate-400">
                                    {new Date(m.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                  </span>
                                )}
                                <div className="flex gap-1 ml-2 opacity-70 group-hover/message:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMessageId(m.id);
                                      setEditingText(m.message);
                                    }}
                                    className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                                    title="Modifier"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteMessage(m.id)}
                                    disabled={isDeleting}
                                    className="p-1 rounded hover:bg-red-100 text-slate-500 hover:text-red-600"
                                    title="Supprimer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {isNewConversationMode ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createConversation();
                  }}
                  className="p-3 border-t space-y-2 bg-white"
                >
                  <Input
                    value={newConversationSubject}
                    onChange={(e) => setNewConversationSubject(e.target.value)}
                    placeholder="Sujet du message"
                    disabled={!requestedClient || creatingConversation}
                  />
                  <Textarea
                    value={newConversationMessage}
                    onChange={(e) => setNewConversationMessage(e.target.value)}
                    placeholder="Votre message..."
                    rows={3}
                    disabled={!requestedClient || creatingConversation}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button type="submit" disabled={!requestedClient || creatingConversation || !newConversationSubject.trim() || !newConversationMessage.trim()}>
                      <Send className="w-4 h-4 mr-2" />
                      {creatingConversation ? 'Création…' : 'Créer la conversation'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => loadRequests()} disabled={loadingRequests || creatingConversation}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Rafraîchir
                    </Button>
                  </div>
                </form>
              ) : (
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      reformulateDraft();
                    }}
                    disabled={!draft.trim() || reformulating}
                    title="Reformuler et corriger le message avec l'IA"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {reformulating ? 'Reformulation…' : 'Reformuler'}
                  </Button>
                  <Button type="submit" disabled={!selectedRequest || sending || !draft.trim()}>
                    <Send className="w-4 h-4 mr-2" />
                    Envoyer
                  </Button>
                  <Button type="button" variant="outline" onClick={() => loadRequests()} disabled={loadingRequests}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Rafraîchir
                  </Button>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
