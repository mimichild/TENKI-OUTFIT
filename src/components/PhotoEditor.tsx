import {
  Canvas,
  Group,
  Image as SkiaImage,
  ImageFormat,
  ImageShader,
  Path,
  Skia,
  drawAsImage,
  useImage,
  type SkImage,
  type SkPath,
} from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import {
  BRUSH_DEFAULT,
  addPoint,
  containRect,
  outputSize,
  startStroke,
  undoStroke,
  type BrushMode,
  type Point,
  type Size,
  type Stroke,
} from '@/lib/maskEditing';
import { useTheme, type Theme } from '@/theme/useTheme';
import { BrushSizeSlider } from './BrushSizeSlider';
import { Chip } from './Chip';

/** Web 版（PhotoEditor.web.tsx）為 false，表單就不顯示「重新編輯照片」 */
export const PHOTO_EDITOR_SUPPORTED = true;

interface Props {
  /** 目前顯示的圖（去背 PNG；沒去背時是原圖） */
  imageUri: string;
  /** 「補回」筆刷取像素的來源；與 imageUri 等比例 */
  originalUri: string;
  /** 存好的新去背 PNG（暫存資料夾），由表單存檔時再複製進 App */
  onDone: (uri: string) => void;
  onCancel: () => void;
}

function toPath(points: Point[]): SkPath {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  // 只點一下也要畫出圓點
  if (points.length === 1) path.lineTo(points[0].x + 0.01, points[0].y);
  for (const p of points.slice(1)) path.lineTo(p.x, p.y);
  return path;
}

type DrawnStroke = { stroke: Stroke; path: SkPath };

/** 以圖片像素座標畫出：底圖 → 依序套用擦除（clear）與補回（原圖 shader） */
function Layers({ base, original, size, strokes }: { base: SkImage; original: SkImage; size: Size; strokes: DrawnStroke[] }) {
  const rect = { x: 0, y: 0, width: size.width, height: size.height };
  return (
    <Group layer>
      <SkiaImage image={base} fit="fill" {...rect} />
      {strokes.map(({ stroke, path }, i) =>
        stroke.mode === 'erase' ? (
          <Path key={i} path={path} style="stroke" strokeWidth={stroke.width} strokeCap="round" strokeJoin="round" blendMode="clear" color="black" />
        ) : (
          <Path key={i} path={path} style="stroke" strokeWidth={stroke.width} strokeCap="round" strokeJoin="round">
            <ImageShader image={original} fit="fill" rect={rect} />
          </Path>
        ),
      )}
    </Group>
  );
}

async function exportPng(base: SkImage, original: SkImage, strokes: DrawnStroke[]): Promise<string> {
  const size = { width: base.width(), height: base.height() };
  const out = outputSize(size);
  const k = out.width / size.width;
  const image = await drawAsImage(
    <Group transform={[{ scale: k }]}>
      <Layers base={base} original={original} size={size} strokes={strokes} />
    </Group>,
    out,
  );
  const dir = new Directory(Paths.cache, 'bg-removal');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const file = new File(dir, `${randomUUID()}.png`);
  file.write(image.encodeToBytes(ImageFormat.PNG, 100));
  return file.uri;
}

