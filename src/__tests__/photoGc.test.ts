import { ORPHAN_MIN_AGE_MS, orphanPhotos } from '@/lib/photoGc';

const NOW = Date.parse('2026-11-03T10:00:00.000Z');
const old = NOW - ORPHAN_MIN_AGE_MS - 1;

describe('orphanPhotos', () => {
  it('picks files no item refers to and older than an hour', () => {
    const files = [
      { path: 'photos/used.png', modifiedAt: old },
      { path: 'photos/orphan.png', modifiedAt: old },
    ];
    expect(orphanPhotos(files, ['photos/used.png'], NOW)).toEqual(['photos/orphan.png']);
  });

  it('keeps files written within the last hour (an item may still be being saved)', () => {
    const files = [
      { path: 'photos/fresh.png', modifiedAt: NOW - 60_000 },
      { path: 'photos/edge.png', modifiedAt: NOW - ORPHAN_MIN_AGE_MS },
    ];
    expect(orphanPhotos(files, [], NOW)).toEqual([]);
  });

  it('keeps files whose modification time is unknown', () => {
    expect(orphanPhotos([{ path: 'photos/x.png', modifiedAt: null }], [], NOW)).toEqual([]);
  });

  it('never touches paths outside photos/<name>', () => {
    const files = [
      { path: 'photos/sub/x.png', modifiedAt: old },
      { path: 'photos/../x.png', modifiedAt: old },
      { path: 'photo-bounds.json', modifiedAt: old },
      { path: 'photos/noext', modifiedAt: old },
    ];
    expect(orphanPhotos(files, [], NOW)).toEqual([]);
  });

  it('treats image and original photos of trashed or archived items as used', () => {
    const files = [{ path: 'photos/a.png', modifiedAt: old }, { path: 'photos/a.jpg', modifiedAt: old }];
    expect(orphanPhotos(files, new Set(['photos/a.png', 'photos/a.jpg']), NOW)).toEqual([]);
  });
});
