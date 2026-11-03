import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { OutfitCanvasView } from '@/components/OutfitCanvasView';
import { OCCASIONS } from '@/constants/options';
import { useActiveItems } from '@/db/useItems';
import { useWeather } from '@/db/useWeather';
import { useT, type TranslationKey } from '@/i18n';
import { formatPrice } from '@/lib/currency';
import { outfitTotal } from '@/lib/outfitTotals';
import { suggestOutfit, suggestionLayout, type Suggestion } from '@/lib/suggestion';
import { describeSuggestion } from '@/lib/suggestionText';
import { usePieceShapes } from '@/lib/usePieceShapes';
import { addDays } from '@/lib/weatherDates';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/useTheme';
import type { Item, Occasion } from '@/types/models';

type Day = 'today' | 'tomorrow';

interface Picked {
  /** 日期＋場合＋天氣條件；變了就重抽 */
  key: string;
  suggestion: Suggestion;
}

export default function SuggestScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const language = useSettingsStore(s => s.language);
  const currency = useSettingsStore(s => s.currency);
  const window = useWindowDimensions();
  const items = useActiveItems();
  const weather = useWeather();
  const [day, setDay] = useState<Day>('today');
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);

  const date = day === 'today' ? weather.today : addDays(weather.today, 1);
  const dayWeather = weather.days?.find(d => d.date === date) ?? null;
  const ready = items !== undefined && weather.days !== undefined;
  const input = useMemo(() => ({ items: items ?? [], weather: dayWeather, occasion }), [items, dayWeather, occasion]);
  // 天氣只看會影響挑選的條件，重抓到一樣的天氣不重抽
  const probe = ready ? suggestOutfit(input, { rng: () => 0 }) : null;
  const key = probe ? `${date}|${occasion ?? ''}|${probe.band}|${probe.outerwear}` : '';
  const itemIds = useMemo(() => new Set((items ?? []).map(i => i.id)), [items]);

  // 換日期／場合／天氣條件、建議裡的單品不見了、或原本沒有建議而衣櫃變了 → 重抽
  useEffect(() => {
    if (!ready) return;
    setPicked(prev => {
      const stale =
        !prev ||
        prev.key !== key ||
        prev.suggestion.status === 'empty' ||
        prev.suggestion.pieces.some(p => !itemIds.has(p.id));
      return stale ? { key, suggestion: suggestOutfit(input) } : prev;
    });
  }, [ready, key, input, itemIds]);

  const shuffle = () => {
    if (!picked) return;
    setPicked({ key, suggestion: suggestOutfit(input, { previous: picked.suggestion.pieces.map(p => p.id) }) });
  };

  // 顯示用最新的單品資料（名稱、照片可能改過）；天氣（帶傘）也用最新的
  const current = picked && picked.key === key ? picked.suggestion : null;
  const byId = new Map((items ?? []).map(i => [i.id, i]));
  const pieces: Item[] = current ? current.pieces.map(p => byId.get(p.id) ?? p) : [];
  // 量到照片裡衣服的範圍後才排版，避免畫面跳動
  const shapes = usePieceShapes(current ? pieces : undefined);
  const shown: Suggestion | null = current && probe ? { ...current, pieces, rainy: probe.rainy, pop: probe.pop } : null;
  const lines = shown ? describeSuggestion(shown, { language, day, occasion }) : [];
  const canvasWidth = Math.min(window.width - 64, 360);
  const total = outfitTotal(pieces.map(item => ({ item })));
  const pieceNames = pieces.map(i => i.name.trim() || t(`suggest.piece.${i.category}` as TranslationKey)).join(t('suggest.listSep'));

  const saveAsOutfit = () =>
    router.push({ pathname: '/outfit/edit', params: { date, items: pieces.map(i => i.id).join(',') } });

  const num = (v: number | null) => (v === null ? '—' : Math.round(v));
  const feelsMin = dayWeather ? (dayWeather.minAT ?? dayWeather.minT) : null;
  const feelsMax = dayWeather ? (dayWeather.maxAT ?? dayWeather.maxT) : null;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={[styles.segment, { borderColor: theme.border }]} accessibilityRole="tablist" accessibilityLabel={t('suggest.dayLabel')}>
        {(['today', 'tomorrow'] as const).map(d => {
          const selected = d === day;
          return (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityLabel={t(`suggest.tab.${d}`)}
              accessibilityState={{ selected }}
              onPress={() => setDay(d)}
              style={[styles.segmentOption, selected && { backgroundColor: theme.primary }]}
            >
              <Text style={{ color: selected ? '#FFFFFF' : theme.text, fontSize: 15, fontWeight: '500' }}>{t(`suggest.tab.${d}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.weather, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {dayWeather ? (
          <>
            <Text style={[styles.weatherMain, { color: theme.text }]}>
              {t('weather.feelsLike', { min: num(feelsMin), max: num(feelsMax) })}
            </Text>
            <Text style={{ color: theme.textMuted }}>
              {dayWeather.pop === null ? t('weather.popUnknown') : t('weather.pop', { pop: Math.round(dayWeather.pop) })}
            </Text>
          </>
        ) : (
          <Text style={{ color: theme.textMuted }}>{t('suggest.noWeatherShort')}</Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('suggest.occasionLabel')}
      >
        <Chip role="radio" label={t('suggest.occasionAll')} selected={occasion === null} onPress={() => setOccasion(null)} />
        {OCCASIONS.map(o => (
          <Chip key={o} role="radio" label={t(`occasion.${o}`)} selected={occasion === o} onPress={() => setOccasion(o)} />
        ))}
      </ScrollView>

      {!ready || !shown ? null : (items ?? []).length === 0 ? (
        <Message icon="shirt-outline" text={t('suggest.emptyCloset')} color={theme.textMuted} />
      ) : shown.status === 'empty' ? (
        <Message icon="search-outline" text={t('suggest.noMatch')} hint={t('suggest.noMatchHint')} color={theme.textMuted} />
      ) : (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View
            style={[styles.canvasFrame, { borderColor: theme.border }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('suggest.canvasLabel', { list: pieceNames })}
          >
            <OutfitCanvasView
              width={canvasWidth}
              pieces={shapes ? suggestionLayout(pieces, shapes).map((p, i) => ({ ...p, item: pieces[i] })) : []}
            />
          </View>
          <Text style={[styles.pieceNames, { color: theme.textMuted }]}>{pieceNames}</Text>
          {total !== null && (
            <Text style={[styles.total, { color: theme.text }]}>{t('outfit.total', { amount: formatPrice(total, currency) })}</Text>
          )}
          {lines.map(line => (
            <Text key={line} style={[styles.line, { color: theme.text }]}>{line}</Text>
          ))}
          {shown.missing.length > 0 && (
            <Text style={[styles.note, { color: theme.textMuted }]}>
              {t('suggest.missing', { list: shown.missing.map(c => t(`category.${c}`)).join(t('suggest.listSep')) })}
            </Text>
          )}
          {shown.noAlternative && (
            <Text style={[styles.note, { color: theme.textMuted }]} accessibilityLiveRegion="polite">{t('suggest.noAlternative')}</Text>
          )}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('suggest.refresh')}
              onPress={shuffle}
              style={[styles.button, { borderColor: theme.primary }]}
            >
              <Ionicons name="shuffle-outline" size={18} color={theme.primary} accessible={false} importantForAccessibility="no" />
              <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('suggest.refresh')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('suggest.save')}
              onPress={saveAsOutfit}
              style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.primary }]}
            >
              <Ionicons name="calendar-outline" size={18} color="#FFFFFF" accessible={false} importantForAccessibility="no" />
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('suggest.save')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Message({ icon, text, hint, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; hint?: string; color: string }) {
  return (
    <View style={styles.message}>
      <Ionicons name={icon} size={40} color={color} accessible={false} importantForAccessibility="no" />
      <Text style={[styles.messageText, { color }]}>{text}</Text>
      {hint && <Text style={[styles.messageHint, { color }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  segment: { flexDirection: 'row', alignSelf: 'center', borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  segmentOption: { paddingHorizontal: 28, paddingVertical: 7 },
  weather: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12 },
  weatherMain: { fontSize: 16, fontWeight: '600' },
  chips: { gap: 8, paddingVertical: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, alignItems: 'stretch' },
  canvasFrame: { alignSelf: 'center', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  pieceNames: { fontSize: 13, textAlign: 'center' },
  total: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  line: { fontSize: 15, lineHeight: 22 },
  note: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  message: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 16 },
  messageText: { fontSize: 15, textAlign: 'center' },
  messageHint: { fontSize: 13, textAlign: 'center' },
});