export function PhotoEditor({ imageUri, originalUri, onDone, onCancel }: Props) {
  const t = useT();
  const theme = useTheme();
  const base = useImage(imageUri);
  const original = useImage(originalUri);
  const [box, setBox] = useState<LayoutRectangle | null>(null);
  const [mode, setMode] = useState<BrushMode>('erase');
  const [brush, setBrush] = useState(BRUSH_DEFAULT);
  const [strokes, setStrokes] = useState<DrawnStroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  /** 手勢進行中的筆畫（state 更新是非同步的，手勢回呼以 ref 為準） */
  const currentRef = useRef<Stroke | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const size = base ? { width: base.width(), height: base.height() } : null;
  const fit = size && box ? containRect(size, box) : null;
  const currentPath = useMemo(() => (current ? toPath(current.points) : null), [current]);
  const ready = !!(base && original && fit);

  const setStroke = (stroke: Stroke | null) => {
    currentRef.current = stroke;
    setCurrent(stroke);
  };

  const commit = () => {
    const done = currentRef.current;
    if (!done) return;
    setStrokes(list => [...list, { stroke: done, path: toPath(done.points) }]);
    setStroke(null);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(ready && !saving)
    .onBegin(e => {
      if (fit) setStroke(startStroke(mode, brush, e, fit));
    })
    .onUpdate(e => {
      if (fit && currentRef.current) setStroke(addPoint(currentRef.current, e, fit));
    })
    .onFinalize(commit);

  const save = async () => {
    if (!base || !original || saving) return;
    setSaving(true);
    setError(false);
    try {
      onDone(await exportPng(base, original, strokes));
    } catch (e) {
      console.warn('儲存去背結果失敗', e);
      setError(true);
      setSaving(false);
    }
  };

  const drawn = current && currentPath ? [...strokes, { stroke: current, path: currentPath }] : strokes;
  const s = makeStyles(theme);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={s.root}>
          <View style={s.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onCancel} hitSlop={10} disabled={saving}>
              <Text style={s.headerButton}>{t('common.cancel')}</Text>
            </Pressable>
            <Text style={s.title} accessibilityRole="header">{t('editor.title')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('editor.done')}
              accessibilityState={{ disabled: !ready || saving }}
              onPress={save}
              disabled={!ready || saving}
              hitSlop={10}
            >
              {saving ? <ActivityIndicator color={theme.primary} /> : <Text style={[s.headerButton, s.done]}>{t('editor.done')}</Text>}
            </Pressable>
          </View>

          <GestureDetector gesture={pan}>
            <View style={s.canvasBox} onLayout={e => setBox(e.nativeEvent.layout)}>
              {ready && base && original && size && fit ? (
                <Canvas style={StyleSheet.absoluteFill}>
                  <Group transform={[{ translateX: fit.x }, { translateY: fit.y }, { scale: fit.scale }]}>
                    <Layers base={base} original={original} size={size} strokes={drawn} />
                  </Group>
                </Canvas>
              ) : (
                <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.textMuted} />
              )}
            </View>
          </GestureDetector>

          <View style={s.toolbar}>
            <Text style={s.hint}>{t('editor.hint')}</Text>
            {error && <Text style={s.error}>{t('editor.saveFailed')}</Text>}
            <View style={s.row}>
              <Chip role="radio" label={t('editor.erase')} selected={mode === 'erase'} onPress={() => setMode('erase')} />
              <Chip role="radio" label={t('editor.restore')} selected={mode === 'restore'} onPress={() => setMode('restore')} />
              <View style={{ flex: 1 }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('editor.undo')}
                accessibilityState={{ disabled: strokes.length === 0 }}
                disabled={strokes.length === 0}
                onPress={() => setStrokes(undoStroke)}
                style={[s.undo, { opacity: strokes.length === 0 ? 0.4 : 1 }]}
              >
                <Text style={{ color: theme.text, fontSize: 15 }}>{t('editor.undo')}</Text>
              </Pressable>
            </View>
            <View style={s.row}>
              <Text style={s.label}>{t('editor.brush')}</Text>
              <View style={{ flex: 1 }}>
                <BrushSizeSlider value={brush} onChange={setBrush} label={t('editor.brush')} />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
    },
    title: { color: theme.text, fontSize: 17, fontWeight: '600' },
    headerButton: { color: theme.primary, fontSize: 16 },
    done: { fontWeight: '600' },
    // 灰底：擦掉的透明區域才看得出來（白衣服在白底上會分不清）
    canvasBox: { flex: 1, margin: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: '#C9CCD1' },
    toolbar: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
    hint: { color: theme.textMuted, fontSize: 13 },
    error: { color: '#D93025', fontSize: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { color: theme.text, fontSize: 15, marginRight: 4 },
    undo: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.border },
  });
