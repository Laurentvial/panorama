import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PlatformSearchContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const PlatformSearchContext = createContext<PlatformSearchContextType | undefined>(undefined);

export function PlatformSearchProvider({ children }: { children: ReactNode }) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <PlatformSearchContext.Provider value={{ searchTerm, setSearchTerm }}>
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
