import { translate, type Language, type TranslationKey } from '@/i18n';
import type { ColorTag, Item, Occasion } from '@/types/models';
import type { Suggestion } from './suggestion';

export interface DescribeOptions {
  language: Language;
  day: 'today' | 'tomorrow';
  occasion: Occasion | null;
  /**
   * 第幾次抽到的建議（按「更新」就加 1）。有給的話形容詞依序輪著用，每次更新都換一個說法；
   * 沒給時依單品決定（同一套每次一樣）
   */
  variant?: number;
}

/**
 * 從「|」分隔的形容詞庫挑一個：有 variant 就依序輪著用（每按一次「更新」換下一個）；
 * 沒有就依單品 id 決定（同一套每次都一樣，畫面重畫時不會跳動）
 */
function pickVibe(text: string, pieces: Item[], variant: number | undefined): string {
  const list = text.split('|');
  let h = 0;
  for (const ch of pieces.map(p => p.id).join(',')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const i = variant ?? h;
  return list[((i % list.length) + list.length) % list.length];
}

/**
 * 建議下方的說明（固定句型）：
 * 1. 配色與風格（不寫單品名稱），例如「白色＋杏色，簡約低調；淑女風，優雅溫柔。」、「大地色系，溫柔低調。」
 * 2. 體感溫度與降雨機率
 * 3. 溫度和這套穿搭合不合適（有沒有外套）＋下雨帶傘
 * 4. 溫差大（見 isBigSwing）時：「今日溫差大，早晚請加外套喔！」
 * 沒有天氣資料時，第 2 句改成提示，沒有第 3、4 句
 */
/**
 * 溫差大：溫差超過 7 度，或溫差超過 5 度且最低溫低於 24 度（使用者指定 2026-11-05）。
 * 高低溫都低於 24 度時不提醒：天氣本來就冷，原本就會穿外套
 */
export function isBigSwing(min: number, max: number): boolean {
  if (max < 24) return false;
  const diff = max - min;
  return diff > 7 || (diff > 5 && min < 24);
}

export function describeSuggestion(s: Suggestion, opts: DescribeOptions): string[] {
  if (s.status !== 'ok') return [];
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(opts.language, key, params);

  // 配色＋風格的形容；兩個都看不出來時用場合的形容
  // 全身同色系才寫「大地色系／黑白灰色系／粉紅色系」；不是的話寫「灰色＋杏色」
  const { scheme, schemeColor, style, colors, family } = s.look;
  const colorLabel = (c: ColorTag) => {
    const l = t(`color.${c}` as TranslationKey);
    return opts.language === 'en' ? l.toLowerCase() : l;
  };
  const pick = (text: string) => pickVibe(text, s.pieces, opts.variant);
  let schemePart = '';
  if (family === 'mono' || family === 'earth') schemePart = pick(t(`suggest.look.${family}`));
  else if (family) schemePart = pick(t('suggest.look.tonal', { color: colorLabel(colors[0]) }));
  else if (colors.length >= 2) {
    const list = colors.slice(0, 3).map(c => t('suggest.colorName', { color: colorLabel(c) })).join(t('suggest.colorJoin'));
    const mood = scheme === 'accent' || scheme === 'tonal' || scheme === 'clash' ? scheme : 'neutral';
    schemePart = pick(t(`suggest.look.mix.${mood}`, { colors: list, color: schemeColor ? colorLabel(schemeColor) : '' }));
  }
  const stylePart = style ? pick(t(`suggest.styleVibes.${style}` as TranslationKey)) : '';
  const vibe = schemePart || stylePart
    ? [schemePart, stylePart].filter(Boolean).join(t('suggest.lookSep'))
    : pick(t(`suggest.vibes.${opts.occasion ?? 'any'}` as TranslationKey));
  // 第一句只寫配色和風格，不寫單品名稱（畫布上就看得到）
  const line1 = t('suggest.line1', { vibe: opts.language === 'en' ? vibe.charAt(0).toUpperCase() + vibe.slice(1) : vibe });

  if (!s.basis || !s.band) return [line1, t('suggest.noWeather')];

  const line2 = t('suggest.line2', {
    day: t(`suggest.day.${opts.day}`),
    kind: t(`suggest.kind.${s.basis.kind}`),
    min: Math.round(s.basis.min),
    max: Math.round(s.basis.max),
    rain: s.pop === null ? t('suggest.line2.popUnknown') : t('suggest.line2.pop', { pop: Math.round(s.pop) }),
  });

  // 溫差大另外寫一行，這裡就不重複說早晚偏涼
  const bigSwing = isBigSwing(s.basis.min, s.basis.max);
  const swing = !bigSwing && s.outerwear === 'required' && (s.band === 'hot' || s.band === 'warm');
  const has = s.pieces.some(p => p.category === 'outerwear');
  const fitKey: TranslationKey =
    swing ? (has ? 'suggest.fit.swing' : 'suggest.fit.swingNoOuter')
      : s.band === 'hot' ? 'suggest.fit.hot'
        : s.band === 'warm' ? (has ? 'suggest.fit.warmOuter' : 'suggest.fit.warm')
          : s.band === 'cool' ? (has ? 'suggest.fit.cool' : 'suggest.fit.coolNoOuter')
            : has ? 'suggest.fit.cold' : 'suggest.fit.coldNoOuter';
  let line3 = t(fitKey);
  if (s.rainy) line3 += (opts.language === 'en' ? ' ' : '') + t('suggest.rain');
  return bigSwing ? [line1, line2, line3, t(`suggest.bigSwing.${opts.day}`)] : [line1, line2, line3];
}
