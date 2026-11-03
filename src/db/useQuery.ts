import { useCallback, useEffect, useState } from 'react';

export type QueryResult<T> = {
  /** undefined = 讀取中（或讀取失敗） */
  value: T | undefined;
  /** 最近一次讀取失敗的原因；讀取中或成功時為 null */
  error: unknown | null;
  /** 重新讀取 */
  retry: () => void;
};

type Settled<T> = { key: string; attempt: number } & ({ ok: true; value: T } | { ok: false; error: unknown });

/**
 * 以 key 代表查詢內容：key 變了就不回傳舊結果。
 * deps 變了（例如資料版本）會重新讀取，但讀取中仍顯示同一個 key 的上一次結果。
 */
export function useQuery<T>(load: () => Promise<T>, key: string, deps: readonly unknown[]): QueryResult<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>();
  const [lastValue, setLastValue] = useState<{ key: string; value: T }>();

  useEffect(() => {
    let alive = true;
    load()
      .then(value => {
        if (!alive) return;
        setSettled({ key, attempt, ok: true, value });
        setLastValue({ key, value });
      })
      .catch(error => {
        console.warn('讀取資料失敗', key, error);
        if (alive) setSettled({ key, attempt, ok: false, error });
      });
    return () => { alive = false; };
    // load 每次 render 都是新函式；以 key 代表查詢內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, ...deps]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  const error = settled && !settled.ok && settled.key === key && settled.attempt === attempt ? settled.error : null;
  return { value: lastValue?.key === key ? lastValue.value : undefined, error, retry };
}
