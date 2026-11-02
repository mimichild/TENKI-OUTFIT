import fixture from './fixtures/cwa-f-d0047-091.json';
import {
  buildForecastUrl,
  fetchForecast,
  parseForecast,
  taipeiDate,
  wxCategory,
} from '@/lib/cwaWeather';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('taipeiDate', () => {
  it('uses UTC+8 regardless of device time zone', () => {
    expect(taipeiDate('2026-11-02T15:59:59.000Z')).toBe('2026-11-02');
    expect(taipeiDate('2026-11-02T16:00:00.000Z')).toBe('2026-11-03');
  });
});

describe('buildForecastUrl', () => {
  it('targets F-D0047-091 with the county and needed elements, encoded', () => {
    const url = buildForecastUrl('CWA-KEY', '臺北市');
    expect(url.startsWith('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-091?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('Authorization')).toBe('CWA-KEY');
    expect(params.get('LocationName')).toBe('臺北市');
    expect(params.get('ElementName')?.split(',')).toEqual([
      '最高溫度', '最低溫度', '最高體感溫度', '最低體感溫度', '12小時降雨機率', '天氣現象',
    ]);
  });
});

type InlinePeriod = [string, { MaxTemperature: string; MinTemperature: string; PoP: string; wx: [string, string] }];
function inline(periods: InlinePeriod[]) {
  const el = (name: string, value: (p: InlinePeriod[1]) => Record<string, string>) => ({
    ElementName: name,
    Time: periods.map(([start, p]) => ({ StartTime: start, EndTime: start, ElementValue: [value(p)] })),
  });
  return {
    records: { Locations: [{ Location: [{ LocationName: '臺北市', WeatherElement: [
      el('最高溫度', p => ({ MaxTemperature: p.MaxTemperature })),
      el('最低溫度', p => ({ MinTemperature: p.MinTemperature })),
      el('12小時降雨機率', p => ({ ProbabilityOfPrecipitation: p.PoP })),
      el('天氣現象', p => ({ WeatherCode: p.wx[0], Weather: p.wx[1] })),
    ] }] }] },
  };
}

describe('parseForecast', () => {
  const days = parseForecast(fixture, '臺北市');

  it('groups 12-hour periods into Taipei dates, only for the requested county', () => {
    expect(days.map(d => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  // 做法 B（使用者決定 2026-11-02）：最高溫／降雨／天氣看當天白天 06–18，最低溫看前一晚 18:00–當天 06:00
  it('uses the daytime period for highs, rain and weather, and the previous night for lows', () => {
    expect(days[1]).toEqual({
      date: '2026-11-03',
      maxT: 26, maxAT: 27, pop: 70, wxCode: '08', wxText: '短暫陣雨', // 11/3 白天
      minT: 17, minAT: 15, // 11/2 18:00–11/3 06:00
      hasDaytime: true,
    });
    expect(days[2]).toMatchObject({ date: '2026-11-04', maxT: 25, minT: 16, maxAT: 24, minAT: 14 });
  });


  it('uses the night period only when the day has no daytime period', () => {
    expect(days[0]).toMatchObject({ maxT: 21, minT: 17, pop: 20, wxCode: '04', wxText: '多雲', hasDaytime: false });
  });

  it('treats "-" rain chance as unknown', () => {
    expect(days[2]).toMatchObject({ pop: null, wxCode: '01', hasDaytime: true });
  });

  it('ignores a rainy night when rating the day', () => {
    const json = inline([
      ['2026-11-05T06:00:00+08:00', { MaxTemperature: '22', MinTemperature: '16', PoP: '10', wx: ['01', '晴天'] }],
      ['2026-11-05T18:00:00+08:00', { MaxTemperature: '16', MinTemperature: '12', PoP: '70', wx: ['08', '短暫陣雨'] }],
    ]);
    expect(parseForecast(json, '臺北市')).toEqual([
      { date: '2026-11-05', maxT: 22, minT: 16, maxAT: null, minAT: null, pop: 10, wxCode: '01', wxText: '晴天', hasDaytime: true },
    ]);
  });

  it('falls back to the daytime low when the previous night is not in the forecast', () => {
    const json = inline([['2026-11-05T06:00:00+08:00', { MaxTemperature: '22', MinTemperature: '16', PoP: '10', wx: ['01', '晴天'] }]]);
    expect(parseForecast(json, '臺北市')[0]).toMatchObject({ minT: 16 });
  });

  it('returns [] when the county is missing or the shape is unexpected', () => {
    expect(parseForecast(fixture, '連江縣')).toEqual([]);
    expect(parseForecast({ records: {} }, '臺北市')).toEqual([]);
    expect(parseForecast(null, '臺北市')).toEqual([]);
  });

  it('accepts lowercase location keys used by some CWA responses', () => {
    const lower = { records: { locations: [{ location: fixture.records.Locations[0].Location } ] } };
    expect(parseForecast(lower, '臺北市')).toHaveLength(3);
  });
});

describe('fetchForecast', () => {
  it('reports noKey without calling the network', async () => {
    const fetchImpl = jest.fn();
    await expect(fetchForecast({ apiKey: ' ', county: '臺北市', fetchImpl })).resolves.toEqual({ status: 'noKey' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns parsed days on success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(fixture));
    const result = await fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.days).toHaveLength(3);
  });

  it('maps 401/403 to unauthorized', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));
    await expect(fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl })).resolves.toEqual({ status: 'unauthorized' });
  });

  it('maps other HTTP errors and unparseable bodies to badResponse', async () => {
    const f500 = jest.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl: f500 })).resolves.toEqual({ status: 'badResponse' });
    const fEmpty = jest.fn().mockResolvedValue(jsonResponse({ success: 'true', records: {} }));
    await expect(fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl: fEmpty })).resolves.toEqual({ status: 'badResponse' });
  });

  it('maps an invalid JSON body (e.g. an HTML error page) to badResponse', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response);
    await expect(fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl })).resolves.toEqual({ status: 'badResponse' });
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    }));
    const p = fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl, signal: controller.signal });
    controller.abort();
    await expect(p).resolves.toEqual({ status: 'aborted' });
  });

  it('maps thrown fetch errors to network', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl })).resolves.toEqual({ status: 'network' });
  });

  it('times out', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      }));
      const p = fetchForecast({ apiKey: 'k', county: '臺北市', fetchImpl, timeoutMs: 1000 });
      jest.advanceTimersByTime(1000);
      await expect(p).resolves.toEqual({ status: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('wxCategory', () => {
  it.each([
    ['01', 'clear'], ['02', 'partlyCloudy'], ['03', 'partlyCloudy'], ['04', 'cloudy'], ['07', 'cloudy'],
    ['08', 'rain'], ['15', 'thunder'], ['24', 'fog'], ['23', 'snow'], ['42', 'snow'], [null, 'unknown'], ['99', 'unknown'],
  ])('%s → %s', (code, cat) => {
    expect(wxCategory(code)).toBe(cat);
  });
});
