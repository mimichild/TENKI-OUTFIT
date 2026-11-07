import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LoadError } from '@/components/LoadError';
import { MonthOutfitGrid } from '@/components/MonthOutfitGrid';
import { OUTFIT_CARD_FOOTER_HEIGHT, OutfitCard } from '@/components/OutfitCard';
import { ViewModeSwitch, type ViewMode } from '@/components/ViewModeSwitch';
import { useOutfitsInRangeQuery } from '@/db/useOutfits';
import { useWeather } from '@/db/useWeather';
import { useT, type TranslationKey } from '@/i18n';
import { wxCategory } from '@/lib/cwaWeather';
import { addMonths, monthGrid, monthOf, weekOf, weekTitle } from '@/lib/calendar';
import { addDays, weekdayOf } from '@/lib/weatherDates';
import { WX_ICONS } from '@/constants/wxIcons';
import { useCanvasStore, useSharedCanvasRatio } from '@/store/canvasStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme, type Theme } from '@/theme/useTheme';
import type { WeatherDay } from '@/types/models';

const SWIPE_DISTANCE = 50;
/** 週檢視縮圖的高度；寬度依每套穿搭的畫布比例 */
const WEEK_THUMB_HEIGHT = 80;
/** 日、週檢視內容的上方內距與區塊間距（styles.content / contentFill） */
const DAY_PADDING_TOP = 16;
const DAY_GAP = 12;

const num = (n: number | null) => (n === null ? '—' : String(Math.round(n)));
const deg = (n: number | null) => `${num(n)}°`;

