import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useQuery } from '@/db/useQuery';

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('useQuery', () => {
  it('reports the error and loads again on retry', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(['a']);
    const { result } = renderHook(() => useQuery(load, 'k', []));
    expect(result.current.value).toBeUndefined();
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.value).toBeUndefined();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.value).toEqual(['a']));
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('clears the error while retrying', async () => {
    let resolve: (v: string) => void = () => {};
    const load = jest.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(() => new Promise<string>(r => { resolve = r; }));
    const { result } = renderHook(() => useQuery(load, 'k', []));
    await waitFor(() => expect(result.current.error).toBeTruthy());

    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    expect(result.current.value).toBeUndefined();
    await act(async () => resolve('ok'));
    expect(result.current.value).toBe('ok');
  });

  it('loads again when a dependency changes', async () => {
    const load = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const { result, rerender } = renderHook(({ v }: { v: number }) => useQuery(load, 'k', [v]), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.value).toBe(1));
    rerender({ v: 1 });
    await waitFor(() => expect(result.current.value).toBe(2));
  });

  it('does not return the result of an old key', async () => {
    let resolveB: (v: string) => void = () => {};
    const load = jest.fn()
      .mockResolvedValueOnce('A')
      .mockImplementationOnce(() => new Promise<string>(r => { resolveB = r; }));
    const { result, rerender } = renderHook(({ k }: { k: string }) => useQuery(load, k, []), { initialProps: { k: 'a' } });
    await waitFor(() => expect(result.current.value).toBe('A'));
    rerender({ k: 'b' });
    expect(result.current.value).toBeUndefined();
    await act(async () => resolveB('B'));
    expect(result.current.value).toBe('B');
  });

  it('does not show an error from an old key', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('boom')).mockImplementationOnce(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ k }: { k: string }) => useQuery(load, k, []), { initialProps: { k: 'a' } });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    rerender({ k: 'b' });
    expect(result.current.error).toBeNull();
  });
});
