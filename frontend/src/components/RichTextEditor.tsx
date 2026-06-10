import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Sparkles, List, ListOrdered, CornerDownLeft, Eraser, Search, Braces } from 'lucide-react';
import { toast } from 'sonner';
import { ProductVariablePickerModal } from './ProductVariablePickerModal';

interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  fixedHeight?: boolean;
  onGenerateAI?: () => Promise<string>;
  /** Affiché sous la barre d’outils après le 1er clic sur ✨ (contexte optionnel avant génération) */
  aiContextSlot?: React.ReactNode;
  /** id du champ contexte à focus à l’ouverture du panneau (évite les collisions entre écrans) */
  aiContextFocusFieldId?: string;
  /** Ouvre un sélecteur de variables plateforme quand l'utilisateur tape « { » */
  enableVariablePicker?: boolean;
}

export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  fixedHeight = false,
  onGenerateAI,
  aiContextSlot,
  aiContextFocusFieldId = 'ai-description-context',
  enableVariablePicker = false,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const variablePickerWrapRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showAiContextPanel, setShowAiContextPanel] = useState(false);
  const [showSearchReplacePanel, setShowSearchReplacePanel] = useState(false);
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [variableBracePos, setVariableBracePos] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');

  useEffect(() => {
    if (!showAiContextPanel) return;
    const focusId = aiContextFocusFieldId || 'ai-description-context';
    const id = window.setTimeout(() => {
      document.getElementById(focusId)?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [showAiContextPanel, aiContextFocusFieldId]);

  function insertAtCursor(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textBefore = value.substring(0, start);
    const textAfter = value.substring(end);
    const newValue = textBefore + text + textAfter;
    
    onChange(newValue);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }

  function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function countOccurrences(text: string, term: string) {
    if (!term) return 0;
    const regex = new RegExp(escapeRegExp(term), 'gi');
    return (text.match(regex) || []).length;
  }

  function insertLineBreak() {
    insertAtCursor('\n');
  }

  function insertBulletList() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lines = value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];
    const indent = currentLine.match(/^\s*/)?.[0] || '';
    
    insertAtCursor(`${indent}• `);
  }

  function removeEmptyLines() {
    const lines = value.split('\n');
    const cleaned = lines.filter((line) => line.trim() !== '');
    onChange(cleaned.join('\n'));
    if (lines.length !== cleaned.length) {
      toast.success(`${lines.length - cleaned.length} ligne(s) vide(s) supprimée(s)`);
    }
  }

  function replaceCurrentOccurrence() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const term = searchTerm;
    if (!term) {
      toast.error('Saisissez un texte a rechercher');
      return;
    }

    const currentStart = textarea.selectionStart;
    const currentEnd = textarea.selectionEnd;
    const selectedText = value.slice(currentStart, currentEnd);
    const normalizedTerm = term.toLocaleLowerCase();
    const normalizedValue = value.toLocaleLowerCase();

    if (selectedText.toLocaleLowerCase() === normalizedTerm) {
      const updatedValue =
        value.slice(0, currentStart) + replaceTerm + value.slice(currentEnd);
      onChange(updatedValue);
      const nextCursor = currentStart + replaceTerm.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      }, 0);
      toast.success('Occurrence remplacee');
      return;
    }

    let replaceIndex = -1;
    const containingIndex = normalizedValue.lastIndexOf(normalizedTerm, currentStart);
    if (containingIndex !== -1) {
      const containingEnd = containingIndex + term.length;
      if (currentStart >= containingIndex && currentStart <= containingEnd) {
        replaceIndex = containingIndex;
      }
    }

    if (replaceIndex === -1) {
      replaceIndex = normalizedValue.indexOf(normalizedTerm, currentEnd);
    }

    if (replaceIndex === -1) {
      toast.error('Aucune occurrence trouvee');
      return;
    }

    const updatedValue =
      value.slice(0, replaceIndex) + replaceTerm + value.slice(replaceIndex + term.length);
    onChange(updatedValue);
    const nextCursor = replaceIndex + replaceTerm.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    }, 0);
    toast.success('Occurrence remplacee');
  }

  function replaceAllOccurrences() {
    const term = searchTerm;
    if (!term) {
      toast.error('Saisissez un texte a rechercher');
      return;
    }

    const occurrences = countOccurrences(value, term);
    if (occurrences === 0) {
      toast.error('Aucune occurrence trouvee');
      return;
    }

    const regex = new RegExp(escapeRegExp(term), 'gi');
    onChange(value.replace(regex, () => replaceTerm));
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    toast.success(`${occurrences} occurrence(s) remplacee(s)`);
  }

  function insertNumberedList() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lines = value.substring(0, start).split('\n');
    const currentLine = lines[lines.length - 1];
    const indent = currentLine.match(/^\s*/)?.[0] || '';
    
    // Count numbered items before this line
    let number = 1;
    for (let i = lines.length - 2; i >= 0; i--) {
      const line = lines[i];
      const numberedMatch = line.match(/^\s*(\d+)\.\s/);
      if (numberedMatch) {
        number = parseInt(numberedMatch[1]) + 1;
        break;
      }
      if (line.trim() === '') break;
    }
    
    insertAtCursor(`${indent}${number}. `);
  }

  async function handleAiSparklesClick() {
    if (!onGenerateAI) {
      toast.error('Génération IA non disponible');
      return;
    }
    if (aiContextSlot && !showAiContextPanel) {
      setShowAiContextPanel(true);
      return;
    }
    await runGenerateAI();
  }

  async function runGenerateAI() {
    if (!onGenerateAI) {
      toast.error('Génération IA non disponible');
      return;
    }

    try {
      toast.loading('Génération en cours...', { id: 'ai-generate' });
      const generatedText = await onGenerateAI();
      
      if (generatedText) {
        // Toujours remplacer par le texte généré (génération from scratch ou amélioration)
        onChange(generatedText);
        toast.success('Texte généré avec succès', { id: 'ai-generate' });
      } else {
        toast.error('Aucun texte généré', { id: 'ai-generate' });
      }
    } catch (error: any) {
      console.error('Error generating AI text:', error);
      toast.error(error?.message || 'Erreur lors de la génération', { id: 'ai-generate' });
    }
  }

  function openVariablePicker(bracePos: number | null = null) {
    setVariableBracePos(bracePos);
    setShowVariablePicker(true);
  }

  function insertVariableToken(token: string) {
    const textarea = textareaRef.current;
    const bracePos = variableBracePos;

    if (textarea && bracePos !== null && value[bracePos] === '{') {
      const newValue = value.slice(0, bracePos) + token + value.slice(bracePos + 1);
      onChange(newValue);
      const nextCursor = bracePos + token.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    } else {
      insertAtCursor(token);
    }

    setShowVariablePicker(false);
    setVariableBracePos(null);
  }

  const handleVariablePickerOpenChange = useCallback((open: boolean) => {
    setShowVariablePicker(open);
    if (!open) {
      setVariableBracePos(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, []);

  useEffect(() => {
    if (!showVariablePicker) return;

    function handlePointerDown(event: MouseEvent) {
      const root = variablePickerWrapRef.current;
      if (!root || root.contains(event.target as Node)) return;
      handleVariablePickerOpenChange(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleVariablePickerOpenChange(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showVariablePicker, handleVariablePickerOpenChange]);

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      setShowSearchReplacePanel((current) => !current);
      return;
    }

    if (e.key === 'Escape' && showVariablePicker) {
      e.preventDefault();
      handleVariablePickerOpenChange(false);
      return;
    }

    if (enableVariablePicker && e.key === '{' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const textarea = e.currentTarget;
      openVariablePicker(textarea.selectionStart);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={insertLineBreak}
            title="Insérer un retour à la ligne"
            className="h-8 w-8 p-0"
          >
            <CornerDownLeft className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={insertBulletList}
            title="Insérer une liste à puces"
            className="h-8 w-8 p-0"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={insertNumberedList}
            title="Insérer une liste numérotée"
            className="h-8 w-8 p-0"
          >
            <ListOrdered className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removeEmptyLines}
            title="Supprimer les lignes vides"
            className="h-8 w-8 p-0"
          >
            <Eraser className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant={showSearchReplacePanel ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowSearchReplacePanel((current) => !current)}
            title="Afficher le panneau rechercher/remplacer (Ctrl+H)"
            className="h-8 w-8 p-0"
          >
            <Search className="w-4 h-4" />
          </Button>
          {enableVariablePicker && (
            <Button
              type="button"
              variant={showVariablePicker ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => openVariablePicker(null)}
              title="Insérer une variable dynamique (ou tapez « { »)"
              className="h-8 w-8 p-0"
            >
              <Braces className="w-4 h-4" />
            </Button>
          )}
          {onGenerateAI && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAiSparklesClick}
              title={
                aiContextSlot && !showAiContextPanel
                  ? "Afficher le contexte pour l'IA"
                  : "Générer avec l'IA"
              }
              className="h-8 w-8 p-0"
            >
              <Sparkles className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      {aiContextSlot && showAiContextPanel ? aiContextSlot : null}
      {showSearchReplacePanel ? (
        <div className="rounded-md border bg-slate-50 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher"
              aria-label="Rechercher"
            />
            <Input
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              placeholder="Remplacer par"
              aria-label="Remplacer par"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {searchTerm
                ? `${countOccurrences(value, searchTerm)} occurrence(s)`
                : 'Saisissez un terme a rechercher'}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={replaceCurrentOccurrence}>
                Remplacer
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={replaceAllOccurrences}>
                Tout remplacer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div ref={variablePickerWrapRef} className="flex items-stretch gap-3">
        <Textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder={placeholder}
          rows={rows}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`min-w-0 flex-1 font-mono text-sm whitespace-pre-wrap transition-all duration-200 overflow-y-auto ${
            fixedHeight ? 'h-40 resize-none field-sizing-fixed' : 'resize-y'
          } ${isFocused ? '' : ''}`}
        />
        {enableVariablePicker ? (
          <ProductVariablePickerModal
            open={showVariablePicker}
            onOpenChange={handleVariablePickerOpenChange}
            onSelect={insertVariableToken}
            className={fixedHeight ? 'h-40' : 'max-h-64 self-start'}
          />
        ) : null}
      </div>
    </div>
  );
}
