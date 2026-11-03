import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import SuggestScreen from '../../app/(tabs)/suggest';
import { ItemRepositoryProvider, useItemsVersion } from '@/db/ItemRepositoryContext';
import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { createMemoryWeatherRepository } from '@/db/memoryWeatherRepository';
import { WeatherProvider } from '@/db/WeatherContext';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { Category, Occasion, Season, WeatherDay } from '@/types/models';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/cwaKey', () => ({ builtInCwaKey: () => '', effectiveCwaKey: () => '' }));

// 2026-11-03（二）10:00 台灣時間
const NOW = '2026-11-03T02:00:00.000Z';

const day = (date: string, maxAT: number, minAT: number, pop: number | null = 10): WeatherDay => ({
  county: '臺北市', town: '', date, maxT: maxAT, minT: minAT, maxAT, minAT, pop,
  wxCode: '01', wxText: '晴天', fetchedAt: NOW,
});

type Seed = { name: string; category: Category; seasons?: Season[]; occasions?: Occasion[] };

const BASIC: Seed[] = [
  { name: '白色短袖', category: 'top', seasons: ['summer'] },
  { name: '牛仔褲', category: 'bottom' },
  { name: '薄外套', category: 'outerwear', seasons: ['spring', 'autumn'] },
  { name: '白球鞋', category: 'shoes' },
];

async function setup({ items = BASIC, weather = [day('2026-11-03', 29, 19, 70), day('2026-11-04', 33, 28)] }: { items?: Seed[]; weather?: WeatherDay[] } = {}) {
  let n = 0;
  const db = createMemoryDatabase({ now: () => NOW, newId: () => `id${++n}` });
  const ids: Record<string, string> = {};
  for (const s of items) {
    const created = await db.items.create({
      name: s.name, brand: '', category: s.category, price: null, occasions: s.occasions ?? [], seasons: s.seasons ?? [],
      imageUri: null, originalUri: null,
    });
    ids[s.name] = created.id;
  }
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  const weatherRepo = createMemoryWeatherRepository(weather);
  render(
    <ItemRepositoryProvider repository={db.items}>
      <WeatherProvider repository={weatherRepo} fetcher={jest.fn()} now={() => NOW}>
        <SuggestScreen />
      </WeatherProvider>
    </ItemRepositoryProvider>,
  );
  await act(async () => {});
  return { ids, db, weatherRepo };
}

beforeEach(() => mockPush.mockClear());

