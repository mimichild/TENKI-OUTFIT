import type { ColorTag } from '@/types/models';

/**
 * 單品顏色：從去背照片判斷主色，以及配色用的色系分組。
 * 色系：
 * - mono：黑白灰（無彩色）
 * - earth：大地色（杏、卡其、咖啡）
 * - 其他：有彩色，依色相分組（藍和深藍同一組、紅和粉紅同一組）
 */
export type ColorGroup = 'mono' | 'earth' | 'red' | 'orange' | 'green' | 'blue' | 'purple';

const GROUP: Record<ColorTag, ColorGroup> = {
  black: 'mono', white: 'mono', gray: 'mono',
  beige: 'earth', khaki: 'earth', brown: 'earth',
  red: 'red', pink: 'red', orange: 'orange', green: 'green',
  blue: 'blue', navy: 'blue', purple: 'purple',
};

export const colorGroup = (c: ColorTag): ColorGroup => GROUP[c];
export const isNeutralGroup = (g: ColorGroup) => g === 'mono' || g === 'earth';

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** RGB → 最接近的顏色名稱 */
export function classifyColor(r: number, g: number, b: number): ColorTag {
  const { h, s, l } = rgbToHsl(r, g, b);
  // 幾乎沒有彩度：黑白灰
  if (s < 0.14 || l < 0.12 || l > 0.93) {
    if (l < 0.25) return 'black';
    if (l > 0.8) return 'white';
    return 'gray';
  }
  // 低彩度的暖色：大地色
  if (h >= 15 && h < 65 && s < 0.55) {
    if (l >= 0.7) return 'beige';
    if (l >= 0.42) return 'khaki';
    return 'brown';
  }
  if (h >= 15 && h < 45 && l < 0.35) return 'brown';
  if (h < 12 || h >= 345) return l > 0.72 ? 'pink' : 'red';
  if (h >= 300) return l > 0.6 ? 'pink' : 'purple';
  if (h < 42) return 'orange';
  // 沒有黃色選項：淺黃歸杏色、其他黃（芥末黃等）歸卡其
  if (h < 70) return l >= 0.65 ? 'beige' : 'khaki';
  if (h < 170) return 'green';
  if (h < 250) return l < 0.3 ? 'navy' : 'blue';
  return 'purple';
}

/**
 * 照片像素（RGBA）的主色：把不透明的像素依顏色名稱分組，取像素最多的那一組。
 * 用分組計數而不是整張平均，條紋或印花不會被平均成奇怪的顏色；整張透明時回傳 null
 */
export function dominantColor(pixels: Uint8Array, width: number, height: number, threshold = 128): ColorTag | null {
  const counts = new Map<ColorTag, number>();
  // 像素很多時跳著取樣，速度固定
  const step = Math.max(1, Math.floor((width * height) / 4000));
  for (let i = 0; i < width * height; i += step) {
    const o = i * 4;
    if (pixels[o + 3] < threshold) continue;
    const c = classifyColor(pixels[o], pixels[o + 1], pixels[o + 2]);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: ColorTag | null = null;
  let max = 0;
  for (const [c, n] of counts) {
    if (n > max) {
      best = c;
      max = n;
    }
  }
  return best;
}
