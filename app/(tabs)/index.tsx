import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LoadError } from '@/components/LoadError';
import { MonthGrid } from '@/components/MonthGrid';
import { OutfitCard } from '@/components/OutfitCard';
import { ViewModeSwitch, type ViewMode } from '@/components/ViewModeSwitch';
import { useOutfitsInRangeQuery } from '@/db/useOutfits';
import { useWeather } from '@/db/useWeather';
import { useT, type TranslationKey } from '@/i18n';
import { wxCategory, type WxCategory } from '@/lib/cwaWeather';
import { addMonths, monthGrid, monthOf, weekOf, weekTitle } from '@/lib/calendar';
import { addDays, browsableRange, weekdayOf } from '@/lib/weatherDates';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme, type Theme } from '@/theme/useTheme';
import type { WeatherDay } from '@/types/models';

const WX_ICONS: Record<WxCategory, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny-outline',
  partlyCloudy: 'partly-sunny-outline',
  cloudy: 'cloudy-outline',
  rain: 'rainy-outline',
  thunder: 'thunderstorm-outline',
  fog: 'cloudy-outline',
  snow: 'snow-outline',
  unknown: 'help-circle-outline',
};

const SWIPE_DISTANCE = 50;

const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);

const num = (n: number | null) => (n === null ? '—' : String(Math.round(n)));
const deg = (n: number | null) => `${num(n)}°`;

