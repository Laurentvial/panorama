import React, { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Sparkles, List, ListOrdered, CornerDownLeft, Eraser } from 'lucide-react';
import { toast } from 'sonner';

interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  onGenerateAI?: () => Promise<string>;
}

export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  onGenerateAI
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

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

  async function handleGenerateAI() {
    if (!onGenerateAI) {
      toast.error('Génération IA non disponible');
      return;
    }

    try {
      toast.loading('Génération en cours...', { id: 'ai-generate' });
      const generatedText = await onGenerateAI();
      
      if (generatedText) {
        const currentValue = value.trim();
        const newValue = currentValue 
          ? `${currentValue}\n\n${generatedText}`
          : generatedText;
        onChange(newValue);
        toast.success('Texte généré avec succès', { id: 'ai-generate' });
      } else {
        toast.error('Aucun texte généré', { id: 'ai-generate' });
      }
    } catch (error: any) {
      console.error('Error generating AI text:', error);
      toast.error(error?.message || 'Erreur lors de la génération', { id: 'ai-generate' });
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
          {onGenerateAI && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleGenerateAI}
              title="Générer avec l'IA"
              className="h-8 w-8 p-0"
            >
              <Sparkles className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={isFocused ? rows : Math.max(4, Math.floor(rows * 0.5))}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`font-mono text-sm whitespace-pre-wrap resize-y transition-all duration-200 ${
          isFocused 
            ? 'max-h-none overflow-y-auto' 
            : ''
        }`}
      />
    </div>
  );
}
