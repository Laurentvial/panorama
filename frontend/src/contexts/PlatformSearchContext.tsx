import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';

interface PlatformSearchContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const PlatformSearchContext = createContext<PlatformSearchContextType | undefined>(undefined);

export function PlatformSearchProvider({ children }: { children: ReactNode }) {
  const storageKey = 'platformSearchTerm';
  const [searchTerm, setSearchTermState] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });

  const setSearchTerm = (term: string) => {
    setSearchTermState(term);
    if (typeof window === 'undefined') return;
    try {
      if (!term) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, term);
    } catch {
      // ignore storage errors
    }
  };

  const value = useMemo(() => ({ searchTerm, setSearchTerm }), [searchTerm]);

  return (
    <PlatformSearchContext.Provider value={value}>
      {children}
    </PlatformSearchContext.Provider>
  );
}

export function usePlatformSearch() {
  const context = useContext(PlatformSearchContext);
  if (context === undefined) {
    throw new Error('usePlatformSearch must be used within a PlatformSearchProvider');
  }
  return context;
}
