import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Button } from './ui/button';
import { ExternalLink, Link2 } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { useIsMobile } from './ui/use-mobile';
import { logPlatformAction } from '../utils/platformLogger';
import '../styles/PlatformTypography.css';
import '../styles/PlatformUsefulLinks.css';

interface UsefulLink {
  id: string;
  name: string;
  url: string;
  description?: string;
  imageUrl?: string;
  image_url?: string; // fallback si l'API renvoie snake_case
  button?: string;
}

interface ClientUsefulLink {
  id: string;
  usefulLink?: UsefulLink;
  useful_link?: UsefulLink; // fallback si l'API renvoie snake_case
}

export function PlatformUsefulLinks() {
  const { currentUser } = useUser();
  const isMobile = useIsMobile();
  const [links, setLinks] = useState<ClientUsefulLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.id) {
      loadUsefulLinks();
    }
  }, [currentUser?.id]);

  async function loadUsefulLinks() {
    try {
      setLoading(true);
      // Use /api/client/useful-links/ which extracts client from token (évite déconnexion)
      const data = await apiCall('/api/client/useful-links/');
      setLinks((data as any).usefulLinks || []);
    } catch (error: any) {
      if (error?.isRedirecting || error?.status === 401) return;
      console.error('Error loading useful links:', error);
      toast.error('Erreur lors du chargement des liens utiles');
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }

  function handleLinkClick(link: UsefulLink) {
    logPlatformAction('click', { target: 'useful_link', usefulLinkId: link.id, usefulLinkName: link.name });
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return (
      <div className="platform-page" style={{ padding: isMobile ? '20px 16px' : '24px 24px' }}>
        <h1 className="platform-page-title">Liens utiles</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <span style={{ color: 'var(--muted-foreground)' }}>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="platform-page" style={{ padding: isMobile ? '20px 16px' : '24px 24px' }}>
      <h1 className="platform-page-title">Liens utiles</h1>
      <p style={{ color: 'var(--muted-foreground)', marginTop: '8px', marginBottom: '24px' }}>
        Accédez rapidement à vos ressources et documents utiles.
      </p>

      {links.length === 0 ? (
        <div className="platform-useful-links-empty">
          <Link2 size={48} className="platform-useful-links-empty-icon" />
          <p className="platform-useful-links-empty-title">
            Aucun lien utile disponible
          </p>
          <p className="platform-useful-links-empty-desc">
            Contactez votre gestionnaire pour accéder à des ressources supplémentaires.
          </p>
        </div>
      ) : (
        <div className="platform-useful-links-grid">
          {links
            .map((item) => ({ item, link: item.usefulLink ?? item.useful_link }))
            .filter(({ link }) => link != null)
            .map(({ item, link }) => (
              <article
                key={item.id}
                className="platform-useful-link-card"
                onClick={() => handleLinkClick(link)}
                role="button"
                tabIndex={0}
                aria-label={`Ouvrir ${link.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleLinkClick(link);
                  }
                }}
              >
                <div className={`platform-useful-link-icon${(link.imageUrl ?? link.image_url) ? ' platform-useful-link-icon--has-img' : ''}`}>
                  {(link.imageUrl ?? link.image_url) ? (
                    <img src={link.imageUrl ?? link.image_url} alt="" />
                  ) : (
                    <Link2 size={36} className="platform-useful-link-icon-placeholder" strokeWidth={1.5} />
                  )}
                </div>
                <div className="platform-useful-link-body">
                  <h3 className="platform-useful-link-title">{link.name}</h3>
                  {link.description && (
                    <p className="platform-useful-link-description">{link.description}</p>
                  )}
                  <Button
                    variant="default"
                    className="platform-useful-link-btn"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLinkClick(link);
                    }}
                  >
                    <ExternalLink size={16} style={{ marginRight: '8px' }} />
                    {link.button || 'Ouvrir le lien'}
                  </Button>
                </div>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