export default function WeatherScreen() {
  const t = useT();
  const language = useSettingsStore(s => s.language);
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
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

  // 前後都不設限：過去看得到以前的穿搭，未來超過預報範圍也能先排穿搭（沒有天氣資料就顯示提示）
  const move = (n: number) => setSelected(s => addDays(s, n));

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
  const [from, to] =
    mode === 'week' ? [week[0], week[6]]
      : mode === 'month' ? [grid[0][0], grid[grid.length - 1][6]]
        : [selected, selected];
  const { value: outfits, error: outfitsError, retry: retryOutfits } = useOutfitsInRangeQuery(from, to);
  const outfitsFailed = outfits === undefined && !!outfitsError;
  const outfitsOn = (date: string) => (outfits ?? []).filter(o => o.date === date);

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
  // 日／週／月放在標題列右側；changeMode 會用到 selected，所以 selected 變了也要更新
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <ViewModeSwitch mode={mode} onChange={changeMode} /> });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, mode, selected]);
  const openDay = (date: string) => {
    setSelected(date);
    setMode('day');
  };
  const openOutfit = (id: string) => router.push({ pathname: '/outfit/edit', params: { id } });
  const newOutfit = (date: string) => router.push({ pathname: '/outfit/edit', params: { date } });
  /**
   * 日檢視穿搭區：左右貼齊手機邊緣、往下到分頁列。
   * 用「捲動區域 − 天氣欄」計算，不量穿搭區自己（否則卡片高度會影響量到的高度，停不在分頁列）
   */
  const [scrollSize, setScrollSize] = useState<{ width: number; height: number } | null>(null);
  const [weatherCardHeight, setWeatherCardHeight] = useState(0);
  /**
   * 有天氣資料時天氣內容的高度：讀取中、沒有天氣資料時天氣欄也用這個高度，
   * 天氣欄才不會變大、把穿搭畫布擠小（2026-11-07）
   */
  const [detailsHeight, setDetailsHeight] = useState(DETAILS_FALLBACK_HEIGHT);
  const areaWidth = scrollSize?.width || window.width;
  const measuredHeight = scrollSize && weatherCardHeight ? scrollSize.height - DAY_PADDING_TOP - weatherCardHeight - DAY_GAP : 0;
  const areaHeight = measuredHeight > 200 ? measuredHeight : areaWidth * (4 / 3);
  // 和新增穿搭的畫布共用同一個比例（兩邊比較小的那個）
  const ownRatio = measuredHeight > 200 ? (measuredHeight - OUTFIT_CARD_FOOTER_HEIGHT) / areaWidth : null;
  const reportCanvas = useCanvasStore(s => s.report);
  useEffect(() => {
    if (ownRatio !== null) reportCanvas('day', ownRatio);
  }, [ownRatio, reportCanvas]);
  const canvasRatio = useSharedCanvasRatio(ownRatio ?? (areaHeight - OUTFIT_CARD_FOOTER_HEIGHT) / areaWidth);
  const cardHeight = areaWidth * canvasRatio + OUTFIT_CARD_FOOTER_HEIGHT;

  /** 日檢視：穿搭畫布滿版（不管這套穿搭原本的比例）；沒有穿搭時空白框一樣滿版 */
  const dayOutfits = (date: string) => {
    const list = outfitsOn(date);
    const body = outfitsFailed ? (
      <LoadError onRetry={retryOutfits} />
    ) : outfits === undefined ? (
      <ActivityIndicator color={theme.primaryText} />
    ) : list.length === 0 ? (
      <View style={[styles.canvas, { borderColor: theme.border }]}>
        <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.noOutfit')}</Text>
      </View>
    ) : (
      list.map(o => <OutfitCard key={o.id} outfit={o} width={areaWidth} height={cardHeight} onPress={() => openOutfit(o.id)} />)
    );
    return (
      <View testID="day-outfits" style={[styles.dayOutfits, { minHeight: areaHeight }]}>
        {body}
      </View>
    );
  };

  const weatherCard = (
    <View {...pan.panHandlers} style={[styles.card, styles.weatherCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <NavButton icon="chevron-back" label={t('weather.prevDay')} disabled={false} onPress={() => move(-1)} theme={theme} />
        {/* 切換日期時讓螢幕閱讀器念出新日期（Android） */}
        <View style={styles.dateBlock} accessibilityLiveRegion="polite">
          <Text style={[styles.date, { color: theme.text }]}>{labelOf(selected)}</Text>
          <View style={styles.subRow}>
            {relative && <Text style={[styles.relative, { color: theme.primaryText }]}>{t(relative)}</Text>}
            <Text style={[styles.county, { color: theme.textMuted }]}>{weather.county}</Text>
          </View>
        </View>
        <NavButton icon="chevron-forward" label={t('weather.nextDay')} disabled={false} onPress={() => move(1)} theme={theme} />
      </View>

      {!weather.hasKey ? (
        <View style={styles.placeholder}>
          <Ionicons name="key-outline" size={36} color={theme.primaryText} />
          <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.noKey')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={[styles.button, { backgroundColor: theme.primary }]}>
            <Text style={[styles.buttonText, { color: theme.onPrimary }]}>{t('weather.goSettings')}</Text>
          </Pressable>
        </View>
      ) : day ? (
        <View testID="weather-details" onLayout={e => setDetailsHeight(e.nativeEvent.layout.height)}>
          <DayDetails day={day} theme={theme} language={language} t={t} />
        </View>
      ) : weather.loading || days === undefined ? (
        <View testID="weather-placeholder" style={[styles.compactPlaceholder, { height: detailsHeight }]}>
          <ActivityIndicator color={theme.primaryText} />
          <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.loading')}</Text>
        </View>
      ) : (
        <View testID="weather-placeholder" style={[styles.compactPlaceholder, { height: detailsHeight }]}>
          <Text style={[styles.message, { color: theme.textMuted }]}>{t('weather.noData')}</Text>
        </View>
      )}
    </View>
  );

  const weekView = (
    <View style={[styles.card, styles.fillCard, { backgroundColor: theme.surface, borderColor: theme.border, gap: 4 }]}>
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
          <View key={date} style={[styles.weekRow, styles.weekRowFill, { borderColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('calendar.showDay', { date: labelOf(date) })}
              onPress={() => openDay(date)}
              style={styles.weekDay}
            >
              <Text style={[styles.weekDate, { color: date === today ? theme.primaryText : theme.text }]}>{labelOf(date)}</Text>
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
                list.map(o => <OutfitCard key={o.id} outfit={o} width={WEEK_THUMB_HEIGHT / o.canvasRatio} compact onPress={() => openOutfit(o.id)} />)
              )}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );

  const monthView = (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, paddingHorizontal: 8, paddingVertical: 8, gap: 4 }]}>
      {outfitsFailed && <LoadError onRetry={retryOutfits} />}
      <MonthOutfitGrid
        month={month}
        today={today}
        outfitsOn={outfitsOn}
        labelOf={labelOf}
        onOpenDay={openDay}
        onAdd={newOutfit}
        onPrev={() => setMonth(m => addMonths(m, -1))}
        onNext={() => setMonth(m => addMonths(m, 1))}
      />
    </View>
  );

  return (
    // 外層 View 與捲動區域一樣大（＋是浮在上面的），量它來算日檢視穿搭區的高度
    <View
      testID="weather-scroll"
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setScrollSize(v => (v && v.width === width && v.height === height ? v : { width, height }));
      }}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, mode !== 'month' && styles.contentFill]}
        refreshControl={
          <RefreshControl refreshing={weather.refreshing} onRefresh={weather.refresh} tintColor={theme.primaryText} colors={[theme.primaryText]} />
        }
      >
        {weather.hasKey && weather.error && (
          <View style={[styles.banner, { backgroundColor: theme.primarySoft }]} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={18} color={theme.text} />
            <Text style={[styles.bannerText, { color: theme.text }]}>{t(`weather.error.${weather.error}`)}</Text>
          </View>
        )}

        {mode === 'day' && (
          <>
            {/* 量天氣欄高度用來算穿搭區；包一層，不跟滑動手勢掛在同一個元件上 */}
            <View testID="weather-card" onLayout={e => setWeatherCardHeight(e.nativeEvent.layout.height)}>
              {weatherCard}
            </View>
            {dayOutfits(selected)}
          </>
        )}
        {mode === 'week' && weekView}
        {mode === 'month' && monthView}
      </ScrollView>
      {/* 穿搭不需要天氣資料：沒有授權碼時也能新增 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('outfit.new')}
        onPress={() => newOutfit(selected)}
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/** 還沒量到天氣內容高度時的預估值（溫度列＋天氣描述列） */
const DETAILS_FALLBACK_HEIGHT = 80;

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
      <View testID="weather-main-row" style={styles.mainRow}>
        <Ionicons name={WX_ICONS[category]} size={40} color={theme.primaryText} accessible={false} importantForAccessibility="no" />
        <View
          style={styles.temps}
          accessible
          accessibilityLabel={t('weather.tempsLabel', { max: deg(day.maxT), min: deg(day.minT) })}
        >
          <Text style={[styles.maxT, { color: theme.text }]}>{deg(day.maxT)}</Text>
          <Text style={[styles.slash, { color: theme.textMuted }]}>/</Text>
          <Text style={[styles.minT, { color: theme.textMuted }]}>{deg(day.minT)}</Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="body-outline" size={16} color={theme.textMuted} accessible={false} importantForAccessibility="no" />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {t('weather.feelsLike', { min: num(day.minAT), max: num(day.maxAT) })}
          </Text>
        </View>
      </View>
      {/* 第二行：天氣描述在左、降雨機率在右 */}
      <View testID="weather-sub-row" style={styles.metaRow}>
        <Text style={[styles.wx, { color: theme.text }]}>{wxLabel}</Text>
        <View style={styles.meta}>
          <Ionicons name="umbrella-outline" size={16} color={theme.textMuted} accessible={false} importantForAccessibility="no" />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {day.pop === null ? t('weather.popUnknown') : t('weather.pop', { pop: Math.round(day.pop) })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 底部留空間給右下 ＋
  content: { padding: DAY_PADDING_TOP, paddingBottom: 96, gap: 16, flexGrow: 1 },
  // 日、週檢視：內容延伸到分頁列，＋浮在上面
  contentFill: { paddingBottom: 16, gap: DAY_GAP },
  fillCard: { flex: 1 },
  // 往上避開穿搭卡片底部的總金額列
  fab: {
    position: 'absolute', right: 20, bottom: OUTFIT_CARD_FOOTER_HEIGHT + 12, width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  message: { fontSize: 15, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 14 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  weatherCard: { paddingVertical: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  nav: { padding: 6 },
  dateBlock: { flex: 1, alignItems: 'center' },
  date: { fontSize: 18, fontWeight: '700' },
  subRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  relative: { fontSize: 13, fontWeight: '600' },
  county: { fontSize: 13 },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 170 },
  compactPlaceholder: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  details: { alignItems: 'center', paddingTop: 6, gap: 6 },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  temps: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  maxT: { fontSize: 32, fontWeight: '300' },
  slash: { fontSize: 20 },
  minT: { fontSize: 20 },
  wx: { fontSize: 16, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 18, rowGap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 14 },
  // 日檢視穿搭區：抵銷內容左右內距貼齊手機邊緣，撐滿到分頁列
  dayOutfits: { marginHorizontal: -16, marginBottom: -16, gap: 16 },
  canvas: {
    flex: 1, minHeight: 200, borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  weekTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  weekRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6, gap: 8 },
  // 七天平均分配卡片高度，第七天的下緣剛好到分頁列
  weekRowFill: { flex: 1 },
  weekDay: { width: 96, gap: 2 },
  weekDate: { fontSize: 14, fontWeight: '600' },
  weekWx: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekTemp: { fontSize: 12 },
  weekOutfits: { gap: 6, alignItems: 'center', minHeight: 40 },
  weekEmpty: { fontSize: 14, paddingHorizontal: 4 },
});
