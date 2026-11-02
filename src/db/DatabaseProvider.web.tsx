import type { ReactNode } from 'react';

// Web 預覽只用來看 UI，不開本機資料庫
export const DB_NAME = '';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
