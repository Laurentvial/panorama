import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useTheme } from '../contexts/ThemeContext';
import {
  PRODUCT_TEXT_VARIABLES,
  getProductVariableValues,
} from '../constants/productTextVariables';

type ProductVariablePickerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (token: string) => void;
  className?: string;
};

function formatPreviewValue(value: string): string {
  if (!value) return 'Non renseigné';
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 80) return singleLine;
  return `${singleLine.slice(0, 77)}…`;
}

export function ProductVariablePickerModal({
  open,
  onOpenChange,
  onSelect,
  className = '',
}: ProductVariablePickerModalProps) {
  const { settings } = useTheme();
  const [filter, setFilter] = useState('');

  const valuesByKey = useMemo(() => getProductVariableValues(settings), [settings]);

  const filteredVariables = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return PRODUCT_TEXT_VARIABLES;
    return PRODUCT_TEXT_VARIABLES.filter((variable) => {
      const value = valuesByKey[variable.key] || '';
      return (
        variable.label.toLowerCase().includes(q) ||
        variable.key.toLowerCase().includes(q) ||
        variable.token.toLowerCase().includes(q) ||
        value.toLowerCase().includes(q)
      );
    });
  }, [filter, valuesByKey]);

  if (!open) return null;

  const handleClose = () => {
    setFilter('');
    onOpenChange(false);
  };

  return (
    <aside
      className={`flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${className}`}
      onMouseDown={(e) => e.preventDefault()}
      role="dialog"
      aria-label="Variables dynamiques"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Variables</p>
          <p className="text-xs text-slate-500">Paramètres plateforme</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={handleClose}
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b border-slate-100 px-3 py-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Rechercher…"
          aria-label="Filtrer les variables"
          className="h-8 text-sm"
          autoFocus
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredVariables.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">Aucune variable trouvée.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredVariables.map((variable) => {
              const rawValue = valuesByKey[variable.key] || '';
              const preview = formatPreviewValue(rawValue);
              const isEmpty = !rawValue;

              return (
                <li key={variable.key}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                    onClick={() => onSelect(variable.token)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-slate-900">{variable.label}</span>
                      <code className="w-fit rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-700">
                        {variable.token}
                      </code>
                    </div>
                    <p
                      className={`mt-1 text-[11px] leading-snug break-words ${
                        isEmpty ? 'italic text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {preview}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

export default ProductVariablePickerModal;
