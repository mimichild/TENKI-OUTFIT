import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OutfitInput } from '@/db/outfitRepository';
import { useT, type TranslationKey } from '@/i18n';
import { formatPrice } from '@/lib/currency';
import {
  addPiece, applyGesture, bringToFront, CANVAS_HEIGHT_RATIO, droppedInTrash, editorCanvasRatio, removePiece, TRASH_BOTTOM, TRASH_SIZE,
  type GestureDelta,
} from '@/lib/outfitCanvas';
import type { PieceShape } from '@/lib/outfitLayout';
import { outfitTotal } from '@/lib/outfitTotals';
import { pieceAt } from '@/lib/pieceHit';
import { usePieceShapes } from '@/lib/usePieceShapes';
import { weekdayOf } from '@/lib/weatherDates';
import { useCanvasStore, useSharedCanvasRatio } from '@/store/canvasStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme, type Theme } from '@/theme/useTheme';
import type { Item, OutfitItemPlacement, OutfitPiece } from '@/types/models';
import { DatePickerSheet } from './DatePickerSheet';
import { ItemPickerSheet } from './ItemPickerSheet';
import { PieceImage, pieceStyle } from './OutfitCanvasView';

export interface OutfitDraft {
  name: string;
  date: string | null;
  pieces: OutfitPiece[];
  /** 已有穿搭的畫布比例；新穿搭不用給 */
  canvasRatio?: number;
}

interface Props {
  title: string;
  initial: OutfitDraft;
  /** 可以放上畫布的單品（服裝牆上的單品） */
  items: Item[];
  today: string;
  onSave: (input: OutfitInput) => Promise<void>;
  onCancel: () => void;
  /** 編輯既有穿搭時才有 */
  onDelete?: () => Promise<void>;
}

const placementOf = ({ itemId, x, y, scale, rotation, z }: OutfitItemPlacement): OutfitItemPlacement => ({ itemId, x, y, scale, rotation, z });

