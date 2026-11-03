import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps } from 'react';
import { useT } from '@/i18n';
import { TAB_STATUS_BAR_STYLE, tabScreenOptions } from '@/theme/tabScreenOptions';
import { useTheme } from '@/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: string; size: number }) {
    return <Ionicons name={name} size={size} color={color} />;
  };
}

// 分頁順序依需求：設定／服裝／天氣穿搭／穿搭建議；開 App 預設停在「天氣穿搭」(index)
export default function TabLayout() {
  const t = useT();
  const theme = useTheme();
  // 只在主分頁顯示時改狀態列顏色；進入其他頁面時卸載，回到根層的 auto 設定
  const focused = useIsFocused();

  return (
    <>
      {focused && <StatusBar style={TAB_STATUS_BAR_STYLE} />}
      <Tabs screenOptions={tabScreenOptions(theme)}>
        <Tabs.Screen name="settings" options={{ title: t('tab.settings'), tabBarIcon: tabIcon('settings-outline') }} />
        <Tabs.Screen name="closet" options={{ title: t('tab.closet'), tabBarIcon: tabIcon('shirt-outline') }} />
        <Tabs.Screen name="index" options={{ title: t('tab.weather'), tabBarIcon: tabIcon('partly-sunny-outline') }} />
        <Tabs.Screen name="suggest" options={{ title: t('tab.suggest'), tabBarIcon: tabIcon('sparkles-outline') }} />
      </Tabs>
    </>
  );
}
