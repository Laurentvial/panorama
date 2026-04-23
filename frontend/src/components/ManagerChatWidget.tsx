import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, Send, X } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import { useUser } from '../contexts/UserContext';
import { useIsPhone } from './ui/use-mobile';
import { Button } from './ui/button';
import LoadingIndicator from './LoadingIndicator';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import '../styles/ManagerChatWidget.css';

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
  /** Page pleine (menu Messagerie) : mêmes listes et envoi que la bulle. */
  variant?: 'floating' | 'page';
}

type ManagerDaySchedule = { start: string; end: string };

const JS_DAY_INDEX_TO_KEY: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function todayDayKey(d = new Date()): string {
  return JS_DAY_INDEX_TO_KEY[d.getDay()] ?? 'monday';
}

function parseHHMMToMinutes(s: string | undefined): number | null {
  const t = (s && s.trim()) || '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** true if calendrier messagerie non renseigné; sinon aujourd’hui avec créneau et heure actuelle dans [start, end]. */
function isWithinMessengerAgenda(
  sched: Record<string, ManagerDaySchedule> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sched || typeof sched !== 'object') return true;
  const st = (x: string | undefined) => (x && x.trim()) || '';
  const hasConfiguredDay = Object.keys(sched).some((k) => {
    const v = sched[k] as ManagerDaySchedule | undefined;
    return v && st(v.start) && st(v.end);
  });
  if (!hasConfiguredDay) return true;

  const key = todayDayKey(now);
  const day = sched[key] as ManagerDaySchedule | undefined;
  if (!day) return false;
  const a = st(day.start);
  const b = st(day.end);
  if (!a || !b) return false;
  const startM = parseHHMMToMinutes(a);
  const endM = parseHHMMToMinutes(b);
  if (startM === null || endM === null) return false;
  const n = nowMinutes(now);
  if (endM < startM) {
    return n >= startM || n <= endM;
  }
  return n >= startM && n <= endM;
}

function mergeManagerAvailabilityFromResponse(data: { manager?: unknown } | null | undefined) {
  const asched = (data?.manager as { availabilitySchedule?: unknown } | null)?.availabilitySchedule;
  if (asched && typeof asched === 'object' && !Array.isArray(asched)) {
    return asched as Record<string, ManagerDaySchedule>;
  }
  return {};
}

