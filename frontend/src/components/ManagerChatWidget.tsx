import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useUser } from '../contexts/UserContext';
import { Button } from './ui/button';
import { Input } from './ui/input';

type ChatMessage = {
  id: string;
  sender: 'client' | 'manager' | string;
  message: string;
  createdAt?: string;
};

interface ManagerChatWidgetProps {
  bottomOffsetPx?: number;
}

export function ManagerChatWidget({ bottomOffsetPx = 0 }: ManagerChatWidgetProps) {
  const { currentUser } = useUser();
  const clientId = currentUser?.id;
  const managerName = currentUser?.managerName || 'Votre gestionnaire';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const bottomCss = useMemo(() => {
    // Keep above bottom nav and cookie banner.
    return `calc(${bottomOffsetPx}px + var(--cookie-banner-height, 0px) + 16px)`;
  }, [bottomOffsetPx]);

  const canShow = Boolean(clientId) && (currentUser?.userType === 'client' || String(currentUser?.id || '').length > 0);

  async function loadMessages() {
    if (!clientId) return;
    setLoading(true);
    try {
      const data = await apiCall(`/api/clients/${clientId}/chat/`);
      setMessages((data?.messages || []) as ChatMessage[]);
    } catch (e) {
      console.error('Error loading chat messages:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadMessages();
    const interval = window.setInterval(() => loadMessages(), 10000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return;
    // Scroll to bottom when opening / receiving messages.
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [open, messages.length]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !clientId) return;
    setSending(true);
    try {
      const res = await apiCall(`/api/clients/${clientId}/chat/`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      const newMsg = res?.message as ChatMessage | undefined;
      setDraft('');
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
      } else {
        await loadMessages();
      }
    } catch (e) {
      console.error('Error sending chat message:', e);
    } finally {
      setSending(false);
    }
  }

  if (!canShow) return null;

  return (
    <div style={{ position: 'fixed', right: 16, bottom: bottomCss, zIndex: 350 }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le chat"
          style={{
            width: 52,
            height: 52,
            borderRadius: 9999,
            border: '1px solid rgba(2, 6, 23, 0.12)',
            background: 'white',
            boxShadow: '0 10px 24px rgba(2, 6, 23, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <MessageCircle size={22} />
        </button>
      ) : (
        <div
          style={{
            width: 320,
            maxWidth: 'calc(100vw - 32px)',
            height: 420,
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
          aria-label={`Chat avec ${managerName}`}
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
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {managerName}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Chat</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
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
                Envoyez un message à votre gestionnaire.
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            style={{
              padding: 12,
              borderTop: '1px solid rgba(2, 6, 23, 0.08)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              background: 'white',
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Votre message…"
              disabled={sending}
              style={{ height: 42, borderRadius: 12 }}
            />
            <Button type="submit" disabled={sending || !draft.trim()} style={{ height: 42, borderRadius: 12, padding: '0 12px' }}>
              <Send size={16} />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

