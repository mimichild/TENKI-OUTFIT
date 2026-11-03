import type { Theme } from './useTheme';

/** 主分頁標題列與分頁列的文字顏色：一律白色，不隨主題深淺改變 */
export const TAB_BAR_TEXT = '#FFFFFF';

/** 標題列文字是白色，手機狀態列（時間、電量）也用淺色圖示 */
export const TAB_STATUS_BAR_STYLE = 'light' as const;

/** 主分頁（設定／服裝／天氣穿搭／穿搭建議）的標題列與分頁列：用主題色填滿、白字 */
export function tabScreenOptions(theme: Theme) {
  return {
    headerStyle: { backgroundColor: theme.primary },
    headerTintColor: TAB_BAR_TEXT,
    tabBarStyle: { backgroundColor: theme.primary, borderTopColor: theme.primary },
    tabBarActiveTintColor: TAB_BAR_TEXT,
    // 未選中的分頁：白字加 60% 透明度，跟選中的分頁做出區別
    tabBarInactiveTintColor: `${TAB_BAR_TEXT}99`,
    sceneStyle: { backgroundColor: theme.background },
  };
}