export function ManagerChatWidget({ bottomOffsetPx = 0, variant = 'floating' }: ManagerChatWidgetProps) {
  const location = useLocation();
  const isPage = variant === 'page';
  const { currentUser } = useUser();
  const clientId = currentUser?.id;
  const managerNameFallback = currentUser?.managerName || 'Votre conseiller';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
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
  const [managerAvailability, setManagerAvailability] = useState<Record<string, ManagerDaySchedule>>({});
  /** null = not loaded yet; false = no CRM manager (managed_by). */
  const [hasAssignedManager, setHasAssignedManager] = useState<boolean | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  /** Re-tick périodiquement pour mettre à jour le point (passage d’un créneau / jour). */
  const [agendaTick, setAgendaTick] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const isPhone = useIsPhone();
  const effectiveOpen = isPage || open;
  const bottomCss = useMemo(() => {
    // Keep above bottom nav and cookie banner.
    return `calc(${bottomOffsetPx}px + var(--cookie-banner-height, 0px) + 16px)`;
  }, [bottomOffsetPx]);

  const canShow = Boolean(clientId) && (currentUser?.userType === 'client' || String(currentUser?.id || '').length > 0);

  const inMessengerWindow = useMemo(
    () => isWithinMessengerAgenda(managerAvailability, new Date()),
    // agendaTick: recalcul quand l’heure a pu changer
    [managerAvailability, agendaTick],
  );

  const statusDot = useMemo(() => {
    if (hasAssignedManager === false) {
      return { bg: '#9ca3af' as const, title: 'Aucun gestionnaire assigné' };
    }
    if (hasAssignedManager === null) {
      return { bg: '#9ca3af' as const, title: undefined as string | undefined };
    }
    if (!inMessengerWindow) {
      return {
        bg: '#9ca3af' as const,
        title:
          managerStatus === 'online'
            ? 'En ligne — hors plage du calendrier messagerie'
            : 'Hors plage du calendrier messagerie',
      };
    }
    if (managerStatus === 'online') return { bg: '#10b981' as const, title: 'En ligne' };
    if (managerStatus === 'away') return { bg: '#f59e0b' as const, title: 'Absent' };
    return { bg: '#9ca3af' as const, title: 'Déconnecté' };
  }, [hasAssignedManager, inMessengerWindow, managerStatus]);

  useEffect(() => {
    if (!effectiveOpen) return;
    const t = setInterval(() => setAgendaTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [effectiveOpen]);

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
      setHasAssignedManager(Boolean(data?.manager?.id));
      setManagerAvailability(mergeManagerAvailabilityFromResponse(data));

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

  async function fetchUnreadCount() {
    if (!clientId || currentUser?.userType !== 'client') return;
    clearApiCache('/api/client/messages');
    try {
      const data = await apiCall('/api/client/messages/unread-count/') as { unreadCount?: number };
      setUnreadMessagesCount(data?.unreadCount ?? 0);
    } catch {
      setUnreadMessagesCount(0);
    }
  }

  async function loadMessages(conversationId: string) {
    if (!clientId || !conversationId) return;
    setLoadingMessages(true);
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
      setHasAssignedManager(Boolean(data?.manager?.id));
      setManagerAvailability(mergeManagerAvailabilityFromResponse(data));
      // Rafraîchir le badge après consultation (le backend a marqué les messages comme lus)
      fetchUnreadCount();
    } catch (e) {
      console.error('Error loading conversation messages:', e);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    if (!effectiveOpen) return;
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOpen, clientId, view, selectedConversationId]);

  // Charger le nombre de messages non lus au montage
  useEffect(() => {
    if (clientId && currentUser?.userType === 'client') {
      fetchUnreadCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, currentUser?.userType]);

  // Polling pour le badge de nouveaux messages
  useEffect(() => {
    if (!clientId || currentUser?.userType !== 'client') return;
    const interval = setInterval(() => fetchUnreadCount(), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, currentUser?.userType]);

  // Preload manager photo/name/phone for the floating chat bubble.
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const data = await apiCall(`/api/clients/${clientId}/conversations/`);
        const m = data?.manager?.name?.trim();
        if (m) setManagerName(m);
        const photo = data?.manager?.profilePhoto;
        if (typeof photo === 'string') setManagerPhoto(photo);
        const phone = data?.manager?.phone;
        if (typeof phone === 'string') setManagerPhone(phone);
        setHasAssignedManager(Boolean(data?.manager?.id));
        setManagerAvailability(mergeManagerAvailabilityFromResponse(data));
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (!effectiveOpen) return;
    // Scroll to bottom when opening / receiving messages.
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [effectiveOpen, messages.length]);

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
          setLoadingMessages(true);
          setMessages([]);
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
  if (!isPage && location.pathname === '/platform/messaging') return null;

  const activeConversation = conversations.find((c) => c.id === selectedConversationId) || null;

  const goBackToSelect = async () => {
    setView('select');
    setMessages([]);
    setLoadingMessages(false);
    setDraft('');
    setNewSubject('');
    setNewMessage('');
    setShowNewRequestForm(false);
    await loadConversations();
  };

  const openChat = () => {
    setView('select');
    setMessages([]);
    setLoadingMessages(false);
    setDraft('');
    setNewSubject('');
    setNewMessage('');
    setShowNewRequestForm(false);
    setOpen(true);
  };

  return (
    <div
      className="managerChatWidget"
      style={
        isPage
          ? {
              width: '100%',
              maxWidth: '100%',
              margin: 0,
              position: 'relative',
              zIndex: 1,
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              alignSelf: 'stretch',
            }
          : {
              position: 'fixed',
              right: isPhone && !open ? 0 : isPhone ? 8 : 16,
              bottom: open ? bottomCss : isPhone ? undefined : bottomCss,
              top: !open && isPhone ? '50%' : undefined,
              transform: !open && isPhone ? 'translateY(-50%)' : undefined,
              zIndex: 600,
            }
      }
    >
      {isPage || open ? (
        <div
          style={{
            width: isPage ? '100%' : 400,
            maxWidth: isPage ? '100%' : 'calc(100vw - 32px)',
            height: isPage ? '100%' : 520,
            maxHeight: isPage ? 'none' : 'calc(100vh - 140px)',
            minHeight: isPage ? 0 : undefined,
            flex: isPage ? 1 : undefined,
            background: 'white',
            borderRadius: 16,
            border: '1px solid rgba(2, 6, 23, 0.10)',
            boxShadow: isPage ? '0 8px 24px rgba(2, 6, 23, 0.08)' : '0 24px 60px rgba(2, 6, 23, 0.18)',
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
              flexShrink: 0,
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
              {managerPhoto && (
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
                  <img
                    src={managerPhoto}
                    alt={managerName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => setManagerPhoto('')}
                  />
                </div>
              )}
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
                      backgroundColor: statusDot.bg,
                      flexShrink: 0,
                    }}
                    title={statusDot.title}
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
            {!isPage && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setView('select');
                  setMessages([]);
                  setLoadingMessages(false);
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
            )}
          </div>

          {view === 'select' ? (
            <div
              style={{
                flex: 1,
                minHeight: isPage ? 0 : undefined,
                overflowY: 'auto',
                padding: 12,
                background: 'rgba(2, 6, 23, 0.02)',
              }}
            >
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
                        className={isPage ? 'w-fit' : 'w-full'}
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
                            setLoadingMessages(true);
                            setMessages([]);
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
                  minHeight: isPage ? 0 : undefined,
                  overflowY: 'auto',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  background: 'rgba(2, 6, 23, 0.02)',
                }}
              >
                {loadingMessages ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
                    <LoadingIndicator />
                  </div>
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
                            fontSize: 14,
                            lineHeight: 1.4,
                          }}
                        >
                          {m.message}
                        </div>
                        {m.createdAt && (
                          <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af', textAlign: isMe ? 'right' : 'left' }}>
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
                  flexShrink: 0,
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
      ) : (
        isPhone ? (
          <button
            type="button"
            onClick={openChat}
            aria-label="Ouvrir la messagerie"
            title="Messagerie"
            style={{
              width: unreadMessagesCount > 0 ? 56 : 44,
              padding: '16px 10px',
              borderRadius: '14px 0 0 14px',
              border: '1px solid rgba(2, 6, 23, 0.12)',
              borderRight: 'none',
              background: 'white',
              boxShadow: '-4px 0 12px rgba(2, 6, 23, 0.08)',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              cursor: 'pointer',
              overflow: 'visible',
            }}
          >
            <ChevronLeft size={24} color="#374151" style={{ flexShrink: 0 }} />
            {unreadMessagesCount > 0 && (
              <span
                aria-label={`${unreadMessagesCount} nouveau(x) message(s)`}
                style={{
                  flexShrink: 0,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9999,
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={openChat}
            aria-label="Ouvrir le chat"
            style={{
              position: 'relative',
              width: managerPhoto ? 80 : 'auto',
              height: managerPhoto ? 80 : 'auto',
              minWidth: managerPhoto ? undefined : 140,
              padding: managerPhoto ? 0 : '12px 16px',
              borderRadius: managerPhoto ? 9999 : 16,
              border: '1px solid rgba(2, 6, 23, 0.12)',
              background: 'white',
              boxShadow: '0 10px 24px rgba(2, 6, 23, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              overflow: 'visible',
            }}
          >
            {unreadMessagesCount > 0 && (
              <span
                aria-label={`${unreadMessagesCount} nouveau(x) message(s)`}
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 9999,
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                }}
              >
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </span>
            )}
            {managerPhoto ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={managerPhoto}
                  alt={managerName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setManagerPhoto('')}
                />
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
                  Votre conseiller
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#111827',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 180,
                  }}
                >
                  {managerName}
                </div>
                {managerPhone && (
                  <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>
                    {managerPhone}
                  </div>
                )}
              </div>
            )}
          </button>
        )
      )}
    </div>
  );
}

