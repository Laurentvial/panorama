import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Send, X } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useUser } from '../contexts/UserContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

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

interface ManagerChatWidgetProps {
  bottomOffsetPx?: number;
}

export function ManagerChatWidget({ bottomOffsetPx = 0 }: ManagerChatWidgetProps) {
  const { currentUser } = useUser();
  const clientId = currentUser?.id;
  const managerNameFallback = currentUser?.managerName || 'Votre conseiller';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'select' | 'thread'>('select');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showNewRequestForm, setShowNewRequestForm] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>('');
  const [managerName, setManagerName] = useState(managerNameFallback);
  const [managerPhoto, setManagerPhoto] = useState<string>('');
  const [managerStatus, setManagerStatus] = useState<'online' | 'away' | 'offline'>('offline');
  const [managerPhone, setManagerPhone] = useState<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const bottomCss = useMemo(() => {
    // Keep above bottom nav and cookie banner.
    return `calc(${bottomOffsetPx}px + var(--cookie-banner-height, 0px) + 16px)`;
  }, [bottomOffsetPx]);

  const canShow = Boolean(clientId) && (currentUser?.userType === 'client' || String(currentUser?.id || '').length > 0);

  async function loadConversations() {
    if (!clientId) return;
    setLoading(true);
    try {
      const data = await apiCall(`/api/clients/${clientId}/conversations/`);
      const convs = (data?.conversations || []) as Conversation[];
      setConversations(convs);
      const m = data?.manager?.name?.trim();
      if (m) setManagerName(m);
      const photo = data?.manager?.profilePhoto;
      if (typeof photo === 'string') setManagerPhoto(photo);
      const status = data?.manager?.status;
      if (status && ['online', 'away', 'offline'].includes(status)) {
        setManagerStatus(status);
      }
      const phone = data?.manager?.phone;
      if (typeof phone === 'string') setManagerPhone(phone);

      // Default selection: first conversation (often "legacy") if present.
      if (!selectedConversationId && convs.length > 0) {
        setSelectedConversationId(convs[0].id);
      }
    } catch (e) {
      console.error('Error loading conversations:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    if (!clientId || !conversationId) return;
    setLoading(true);
    try {
      const data = await apiCall(`/api/clients/${clientId}/conversations/${conversationId}/messages/`);
      setMessages((data?.messages || []) as ChatMessage[]);
      const subject = data?.conversation?.subject;
      if (subject && String(subject).trim()) {
        // Update manager name if provided.
        const m = data?.manager?.name?.trim();
        if (m) setManagerName(m);
      }
      const photo = data?.manager?.profilePhoto;
      if (typeof photo === 'string') setManagerPhoto(photo);
      const status = data?.manager?.status;
      if (status && ['online', 'away', 'offline'].includes(status)) {
        setManagerStatus(status);
      }
      const phone = data?.manager?.phone;
      if (typeof phone === 'string') setManagerPhone(phone);
    } catch (e) {
      console.error('Error loading conversation messages:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId, view, selectedConversationId]);

  // Preload manager photo/name for the floating chat bubble.
  useEffect(() => {
    if (!clientId) return;
    if (managerPhoto) return;
    // Best-effort: fetch manager meta once.
    (async () => {
      try {
        const data = await apiCall(`/api/clients/${clientId}/conversations/`);
        const m = data?.manager?.name?.trim();
        if (m) setManagerName(m);
        const photo = data?.manager?.profilePhoto;
        if (typeof photo === 'string') setManagerPhoto(photo);
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, managerPhoto]);

  useEffect(() => {
    if (!open) return;
    // Scroll to bottom when opening / receiving messages.
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [open, messages.length]);

  async function createNewRequest() {
    const subject = newSubject.trim();
    const text = newMessage.trim();
    if (!clientId || !subject || !text) return;
    setCreating(true);
    try {
      const res = await apiCall(`/api/clients/${clientId}/conversations/`, {
        method: 'POST',
        body: JSON.stringify({ subject, message: text }),
      });
      const createdConv = res?.conversation as Conversation | undefined;
      const firstMsg = res?.message as ChatMessage | undefined;
      setNewSubject('');
      setNewMessage('');
      setShowNewRequestForm(false);
      await loadConversations();
      if (createdConv?.id) {
        setSelectedConversationId(createdConv.id);
        setView('thread');
        if (firstMsg) {
          setMessages([firstMsg]);
        } else {
          await loadMessages(createdConv.id);
        }
      }
    } catch (e) {
      console.error('Error creating new request:', e);
    } finally {
      setCreating(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !clientId || !selectedConversationId) return;
    setSending(true);
    try {
      const res = await apiCall(`/api/clients/${clientId}/conversations/${selectedConversationId}/messages/`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      const newMsg = res?.message as ChatMessage | undefined;
      setDraft('');
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
      } else {
        await loadMessages(selectedConversationId);
      }
    } catch (e) {
      console.error('Error sending chat message:', e);
    } finally {
      setSending(false);
    }
  }

  if (!canShow) return null;

  const activeConversation = conversations.find((c) => c.id === selectedConversationId) || null;

  const goBackToSelect = async () => {
    setView('select');
    setMessages([]);
    setDraft('');
    setNewSubject('');
    setNewMessage('');
    setShowNewRequestForm(false);
    await loadConversations();
  };

  return (
    <div style={{ position: 'fixed', right: 16, bottom: bottomCss, zIndex: 350 }}>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setView('select');
            setMessages([]);
            setDraft('');
            setNewSubject('');
            setNewMessage('');
            setShowNewRequestForm(false);
            setOpen(true);
          }}
          aria-label="Ouvrir le chat"
          style={{
            width: 80,
            height: 80,
            borderRadius: 9999,
            border: '1px solid rgba(2, 6, 23, 0.12)',
            background: 'white',
            boxShadow: '0 10px 24px rgba(2, 6, 23, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          {managerPhoto ? (
            <img
              src={managerPhoto}
              alt={managerName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <MessageCircle size={36} />
          )}
        </button>
      ) : (
        <div
          style={{
            width: 400,
            maxWidth: 'calc(100vw - 32px)',
            height: 520,
            maxHeight: 'calc(100vh - 140px)',
            background: 'white',
            borderRadius: 16,
            border: '1px solid rgba(2, 6, 23, 0.10)',
            boxShadow: '0 24px 60px rgba(2, 6, 23, 0.18)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="dialog"
          aria-label={`Messagerie avec ${managerName}`}
        >
          <div
            style={{
              padding: '12px 12px',
              borderBottom: '1px solid rgba(2, 6, 23, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              {view === 'thread' && (
                <button
                  type="button"
                  onClick={goBackToSelect}
                  aria-label="Retour"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: '1px solid rgba(2, 6, 23, 0.10)',
                    background: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 9999,
                  background: '#f3f4f6',
                  border: '1px solid rgba(2, 6, 23, 0.10)',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {managerPhoto ? (
                  <img
                    src={managerPhoto}
                    alt={managerName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {managerName}
                  </div>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor:
                        managerStatus === 'online'
                          ? '#10b981'
                          : managerStatus === 'away'
                          ? '#f59e0b'
                          : '#9ca3af',
                      flexShrink: 0,
                    }}
                    title={
                      managerStatus === 'online'
                        ? 'En ligne'
                        : managerStatus === 'away'
                        ? 'Absent'
                        : 'Déconnecté'
                    }
                  />
                </div>
                {managerPhone && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    <a
                      href={`tel:${managerPhone.replace(/\s/g, '')}`}
                      style={{
                        color: '#2563eb',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>{managerPhone}</span>
                    </a>
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: managerPhone ? 2 : 0 }}>
                  {view === 'thread' ? (activeConversation?.subject || 'Conversation') : 'Messagerie'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setView('select');
                setMessages([]);
                setDraft('');
                setNewSubject('');
                setNewMessage('');
                setShowNewRequestForm(false);
              }}
              aria-label="Fermer"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: '1px solid rgba(2, 6, 23, 0.10)',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {view === 'select' ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: 'rgba(2, 6, 23, 0.02)' }}>
              {loading ? (
                <div style={{ fontSize: 13, color: '#6b7280' }}>Chargement…</div>
              ) : (
                <>
                  {!showNewRequestForm ? (
                    <div style={{ marginBottom: 12 }}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowNewRequestForm(true)}
                        className="w-full"
                      >
                        Nouvelle demande
                      </Button>
                    </div>
                  ) : (
                    <div
                      style={{
                        background: 'white',
                        border: '1px solid rgba(2, 6, 23, 0.10)',
                        borderRadius: 12,
                        padding: 10,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                        Nouvelle demande
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          createNewRequest();
                        }}
                        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                      >
                        <Input
                          value={newSubject}
                          onChange={(e) => setNewSubject(e.target.value)}
                          placeholder="Sujet…"
                          disabled={creating}
                          style={{ height: 42, borderRadius: 12 }}
                        />
                        <Textarea
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Votre message…"
                          disabled={creating}
                          rows={4}
                          style={{ borderRadius: 12 }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setShowNewRequestForm(false);
                              setNewSubject('');
                              setNewMessage('');
                            }}
                            disabled={creating}
                            className="flex-1"
                          >
                            Annuler
                          </Button>
                          <Button
                            type="submit"
                            disabled={creating || !newSubject.trim() || !newMessage.trim()}
                            className="flex-1"
                          >
                            Envoyer
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}

                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                    Conversations précédentes
                  </div>
                  {conversations.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#6b7280' }}>
                      Aucune conversation existante.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {conversations.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={async () => {
                            setSelectedConversationId(c.id);
                            setView('thread');
                            await loadMessages(c.id);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: 10,
                            borderRadius: 12,
                            border: '1px solid rgba(2, 6, 23, 0.10)',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                            {c.subject || 'Conversation'}
                          </div>
                          {c.lastMessagePreview ? (
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                              {c.lastMessagePreview}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div
                ref={listRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  background: 'rgba(2, 6, 23, 0.02)',
                }}
              >
                {loading ? (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Chargement…</div>
                ) : messages.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Aucun message pour le moment.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.sender === 'client';
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                        }}
                      >
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: 14,
                            background: isMe ? '#111827' : 'white',
                            color: isMe ? 'white' : '#111827',
                            border: isMe ? 'none' : '1px solid rgba(2, 6, 23, 0.10)',
                            whiteSpace: 'pre-wrap',
                            fontSize: 13,
                            lineHeight: 1.35,
                          }}
                        >
                          {m.message}
                        </div>
                        {m.createdAt && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af', textAlign: isMe ? 'right' : 'left' }}>
                            {new Date(m.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  padding: 10,
                  borderTop: '1px solid rgba(2, 6, 23, 0.08)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-end',
                  background: 'white',
                }}
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'flex-end' }}
                >
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Votre message…"
                    disabled={sending}
                    rows={2}
                    style={{ borderRadius: 12 }}
                  />
                  <Button type="submit" disabled={sending || !draft.trim()} style={{ height: 42, borderRadius: 12, padding: '0 16px' }}>
                    <Send size={16} />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

