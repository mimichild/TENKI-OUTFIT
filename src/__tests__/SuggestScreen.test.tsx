import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import SuggestScreen from '../../app/(tabs)/suggest';
import { ItemRepositoryProvider, useItemsVersion } from '@/db/ItemRepositoryContext';
import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { createMemoryWeatherRepository } from '@/db/memoryWeatherRepository';
import { WeatherProvider } from '@/db/WeatherContext';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { Category, Occasion, Season, WeatherDay } from '@/types/models';
import { withFailures } from './helpers/failingRepo';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/photoStorage', () => ({
  ...jest.requireActual('@/lib/photoStorage'),
  clearCutoutCache: jest.fn(), clearBackupTemp: jest.fn(), deletePhotos: jest.fn(), listPhotoFiles: () => [],
}));
jest.mock('@/lib/cwaKey', () => ({ builtInCwaKey: () => '', effectiveCwaKey: () => '' }));
// 記錄畫布掛載次數：卡片在換日期／場合時若中間閃一幀空白，畫布會被卸掉再掛上
let mockCanvasMounts = 0;
jest.mock('@/components/OutfitCanvasView', () => {
  const actual = jest.requireActual('@/components/OutfitCanvasView');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    OutfitCanvasView: (props: Parameters<typeof actual.OutfitCanvasView>[0]) => {
      useEffect(() => { mockCanvasMounts++; }, []);
      return actual.OutfitCanvasView(props);
    },
  };
});

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

beforeEach(() => {
  mockPush.mockClear();
  mockCanvasMounts = 0;
});

