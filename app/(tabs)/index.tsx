import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWeather } from '@/db/useWeather';
import { useT, type TranslationKey } from '@/i18n';
import { wxCategory, type WxCategory } from '@/lib/cwaWeather';
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
  const weather = useWeather();
  const { today, days } = weather;
  const [selected, setSelected] = useState(today);

  // 換縣市後回到今天
  useEffect(() => setSelected(today), [weather.county, today]);

  const range = useMemo(() => browsableRange((days ?? []).map(d => d.date), today), [days, today]);
  const canPrev = selected > range.first;
  const canNext = selected < range.last;
  const move = (n: number) => setSelected(s => {
    const target = addDays(s, n);
    return target < range.first || target > range.last ? s : target;
  });

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

  const day = days?.find(d => d.date === selected);
  const relative: TranslationKey | null =
    selected === today ? 'weather.today'
      : selected === addDays(today, 1) ? 'weather.tomorrow'
        : selected === addDays(today, -1) ? 'weather.yesterday'
          : null;
  const [, m, d] = selected.split('-').map(Number);
  const dateLabel = t('weather.dateLabel', { m, d, wd: t(`weather.wd${weekdayOf(selected)}` as TranslationKey) });

  if (!weather.hasKey) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="key-outline" size={40} color={theme.primary} />
        <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.noKey')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={[styles.button, { backgroundColor: theme.primary }]}
        >
          <Text style={styles.buttonText}>{t('weather.goSettings')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={weather.refreshing} onRefresh={weather.refresh} tintColor={theme.primary} />}
    >
      {weather.error && (
        <View style={[styles.banner, { backgroundColor: theme.primarySoft }]} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={18} color={theme.text} />
          <Text style={[styles.bannerText, { color: theme.text }]}>{t(`weather.error.${weather.error}`)}</Text>
        </View>
      )}

      <View {...pan.panHandlers} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <NavButton icon="chevron-back" label={t('weather.prevDay')} disabled={!canPrev} onPress={() => move(-1)} theme={theme} />
          <View style={styles.dateBlock}>
            <Text style={[styles.date, { color: theme.text }]}>{dateLabel}</Text>
            <View style={styles.subRow}>
              {relative && <Text style={[styles.relative, { color: theme.primary }]}>{t(relative)}</Text>}
              <Text style={[styles.county, { color: theme.textMuted }]}>{weather.county}</Text>
            </View>
          </View>
          <NavButton icon="chevron-forward" label={t('weather.nextDay')} disabled={!canNext} onPress={() => move(1)} theme={theme} />
        </View>

        {day ? (
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

      <View style={[styles.canvas, { borderColor: theme.border }]}>
        <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.outfitsComing')}</Text>
      </View>

      <Text style={[styles.source, { color: theme.textMuted }]}>{t('weather.source')}</Text>
    </ScrollView>
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
        <Ionicons name={WX_ICONS[category]} size={64} color={theme.primary} />
        <View style={styles.temps}>
          <Text style={[styles.maxT, { color: theme.text }]}>{deg(day.maxT)}</Text>
          <Text style={[styles.slash, { color: theme.textMuted }]}>/</Text>
          <Text style={[styles.minT, { color: theme.textMuted }]}>{deg(day.minT)}</Text>
        </View>
      </View>
      <Text style={[styles.wx, { color: theme.text }]}>{wxLabel}</Text>
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Ionicons name="body-outline" size={16} color={theme.textMuted} />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {t('weather.feelsLike', { min: num(day.minAT), max: num(day.maxAT) })}
          </Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="umbrella-outline" size={16} color={theme.textMuted} />
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
  content: { padding: 16, gap: 16, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
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
    flexGrow: 1, minHeight: 200, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  source: { fontSize: 11, textAlign: 'center' },
});
