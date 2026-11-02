import { act, fireEvent, render, screen } from '@testing-library/react-native';
import WeatherScreen from '../../app/(tabs)/index';
import { WeatherProvider } from '@/db/WeatherContext';
import { createMemoryWeatherRepository } from '@/db/memoryWeatherRepository';
import type { DailyForecast, FetchForecastResult } from '@/lib/cwaWeather';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { WeatherDay } from '@/types/models';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

// 2026-11-03（二）10:00 台灣時間
const NOW = '2026-11-03T02:00:00.000Z';

const forecast = (date: string, maxT: number, extra: Partial<DailyForecast> = {}): DailyForecast => ({
  date, maxT, minT: maxT - 6, maxAT: maxT + 1, minAT: maxT - 8, pop: 30, wxCode: '04', wxText: '多雲', hasDaytime: true, ...extra,
});
const cached = (date: string, maxT: number): WeatherDay => ({
  county: '臺北市', town: '', date, maxT, minT: maxT - 6, maxAT: maxT, minAT: maxT - 7, pop: 10,
  wxCode: '01', wxText: '晴天', fetchedAt: '2026-11-02T02:00:00.000Z',
});

async function setup({ apiKey = 'KEY', result, seed = [] }: { apiKey?: string; result?: FetchForecastResult; seed?: WeatherDay[] }) {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, cwaApiKey: apiKey });
  const repo = createMemoryWeatherRepository(seed);
  const fetcher = jest.fn().mockResolvedValue(result ?? { status: 'ok', days: [] });
  render(
    <WeatherProvider repository={repo} fetcher={fetcher} now={() => NOW}>
      <WeatherScreen />
    </WeatherProvider>,
  );
  await act(async () => {});
  return { fetcher, repo };
}

beforeEach(() => mockPush.mockClear());

describe('WeatherScreen', () => {
  it('asks for the API key and links to settings when none is set', async () => {
    const { fetcher } = await setup({ apiKey: '' });
    expect(screen.getByText('請先到設定輸入氣象署授權碼')).toBeTruthy();
    fireEvent.press(screen.getByText('前往設定'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches the selected county and shows today', async () => {
    const { fetcher } = await setup({
      result: { status: 'ok', days: [forecast('2026-11-03', 25, { pop: 70, wxText: '短暫陣雨', wxCode: '08' }), forecast('2026-11-04', 22)] },
    });
    expect(fetcher).toHaveBeenCalledWith({ apiKey: 'KEY', county: '臺北市' });
    expect(screen.getByText('11/3（二）')).toBeTruthy();
    expect(screen.getByText('今天')).toBeTruthy();
    expect(screen.getByText('臺北市')).toBeTruthy();
    expect(screen.getByText('短暫陣雨')).toBeTruthy();
    expect(screen.getByText('25°')).toBeTruthy();
    expect(screen.getByText('19°')).toBeTruthy();
    expect(screen.getByText('體感 17°–26°')).toBeTruthy();
    expect(screen.getByText('降雨機率 70%')).toBeTruthy();
  });

  it('moves between cached dates and stops at both ends', async () => {
    await setup({ seed: [cached('2026-11-02', 28)], result: { status: 'ok', days: [forecast('2026-11-03', 25), forecast('2026-11-04', 22)] } });
    const prev = screen.getByLabelText('前一天');
    const next = screen.getByLabelText('後一天');

    fireEvent.press(next);
    expect(screen.getByText('明天')).toBeTruthy();
    expect(screen.getByText('22°')).toBeTruthy();
    expect(next).toBeDisabled();

    fireEvent.press(prev);
    fireEvent.press(prev);
    expect(screen.getByText('昨天')).toBeTruthy();
    expect(screen.getByText('28°')).toBeTruthy();
    expect(screen.getByText('晴天')).toBeTruthy();
    expect(prev).toBeDisabled();
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
});
