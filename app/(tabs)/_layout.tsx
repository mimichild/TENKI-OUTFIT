import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: string; size: number }) {
    return <Ionicons name={name} size={size} color={color} />;
  };
}

// 分頁順序依需求：設定／服裝／每日氣象／穿搭建議；開 App 預設停在「每日氣象」(index)
export default function TabLayout() {
  const t = useT();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primaryText,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen name="settings" options={{ title: t('tab.settings'), tabBarIcon: tabIcon('settings-outline') }} />
      <Tabs.Screen name="closet" options={{ title: t('tab.closet'), tabBarIcon: tabIcon('shirt-outline') }} />
      <Tabs.Screen name="index" options={{ title: t('tab.weather'), tabBarIcon: tabIcon('partly-sunny-outline') }} />
      <Tabs.Screen name="suggest" options={{ title: t('tab.suggest'), tabBarIcon: tabIcon('sparkles-outline') }} />
    </Tabs>
  );
}
