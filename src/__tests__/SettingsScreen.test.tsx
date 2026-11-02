import { fireEvent, render, screen } from '@testing-library/react-native';
import SettingsScreen from '../../app/(tabs)/settings';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));

describe('SettingsScreen', () => {
  it('switches the UI language from the language picker', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: '語言' }));
    fireEvent.press(screen.getByText('English'));
    expect(useSettingsStore.getState().language).toBe('en');
    expect(screen.getByRole('button', { name: 'Language' })).toBeTruthy();
  });

  it('changes the theme color when a swatch is tapped', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: '抹茶綠' }));
    expect(useSettingsStore.getState().themeColor).toBe('matcha');
  });

  it('changes region and resets the town', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: '地區' }));
    fireEvent.press(screen.getByText('高雄市'));
    expect(useSettingsStore.getState()).toMatchObject({ county: '高雄市', town: '' });
  });

  it('stores the trimmed CWA key', () => {
    render(<SettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('氣象署授權碼'), ' CWA-123 ');
    expect(useSettingsStore.getState().cwaApiKey).toBe('CWA-123');
  });
});
