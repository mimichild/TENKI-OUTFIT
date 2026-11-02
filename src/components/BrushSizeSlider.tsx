import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BRUSH_MAX, BRUSH_MIN, brushFromSlider, sliderFromBrush } from '@/lib/maskEditing';
import { useTheme } from '@/theme/useTheme';

const STEP = 4;
const THUMB = 26;
/** 預覽圓點顯示上限（畫面寬度有限，超過就只看數字） */
const PREVIEW_MAX = 44;

interface Props {
  /** 筆刷粗細（畫面像素） */
  value: number;
  onChange: (size: number) => void;
  label: string;
}

/** 拖拉或點軌道選擇筆刷粗細；左邊圓點即時顯示實際大小 */
export function BrushSizeSlider({ value, onChange, label }: Props) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  /** x：手指在整個觸控區的位置；扣掉半個圓鈕才是軌道上的位置 */
  const set = (x: number) => {
    const next = brushFromSlider(x - THUMB / 2, trackWidth);
    if (next !== value) onChange(next);
  };

  // 拖拉與點擊都直接跳到手指位置
  const drag = Gesture.Pan().runOnJS(true).minDistance(0).onBegin(e => set(e.x)).onUpdate(e => set(e.x));

  const clamp = (n: number) => Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, n));
  const thumbLeft = sliderFromBrush(value, trackWidth);
  const preview = Math.min(value, PREVIEW_MAX);

  return (
    <View style={styles.row}>
      <View style={styles.previewBox}>
        <View style={{ width: preview, height: preview, borderRadius: preview / 2, backgroundColor: theme.primary }} />
      </View>
      <GestureDetector gesture={drag}>
        <View
          style={styles.hitArea}
          onLayout={e => setTrackWidth(e.nativeEvent.layout.width - THUMB)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: BRUSH_MIN, max: BRUSH_MAX, now: value, text: String(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? STEP : -STEP)))}
        >
          {/* 軌道左右各內縮半個圓鈕，圓鈕中心才會對到手指 */}
          <View style={[styles.track, { backgroundColor: theme.border }]}>
            <View style={{ width: Math.max(0, thumbLeft), height: '100%', borderRadius: 2, backgroundColor: theme.primary }} />
          </View>
          <View
            style={[
              styles.thumb,
              { left: Math.max(0, thumbLeft), backgroundColor: theme.surface, borderColor: theme.primary },
            ]}
          />
        </View>
      </GestureDetector>
      <Text style={[styles.value, { color: theme.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewBox: { width: PREVIEW_MAX, height: PREVIEW_MAX, alignItems: 'center', justifyContent: 'center' },
  hitArea: { flex: 1, height: 44, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, marginHorizontal: THUMB / 2, overflow: 'hidden' },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 2 },
  value: { width: 28, textAlign: 'right', fontSize: 13, fontVariant: ['tabular-nums'] },
});
