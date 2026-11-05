import { translate, type Language, type TranslationKey } from '@/i18n';
import type { ColorTag, Item, Occasion } from '@/types/models';
import type { Suggestion } from './suggestion';

export interface DescribeOptions {
  language: Language;
  day: 'today' | 'tomorrow';
  occasion: Occasion | null;
}

/** 同一套穿搭每次都選同一個風格形容（換一套才換），不用亂數，畫面重畫時不會跳動 */
function pickVibe(list: string[], pieces: Item[]): string {
  let h = 0;
  for (const ch of pieces.map(p => p.id).join(',')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/**
 * 建議下方的說明（固定句型）：
 * 1. 穿搭組合、配色與風格，例如「杏色針織外套內搭白襯衫，配上卡其長裙，白色＋杏色＋卡其色，簡約低調；淑女風，優雅溫柔。」
 * 2. 體感溫度與降雨機率
 * 3. 溫度和這套穿搭合不合適（有沒有外套）＋下雨帶傘
 * 沒有天氣資料時，第 2 句改成提示，沒有第 3 句
 */
export function describeSuggestion(s: Suggestion, opts: DescribeOptions): string[] {
  if (s.status !== 'ok') return [];
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(opts.language, key, params);
  const label = (item: Item) => item.name.trim() || t(`suggest.piece.${item.category}` as TranslationKey);
  const find = (category: Item['category']) => s.pieces.find(p => p.category === category);

  // 配色＋風格的形容；兩個都看不出來時用場合的形容
  // 全身同色系才寫「大地色系／黑白灰色系／粉紅色系」；不是的話寫「灰色＋杏色」
  const { scheme, schemeColor, style, colors, family } = s.look;
  const colorLabel = (c: ColorTag) => {
    const l = t(`color.${c}` as TranslationKey);
    return opts.language === 'en' ? l.toLowerCase() : l;
  };
  let schemePart = '';
  if (family === 'mono' || family === 'earth') schemePart = t(`suggest.look.${family}`);
  else if (family) schemePart = t('suggest.look.tonal', { color: colorLabel(colors[0]) });
  else if (colors.length >= 2) {
    const list = colors.slice(0, 3).map(c => t('suggest.colorName', { color: colorLabel(c) })).join(t('suggest.colorJoin'));
    const mood = scheme === 'accent' || scheme === 'tonal' || scheme === 'clash' ? scheme : 'neutral';
    schemePart = t(`suggest.look.mix.${mood}`, { colors: list, color: schemeColor ? colorLabel(schemeColor) : '' });
  }
  const stylePart = style ? pickVibe(t(`suggest.styleVibes.${style}` as TranslationKey).split('|'), s.pieces) : '';
  const vibe = schemePart || stylePart
    ? [schemePart, stylePart].filter(Boolean).join(t('suggest.lookSep'))
    : pickVibe(t(`suggest.vibes.${opts.occasion ?? 'any'}` as TranslationKey).split('|'), s.pieces);
  const outerwear = find('outerwear');
  const outer = outerwear ? label(outerwear) : '';
  const onepiece = find('onepiece');
  // 上衣那一格可能是內著；有外搭時寫成「上衣外搭小背心」
  const top = s.pieces.find(p => p.category === 'top' || p.category === 'inner');
  const overlay = find('overlay');
  const bottom = find('bottom');
  const line1 =
    onepiece || !top || !bottom
      ? t(outerwear ? 'suggest.line1.onepieceOuter' : 'suggest.line1.onepiece', { onepiece: onepiece ? label(onepiece) : '', outer, vibe })
      : t(outerwear ? 'suggest.line1.separatesOuter' : 'suggest.line1.separates', {
          top: overlay ? t('suggest.topWithOverlay', { top: label(top), overlay: label(overlay) }) : label(top),
          bottom: label(bottom), outer, vibe,
        });

  if (!s.basis || !s.band) return [line1, t('suggest.noWeather')];

  const line2 = t('suggest.line2', {
    day: t(`suggest.day.${opts.day}`),
    kind: t(`suggest.kind.${s.basis.kind}`),
    min: Math.round(s.basis.min),
    max: Math.round(s.basis.max),
    rain: s.pop === null ? t('suggest.line2.popUnknown') : t('suggest.line2.pop', { pop: Math.round(s.pop) }),
  });

  const swing = s.outerwear === 'required' && (s.band === 'hot' || s.band === 'warm');
  const has = !!outerwear;
  const fitKey: TranslationKey =
    swing ? (has ? 'suggest.fit.swing' : 'suggest.fit.swingNoOuter')
      : s.band === 'hot' ? 'suggest.fit.hot'
        : s.band === 'warm' ? (has ? 'suggest.fit.warmOuter' : 'suggest.fit.warm')
          : s.band === 'cool' ? (has ? 'suggest.fit.cool' : 'suggest.fit.coolNoOuter')
            : has ? 'suggest.fit.cold' : 'suggest.fit.coldNoOuter';
  let line3 = t(fitKey);
  if (s.rainy) line3 += (opts.language === 'en' ? ' ' : '') + t('suggest.rain');
  return [line1, line2, line3];
}