describe('SuggestScreen', () => {
  it('上方顯示氣溫與天氣；下方說明穿搭風格、體感與降雨、溫度適配；不列出單品名稱', async () => {
    await setup();
    expect(screen.getByRole('tab', { name: '今日' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('氣溫 19°–29°')).toBeTruthy();
    expect(screen.getByText('晴天')).toBeTruthy();
    expect(screen.queryByText('體感 19°–29°')).toBeNull();
    expect(screen.getByText(/^薄外套內搭白色短袖，配上牛仔褲，.+。$/)).toBeTruthy();
    expect(screen.getByText('今天體感 19–29°，降雨機率 70%。')).toBeTruthy();
    expect(screen.getByText('早晚偏涼、中午偏暖，這套有外套方便穿脫。容易下雨，記得帶傘。')).toBeTruthy();
    expect(screen.queryByText(/白色短袖、牛仔褲/)).toBeNull();
  });

  it('switches to tomorrow', async () => {
    await setup();
    fireEvent.press(screen.getByRole('tab', { name: '明日' }));
    expect(screen.getByText(/^白色短袖搭配牛仔褲，.+。$/)).toBeTruthy();
    expect(screen.getByText('明天體感 28–33°，降雨機率 10%。')).toBeTruthy();
    expect(screen.getByText('天氣炎熱，這套輕薄透氣，穿起來清爽。')).toBeTruthy();
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
    expect(screen.getByText('還湊不成一套')).toBeTruthy();
    expect(screen.getByText('有上衣，但季節或場合不符合今天')).toBeTruthy();
    expect(screen.getByText('有下著，但季節或場合不符合今天')).toBeTruthy();
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

  it('re-picks when an item it was missing (shoes) is added', async () => {
    const { db } = await setup({ items: [{ name: '上衣', category: 'top' }, { name: '褲子', category: 'bottom' }] });
    expect(screen.getByText('缺少：外套、鞋子')).toBeTruthy();
    await act(async () => {
      await db.items.create({ name: '球鞋', brand: '', category: 'shoes', price: null, occasions: [], seasons: [], imageUri: null, originalUri: null });
      useItemsVersion.getState().bump();
    });
    expect(screen.getByText('缺少：外套')).toBeTruthy();
  });

  it('shows an error with retry when the local weather cache cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    const db = createMemoryDatabase({ now: () => NOW, newId: () => `id${++n}` });
    await db.items.create({ name: '上衣', brand: '', category: 'top', price: null, occasions: [], seasons: [], imageUri: null, originalUri: null });
    useSettingsStore.setState({ ...DEFAULT_SETTINGS });
    const weatherRepo = createMemoryWeatherRepository([day('2026-11-03', 29, 19)]);
    const realList = weatherRepo.list.bind(weatherRepo);
    let failing = true;
    weatherRepo.list = async (county: string) => {
      if (failing) throw new Error('storage');
      return realList(county);
    };
    render(
      <ItemRepositoryProvider repository={db.items}>
        <WeatherProvider repository={weatherRepo} fetcher={jest.fn()} now={() => NOW}>
          <SuggestScreen />
        </WeatherProvider>
      </ItemRepositoryProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('讀取失敗')).toBeTruthy();
    failing = false;
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '重試' })));
    expect(screen.queryByText('讀取失敗')).toBeNull();
  });

  it('says a bottom is missing when the closet only has tops', async () => {
    await setup({ items: [{ name: '白T', category: 'top' }, { name: '球鞋', category: 'shoes' }] });
    expect(screen.getByText('還差一件下著（或一件連身）')).toBeTruthy();
    expect(screen.queryByText('可以換個場合，或確認單品的季節、場合設定')).toBeNull();
  });

  it('says the bottom does not fit today when it is filtered out', async () => {
    await setup({ items: [{ name: '白T', category: 'top' }, { name: '毛褲', category: 'bottom', seasons: ['winter'] }] });
    expect(screen.getByText('有下著，但季節或場合不符合今天')).toBeTruthy();
  });

  it('keeps the card on screen while switching day or occasion (no blank frame)', async () => {
    await setup();
    expect(mockCanvasMounts).toBe(1);
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: '明日' })));
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: '上班' })));
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: '今日' })));
    expect(screen.getByRole('button', { name: '存成穿搭' })).toBeTruthy();
    expect(mockCanvasMounts).toBe(1);
  });

  it('wraps long item names to at most two lines', async () => {
    await setup({ items: [{ name: '非常非常長的名稱'.repeat(6), category: 'onepiece' }] });
    // 卡片下方不再列出單品名稱；只剩畫布上沒有照片時的名稱，最多兩行
    const texts = screen.getAllByText('非常非常長的名稱'.repeat(6));
    expect(texts).toHaveLength(1);
    expect(texts[0].props.numberOfLines).toBe(2);
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
    expect(screen.getByText('還差一件上衣（或一件連身）')).toBeTruthy();
  });

  it('describes the latest temperatures when re-read weather stays in the same band', async () => {
    // 天氣與單品的 Provider 都會監聽回到前景
    const handlers: ((s: AppStateStatus) => void)[] = [];
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, handler: (s: AppStateStatus) => void) => {
      handlers.push(handler);
      return { remove: () => {} };
    }) as typeof AppState.addEventListener;
    try {
      const { weatherRepo } = await setup();
      const first = screen.getByText(/內搭白色短袖，配上牛仔褲/).props.children;
      await weatherRepo.upsert(
        '臺北市',
        [{ date: '2026-11-03', maxT: 28, minT: 18, maxAT: 28, minAT: 18, pop: 70, wxCode: '01', wxText: '晴天', hasDaytime: true }],
        NOW,
      );
      await act(async () => { handlers.forEach(h => h('active')); });
      expect(screen.getByText('氣溫 18°–28°')).toBeTruthy();
      expect(screen.getByText(/^今天體感 18–28°/)).toBeTruthy();
      expect(screen.getByText(/內搭白色短袖，配上牛仔褲/).props.children).toBe(first);
    } finally {
      AppState.addEventListener = original;
    }
  });
});

describe('SuggestScreen load error', () => {
  it('shows an error with retry when items fail to load', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = await setup();
    screen.unmount();
    const { repo, control } = withFailures(db.items, ['list']);
    useSettingsStore.setState({ ...DEFAULT_SETTINGS });
    render(
      <ItemRepositoryProvider repository={repo}>
        <WeatherProvider repository={createMemoryWeatherRepository([day('2026-11-03', 29, 19, 70)])} fetcher={jest.fn()} now={() => NOW}>
          <SuggestScreen />
        </WeatherProvider>
      </ItemRepositoryProvider>,
    );
    expect(await screen.findByText('讀取失敗')).toBeTruthy();
    control.failing = false;
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '重試' })));
    expect(await screen.findByRole('button', { name: '更新' })).toBeTruthy();
    expect(screen.queryByText('讀取失敗')).toBeNull();
  });
});
