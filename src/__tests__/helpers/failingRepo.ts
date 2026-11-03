type AsyncFn = (...args: unknown[]) => Promise<unknown>;

/**
 * 包一層 repository：`control.failing` 為 true 時，指定的方法一律 reject。
 * 用來測試「讀取失敗＋重試」：先失敗、關掉後按重試就讀得到。
 */
export function withFailures<T extends object>(repo: T, methods: (keyof T)[]) {
  const control = { failing: true, calls: 0 };
  const wrapped = { ...repo };
  for (const m of methods) {
    const original = repo[m] as unknown as AsyncFn;
    (wrapped as Record<keyof T, unknown>)[m] = (...args: unknown[]) => {
      control.calls++;
      return control.failing ? Promise.reject(new Error('讀取失敗（測試）')) : original(...args);
    };
  }
  return { repo: wrapped, control };
}
