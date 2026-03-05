import React, { useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { ChevronDown } from 'lucide-react';

interface ProductTransferSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  products: any[];
  label: string;
  placeholder?: string;
}

export function ProductTransferSelect({
  value,
  onValueChange,
  products,
  label,
  placeholder = 'Rechercher un produit...',
}: ProductTransferSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedProduct = products.find((p: any) => p.id === value);
  const displayValue =
    value === 'solde' || value === 'balance'
      ? 'Solde'
      : selectedProduct
        ? `${selectedProduct.name || ''}${selectedProduct.reference ? ` (${selectedProduct.reference})` : ''}`
        : value;

  return (
    <div className="modal-form-field">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 rounded-md border-input bg-input-background px-3 py-2 text-sm font-normal text-slate-700"
          >
            <span className="truncate">{displayValue}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[1050]" align="start" style={{ zIndex: 1050 }}>
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList className="max-h-[180px]">
              <CommandEmpty>Aucun produit trouvé.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="solde"
                  onSelect={() => {
                    onValueChange('solde');
                    setOpen(false);
                  }}
                >
                  Solde
                </CommandItem>
                {products.map((p: any) => {
                  const searchText = `${p.name || ''} ${p.reference || ''}`.toLowerCase();
                  return (
                    <CommandItem
                      key={p.id}
                      value={searchText}
                      onSelect={() => {
                        onValueChange(p.id);
                        setOpen(false);
                      }}
                    >
                      {p.name}
                      {p.reference ? ` (${p.reference})` : ''}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