describe('SuggestScreen', () => {
  it('suggests an outfit for today with two sentences', async () => {
    await setup();
    expect(screen.getByRole('tab', { name: '今日' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('體感 19°–29°')).toBeTruthy();
    expect(screen.getByText('白色短袖搭配牛仔褲，外加一件薄外套，輕鬆好搭，日常都適合。')).toBeTruthy();
    expect(screen.getByText('今天體感 19–29°，早晚偏涼、中午偏暖，外套方便穿脫。降雨機率 70%，記得帶傘。')).toBeTruthy();
  });

  it('switches to tomorrow', async () => {
    await setup();
    fireEvent.press(screen.getByRole('tab', { name: '明日' }));
    expect(screen.getByText('白色短袖搭配牛仔褲，輕鬆好搭，日常都適合。')).toBeTruthy();
    expect(screen.getByText('明天體感 28–33°，天氣炎熱，透氣的夏季單品最舒服。')).toBeTruthy();
  });

  it('filters by occasion', async () => {
    await setup({
      items: [
        { name: '襯衫', category: 'top', occasions: ['work'] },
        { name: '運動上衣', category: 'top', occasions: ['sport'] },
        { name: '西裝褲', category: 'bottom', occasions: ['work'] },
      ],
    });
    fireEvent.press(screen.getByRole('radio', { name: '上班' }));
    expect(screen.getByText(/^襯衫搭配西裝褲/)).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: '正式' }));
    expect(screen.getByText('沒有符合的單品')).toBeTruthy();
  });

  it('shuffles to another outfit', async () => {
    await setup({ items: [{ name: 'A 上衣', category: 'top' }, { name: 'B 上衣', category: 'top' }, { name: '褲子', category: 'bottom' }] });
    const first = screen.getByText(/搭配褲子/).props.children as string;
    fireEvent.press(screen.getByRole('button', { name: '更新' }));
    const second = screen.getByText(/搭配褲子/).props.children as string;
    expect(second).not.toBe(first);
    expect(screen.queryByText('沒有其他組合了')).toBeNull();
  });

  it('says when there is no other combination', async () => {
    await setup();
    fireEvent.press(screen.getByRole('button', { name: '更新' }));
    expect(screen.getByText('沒有其他組合了')).toBeTruthy();
  });

  it('lists what is missing', async () => {
    await setup({ items: [{ name: '上衣', category: 'top' }, { name: '褲子', category: 'bottom' }] });
    expect(screen.getByText('缺少：外套、鞋子')).toBeTruthy();
  });

  it('works without weather data', async () => {
    await setup({ weather: [] });
    expect(screen.getByText('沒有這天的天氣資料')).toBeTruthy();
    expect(screen.getByText('目前沒有這天的天氣資料，這套只依場合挑選。')).toBeTruthy();
  });

  it('asks to add items when the closet is empty', async () => {
    await setup({ items: [] });
    expect(screen.getByText('衣櫃裡還沒有單品，先到「服裝」新增')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '存成穿搭' })).toBeNull();
  });

  it('opens the canvas with the suggested items and date', async () => {
    const { ids } = await setup();
    fireEvent.press(screen.getByRole('tab', { name: '明日' }));
    fireEvent.press(screen.getByRole('button', { name: '存成穿搭' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/outfit/edit',
      params: { date: '2026-11-04', items: [ids['白色短袖'], ids['牛仔褲'], ids['白球鞋']].join(',') },
    });
  });

  it('keeps the same outfit when items change but re-picks when a suggested item disappears', async () => {
    const { ids, db } = await setup({ items: [{ name: 'A 上衣', category: 'top' }, { name: 'B 上衣', category: 'top' }, { name: '褲子', category: 'bottom' }] });
    const first = screen.getByText(/搭配褲子/).props.children as string;
    const shown = first.startsWith('A') ? 'A 上衣' : 'B 上衣';
    await act(async () => {
      await db.items.moveToTrash(ids[shown]);
    });
    // 暫存區的單品不會被建議；畫面要重新讀取（實際 App 由 bumpItemsVersion 通知）
    await act(async () => useItemsVersion.getState().bump());
    expect(screen.getByText(/搭配褲子/).props.children).not.toBe(first);
  });

  it('re-picks when a suggested item is edited so it no longer fits', async () => {
    const { ids, db } = await setup();
    const shirt = (await db.items.get(ids['白色短袖']))!;
    await act(async () => {
      await db.items.update(shirt.id, { ...shirt, category: 'shoes' });
    });
    await act(async () => useItemsVersion.getState().bump());
    // 上衣沒了 → 湊不出上衣＋下著，也沒有連身
    expect(screen.getByText('沒有符合的單品')).toBeTruthy();
  });

  it('describes the latest temperatures when re-read weather stays in the same band', async () => {
    let onChange: ((s: AppStateStatus) => void) | undefined;
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, handler: (s: AppStateStatus) => void) => {
      onChange = handler;
      return { remove: () => {} };
    }) as typeof AppState.addEventListener;
    try {
      const { weatherRepo } = await setup();
      const first = screen.getByText(/^白色短袖搭配牛仔褲/).props.children;
      await weatherRepo.upsert(
        '臺北市',
        [{ date: '2026-11-03', maxT: 28, minT: 18, maxAT: 28, minAT: 18, pop: 70, wxCode: '01', wxText: '晴天', hasDaytime: true }],
        NOW,
      );
      await act(async () => { onChange?.('active'); });
      expect(screen.getByText('體感 18°–28°')).toBeTruthy();
      expect(screen.getByText(/^今天體感 18–28°/)).toBeTruthy();
      expect(screen.getByText(/^白色短袖搭配牛仔褲/).props.children).toBe(first);
    } finally {
      AppState.addEventListener = original;
    }
  });
});
