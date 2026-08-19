import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Send, RefreshCw, Sparkles, Pencil, Trash2, Paperclip, X } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { useUser } from '../contexts/UserContext';
import { toast } from 'sonner';
import '../styles/PageHeader.css';
import '../styles/Messagerie.css';

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
  attachmentUrl?: string;
  attachmentName?: string;
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

const CONVERSATIONS_PAGE_SIZE = 10;

function mapInboxRequests(rawRequests: Array<Record<string, unknown>>): RequestItem[] {
  return rawRequests.map((item) => ({
    id: String(item.id),
    clientId: String(item.clientId),
    conversationId: String(item.conversationId),
    clientName: String(item.clientName || ''),
    subject: String(item.subject || 'Conversation'),
    lastMessageAt: (item.lastMessageAt as string | null | undefined) ?? null,
    lastMessagePreview: String(item.lastMessagePreview || ''),
  }));
}

export function Messagerie() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingMoreRequests, setLoadingMoreRequests] = useState(false);
  const [hasMoreRequests, setHasMoreRequests] = useState(false);
  const [totalRequests, setTotalRequests] = useState(0);
  const [inboxPage, setInboxPage] = useState(1);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [reformulating, setReformulating] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftAttachment, setDraftAttachment] = useState<File | null>(null);
  const [newConversationClientId, setNewConversationClientId] = useState('');
  const [newConversationSubject, setNewConversationSubject] = useState('');
  const [newConversationMessage, setNewConversationMessage] = useState('');
  const [newConversationAttachment, setNewConversationAttachment] = useState<File | null>(null);
  const [newConversationError, setNewConversationError] = useState('');
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

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
  const activeClientId = selectedRequest?.clientId || newConversationClientId || requestedClientId || '';

  async function loadClients() {
    setLoadingClients(true);
    try {
      const data = await apiCall('/api/clients/');
      const nextClients = (data?.clients || []) as Client[];
      setClients(nextClients);
      return nextClients;
    } catch (error) {
      console.error('Error loading clients:', error);
      return [] as Client[];
    } finally {
      setLoadingClients(false);
    }
  }

  async function loadRequests(options?: { reset?: boolean; page?: number }) {
    const reset = options?.reset !== false;
    const page = options?.page ?? (reset ? 1 : inboxPage);
    if (reset) {
      setLoadingRequests(true);
    } else {
      setLoadingMoreRequests(true);
    }
    try {
      const data = await apiCall(
        `/api/messaging/inbox/?page=${page}&limit=${CONVERSATIONS_PAGE_SIZE}`,
      );
      const all = mapInboxRequests((data?.requests || []) as Array<Record<string, unknown>>);
      const pagination = data?.pagination || {};

      setHasMoreRequests(Boolean(pagination.hasMore));
      setTotalRequests(Number(pagination.total || all.length));
      setInboxPage(page);

      setRequests((prev) => (reset
        ? all
        : [...prev, ...all.filter((item) => !prev.some((existing) => existing.id === item.id))]));

      if (reset) {
        setSelectedRequestId((prev) => {
          if (prev && all.some((r) => r.id === prev)) return prev;
          if (requestedMode === 'new' && requestedClientId) return '';
          return all.length > 0 ? all[0].id : '';
        });
      }
      return all;
    } catch (error) {
      console.error('Error loading requests:', error);
      if (reset) {
        setRequests([]);
        setSelectedRequestId('');
        setHasMoreRequests(false);
        setTotalRequests(0);
        setInboxPage(1);
      }
      return [] as RequestItem[];
    } finally {
      if (reset) {
        setLoadingRequests(false);
      } else {
        setLoadingMoreRequests(false);
      }
    }
  }

  async function loadMoreRequests() {
    if (loadingRequests || loadingMoreRequests || !hasMoreRequests) return;
    await loadRequests({ reset: false, page: inboxPage + 1 });
  }

  async function ensureRequestedConversationLoaded() {
    if (requestedMode === 'new') return;
    if (!requestedClientId || !requestedConversationId) return;
    const targetId = `${requestedClientId}:${requestedConversationId}`;
    if (requests.some((r) => r.id === targetId)) return;

    try {
      const data = await apiCall(`/api/clients/${requestedClientId}/conversations/`);
      const client = clients.find((c) => c.id === requestedClientId);
      const clientName =
        (client?.fullName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || client?.email || requestedClientId).trim();
      const conversations = (data?.conversations || []) as Conversation[];
      const targetConv = conversations.find((conv) => conv.id === requestedConversationId);
      if (!targetConv) return;

      const targetRequest: RequestItem = {
        id: targetId,
        clientId: requestedClientId,
        conversationId: requestedConversationId,
        clientName,
        subject: targetConv.subject || 'Conversation',
        lastMessageAt: targetConv.lastMessageAt,
        lastMessagePreview: targetConv.lastMessagePreview,
      };

      setRequests((prev) => (prev.some((r) => r.id === targetId) ? prev : [targetRequest, ...prev]));
      setSelectedRequestId(targetId);
    } catch (error) {
      console.error('Error loading requested conversation:', error);
    }
  }

  async function loadChat(clientId: string, conversationId: string) {
    setLoadingChat(true);
    try {
      const data = await apiCall(`/api/clients/${clientId}/conversations/${conversationId}/messages/`);
      setChatMessages((data?.messages || []) as ChatMessage[]);
      clearApiCache('/api/notifications/');
      clearApiCache('/api/notifications/unread-messages-count/');
      window.dispatchEvent(new CustomEvent('crm-messaging-read'));
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
      await loadRequests({ reset: true });
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
      await loadRequests({ reset: true });
    } catch (e) {
      console.error('Error deleting message:', e);
      setDeletingMessageId(null);
      alert('Erreur lors de la suppression.');
    }
  }

  async function sendChatMessage() {
    const text = draft.trim();
    if (!selectedRequest || (!text && !draftAttachment)) return;
    setSending(true);
    try {
      const payload = new FormData();
      payload.append('message', text);
      if (draftAttachment) {
        payload.append('attachment', draftAttachment);
      }
      const res = await apiCall(
        `/api/clients/${selectedRequest.clientId}/conversations/${selectedRequest.conversationId}/messages/`,
        {
          method: 'POST',
          body: payload,
        },
      );
      setDraft('');
      setDraftAttachment(null);
      // Invalider le cache pour forcer un rechargement frais
      clearApiCache(`/api/clients/${selectedRequest.clientId}/conversations/`);
      // Ajouter le nouveau message immédiatement (réponse API) ou recharger en secours
      const newMsg = res?.message as ChatMessage | undefined;
      if (newMsg) {
        setChatMessages((prev) => [...prev, newMsg]);
      } else {
        await loadChat(selectedRequest.clientId, selectedRequest.conversationId);
      }
      await loadRequests({ reset: true }); // met à jour l'ordre dans la liste
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
    if (!subject || (!message && !newConversationAttachment)) {
      setNewConversationError('Le sujet et le message ou la pièce jointe sont requis.');
      return;
    }
    setCreatingConversation(true);
    setNewConversationError('');
    try {
      const payload = new FormData();
      payload.append('subject', subject);
      payload.append('message', message);
      if (newConversationAttachment) {
        payload.append('attachment', newConversationAttachment);
      }
      const response = await apiCall(`/api/clients/${newConversationClientId}/conversations/`, {
        method: 'POST',
        body: payload,
      });

      clearApiCache(`/api/clients/${newConversationClientId}/conversations/`);
      const refreshedRequests = await loadRequests({ reset: true });
      const conversationId = response?.conversation?.id as string | undefined;
      const requestId =
        (conversationId && refreshedRequests.find((r) => r.id === `${newConversationClientId}:${conversationId}`)?.id) ||
        refreshedRequests.find((r) => r.clientId === newConversationClientId)?.id;

      if (requestId) {
        setSelectedRequestId(requestId);
        setChatMessages([]);
        setDraft('');
        setDraftAttachment(null);
      }
      if (conversationId) {
        clearNewConversationMode(newConversationClientId, conversationId);
      }
      setNewConversationSubject('');
      setNewConversationMessage('');
      setNewConversationAttachment(null);
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
    loadRequests({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loadingClients || loadingRequests) return;
    ensureRequestedConversationLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingClients, loadingRequests, requestedClientId, requestedConversationId, requestedMode, clients.length]);

  useEffect(() => {
    if (requestedMode !== 'new') {
      setNewConversationClientId('');
      setNewConversationError('');
      setNewConversationAttachment(null);
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
    setDraftAttachment(null);
    setNewConversationError('');
    setNewConversationClientId((previousClientId) => {
      if (previousClientId !== requestedClientId) {
        setNewConversationSubject('');
        setNewConversationMessage('');
        setNewConversationAttachment(null);
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
    setDraftAttachment(null);
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
    <div className="messagerie-page">
      <div className="page-header shrink-0">
        <div className="page-title-section">
          <h1 className="page-title">Messagerie</h1>
          <p className="page-subtitle">Demandes clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await loadClients();
              await loadRequests({ reset: true });
            }}
            disabled={loadingClients || loadingRequests || loadingMoreRequests}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      <Card className="messagerie-card">
        <CardContent className="messagerie-card-content">
          <div className="flex gap-4 messagerie-layout">
            {/* Left: requests */}
            <div className="border rounded-lg bg-white messagerie-conversations-panel">
              <div className="px-3 py-2 border-b bg-slate-50 text-sm text-slate-600 shrink-0">
                {loadingRequests
                  ? 'Chargement…'
                  : `${requests.length}${totalRequests > requests.length ? ` / ${totalRequests}` : ''} demande(s)`}
              </div>
              <div className="messagerie-conversations-list">
                {loadingRequests && requests.length === 0 ? (
                  <div className="p-3 flex items-center justify-center">
                    <LoadingIndicator />
                  </div>
                ) : requests.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">Aucune demande.</div>
                ) : (
                  <>
                  {requests.map((r) => {
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
                          setDraftAttachment(null);
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
                  })}
                  {hasMoreRequests && (
                    <div className="p-3 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={loadMoreRequests}
                        disabled={loadingMoreRequests || loadingRequests}
                      >
                        {loadingMoreRequests ? 'Chargement…' : 'Charger plus de conversations'}
                      </Button>
                    </div>
                  )}
                  </>
                )}
              </div>
            </div>

            {/* Right: conversation */}
            <div className="border rounded-lg bg-white messagerie-thread-panel">
              <div className="px-3 py-2 border-b bg-slate-50 text-sm text-slate-700 truncate shrink-0">
                {isNewConversationMode ? (
                  <>
                    <span>Nouveau message — </span>
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2 rounded px-1 -mx-1 transition-colors hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                      onClick={() => {
                        if (!activeClientId) return;
                        navigate(`/admin/clients/${activeClientId}`);
                      }}
                      disabled={!activeClientId}
                    >
                      {requestedClient?.fullName || `${requestedClient?.firstName || ''} ${requestedClient?.lastName || ''}`.trim() || requestedClient?.email || 'Client'}
                    </button>
                  </>
                ) : selectedRequest ? (
                  <>
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2 rounded px-1 -mx-1 transition-colors hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                      onClick={() => navigate(`/admin/clients/${selectedRequest.clientId}`)}
                    >
                      {selectedRequest.clientName}
                    </button>
                    <span>{` — ${selectedRequest.subject}`}</span>
                  </>
                ) : (
                  'Sélectionnez une demande'
                )}
              </div>

              <div ref={listRef} className="p-3 bg-slate-50 messagerie-thread-messages flex flex-col">
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
                                {m.message ? <div>{m.message}</div> : null}
                                {m.attachmentUrl && (
                                  <a
                                    href={m.attachmentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 mt-2 underline ${
                                      isMe ? 'text-white/90 hover:text-white' : 'text-blue-700 hover:text-blue-900'
                                    }`}
                                  >
                                    <Paperclip className="w-3 h-3" />
                                    <span>{m.attachmentName || 'Pièce jointe'}</span>
                                  </a>
                                )}
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
                  <div className="flex items-center gap-2">
                    <label className={`inline-flex items-center gap-2 text-sm ${!requestedClient || creatingConversation ? 'text-slate-400' : 'text-blue-700 cursor-pointer'}`}>
                      <input
                        type="file"
                        className="hidden"
                        disabled={!requestedClient || creatingConversation}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setNewConversationAttachment(file);
                          e.currentTarget.value = '';
                        }}
                      />
                      <Paperclip className="w-4 h-4" />
                      Joindre un fichier
                    </label>
                    {newConversationAttachment && (
                      <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700">
                        <span className="max-w-[220px] truncate">{newConversationAttachment.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewConversationAttachment(null)}
                          className="text-slate-500 hover:text-slate-700"
                          aria-label="Retirer le fichier"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="submit"
                      disabled={!requestedClient || creatingConversation || !newConversationSubject.trim() || (!newConversationMessage.trim() && !newConversationAttachment)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {creatingConversation ? 'Création…' : 'Créer la conversation'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => loadRequests({ reset: true })} disabled={loadingRequests || creatingConversation}>
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
                  className="p-3 border-t space-y-2 bg-white"
                >
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={selectedRequest ? 'Écrire un message…' : 'Sélectionnez une demande…'}
                    disabled={!selectedRequest || sending}
                    rows={2}
                  />
                  <div className="flex items-center gap-2">
                    <label className={`inline-flex items-center gap-2 text-sm ${!selectedRequest || sending ? 'text-slate-400' : 'text-blue-700 cursor-pointer'}`}>
                      <input
                        type="file"
                        className="hidden"
                        disabled={!selectedRequest || sending}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setDraftAttachment(file);
                          e.currentTarget.value = '';
                        }}
                      />
                      <Paperclip className="w-4 h-4" />
                      Joindre un fichier
                    </label>
                    {draftAttachment && (
                      <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700">
                        <span className="max-w-[220px] truncate">{draftAttachment.name}</span>
                        <button
                          type="button"
                          onClick={() => setDraftAttachment(null)}
                          className="text-slate-500 hover:text-slate-700"
                          aria-label="Retirer le fichier"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
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
                    <Button type="submit" disabled={!selectedRequest || sending || (!draft.trim() && !draftAttachment)}>
                      <Send className="w-4 h-4 mr-2" />
                      Envoyer
                    </Button>
                    <Button type="button" variant="outline" onClick={() => loadRequests({ reset: true })} disabled={loadingRequests}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Rafraîchir
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
