import { createBoundsCache, type BoundsCacheIo } from '@/lib/photoBoundsCache';
import type { PieceShape } from '@/lib/outfitLayout';

const shape: PieceShape = { aspect: 2, bounds: { x0: 0.1, y0: 0.2, x1: 0.9, y1: 1 } };

function memoryIo(initial: string | null = null) {
  const io = { text: initial, writes: 0, reads: 0 };
  const api: BoundsCacheIo = {
    read: async () => { io.reads++; return io.text; },
    write: async (t: string) => { io.writes++; io.text = t; },
  };
  return { io, api };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('bounds cache file', () => {
  it('reads the file once and returns saved entries', async () => {
    const { io, api } = memoryIo(JSON.stringify({ version: 1, entries: { 'photos/a.png': shape, 'photos/b.png': null } }));
    const cache = createBoundsCache(api);
    expect(await cache.get('photos/a.png')).toEqual(shape);
    expect(await cache.get('photos/b.png')).toBeNull();
    expect(await cache.get('photos/c.png')).toBeUndefined();
    expect(io.reads).toBe(1);
  });

  it('writes new entries after a short delay, merging several into one write', async () => {
    const { io, api } = memoryIo();
    const cache = createBoundsCache(api);
    await cache.set('photos/a.png', shape);
    await cache.set('photos/b.png', null);
    expect(io.writes).toBe(0);
    await jest.advanceTimersByTimeAsync(500);
    expect(io.writes).toBe(1);
    expect(JSON.parse(io.text!)).toEqual({ version: 1, entries: { 'photos/a.png': shape, 'photos/b.png': null } });
  });

  it.each([
    ['broken JSON', '{not json'],
    ['wrong version', JSON.stringify({ version: 99, entries: { 'photos/a.png': shape } })],
    ['wrong shape', JSON.stringify([1, 2])],
  ])('treats a %s file as empty without throwing', async (_label, text) => {
    const { api } = memoryIo(text);
    const cache = createBoundsCache(api);
    expect(await cache.get('photos/a.png')).toBeUndefined();
  });

  it('skips malformed entries but keeps valid ones', async () => {
    const { api } = memoryIo(JSON.stringify({ version: 1, entries: { 'photos/a.png': shape, 'photos/x.png': { aspect: 'big' } } }));
    const cache = createBoundsCache(api);
    expect(await cache.get('photos/a.png')).toEqual(shape);
    expect(await cache.get('photos/x.png')).toBeUndefined();
  });

  it('treats an unreadable file as empty', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = createBoundsCache({ read: async () => { throw new Error('io'); }, write: async () => {} });
    expect(await cache.get('photos/a.png')).toBeUndefined();
  });

  it('removes entries of deleted photos', async () => {
    const { io, api } = memoryIo(JSON.stringify({ version: 1, entries: { 'photos/a.png': shape, 'photos/b.png': shape } }));
    const cache = createBoundsCache(api);
    await cache.remove(['photos/a.png']);
    expect(await cache.get('photos/a.png')).toBeUndefined();
    await jest.advanceTimersByTimeAsync(500);
    expect(Object.keys(JSON.parse(io.text!).entries)).toEqual(['photos/b.png']);
  });

  it('does not write when removing paths that are not cached', async () => {
    const { io, api } = memoryIo();
    const cache = createBoundsCache(api);
    await cache.remove(['photos/none.png']);
    await jest.advanceTimersByTimeAsync(500);
    expect(io.writes).toBe(0);
  });

  it('only logs when writing fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = createBoundsCache({ read: async () => null, write: async () => { throw new Error('disk full'); } });
    await cache.set('photos/a.png', shape);
    await jest.advanceTimersByTimeAsync(500);
    expect(warn).toHaveBeenCalled();
  });
});
