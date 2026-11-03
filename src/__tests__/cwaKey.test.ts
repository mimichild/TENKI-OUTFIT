describe('cwaKey', () => {
  const original = process.env.EXPO_PUBLIC_CWA_API_KEY;
  afterEach(() => {
    process.env.EXPO_PUBLIC_CWA_API_KEY = original;
    jest.resetModules();
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 每個測試重新載入以讀取不同的環境變數
  const load = () => require('@/lib/cwaKey') as typeof import('@/lib/cwaKey');

  it("prefers the user's own key even when a built-in key was bundled", () => {
    process.env.EXPO_PUBLIC_CWA_API_KEY = ' CWA-BUILTIN ';
    const { builtInCwaKey, effectiveCwaKey } = load();
    expect(builtInCwaKey()).toBe('CWA-BUILTIN');
    expect(effectiveCwaKey(' CWA-USER ')).toBe('CWA-USER');
  });

  it('uses the built-in key when the user key is empty', () => {
    process.env.EXPO_PUBLIC_CWA_API_KEY = 'CWA-BUILTIN';
    const { effectiveCwaKey } = load();
    expect(effectiveCwaKey('')).toBe('CWA-BUILTIN');
    expect(effectiveCwaKey('   ')).toBe('CWA-BUILTIN');
  });

  it('falls back to the user key when no built-in key was bundled', () => {
    delete process.env.EXPO_PUBLIC_CWA_API_KEY;
    const { builtInCwaKey, effectiveCwaKey } = load();
    expect(builtInCwaKey()).toBe('');
    expect(effectiveCwaKey(' CWA-USER ')).toBe('CWA-USER');
  });
});
