import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Layers2, Trash2 } from 'lucide-react';
import { apiCall, clearApiCache } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useUser } from '../contexts/UserContext';
import '../styles/PageHeader.css';

type ExternalAssetDuplicateKind = 'alphaSymbol' | 'reference' | 'tradingView';

type ExternalAssetDuplicateGroup = {
  kind: ExternalAssetDuplicateKind;
  key: string;
  assets: any[];
};

const EXTERNAL_ASSET_DUPLICATE_KIND_LABELS: Record<ExternalAssetDuplicateKind, string> = {
  alphaSymbol: 'Symbole API (ticker)',
  reference: 'Référence',
  tradingView: 'Symbole TradingView',
};

function normalizeExternalAssetKey(value: string): string {
  return (value || '').trim().toUpperCase();
}

function buildExternalAssetDuplicateGroups(assets: any[]): ExternalAssetDuplicateGroup[] {
  const push = (map: Map<string, any[]>, key: string, asset: any) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(asset);
  };

  const byAlpha = new Map<string, any[]>();
  const byRef = new Map<string, any[]>();
  const byTv = new Map<string, any[]>();

  for (const a of assets) {
    const sym = normalizeExternalAssetKey(a.alphaVantageSymbol || '');
    if (sym) push(byAlpha, sym, a);
    const ref = normalizeExternalAssetKey(a.reference || '');
    if (ref) push(byRef, ref, a);
    const tv = normalizeExternalAssetKey(a.tradingViewSymbol || '');
    if (tv) push(byTv, tv, a);
  }

  const groups: ExternalAssetDuplicateGroup[] = [];
  const collect = (kind: ExternalAssetDuplicateKind, map: Map<string, any[]>) => {
    for (const [key, list] of map) {
      if (list.length > 1) groups.push({ kind, key, assets: list });
    }
  };
  collect('alphaSymbol', byAlpha);
  collect('reference', byRef);
  collect('tradingView', byTv);

  groups.sort((a, b) => {
    const byLabel = EXTERNAL_ASSET_DUPLICATE_KIND_LABELS[a.kind].localeCompare(
      EXTERNAL_ASSET_DUPLICATE_KIND_LABELS[b.kind],
      'fr'
    );
    if (byLabel !== 0) return byLabel;
    return a.key.localeCompare(b.key, 'fr', { sensitivity: 'base' });
  });

  return groups;
}