/** fetchedAt（ISO）→ 台灣時間 M/D HH:mm */
function taipeiStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}`;
}

export default function WeatherScreen() {
  const t = useT();
  const language = useSettingsStore(s => s.language);
  const theme = useTheme();
  const router = useRouter();
  const window = useWindowDimensions();
  const weather = useWeather();
  const { today, days } = weather;
  const [selected, setSelected] = useState(today);
  const [mode, setMode] = useState<ViewMode>('day');
  const [month, setMonth] = useState(monthOf(today));

  // 換縣市或跨過午夜後回到今天
  useEffect(() => {
    setSelected(today);
    setMonth(monthOf(today));
  }, [weather.county, today]);

  const range = useMemo(() => browsableRange((days ?? []).map(d => d.date), today), [days, today]);
  // 箭頭／滑動只在有天氣資料的範圍內移動；從週、月曆選到範圍外的日期時，可以往範圍的方向走回來
  const canMove = (from: string, n: number) => {
    const target = addDays(from, n);
    if (target >= range.first && target <= range.last) return true;
    return n < 0 ? from > range.last : from < range.first;
  };
  const canPrev = canMove(selected, -1);
  const canNext = canMove(selected, 1);
  const move = (n: number) => setSelected(s => (canMove(s, n) ? addDays(s, n) : s));

  // PanResponder 的 handler 只建立一次，用 ref 拿最新的 move
  const moveRef = useRef(move);
  moveRef.current = move;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE_DISTANCE) moveRef.current(1);
          else if (g.dx >= SWIPE_DISTANCE) moveRef.current(-1);
        },
      }),
    [],
  );

  const week = weekOf(selected);
  const grid = monthGrid(month);
  // 月檢視換到別的月份時，選取的日子可能不在格子裡；查詢範圍要涵蓋它，下方才列得出它的穿搭
  const [from, to] =
    mode === 'week' ? [week[0], week[6]]
      : mode === 'month' ? [minDate(grid[0][0], selected), maxDate(grid[grid.length - 1][6], selected)]
        : [selected, selected];
  const { value: outfits, error: outfitsError, retry: retryOutfits } = useOutfitsInRangeQuery(from, to);
  const outfitsFailed = outfits === undefined && !!outfitsError;
  const outfitsOn = (date: string) => (outfits ?? []).filter(o => o.date === date);
  const marked = useMemo(() => new Set((outfits ?? []).map(o => o.date ?? '')), [outfits]);

  const labelOf = (date: string, withYear = false) => {
    const [y, m, d] = date.split('-').map(Number);
    return t(withYear ? 'weather.dateLabelYear' : 'weather.dateLabel', { y, m, d, wd: t(`weather.wd${weekdayOf(date)}` as TranslationKey) });
  };
  const day = days?.find(d => d.date === selected);
  const relative: TranslationKey | null =
    selected === today ? 'weather.today'
      : selected === addDays(today, 1) ? 'weather.tomorrow'
        : selected === addDays(today, -1) ? 'weather.yesterday'
          : null;

  const changeMode = (next: ViewMode) => {
    if (next === 'month') setMonth(monthOf(selected));
    setMode(next);
  };
  const openDay = (date: string) => {
    setSelected(date);
    setMode('day');
  };
  const openOutfit = (id: string) => router.push({ pathname: '/outfit/edit', params: { id } });
  const cardWidth = Math.min(window.width - 32, 360);

  const dayOutfits = (date: string) => {
    if (outfitsFailed) return <LoadError onRetry={retryOutfits} />;
    if (outfits === undefined) return <ActivityIndicator color={theme.primary} />;
    const list = outfitsOn(date);
    if (list.length === 0) {
      return (
        <View style={[styles.canvas, { borderColor: theme.border }]}>
          <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.noOutfit')}</Text>
        </View>
      );
    }
    return (
      <View style={styles.outfitList}>
        {list.map(o => <OutfitCard key={o.id} outfit={o} width={cardWidth} onPress={() => openOutfit(o.id)} />)}
      </View>
    );
  };

  const weatherCard = (
    <View {...pan.panHandlers} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <NavButton icon="chevron-back" label={t('weather.prevDay')} disabled={!canPrev} onPress={() => move(-1)} theme={theme} />
        {/* 切換日期時讓螢幕閱讀器念出新日期（Android） */}
        <View style={styles.dateBlock} accessibilityLiveRegion="polite">
          <Text style={[styles.date, { color: theme.text }]}>{labelOf(selected)}</Text>
          <View style={styles.subRow}>
            {relative && <Text style={[styles.relative, { color: theme.primary }]}>{t(relative)}</Text>}
            <Text style={[styles.county, { color: theme.textMuted }]}>{weather.county}</Text>
          </View>
        </View>
        <NavButton icon="chevron-forward" label={t('weather.nextDay')} disabled={!canNext} onPress={() => move(1)} theme={theme} />
      </View>

      {!weather.hasKey ? (
        <View style={styles.placeholder}>
          <Ionicons name="key-outline" size={36} color={theme.primary} />
          <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.noKey')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={[styles.button, { backgroundColor: theme.primary }]}>
            <Text style={styles.buttonText}>{t('weather.goSettings')}</Text>
          </Pressable>
        </View>
      ) : day ? (
        <DayDetails day={day} theme={theme} language={language} t={t} />
      ) : weather.loading || days === undefined ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.loading')}</Text>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.noData')}</Text>
        </View>
      )}
    </View>
  );

  const weekView = (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, gap: 4 }]}>
      <View style={styles.cardHeader}>
        <NavButton icon="chevron-back" label={t('calendar.prevWeek')} disabled={false} onPress={() => setSelected(s => addDays(s, -7))} theme={theme} />
        <Text style={[styles.weekTitle, { color: theme.text }]} accessibilityLiveRegion="polite">
          {weekTitle(week[0], week[6], labelOf)}
        </Text>
        <NavButton icon="chevron-forward" label={t('calendar.nextWeek')} disabled={false} onPress={() => setSelected(s => addDays(s, 7))} theme={theme} />
      </View>
      {outfitsFailed && <LoadError onRetry={retryOutfits} />}
      {week.map(date => {
        const w = days?.find(d => d.date === date);
        const list = outfitsOn(date);
        return (
          <View key={date} style={[styles.weekRow, { borderColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('calendar.showDay', { date: labelOf(date) })}
              onPress={() => openDay(date)}
              style={styles.weekDay}
            >
              <Text style={[styles.weekDate, { color: date === today ? theme.primary : theme.text }]}>{labelOf(date)}</Text>
              {w && (
                <View style={styles.weekWx}>
                  <Ionicons name={WX_ICONS[wxCategory(w.wxCode)]} size={14} color={theme.textMuted} accessible={false} importantForAccessibility="no" />
                  <Text style={[styles.weekTemp, { color: theme.textMuted }]}>{`${deg(w.maxT)}/${deg(w.minT)}`}</Text>
                </View>
              )}
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekOutfits}>
              {list.length === 0 ? (
                <Text style={[styles.weekEmpty, { color: theme.textMuted }]}>—</Text>
              ) : (
                list.map(o => <OutfitCard key={o.id} outfit={o} width={66} compact onPress={() => openOutfit(o.id)} />)
              )}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );

  const monthView = (
    <>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, paddingVertical: 8 }]}>
        <MonthGrid
          month={month}
          today={today}
          selected={selected}
          marked={marked}
          onSelect={setSelected}
          onPrev={() => setMonth(m => addMonths(m, -1))}
          onNext={() => setMonth(m => addMonths(m, 1))}
        />
      </View>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{labelOf(selected)}</Text>
      {dayOutfits(selected)}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={weather.refreshing} onRefresh={weather.refresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
      >
        <ViewModeSwitch mode={mode} onChange={changeMode} />

        {weather.hasKey && weather.error && (
          <View style={[styles.banner, { backgroundColor: theme.primarySoft }]} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={18} color={theme.text} />
            <Text style={[styles.bannerText, { color: theme.text }]}>{t(`weather.error.${weather.error}`)}</Text>
          </View>
        )}

        {mode === 'day' && (
          <>
            {weatherCard}
            {dayOutfits(selected)}
          </>
        )}
        {mode === 'week' && weekView}
        {mode === 'month' && monthView}

        <Text style={[styles.source, { color: theme.textMuted }]}>{t('weather.source')}</Text>
      </ScrollView>
      {/* 穿搭不需要天氣資料：沒有授權碼時也能新增 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('outfit.new')}
        onPress={() => router.push({ pathname: '/outfit/edit', params: { date: selected } })}
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function NavButton({ icon, label, disabled, onPress, theme }: {
  icon: 'chevron-back' | 'chevron-forward'; label: string; disabled: boolean; onPress: () => void; theme: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={styles.nav}
    >
      <Ionicons name={icon} size={26} color={disabled ? theme.border : theme.text} />
    </Pressable>
  );
}

function DayDetails({ day, theme, language, t }: {
  day: WeatherDay; theme: Theme; language: string; t: ReturnType<typeof useT>;
}) {
  const category = wxCategory(day.wxCode);
  // 中文介面直接用氣象署的描述，其他語言用分類
  const wxLabel = language === 'zh-TW' && day.wxText ? day.wxText : t(`wx.${category}`);
  return (
    <View style={styles.details}>
      <View style={styles.mainRow}>
        <Ionicons name={WX_ICONS[category]} size={64} color={theme.primary} accessible={false} importantForAccessibility="no" />
        <View
          style={styles.temps}
          accessible
          accessibilityLabel={t('weather.tempsLabel', { max: deg(day.maxT), min: deg(day.minT) })}
        >
          <Text style={[styles.maxT, { color: theme.text }]}>{deg(day.maxT)}</Text>
          <Text style={[styles.slash, { color: theme.textMuted }]}>/</Text>
          <Text style={[styles.minT, { color: theme.textMuted }]}>{deg(day.minT)}</Text>
        </View>
      </View>
      <Text style={[styles.wx, { color: theme.text }]}>{wxLabel}</Text>
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Ionicons name="body-outline" size={16} color={theme.textMuted} accessible={false} importantForAccessibility="no" />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {t('weather.feelsLike', { min: num(day.minAT), max: num(day.maxAT) })}
          </Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="umbrella-outline" size={16} color={theme.textMuted} accessible={false} importantForAccessibility="no" />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {day.pop === null ? t('weather.popUnknown') : t('weather.pop', { pop: Math.round(day.pop) })}
          </Text>
        </View>
      </View>
      <Text style={[styles.updated, { color: theme.textMuted }]}>{t('weather.updatedAt', { time: taipeiStamp(day.fetchedAt) })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 底部留空間給右下 ＋
  content: { padding: 16, paddingBottom: 96, gap: 16, flexGrow: 1 },
  fab: {
    position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  message: { fontSize: 15, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 14 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  nav: { padding: 6 },
  dateBlock: { flex: 1, alignItems: 'center' },
  date: { fontSize: 20, fontWeight: '700' },
  subRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  relative: { fontSize: 13, fontWeight: '600' },
  county: { fontSize: 13 },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 170 },
  details: { alignItems: 'center', paddingTop: 12, gap: 8 },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  temps: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  maxT: { fontSize: 48, fontWeight: '300' },
  slash: { fontSize: 28 },
  minT: { fontSize: 28 },
  wx: { fontSize: 17, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18, rowGap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 14 },
  updated: { fontSize: 12, marginTop: 4 },
  canvas: {
    minHeight: 200, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  outfitList: { alignItems: 'center', gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  weekTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  weekRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6, gap: 8 },
  weekDay: { width: 96, gap: 2 },
  weekDate: { fontSize: 14, fontWeight: '600' },
  weekWx: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekTemp: { fontSize: 12 },
  weekOutfits: { gap: 6, alignItems: 'center', minHeight: 40 },
  weekEmpty: { fontSize: 14, paddingHorizontal: 4 },
  source: { fontSize: 11, textAlign: 'center' },
});
