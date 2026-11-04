import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { AppState, RefreshControl, StyleSheet, type AppStateStatus } from 'react-native';
import { OUTFIT_CARD_FOOTER_HEIGHT } from '@/components/OutfitCard';
import WeatherScreen from '../../app/(tabs)/index';
import { WeatherProvider } from '@/db/WeatherContext';
import { createMemoryWeatherRepository } from '@/db/memoryWeatherRepository';
import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { OutfitRepositoryProvider } from '@/db/OutfitRepositoryContext';
import type { OutfitInput } from '@/db/outfitRepository';
import type { DailyForecast, FetchForecastResult } from '@/lib/cwaWeather';
import { useCanvasStore } from '@/store/canvasStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { WeatherDay } from '@/types/models';
import type { WeatherRepository } from '@/db/weatherRepository';
import { withFailures } from './helpers/failingRepo';

const mockPush = jest.fn();
// 標題列：WeatherScreen 用 navigation.setOptions 放 headerRight，測試裡用 WithHeader 把它畫出來
type HeaderOptions = { headerRight?: () => ReactNode };
let mockApplyOptions: (o: HeaderOptions) => void = () => {};
const mockSetOptions = jest.fn((o: HeaderOptions) => mockApplyOptions(o));
jest.mock('expo-router', () => {
  const navigation = { setOptions: (o: HeaderOptions) => mockSetOptions(o) };
  return { useRouter: () => ({ push: mockPush }), useNavigation: () => navigation };
});
function WithHeader({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<HeaderOptions>({});
  mockApplyOptions = o => setOptions(prev => ({ ...prev, ...o }));
  return <>{options.headerRight?.()}{children}</>;
}
let mockBuiltInKey = '';
jest.mock('@/lib/cwaKey', () => ({
  builtInCwaKey: () => mockBuiltInKey,
  effectiveCwaKey: (k: string) => k.trim() || mockBuiltInKey,
}));

// 2026-11-03（二）10:00 台灣時間
const NOW = '2026-11-03T02:00:00.000Z';
let currentNow = NOW;

const forecast = (date: string, maxT: number, extra: Partial<DailyForecast> = {}): DailyForecast => ({
  date, maxT, minT: maxT - 6, maxAT: maxT + 1, minAT: maxT - 8, pop: 30, wxCode: '04', wxText: '多雲', hasDaytime: true, ...extra,
});
const cached = (date: string, maxT: number): WeatherDay => ({
  county: '臺北市', town: '', date, maxT, minT: maxT - 6, maxAT: maxT, minAT: maxT - 7, pop: 10,
  wxCode: '01', wxText: '晴天', fetchedAt: '2026-11-02T02:00:00.000Z',
});

type OutfitSeed = { date: string; items: ('shirt' | 'jeans')[] };

async function setup({ apiKey = 'KEY', result, seed = [], fetcher: customFetcher, repo: customRepo, outfits = [] }: {
  apiKey?: string; result?: FetchForecastResult; seed?: WeatherDay[];
  fetcher?: jest.Mock; repo?: WeatherRepository; outfits?: OutfitSeed[];
}) {
  let n = 0;
  const db = createMemoryDatabase({ now: () => NOW, newId: () => `id${++n}` });
  const base = { brand: '', category: 'top' as const, occasions: [], seasons: [], imageUri: null, originalUri: null };
  const shirt = await db.items.create({ ...base, name: '白襯衫', price: 790 });
  const jeans = await db.items.create({ ...base, name: '牛仔褲', price: null });
  const ids = { shirt: shirt.id, jeans: jeans.id };
  const outfitIds: string[] = [];
  for (const o of outfits) {
    const input: OutfitInput = { name: '', date: o.date, items: o.items.map((k, z) => ({ itemId: ids[k], x: 0.5, y: 0.5, scale: 1, rotation: 0, z })) };
    outfitIds.push((await db.outfits.create(input)).id);
  }
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, cwaApiKey: apiKey });
  const repo = customRepo ?? createMemoryWeatherRepository(seed);
  const fetcher = customFetcher ?? jest.fn().mockResolvedValue(result ?? { status: 'ok', days: [] });
  render(
    <OutfitRepositoryProvider repository={db.outfits}>
      <WeatherProvider repository={repo} fetcher={fetcher} now={() => currentNow}>
        <WithHeader>
          <WeatherScreen />
        </WithHeader>
      </WeatherProvider>
    </OutfitRepositoryProvider>,
  );
  await act(async () => {});
  return { fetcher, repo, outfitIds };
}