export function ExternalAssetDuplicatesPage() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const isAdmin = String(currentUser?.role || '').toLowerCase() === 'admin';

  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<any[]>([]);
  const [positionsCountByAssetId, setPositionsCountByAssetId] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);

  const duplicateGroups = useMemo(() => buildExternalAssetDuplicateGroups(assets), [assets]);
  const duplicateIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of duplicateGroups) for (const a of g.assets) s.add(String(a.id));
    return s;
  }, [duplicateGroups]);

  const loadAssets = useCallback(async () => {
    try {
      setLoading(true);
      const res: any = await apiCall('/api/assets/').catch(() => ({ assets: [] }));
      setAssets(res.assets || res || []);
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors du chargement des actifs');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPositionsCounts = useCallback(async (assetIds: string[]) => {
    if (assetIds.length === 0) {
      setPositionsCountByAssetId({});
      return;
    }
    try {
      const res: any = await apiCall('/api/assets/positions-count/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds }),
      });
      setPositionsCountByAssetId(res?.counts || {});
    } catch {
      // Non-blocking: still allow viewing duplicates if counts fail.
      setPositionsCountByAssetId({});
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    void loadPositionsCounts(Array.from(duplicateIds));
    // Clear selection whenever the underlying duplicate set changes
    setSelection(new Set());
  }, [duplicateIds, loadPositionsCounts]);

  const canSelectForDeletion = (assetId: string): boolean => {
    const n = positionsCountByAssetId[String(assetId)] || 0;
    return n === 0;
  };

  const toggleSelect = (assetId: string) => {
    if (!canSelectForDeletion(assetId)) {
      toast.info('Suppression désactivée: des positions sont liées à cet actif.');
      return;
    }
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const selectAllDeletable = () => {
    const next = new Set<string>();
    for (const id of duplicateIds) {
      if (canSelectForDeletion(id)) next.add(id);
    }
    setSelection(next);
    toast.success(`${next.size} actif(s) sélectionné(s) (sans positions liées).`);
  };

  const clearSelection = () => setSelection(new Set());

  const handleBulkDelete = async () => {
    const ids = Array.from(selection);
    if (ids.length === 0) {
      toast.info('Sélectionnez au moins un actif à supprimer');
      return;
    }
    if (
      !confirm(
        `Supprimer définitivement ${ids.length} actif(s) sélectionné(s) ? Les liaisons clients seront supprimées si nécessaire. Cette action est irréversible.`
      )
    ) {
      return;
    }
    setDeleting(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          await apiCall(`/api/assets/${id}/delete/`, { method: 'DELETE' });
          clearApiCache('/api/assets/');
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0) toast.success(`${ok} actif(s) supprimé(s)`);
      if (failed > 0) toast.error(`${failed} suppression(s) en échec`);
      setSelection(new Set());
      await loadAssets();
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingIndicator />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title-section">
          <h1 className="page-title">Doublons d’actifs externes</h1>
          <p className="page-subtitle">
            Comparaison insensible à la casse sur le symbole API (ticker), la référence et le symbole TradingView.
            Les actifs avec des positions liées affichent un compteur et ne sont pas supprimables ici.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/admin/manage/assets')}>
            Retour
          </Button>
          <Button variant="outline" onClick={() => void loadAssets()} disabled={loading}>
            <Layers2 className="w-4 h-4 mr-2" aria-hidden />
            Recalculer
          </Button>
        </div>
      </div>

      {duplicateGroups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Aucun doublon détecté</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">Aucune collision détectée sur les champs surveillés.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Résultats ({duplicateGroups.length} groupe(s))</CardTitle>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAllDeletable}>
                  Tout sélectionner (sans positions)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                  disabled={selection.size === 0}
                >
                  Effacer
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleBulkDelete()}
                  disabled={selection.size === 0 || deleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" aria-hidden />
                  {deleting ? 'Suppression…' : `Supprimer (${selection.size})`}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {duplicateGroups.map((group) => (
                <div key={`${group.kind}-${group.key}`} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-800">{EXTERNAL_ASSET_DUPLICATE_KIND_LABELS[group.kind]}</span>
                      <span className="font-mono text-slate-600">{group.key}</span>
                      <span className="text-slate-500">({group.assets.length} fiches)</span>
                    </div>
                  </div>

                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                    {group.assets.map((a) => {
                      const id = String(a.id);
                      const positionsCount = positionsCountByAssetId[id] ?? 0;
                      const deletionDisabled = !canSelectForDeletion(id);
                      return (
                        <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                          {isAdmin && (
                            <input
                              type="checkbox"
                              checked={selection.has(id)}
                              disabled={deletionDisabled}
                              onChange={() => toggleSelect(id)}
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Sélectionner ${a.name || id} pour suppression`}
                              title={
                                deletionDisabled
                                  ? `Suppression désactivée: ${positionsCount} position(s) liée(s)`
                                  : 'Sélectionner pour suppression'
                              }
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900">{a.name || '—'}</div>
                            <div className="text-xs text-slate-500">
                              ID {id}
                              {a.alphaVantageSymbol ? ` · ${a.alphaVantageSymbol}` : ''}
                              {a.reference ? ` · réf. ${a.reference}` : ''}
                              {a.tradingViewSymbol ? ` · TV ${a.tradingViewSymbol}` : ''}
                            </div>
                          </div>
                          <div className="shrink-0">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                positionsCount > 0
                                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                                  : 'border-slate-200 bg-slate-50 text-slate-700'
                              }`}
                              title="Nombre de positions liées à cet actif"
                            >
                              {positionsCount} position(s)
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

