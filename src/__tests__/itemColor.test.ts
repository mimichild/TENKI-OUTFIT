import { classifyColor, colorGroup, dominantColor } from '@/lib/itemColor';
import { inferStyle } from '@/lib/itemStyle';

describe('classifyColor', () => {
  it.each([
    [[20, 20, 20], 'black'],
    [[250, 250, 248], 'white'],
    [[140, 140, 145], 'gray'],
    [[236, 222, 196], 'beige'],
    [[190, 168, 120], 'khaki'],
    [[110, 75, 50], 'brown'],
    [[200, 40, 50], 'red'],
    [[245, 170, 190], 'pink'],
    [[240, 140, 50], 'orange'],
    [[240, 210, 70], 'yellow'],
    [[80, 150, 90], 'green'],
    [[80, 140, 220], 'blue'],
    [[30, 45, 90], 'navy'],
    [[140, 100, 190], 'purple'],
  ])('%j → %s', (rgb, expected) => {
    expect(classifyColor(rgb[0], rgb[1], rgb[2])).toBe(expected);
  });

  it('groups colors into families for coordination', () => {
    expect(colorGroup('navy')).toBe('blue');
    expect(colorGroup('pink')).toBe('red');
    expect(colorGroup('khaki')).toBe('earth');
    expect(colorGroup('gray')).toBe('mono');
  });
});

describe('dominantColor', () => {
  const image = (colors: [number, number, number, number][]) => new Uint8Array(colors.flat());
  it('picks the most common color among visible pixels, ignoring transparent ones', () => {
    const px = image([[30, 45, 90, 255], [30, 45, 90, 255], [250, 250, 250, 255], [200, 40, 50, 0]]);
    expect(dominantColor(px, 4, 1)).toBe('navy');
  });
  it('returns null for a fully transparent photo', () => {
    expect(dominantColor(new Uint8Array(16), 4, 1)).toBeNull();
  });
});

describe('inferStyle', () => {
  const it2 = (name: string, occasions: ('casual' | 'work' | 'formal' | 'sport' | 'date' | 'travel')[] = []) => inferStyle({ name, brand: '', occasions });
  it('reads keywords in the name first', () => {
    expect(it2('碎花洋裝')).toBe('feminine');
    expect(it2('蕾絲上衣', ['sport'])).toBe('feminine');
    expect(it2('白色T恤')).toBe('casual');
    expect(it2('牛仔褲')).toBe('casual');
  });
  it('falls back to occasions, then to no style', () => {
    expect(it2('上衣', ['date'])).toBe('feminine');
    expect(it2('上衣', ['casual', 'travel'])).toBe('casual');
    expect(it2('上衣', ['work'])).toBeNull();
    expect(it2('上衣')).toBeNull();
  });
});
