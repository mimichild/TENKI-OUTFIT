import { createContext, useContext, type ReactNode } from 'react';
import type { OutfitRepository } from './outfitRepository';

const OutfitRepositoryContext = createContext<OutfitRepository | null>(null);

export function OutfitRepositoryProvider({ repository, children }: { repository: OutfitRepository; children: ReactNode }) {
  return <OutfitRepositoryContext.Provider value={repository}>{children}</OutfitRepositoryContext.Provider>;
}

export function useOutfitRepository(): OutfitRepository {
  const repo = useContext(OutfitRepositoryContext);
  if (!repo) throw new Error('useOutfitRepository 必須在 OutfitRepositoryProvider 裡使用');
  return repo;
}