beforeEach(() => {
  mockPush.mockClear();
  useCanvasStore.setState({ day: null, editor: null });
  mockSetOptions.mockClear();
  mockBuiltInKey = '';
  currentNow = NOW;
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('WeatherScreen', () => {
  it('asks for the API key and links to settings when none is set', async () => {
    const { fetcher } = await setup({ apiKey: '' });
    expect(screen.getByText('請先到設定輸入氣象署授權碼')).toBeTruthy();
    fireEvent.press(screen.getByText('前往設定'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the built-in key when the user has not entered one', async () => {
    mockBuiltInKey = 'CWA-BUILTIN';
    const { fetcher } = await setup({ apiKey: '', result: { status: 'ok', days: [forecast('2026-11-03', 25)] } });
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'CWA-BUILTIN', county: '臺北市' }));
    expect(screen.queryByText('請先到設定輸入氣象署授權碼')).toBeNull();
    expect(screen.getByText('25°')).toBeTruthy();
  });

  it("uses the user's own key over the built-in one", async () => {
    mockBuiltInKey = 'CWA-BUILTIN';
    const { fetcher } = await setup({ apiKey: 'CWA-MINE', result: { status: 'ok', days: [forecast('2026-11-03', 25)] } });
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'CWA-MINE' }));
  });

  it('fetches the selected county and shows today', async () => {
    const { fetcher } = await setup({
      result: { status: 'ok', days: [forecast('2026-11-03', 25, { pop: 70, wxText: '短暫陣雨', wxCode: '08' }), forecast('2026-11-04', 22)] },
    });
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'KEY', county: '臺北市' }));
    expect(screen.getByText('11/3（二）')).toBeTruthy();
    expect(screen.getByText('今天')).toBeTruthy();
    expect(screen.getByText('臺北市')).toBeTruthy();
    expect(screen.getByText('短暫陣雨')).toBeTruthy();
    expect(screen.getByText('25°')).toBeTruthy();
    expect(screen.getByText('19°')).toBeTruthy();
    expect(screen.getByText('體感 17°–26°')).toBeTruthy();
    expect(screen.getByText('降雨機率 70%')).toBeTruthy();
  });

  it('日／週／月切換放在標題列右側，不在頁面內容裡', async () => {
    await setup({ result: { status: 'ok', days: [forecast('2026-11-03', 25)] } });
    const headerRight = mockSetOptions.mock.calls.at(-1)?.[0].headerRight;
    expect(headerRight).toBeDefined();
    const header = render(<>{headerRight!()}</>);
    expect(header.getByRole('tab', { name: '日' })).toBeSelected();
    expect(header.getByRole('tab', { name: '週' })).toBeTruthy();
    expect(header.getByRole('tab', { name: '月' })).toBeTruthy();
    header.unmount();
  });

  it('不顯示更新時間與資料來源', async () => {
    await setup({ result: { status: 'ok', days: [forecast('2026-11-03', 25)] } });
    expect(screen.queryByText(/更新於/)).toBeNull();
    expect(screen.queryByText('資料來源：中央氣象署')).toBeNull();
  });

  it('體感溫度在氣溫右邊；天氣描述和降雨機率在第二行；＋不會蓋住總金額', async () => {
    await setup({ result: { status: 'ok', days: [forecast('2026-11-03', 25, { pop: 70, wxText: '短暫陣雨', wxCode: '08' })] } });
    const main = within(screen.getByTestId('weather-main-row'));
    expect(main.getByText('25°')).toBeTruthy();
    expect(main.getByText('體感 17°–26°')).toBeTruthy();
    expect(main.queryByText('短暫陣雨')).toBeNull();
    const sub = within(screen.getByTestId('weather-sub-row'));
    expect(sub.getByText('短暫陣雨')).toBeTruthy();
    expect(sub.getByText('降雨機率 70%')).toBeTruthy();
    const fab = StyleSheet.flatten(screen.getByRole('button', { name: '新增穿搭' }).props.style);
    expect(fab.bottom).toBeGreaterThan(OUTFIT_CARD_FOOTER_HEIGHT);
  });

  it('moves between dates with no limit in either direction', async () => {
    await setup({ seed: [cached('2026-11-02', 28)], result: { status: 'ok', days: [forecast('2026-11-03', 25), forecast('2026-11-04', 22)] } });
    const prev = screen.getByLabelText('前一天');
    const next = screen.getByLabelText('後一天');

    fireEvent.press(next);
    expect(screen.getByText('明天')).toBeTruthy();
    expect(screen.getByText('22°')).toBeTruthy();
    // 超過預報範圍也能繼續往後（新增未來的穿搭），沒有天氣資料就顯示提示
    expect(next).not.toBeDisabled();
    for (let i = 0; i < 30; i++) fireEvent.press(next);
    expect(screen.getByText('12/4（五）')).toBeTruthy();
    expect(screen.getByText('這一天沒有天氣資料')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '新增穿搭' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/outfit/edit', params: { date: '2026-12-04' } });
    for (let i = 0; i < 30; i++) fireEvent.press(prev);

    fireEvent.press(prev);
    fireEvent.press(prev);
    expect(screen.getByText('昨天')).toBeTruthy();
    expect(screen.getByText('28°')).toBeTruthy();
    expect(screen.getByText('晴天')).toBeTruthy();
    // 過去沒有天氣資料的日子也能往前看（為了看過去的穿搭）
    expect(prev).not.toBeDisabled();
    fireEvent.press(prev);
    expect(screen.getByText('11/1（日）')).toBeTruthy();
    expect(screen.getByText('這一天沒有天氣資料')).toBeTruthy();
  });

  it('opens a new outfit for the day being viewed from the + button', async () => {
    await setup({ result: { status: 'ok', days: [forecast('2026-11-03', 25), forecast('2026-11-04', 22)] } });
    fireEvent.press(screen.getByRole('button', { name: '後一天' }));
    fireEvent.press(screen.getByRole('button', { name: '新增穿搭' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/outfit/edit', params: { date: '2026-11-04' } });
  });

  it('shows the error but keeps cached data', async () => {
    await setup({ seed: [cached('2026-11-03', 24)], result: { status: 'unauthorized' } });
    // 快取是一天前抓的，會重新抓 → 授權碼錯誤
    expect(screen.getByText('授權碼無效，請到設定確認')).toBeTruthy();
    expect(screen.getByText('24°')).toBeTruthy();
  });

  it('says there is no data when today is missing', async () => {
    await setup({ result: { status: 'network' } });
    expect(screen.getByText('無法連線到氣象署')).toBeTruthy();
    expect(screen.getByText('這一天沒有天氣資料')).toBeTruthy();
  });

  it('shows the English category label instead of the Chinese text', async () => {
    await setup({ result: { status: 'ok', days: [forecast('2026-11-03', 25, { wxCode: '08', wxText: '短暫陣雨' })] } });
    await act(async () => { useSettingsStore.setState({ language: 'en' }); });
    expect(screen.getByText('Rain')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('短暫陣雨')).toBeNull();
  });

  it('ignores a slow result for the previous county after switching', async () => {
    const slow = deferred<FetchForecastResult>();
    const fetcher = jest.fn()
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce({ status: 'ok', days: [forecast('2026-11-03', 30)] });
    await setup({ fetcher });
    await act(async () => { useSettingsStore.setState({ county: '高雄市' }); });
    expect(fetcher.mock.calls[0][0].signal.aborted).toBe(true);
    expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ county: '高雄市' }));
    await act(async () => { slow.resolve({ status: 'unauthorized' }); });
    expect(screen.getByText('高雄市')).toBeTruthy();
    expect(screen.getByText('30°')).toBeTruthy();
    expect(screen.queryByText('授權碼無效，請到設定確認')).toBeNull();
  });

  it('does not refetch when the cache is fresh, but pull-to-refresh forces it', async () => {
    const fresh = { ...cached('2026-11-03', 24), fetchedAt: '2026-11-03T01:30:00.000Z' };
    const { fetcher } = await setup({ seed: [fresh], result: { status: 'ok', days: [forecast('2026-11-03', 27)] } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByText('24°')).toBeTruthy();
    await act(async () => { screen.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText('27°')).toBeTruthy();
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  it('moves to the new today and refetches when the app comes back after midnight', async () => {
    let onChange: ((s: AppStateStatus) => void) | undefined;
    // jest-expo 的 AppState 本身就是 mock，spyOn + mockRestore 會把它的預設實作清掉，所以手動換回去
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, handler: (s: AppStateStatus) => void) => {
      onChange = handler;
      return { remove: () => {} };
    }) as typeof AppState.addEventListener;
    try {
      const fetcher = jest.fn()
        .mockResolvedValueOnce({ status: 'ok', days: [forecast('2026-11-03', 25), forecast('2026-11-04', 21)] })
        .mockResolvedValueOnce({ status: 'ok', days: [forecast('2026-11-04', 22)] });
      await setup({ fetcher });
      expect(screen.getByText('11/3（二）')).toBeTruthy();
      currentNow = '2026-11-04T00:30:00.000Z'; // 11/4 08:30 台灣時間
      await act(async () => { onChange?.('active'); });
      expect(screen.getByText('11/4（三）')).toBeTruthy();
      expect(screen.getByText('今天')).toBeTruthy();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(screen.getByText('22°')).toBeTruthy();
    } finally {
      AppState.addEventListener = original;
    }
  });

  it('shows a storage error, not a CWA error, when the local cache fails', async () => {
    const repo: WeatherRepository = {
      list: jest.fn().mockRejectedValue(new Error('SQLITE_BUSY')),
      upsert: jest.fn(),
      lastFetchedAt: jest.fn(),
    };
    await setup({ repo });
    expect(screen.getByText('無法讀取本機天氣資料')).toBeTruthy();
  });

  it('reads the temperatures as one accessible label', async () => {
    await setup({ result: { status: 'ok', days: [forecast('2026-11-03', 25)] } });
    expect(screen.getByLabelText('最高 25°，最低 19°')).toBeTruthy();
  });
});

describe('WeatherScreen outfits', () => {
  const twoDays: FetchForecastResult = { status: 'ok', days: [forecast('2026-11-03', 25), forecast('2026-11-04', 22)] };
  const planned: OutfitSeed[] = [
    { date: '2026-11-03', items: ['shirt', 'jeans'] },
    { date: '2026-11-03', items: ['jeans'] },
    { date: '2026-11-04', items: ['shirt'] },
  ];
  const cards = () => screen.queryAllByLabelText(/^編輯穿搭，/);
  // 換日期／檢視後穿搭是非同步讀取的
  const press = async (el: Parameters<typeof fireEvent.press>[0]) => act(async () => { fireEvent.press(el); });

  it('shows the outfits planned for the selected day with totals, and opens one for editing', async () => {
    const { outfitIds } = await setup({ result: twoDays, outfits: planned });
    expect(cards().map(c => c.props.accessibilityLabel)).toEqual(['編輯穿搭，2 件單品，NT$790', '編輯穿搭，1 件單品，—']);
    await press(cards()[0]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/outfit/edit', params: { id: outfitIds[0] } });
    await press(screen.getByRole('button', { name: '後一天' }));
    expect(cards()).toHaveLength(1);
  });

  it('日檢視可以往前看到過去的穿搭', async () => {
    await setup({ result: twoDays, outfits: [{ date: '2026-10-30', items: ['shirt'] }] });
    for (let i = 0; i < 4; i++) await press(screen.getByRole('button', { name: '前一天' }));
    expect(screen.getByText('10/30（五）')).toBeTruthy();
    expect(cards()).toHaveLength(1);
  });

  it('週檢視可以往前看到過去的穿搭', async () => {
    await setup({ result: twoDays, outfits: [{ date: '2026-10-28', items: ['shirt'] }] });
    await press(screen.getByRole('tab', { name: '週' }));
    await press(screen.getByRole('button', { name: '上一週' }));
    expect(cards()).toHaveLength(1);
  });

  it('日檢視的穿搭畫布左右貼齊手機邊緣、往下延伸到分頁列（不管原本比例）', async () => {
    await setup({ result: twoDays, outfits: [{ date: '2026-11-03', items: ['shirt'] }] });
    // 可用高度 = 捲動區域 700 − 上方內距 16 − 天氣欄 150 − 間距 12 = 522（不受穿搭內容影響）
    fireEvent(screen.getByTestId('weather-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
    fireEvent(screen.getByTestId('weather-card'), 'layout', { nativeEvent: { layout: { x: 16, y: 16, width: 358, height: 150 } } });
    const canvas = StyleSheet.flatten(screen.getByTestId('outfit-canvas-view').props.style);
    expect(canvas.width).toBe(390);
    // 扣掉下方總金額列
    expect(canvas.height).toBe(522 - OUTFIT_CARD_FOOTER_HEIGHT);
  });

  it('日檢視和新增穿搭的畫布共用同一個比例：新增穿搭那邊比較矮時用它的', async () => {
    useCanvasStore.setState({ editor: 1 });
    await setup({ result: twoDays, outfits: [{ date: '2026-11-03', items: ['shirt'] }] });
    fireEvent(screen.getByTestId('weather-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
    fireEvent(screen.getByTestId('weather-card'), 'layout', { nativeEvent: { layout: { x: 16, y: 16, width: 358, height: 150 } } });
    // 自己量到的比例記下來給新增穿搭用
    expect(useCanvasStore.getState().day).toBeCloseTo((522 - OUTFIT_CARD_FOOTER_HEIGHT) / 390);
    const canvas = StyleSheet.flatten(screen.getByTestId('outfit-canvas-view').props.style);
    expect(canvas.width).toBe(390);
    expect(canvas.height).toBeCloseTo(390);
  });

  it('says when a day has no outfit yet', async () => {
    await setup({ result: twoDays });
    expect(screen.getByText('這天還沒有穿搭，按右下 ＋ 新增')).toBeTruthy();
    expect(cards()).toHaveLength(0);
  });

  it('still shows outfits and the + button without an API key', async () => {
    await setup({ apiKey: '', outfits: planned });
    expect(screen.getByText('請先到設定輸入氣象署授權碼')).toBeTruthy();
    expect(cards()).toHaveLength(2);
    expect(screen.getByRole('button', { name: '新增穿搭' })).toBeTruthy();
  });

  it('week view lists every day of the week; tapping a day opens it in day view', async () => {
    await setup({ result: twoDays, outfits: planned });
    await press(screen.getByRole('tab', { name: '週' }));
    for (const label of ['11/1（日）', '11/3（二）', '11/7（六）']) {
      expect(screen.getByRole('button', { name: `查看 ${label}` })).toBeTruthy();
    }
    expect(cards()).toHaveLength(3);
    await press(screen.getByRole('button', { name: '下一週' }));
    expect(screen.getByRole('button', { name: '查看 11/8（日）' })).toBeTruthy();
    expect(cards()).toHaveLength(0);
    await press(screen.getByRole('button', { name: '上一週' }));
    await press(screen.getByRole('button', { name: '查看 11/4（三）' }));
    expect(screen.getByRole('tab', { name: '日' })).toBeSelected();
    expect(screen.getByText('明天')).toBeTruthy();
    expect(cards()).toHaveLength(1);
  });

  it('week title shows the year on both ends across new year', async () => {
    await setup({ result: twoDays, outfits: planned });
    await press(screen.getByRole('tab', { name: '週' }));
    expect(screen.getByText('11/1（日） – 11/7（六）')).toBeTruthy();
    for (let i = 0; i < 8; i++) await press(screen.getByRole('button', { name: '下一週' }));
    expect(screen.getByText('2026/12/27（日） – 2027/1/2（六）')).toBeTruthy();
  });

  it('月檢視：有穿搭的日子顯示縮小版穿搭，點了打開那天的日檢視', async () => {
    await setup({ result: twoDays, outfits: planned });
    await press(screen.getByRole('tab', { name: '月' }));
    expect(screen.getByText('2026 年 11 月')).toBeTruthy();
    expect(screen.getByTestId('month-outfit-2026-11-03')).toBeTruthy();
    expect(screen.getByTestId('month-outfit-2026-11-04')).toBeTruthy();
    expect(screen.queryByTestId('month-outfit-2026-11-05')).toBeNull();
    await press(screen.getByRole('button', { name: '查看 11/4（三）' }));
    expect(screen.getByRole('tab', { name: '日' })).toBeSelected();
    expect(screen.getByText('明天')).toBeTruthy();
    expect(cards()).toHaveLength(1);
  });

  it('月檢視：沒有穿搭的日子顯示 ＋，點了新增那天的穿搭', async () => {
    await setup({ result: twoDays, outfits: planned });
    await press(screen.getByRole('tab', { name: '月' }));
    await press(screen.getByRole('button', { name: '新增 11/5（四）的穿搭' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/outfit/edit', params: { date: '2026-11-05' } });
  });

  it('月檢視可以往前看到過去的穿搭', async () => {
    await setup({ result: twoDays, outfits: [{ date: '2026-10-15', items: ['shirt'] }] });
    await press(screen.getByRole('tab', { name: '月' }));
    await press(screen.getByRole('button', { name: '上個月' }));
    expect(screen.getByText('2026 年 10 月')).toBeTruthy();
    expect(screen.getByTestId('month-outfit-2026-10-15')).toBeTruthy();
  });

  it('after picking a day beyond the forecast, the arrows keep moving both ways', async () => {
    await setup({ result: twoDays });
    await press(screen.getByRole('tab', { name: '週' }));
    await press(screen.getByRole('button', { name: '下一週' }));
    await press(screen.getByRole('button', { name: '下一週' }));
    await press(screen.getByRole('button', { name: '查看 11/20（五）' }));
    expect(screen.getByText('11/20（五）')).toBeTruthy();
    expect(screen.getByText('這一天沒有天氣資料')).toBeTruthy();
    await press(screen.getByLabelText('後一天'));
    expect(screen.getByText('11/21（六）')).toBeTruthy();
    await press(screen.getByLabelText('前一天'));
    await press(screen.getByLabelText('前一天'));
    expect(screen.getByText('11/19（四）')).toBeTruthy();
    await press(screen.getByRole('button', { name: '新增穿搭' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/outfit/edit', params: { date: '2026-11-19' } });
  });
});

describe('WeatherScreen outfit load error', () => {
  it.each(['日', '週', '月'])('shows an error with retry in the %s view when outfits fail to load', async mode => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const db = createMemoryDatabase({ now: () => NOW, newId: () => 'o1' });
    const shirt = await db.items.create({ brand: '', category: 'top', occasions: [], seasons: [], imageUri: null, originalUri: null, name: '白襯衫', price: null });
    await db.outfits.create({ name: '', date: '2026-11-02', items: [{ itemId: shirt.id, x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 }] });
    const { repo, control } = withFailures(db.outfits, ['listInRange']);
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, cwaApiKey: 'KEY' });
    render(
      <OutfitRepositoryProvider repository={repo}>
        <WeatherProvider repository={createMemoryWeatherRepository([])} fetcher={jest.fn().mockResolvedValue({ status: 'ok', days: [] })} now={() => currentNow}>
          <WithHeader>
            <WeatherScreen />
          </WithHeader>
        </WeatherProvider>
      </OutfitRepositoryProvider>,
    );
    await act(async () => {});
    if (mode !== '日') await act(async () => fireEvent.press(screen.getByRole('tab', { name: mode })));
    expect(await screen.findByText('讀取失敗')).toBeTruthy();
    control.failing = false;
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '重試' })));
    expect(screen.queryByText('讀取失敗')).toBeNull();
    expect(control.calls).toBeGreaterThan(1);
  });
});
