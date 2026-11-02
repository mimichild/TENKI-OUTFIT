describe('cwaKey', () => {
  const original = process.env.EXPO_PUBLIC_CWA_API_KEY;
  afterEach(() => {
    process.env.EXPO_PUBLIC_CWA_API_KEY = original;
    jest.resetModules();
  });

  const load = () => require('@/lib/cwaKey') as typeof import('@/lib/cwaKey');

  it('prefers the built-in key over the user key', () => {
    process.env.EXPO_PUBLIC_CWA_API_KEY = ' CWA-BUILTIN ';
    const { builtInCwaKey, effectiveCwaKey } = load();
    expect(builtInCwaKey()).toBe('CWA-BUILTIN');
    expect(effectiveCwaKey('CWA-USER')).toBe('CWA-BUILTIN');
  });

  it('falls back to the user key when no built-in key was bundled', () => {
    delete process.env.EXPO_PUBLIC_CWA_API_KEY;
    const { builtInCwaKey, effectiveCwaKey } = load();
    expect(builtInCwaKey()).toBe('');
    expect(effectiveCwaKey(' CWA-USER ')).toBe('CWA-USER');
  });
});