export function OutfitEditor({ title, initial, items, today, onSave, onCancel, onDelete }: Props) {
  const t = useT();
  const theme = useTheme();
  const currency = useSettingsStore(s => s.currency);
  const window = useWindowDimensions();
  const [date, setDate] = useState(initial.date);
  const [pieces, setPieces] = useState(initial.pieces);
  /** 拖拉中：none = 沒在拖，drag = 拖拉中，over = 停在垃圾桶上 */
  const [drag, setDrag] = useState<DragState>('none');
  const [pickerOpen, setPickerOpen] = useState(false);
  // 標題列（取消／新增穿搭／儲存）的下緣：選單品視窗從這裡往下蓋滿
  const [topBarBottom, setTopBarBottom] = useState<number | null>(null);
  const topBarRef = useRef<View>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 畫布寬度填滿、高度延伸到底部按鈕列：量出日期列與按鈕列之間的空間，比例存進穿搭
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const initialRatio = initial.canvasRatio ?? CANVAS_HEIGHT_RATIO;
  // 和天氣穿搭日檢視共用同一個比例（兩邊可用空間比較小的那個）
  const ownRatio = area ? editorCanvasRatio(area, initialRatio) : null;
  const reportCanvas = useCanvasStore(st => st.report);
  useEffect(() => {
    if (ownRatio !== null) reportCanvas('editor', ownRatio);
  }, [ownRatio, reportCanvas]);
  const canvasRatio = useSharedCanvasRatio(ownRatio ?? initialRatio);
  const canvasWidth = area && area.width > 0 ? area.width : window.width;
  const selectedIds = useMemo(() => new Set(pieces.map(p => p.itemId)), [pieces]);
  // 照片裡衣服的形狀：判斷手指有沒有碰到衣服（透明的部分不算）
  const pieceItems = useMemo(() => pieces.map(p => p.item), [pieces]);
  const shapes = usePieceShapes(pieceItems);
  const total = outfitTotal(pieces);
  const canSave = date !== null && pieces.length > 0 && !busy;
  const s = makeStyles(theme);

  const toggleItem = (item: Item) => {
    setError(null);
    setPieces(list => {
      if (list.some(p => p.itemId === item.id)) return removePiece(list, item.id);
      const placed = addPiece(list.map(placementOf), item.id, canvasRatio).at(-1)!;
      return [...list, { ...placed, item }];
    });
  };

  // 手指碰到的單品移到最上層
  const raise = (itemId: string) => setPieces(list => bringToFront(list, itemId));
  const trash = (itemId: string) => {
    setDrag('none');
    setPieces(list => removePiece(list, itemId));
  };

  // 只回寫位置／大小／角度；z 由 raise 時的 bringToFront 決定
  const commit = (itemId: string, { x, y, scale, rotation }: OutfitItemPlacement) => {
    setDrag('none');
    setPieces(list => list.map(p => (p.itemId === itemId ? { ...p, x, y, scale, rotation } : p)));
  };

  const { gesture: canvasGesture, live } = useCanvasGestures({
    pieces, shapes, width: canvasWidth, ratio: canvasRatio,
    onBegin: raise, onDrag: setDrag, onCommit: commit, onTrash: trash,
  });

  const save = async () => {
    if (!canSave || date === null) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: initial.name, date, items: pieces.map(placementOf), canvasRatio });
    } catch (e) {
      console.warn('儲存穿搭失敗', e);
      setError('outfit.saveFailed');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete || busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      console.warn('刪除穿搭失敗', e);
      setError('outfit.deleteFailed');
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const dateLabel = date
    ? t('weather.dateLabel', { m: Number(date.slice(5, 7)), d: Number(date.slice(8)), wd: t(`weather.wd${weekdayOf(date)}` as TranslationKey) })
    : t('outfit.pickDate');

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View
        testID="editor-top-bar"
        ref={topBarRef}
        onLayout={e => {
          const { y, height } = e.nativeEvent.layout;
          setTopBarBottom(y + height);
          // iOS 的 modal 頁面不是從螢幕最上面開始，改用在整個視窗裡的位置
          topBarRef.current?.measureInWindow((_x, wy, _w, wh) => {
            if (wh > 0) setTopBarBottom(wy + wh);
          });
        }}
        style={[s.topBar, { borderColor: theme.border, backgroundColor: theme.surface }]}
      >
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" disabled={busy}>
          <Text style={{ color: theme.textMuted, fontSize: 16 }}>{t('common.cancel')}</Text>
        </Pressable>
        <Text style={[s.title, { color: theme.text }]} accessibilityRole="header">{title}</Text>
        <Pressable testID="save-outfit" onPress={save} hitSlop={12} accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave}>
          {busy ? <ActivityIndicator color={theme.primaryText} /> : (
            <Text style={{ color: canSave ? theme.primaryText : theme.border, fontSize: 16, fontWeight: '600' }}>{t('item.save')}</Text>
          )}
        </Pressable>
      </View>

      <View style={s.body}>
        <Pressable
          onPress={() => setDateOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('outfit.date')} ${dateLabel}`}
          style={[s.dateRow, { borderColor: date ? theme.border : theme.primary, backgroundColor: theme.surface }]}
        >
          <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
          <Text style={[s.dateLabel, { color: theme.textMuted }]}>{t('outfit.date')}</Text>
          <Text style={{ color: date ? theme.text : theme.primaryText, fontSize: 16, flex: 1 }}>{dateLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
        </Pressable>
        {date === null && <Text style={[s.hint, { color: theme.primaryText }]}>{t('outfit.dateRequired')}</Text>}

        <View
          testID="canvas-area"
          style={s.canvasArea}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setArea(a => (a && a.width === width && a.height === height ? a : { width, height }));
          }}
        >
          {/* 手勢掛在整個畫布上：第一根手指落在哪件衣服上就動那件，第二根手指（縮放、旋轉）放在畫布任何地方都可以 */}
          <GestureDetector gesture={canvasGesture}>
            <View
              testID="outfit-canvas"
              accessibilityLabel={t('outfit.canvas')}
              style={[s.canvas, { width: canvasWidth, height: canvasWidth * canvasRatio, borderColor: theme.border }]}
            >
              {pieces.length === 0 && (
                <View style={s.canvasBackground}>
                  <Text style={s.emptyHint}>{t('outfit.emptyCanvas')}</Text>
                </View>
              )}
              {/* 疊放順序用 zIndex，不重新排列子元件，避免手勢進行中原生畫面被搬動 */}
              {pieces.map(p => (
                <CanvasPiece
                  key={p.itemId}
                  piece={p}
                  live={live?.itemId === p.itemId ? live.placement : null}
                  width={canvasWidth}
                  label={t('outfit.pieceLabel', { name: p.item.name || p.item.brand || t('item.untitled') })}
                  removeLabel={t('outfit.removePiece')}
                  onTrash={() => trash(p.itemId)}
                />
              ))}
              {/* 拖拉單品時才出現：把衣服拖到這裡放開就從畫布移除 */}
              {drag !== 'none' && (
                <View
                  testID="canvas-trash"
                  pointerEvents="none"
                  importantForAccessibility="no-hide-descendants"
                  style={[s.trash, drag === 'over' && s.trashOver]}
                >
                  <Ionicons name="trash-outline" size={drag === 'over' ? 30 : 26} color={drag === 'over' ? '#FFFFFF' : '#5F5F5F'} />
                </View>
              )}
            </View>
          </GestureDetector>
        </View>

        <View style={s.toolbar}>
          <Pressable testID="add-items" onPress={() => setPickerOpen(true)} accessibilityRole="button" style={[s.toolButton, { backgroundColor: theme.primary }]}>
            <Ionicons name="add" size={18} color={theme.onPrimary} />
            <Text style={s.toolText}>{t('outfit.addItems')}</Text>
          </Pressable>
          <Text style={[s.total, { color: theme.text }]}>{t('outfit.total', { amount: formatPrice(total, currency) })}</Text>
        </View>

        {error && <Text style={[s.hint, { color: '#D93025' }]} accessibilityRole="alert">{t(error)}</Text>}

        {onDelete && (
          <Pressable
            onPress={remove}
            accessibilityRole="button"
            disabled={busy}
            style={[s.delete, { backgroundColor: confirmDelete ? '#D93025' : 'transparent', borderColor: '#D93025' }]}
          >
            <Text style={{ color: confirmDelete ? '#FFFFFF' : '#D93025', fontSize: 15 }}>
              {t(confirmDelete ? 'outfit.confirmDelete' : 'outfit.delete')}
            </Text>
          </Pressable>
        )}
      </View>

      <ItemPickerSheet visible={pickerOpen} topOffset={topBarBottom} items={items} selectedIds={selectedIds} onToggle={toggleItem} onClose={() => setPickerOpen(false)} />
      <DatePickerSheet
        visible={dateOpen}
        value={date}
        today={today}
        onSelect={d => {
          setDate(d);
          setError(null);
        }}
        onClose={() => setDateOpen(false)}
      />
    </SafeAreaView>
  );
}

type DragState = 'none' | 'drag' | 'over';

type GestureKind = 'pan' | 'pinch' | 'rotate';
const NO_CHANGE: GestureDelta = { dx: 0, dy: 0, scale: 1, rotation: 0 };

interface CanvasGestureOptions {
  pieces: OutfitPiece[];
  shapes: ReadonlyMap<string, PieceShape | null> | undefined;
  width: number;
  /** 畫布高 / 寬 */
  ratio: number;
  onBegin: (itemId: string) => void;
  onDrag: (state: DragState) => void;
  onCommit: (itemId: string, next: OutfitItemPlacement) => void;
  onTrash: (itemId: string) => void;
}

/**
 * 畫布上的單指拖拉、雙指縮放與旋轉（三種手勢同時辨識）。
 * - 手勢一開始（第一根手指按下）時，找手指底下最上層、而且真的碰到衣服的單品；沒碰到衣服就什麼都不動
 * - 手勢進行中只更新 live（這件單品暫時的位置），放開後才回寫到編輯器
 * - 手指放開又按下時各手勢會從頭計算，所以把已結束的部分累加到 done
 */
function useCanvasGestures(options: CanvasGestureOptions) {
  const [live, setLive] = useState<{ itemId: string; placement: OutfitItemPlacement } | null>(null);
  // 手勢的 callback 可能是較早 render 時建立的，一律從 ref 讀最新的值
  const latest = useRef(options);
  latest.current = options;
  const dragState = useRef<DragState>('none');
  /** 已經 onBegin 的手勢；onFinalize 也可能發生在沒有 onBegin 的手勢上，要配對才算 */
  const active = useRef(new Set<GestureKind>());
  /** 這次手勢在動的單品；null = 手指沒碰到衣服 */
  const target = useRef<string | null>(null);
  const start = useRef<OutfitItemPlacement | null>(null);
  const done = useRef<GestureDelta>(NO_CHANGE);
  const current = useRef<GestureDelta>(NO_CHANGE);

  const total = (): GestureDelta => ({
    dx: done.current.dx + current.current.dx,
    dy: done.current.dy + current.current.dy,
    scale: done.current.scale * current.current.scale,
    rotation: done.current.rotation + current.current.rotation,
  });
  const setDrag = (state: DragState) => {
    if (state === dragState.current) return;
    dragState.current = state;
    latest.current.onDrag(state);
  };
  const update = (patch: Partial<GestureDelta>) => {
    if (!target.current || !start.current) return;
    current.current = { ...current.current, ...patch };
    const { width: w, ratio: r } = latest.current;
    const g = total();
    const next = applyGesture(start.current, g, w, r);
    setLive({ itemId: target.current, placement: next });
    // 有拖動才顯示垃圾桶；停在垃圾桶上時反白
    setDrag(droppedInTrash(next, g, w, r) ? 'over' : Math.hypot(g.dx, g.dy) > 0 ? 'drag' : 'none');
  };
  /**
   * 某個手勢結束：它的變化併入 done（其他還在進行的手勢留在 current）。
   * 併入時先套用上下限，避免超出的部分要先「還掉」才有反應
   */
  const fold = (ended: Partial<Record<keyof GestureDelta, true>>) => {
    if (!start.current) return;
    const { width, ratio } = latest.current;
    const c = current.current;
    const clamped = applyGesture(start.current, total(), width, ratio);
    // 還在進行的手勢的部分不併入
    const keep = {
      dx: ended.dx ? 0 : c.dx,
      dy: ended.dy ? 0 : c.dy,
      scale: ended.scale ? 1 : c.scale,
      rotation: ended.rotation ? 0 : c.rotation,
    };
    done.current = {
      dx: (clamped.x - start.current.x) * width - keep.dx,
      dy: (clamped.y - start.current.y) * width - keep.dy,
      scale: clamped.scale / start.current.scale / keep.scale,
      rotation: total().rotation - keep.rotation,
    };
    current.current = keep;
  };
  /** x, y：手指在畫布上的位置 */
  const begin = (kind: GestureKind, x: number, y: number) => {
    if (active.current.size === 0) {
      const { pieces, shapes, width } = latest.current;
      const id = pieceAt(pieces, shapes, width, x, y);
      const piece = pieces.find(p => p.itemId === id);
      target.current = piece ? piece.itemId : null;
      start.current = piece ?? null;
      done.current = NO_CHANGE;
      current.current = NO_CHANGE;
      if (piece) latest.current.onBegin(piece.itemId);
    }
    active.current.add(kind);
  };
  const finalize = (kind: GestureKind) => {
    if (!active.current.delete(kind) || active.current.size > 0) return;
    const id = target.current;
    const from = start.current;
    target.current = null;
    start.current = null;
    if (!id || !from) return;
    const { width: w, ratio: r } = latest.current;
    const g = total();
    const next = applyGesture(from, g, w, r);
    setLive(null);
    dragState.current = 'none';
    if (droppedInTrash(next, g, w, r)) latest.current.onTrash(id);
    else latest.current.onCommit(id, next);
  };

  const pan = Gesture.Pan()
    .withTestId('canvas-pan')
    .runOnJS(true)
    .onBegin(e => begin('pan', e.x, e.y))
    .onUpdate(e => update({ dx: e.translationX, dy: e.translationY }))
    .onEnd(() => fold({ dx: true, dy: true }))
    .onFinalize(() => finalize('pan'));
  const pinch = Gesture.Pinch()
    .withTestId('canvas-pinch')
    .runOnJS(true)
    .onBegin(e => begin('pinch', e.focalX, e.focalY))
    .onUpdate(e => update({ scale: e.scale }))
    .onEnd(() => fold({ scale: true }))
    .onFinalize(() => finalize('pinch'));
  const rotate = Gesture.Rotation()
    .withTestId('canvas-rotate')
    .runOnJS(true)
    .onBegin(e => begin('rotate', e.anchorX, e.anchorY))
    .onUpdate(e => update({ rotation: e.rotation }))
    .onEnd(() => fold({ rotation: true }))
    .onFinalize(() => finalize('rotate'));

  return { gesture: Gesture.Simultaneous(pan, pinch, rotate), live };
}

interface PieceProps {
  piece: OutfitPiece;
  /** 手勢進行中的暫時位置 */
  live: OutfitItemPlacement | null;
  width: number;
  label: string;
  /** 螢幕閱讀器的「移除」動作名稱（無法拖到垃圾桶時用） */
  removeLabel: string;
  onTrash: () => void;
}

/** 單品本身不接觸控（pointerEvents none），觸控由畫布依衣服形狀判斷 */
function CanvasPiece({ piece, live, width, label, removeLabel, onTrash }: PieceProps) {
  // 手勢開始時已移到最上層，拖拉中也要用新的 z
  const shown = live ? { ...live, z: piece.z } : piece;
  return (
    <View
      testID={`piece-${piece.itemId}`}
      pointerEvents="none"
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'remove', label: removeLabel }]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'remove') onTrash();
      }}
      style={pieceStyle(shown, width)}
    >
      <PieceImage item={piece.item} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    title: { fontSize: 17, fontWeight: '600' },
    body: { flex: 1, alignItems: 'center', padding: 16, gap: 10 },
    dateRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
    dateLabel: { fontSize: 14 },
    hint: { alignSelf: 'stretch', fontSize: 13 },
    // 去背單品放在白底最好看，深色模式也維持白底
    // 畫布可用空間：撐滿日期列與按鈕列之間；抵銷 body 左右內距，畫布貼齊手機邊緣
    canvasArea: { flex: 1, alignSelf: 'stretch', marginHorizontal: -16 },
    canvas: { backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    canvasBackground: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
    // 蓋在所有單品上面（單品的 zIndex 是 0..n-1）
    trash: {
      position: 'absolute', left: '50%', bottom: TRASH_BOTTOM, marginLeft: -TRASH_SIZE / 2,
      width: TRASH_SIZE, height: TRASH_SIZE, borderRadius: TRASH_SIZE / 2, zIndex: 100000,
      alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFE6', borderWidth: 1, borderColor: '#D0D0D0',
    },
    trashOver: { backgroundColor: '#D93025', borderColor: '#D93025', transform: [{ scale: 1.15 }] },
    emptyHint: { color: '#8A8A8A', textAlign: 'center', paddingHorizontal: 24, fontSize: 14, lineHeight: 20 },
    toolbar: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    toolButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
    toolText: { color: theme.onPrimary, fontSize: 14 },
    total: { marginLeft: 'auto', fontSize: 15, fontWeight: '600', color: theme.text },
    delete: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  });
