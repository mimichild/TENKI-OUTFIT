import { translate, type Language, type TranslationKey } from '@/i18n';
import type { Item, Occasion } from '@/types/models';
import type { Suggestion } from './suggestion';

export interface DescribeOptions {
  language: Language;
  day: 'today' | 'tomorrow';
  occasion: Occasion | null;
}

/**
 * 建議下方的兩句說明（固定句型）：
 * 1. 單品組合與適合的場合
 * 2. 天氣：溫度範圍、溫差／外套、降雨帶傘
 */
export function describeSuggestion(s: Suggestion, opts: DescribeOptions): string[] {
  if (s.status !== 'ok') return [];
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(opts.language, key, params);
  const label = (item: Item) => item.name.trim() || t(`suggest.piece.${item.category}` as TranslationKey);
  const find = (category: Item['category']) => s.pieces.find(p => p.category === category);

  const outerwear = find('outerwear');
  const outer = outerwear ? t('suggest.line1.outer', { name: label(outerwear) }) : '';
  let occasionLabel = opts.occasion ? t(`occasion.${opts.occasion}` as TranslationKey) : '';
  if (opts.language === 'en') occasionLabel = occasionLabel.toLowerCase();
  const merit = opts.occasion ? t('suggest.merit.occasion', { occasion: occasionLabel }) : t('suggest.merit.any');

  const onepiece = find('onepiece');
  const top = find('top');
  const bottom = find('bottom');
  const line1 =
    onepiece || !top || !bottom
      ? t('suggest.line1.onepiece', { onepiece: onepiece ? label(onepiece) : '', outer, merit })
      : t('suggest.line1.separates', { top: label(top), bottom: label(bottom), outer, merit });

  if (!s.basis || !s.band) return [line1, t('suggest.noWeather')];

  const swing = s.outerwear === 'required' && (s.band === 'hot' || s.band === 'warm');
  const phrase = t(`suggest.phrase.${swing ? 'swing' : s.band}` as TranslationKey);
  let line2 = t('suggest.line2', {
    day: t(`suggest.day.${opts.day}`),
    kind: t(`suggest.kind.${s.basis.kind}`),
    min: Math.round(s.basis.min),
    max: Math.round(s.basis.max),
    phrase,
  });
  if (s.rainy && s.pop !== null) line2 += t('suggest.rain', { pop: s.pop });
  return [line1, line2];
}
