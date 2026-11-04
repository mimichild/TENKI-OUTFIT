import { useEffect, useState } from 'react';
import type { ColorTag } from '@/types/models';
import { measurePhoto } from './photoBounds';

/** 照片自動判斷的主色；沒照片、量測中或量不到時為 null */
export function useAutoColor(photo: string | null): ColorTag | null {
  const [result, setResult] = useState<{ photo: string; color: ColorTag | null } | null>(null);
  useEffect(() => {
    if (!photo) return;
    let alive = true;
    measurePhoto(photo).then(shape => {
      if (alive) setResult({ photo, color: shape?.color ?? null });
    });
    return () => {
      alive = false;
    };
  }, [photo]);
  return photo && result?.photo === photo ? result.color : null;
}
