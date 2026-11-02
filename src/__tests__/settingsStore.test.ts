import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useSettingsStore, DEFAULT_SETTINGS, loadSecureSettings } from '@/store/settingsStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  await SecureStore.deleteItemAsync('cwaApiKey');
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
});

describe('settingsStore', () => {
  it('starts with Taiwan defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.language).toBe('zh-TW');
    expect(s.currency).toBe('TWD');
    expect(s.county).toBe('臺北市');
    expect(s.cwaApiKey).toBe('');
  });

  it('updates and persists settings', async () => {
    useSettingsStore.getState().update({ language: 'ja', themeColor: 'sakura' });
    expect(useSettingsStore.getState().language).toBe('ja');
    await new Promise(r => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('tenki-settings');
    expect(JSON.parse(raw!).state).toMatchObject({ language: 'ja', themeColor: 'sakura' });
  });

  it('trims the CWA api key', () => {
    useSettingsStore.getState().update({ cwaApiKey: '  CWA-ABC  ' });
    expect(useSettingsStore.getState().cwaApiKey).toBe('CWA-ABC');
  });

  it('keeps the CWA api key out of AsyncStorage and in secure storage', async () => {
    useSettingsStore.getState().update({ cwaApiKey: 'CWA-SECRET', language: 'en' });
    await new Promise(r => setTimeout(r, 0));
    const raw = (await AsyncStorage.getItem('tenki-settings'))!;
    expect(raw).not.toContain('CWA-SECRET');
    expect(await SecureStore.getItemAsync('cwaApiKey')).toBe('CWA-SECRET');
  });

  it('deletes the secure key when cleared', async () => {
    useSettingsStore.getState().update({ cwaApiKey: 'CWA-SECRET' });
    useSettingsStore.getState().update({ cwaApiKey: '' });
    await new Promise(r => setTimeout(r, 0));
    expect(await SecureStore.getItemAsync('cwaApiKey')).toBeNull();
  });

  it('loads the secure key into the store on startup', async () => {
    await SecureStore.setItemAsync('cwaApiKey', 'CWA-LOADED');
    await loadSecureSettings();
    expect(useSettingsStore.getState().cwaApiKey).toBe('CWA-LOADED');
  });
});

describe('settingsStore hydration', () => {
  it('falls back to defaults for unknown persisted values', async () => {
    await AsyncStorage.setItem(
      'tenki-settings',
      JSON.stringify({ state: { language: 'fr', themeColor: 'neon', currency: 'XYZ', county: '火星', cwaApiKey: 'PLAIN' }, version: 1 }),
    );
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState()).toMatchObject({
      language: 'zh-TW', themeColor: 'sky', currency: 'TWD', county: '臺北市',
    });
  });
});
