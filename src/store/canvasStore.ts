import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * 穿搭畫布的統一比例（高 / 寬）：「天氣穿搭」日檢視和「新增／編輯穿搭」兩處各自量出可用空間，
 * 兩邊都用比較小的那個，畫布才會一模一樣（使用者指定 2026-11-04）。
 * 存起來：先開哪個畫面都能馬上用上一次量到的值，不會第一次打開時忽大忽小
 */
interface CanvasState {
  /** 天氣穿搭日檢視的可用比例；null = 還沒量過 */
  day: number | null;
  /** 新增／編輯穿搭的可用比例 */
  editor: number | null;
  report: (where: 'day' | 'editor', ratio: number) => void;
}

/** 差不到 0.5% 就不更新，避免版面微幅變動時一直重畫 */
const SAME = 0.005;

export const useCanvasStore = create<CanvasState>()(
  persist(
    set => ({
      day: null,
      editor: null,
      report: (where, ratio) => {
        if (!(ratio > 0) || !Number.isFinite(ratio)) return;
        set(s => {
          const old = s[where];
          return old !== null && Math.abs(old - ratio) / ratio < SAME ? s : { ...s, [where]: ratio };
        });
      },
    }),
    {
      name: 'tenki-canvas',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ day: s.day, editor: s.editor }),
    },
  ),
);

/** 兩邊都用的比例：量到的比較小的那個；都沒量到時用 fallback */
export function sharedCanvasRatio(day: number | null, editor: number | null, fallback: number): number {
  const known = [day, editor].filter((r): r is number => r !== null && r > 0);
  return known.length ? Math.min(...known) : fallback;
}

/** 在畫面元件裡用：回報自己這邊的比例，拿到兩邊共用的比例 */
export function useSharedCanvasRatio(fallback: number): number {
  const day = useCanvasStore(s => s.day);
  const editor = useCanvasStore(s => s.editor);
  return sharedCanvasRatio(day, editor, fallback);
}
