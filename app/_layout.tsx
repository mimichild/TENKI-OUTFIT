import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { loadSecureSettings, useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/useTheme';

// 設定讀回來前先維持啟動畫面（蓋住底下的畫面），避免語言/主題色閃一下預設值
SplashScreen.preventAutoHideAsync();

function useSettingsHydrated() {
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist.hasHydrated());
  const [secureLoaded, setSecureLoaded] = useState(false);
  useEffect(() => {
    loadSecureSettings()
      .catch(e => console.warn('讀取授權碼失敗', e))
      .finally(() => setSecureLoaded(true));
  }, []);
  useEffect(() => {
    if (hydrated) return;
    const unsubscribe = useSettingsStore.persist.onFinishHydration(() => setHydrated(true));
    if (useSettingsStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, [hydrated]);
  return hydrated && secureLoaded;
}

export default function RootLayout() {
  const hydrated = useSettingsHydrated();
  const theme = useTheme();
  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DatabaseProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.surface },
              headerTintColor: theme.text,
              contentStyle: { backgroundColor: theme.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="item/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="item/[id]" />
          </Stack>
          <StatusBar style="auto" />
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
