import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OutfitInput } from '@/db/outfitRepository';
import { useT, type TranslationKey } from '@/i18n';
import { formatPrice } from '@/lib/currency';
import { addPiece, applyGesture, bringToFront, CANVAS_HEIGHT_RATIO, removePiece, type GestureDelta } from '@/lib/outfitCanvas';
import { outfitTotal } from '@/lib/outfitTotals';
import { weekdayOf } from '@/lib/weatherDates';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 畫布 3:4，扣掉上下按鈕列後放得下
  const canvasWidth = Math.max(160, Math.min(window.width - 32, ((window.height - 300) * 3) / 4));
  const selectedIds = useMemo(() => new Set(pieces.map(p => p.itemId)), [pieces]);
  const total = outfitTotal(pieces);
  const canSave = date !== null && pieces.length > 0 && !busy;
  const s = makeStyles(theme);

  const toggleItem = (item: Item) => {
    setError(null);
    setPieces(list => {
      if (list.some(p => p.itemId === item.id)) return removePiece(list, item.id);
      const placed = addPiece(list.map(placementOf), item.id).at(-1)!;
      return [...list, { ...placed, item }];
    });
  };

  const select = (itemId: string) => {
    setSelectedId(itemId);
    setPieces(list => bringToFront(list, itemId));
  };

  // 只回寫位置／大小／角度；z 由 select 時的 bringToFront 決定
  const commit = (itemId: string, { x, y, scale, rotation }: OutfitItemPlacement) => {
    setPieces(list => list.map(p => (p.itemId === itemId ? { ...p, x, y, scale, rotation } : p)));
  };

  const save = async () => {
    if (!canSave || date === null) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: initial.name, date, items: pieces.map(placementOf) });
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
      <View style={[s.topBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" disabled={busy}>
          <Text style={{ color: theme.textMuted, fontSize: 16 }}>{t('common.cancel')}</Text>
        </Pressable>
        <Text style={[s.title, { color: theme.text }]} accessibilityRole="header">{title}</Text>
        <Pressable testID="save-outfit" onPress={save} hitSlop={12} accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave}>
          {busy ? <ActivityIndicator color={theme.primary} /> : (
            <Text style={{ color: canSave ? theme.primary : theme.border, fontSize: 16, fontWeight: '600' }}>{t('item.save')}</Text>
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
          <Text style={{ color: date ? theme.text : theme.primary, fontSize: 16, flex: 1 }}>{dateLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
        </Pressable>
        {date === null && <Text style={[s.hint, { color: theme.primary }]}>{t('outfit.dateRequired')}</Text>}

        <Pressable
          testID="outfit-canvas"
          accessibilityLabel={t('outfit.canvas')}
          onPress={() => setSelectedId(null)}
          style={[s.canvas, { width: canvasWidth, height: canvasWidth * CANVAS_HEIGHT_RATIO, borderColor: theme.border }]}
        >
          {pieces.length === 0 && <Text style={s.emptyHint}>{t('outfit.emptyCanvas')}</Text>}
          {/* 疊放順序用 zIndex，不重新排列子元件，避免手勢進行中原生畫面被搬動 */}
          {pieces.map(p => (
            <CanvasPiece
              key={p.itemId}
              piece={p}
              width={canvasWidth}
              selected={p.itemId === selectedId}
              label={t('outfit.pieceLabel', { name: p.item.name || p.item.brand || t('item.untitled') })}
              color={theme.primary}
              onBegin={() => select(p.itemId)}
              onCommit={next => commit(p.itemId, next)}
            />
          ))}
        </Pressable>

        <View style={s.toolbar}>
          <Pressable testID="add-items" onPress={() => setPickerOpen(true)} accessibilityRole="button" style={[s.toolButton, { backgroundColor: theme.primary }]}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={s.toolText}>{t('outfit.addItems')}</Text>
          </Pressable>
          {selectedId && (
            <Pressable
              onPress={() => {
                setPieces(list => removePiece(list, selectedId));
                setSelectedId(null);
              }}
              accessibilityRole="button"
              style={[s.toolButton, { borderColor: theme.border, borderWidth: 1 }]}
            >
              <Ionicons name="remove-circle-outline" size={18} color={theme.text} />
              <Text style={{ color: theme.text, fontSize: 14 }}>{t('outfit.removePiece')}</Text>
            </Pressable>
          )}
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

      <ItemPickerSheet visible={pickerOpen} items={items} selectedIds={selectedIds} onToggle={toggleItem} onClose={() => setPickerOpen(false)} />
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

interface PieceProps {
  piece: OutfitPiece;
  width: number;
  selected: boolean;
  label: string;
  color: string;
  onBegin: () => void;
  onCommit: (next: OutfitItemPlacement) => void;
}

const NO_CHANGE: GestureDelta = { dx: 0, dy: 0, scale: 1, rotation: 0 };

/**
 * 單指拖拉、雙指縮放與旋轉（三種手勢同時辨識）。
 * 手勢進行中只更新這件單品自己的狀態，放開後才回寫到編輯器。
 * 手指放開又按下時各手勢會從頭計算，所以把已結束的部分累加到 done。
 */
function CanvasPiece({ piece, width, selected, label, color, onBegin, onCommit }: PieceProps) {
  const [live, setLive] = useState<OutfitItemPlacement | null>(null);
  // 手勢的 callback 可能是較早 render 時建立的，一律從 ref 讀最新的值
  const latest = useRef({ piece, width, onBegin, onCommit });
  latest.current = { piece, width, onBegin, onCommit };
  const active = useRef(0);
  const start = useRef<OutfitItemPlacement>(piece);
  const done = useRef<GestureDelta>(NO_CHANGE);
  const current = useRef<GestureDelta>(NO_CHANGE);

  const total = (): GestureDelta => ({
    dx: done.current.dx + current.current.dx,
    dy: done.current.dy + current.current.dy,
    scale: done.current.scale * current.current.scale,
    rotation: done.current.rotation + current.current.rotation,
  });
  const update = (patch: Partial<GestureDelta>) => {
    current.current = { ...current.current, ...patch };
    setLive(applyGesture(start.current, total(), latest.current.width));
  };
  const fold = (reset: Partial<GestureDelta>) => {
    done.current = total();
    current.current = { ...current.current, ...reset };
  };
  const begin = () => {
    if (active.current === 0) {
      start.current = latest.current.piece;
      done.current = NO_CHANGE;
      current.current = NO_CHANGE;
      latest.current.onBegin();
    }
    active.current += 1;
  };
  const finalize = () => {
    active.current = Math.max(0, active.current - 1);
    if (active.current > 0) return;
    const next = applyGesture(start.current, total(), latest.current.width);
    setLive(null);
    latest.current.onCommit(next);
  };

  const pan = Gesture.Pan()
    .withTestId(`pan-${piece.itemId}`)
    .runOnJS(true)
    .onBegin(begin)
    .onUpdate(e => update({ dx: e.translationX, dy: e.translationY }))
    .onEnd(() => fold({ dx: 0, dy: 0 }))
    .onFinalize(finalize);
  const pinch = Gesture.Pinch()
    .withTestId(`pinch-${piece.itemId}`)
    .runOnJS(true)
    .onBegin(begin)
    .onUpdate(e => update({ scale: e.scale }))
    .onEnd(() => fold({ scale: 1 }))
    .onFinalize(finalize);
  const rotate = Gesture.Rotation()
    .withTestId(`rotate-${piece.itemId}`)
    .runOnJS(true)
    .onBegin(begin)
    .onUpdate(e => update({ rotation: e.rotation }))
    .onEnd(() => fold({ rotation: 0 }))
    .onFinalize(finalize);

  const shown = live ?? piece;
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <View
        testID={`piece-${piece.itemId}`}
        accessible
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={[pieceStyle(shown, width), selected && { borderWidth: 1.5, borderColor: color, borderStyle: 'dashed' }]}
      >
        <PieceImage item={piece.item} />
      </View>
    </GestureDetector>
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
    canvas: { backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, overflow: 'hidden', justifyContent: 'center' },
    emptyHint: { color: '#8A8A8A', textAlign: 'center', paddingHorizontal: 24, fontSize: 14, lineHeight: 20 },
    toolbar: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    toolButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
    toolText: { color: '#FFFFFF', fontSize: 14 },
    total: { marginLeft: 'auto', fontSize: 15, fontWeight: '600', color: theme.text },
    delete: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  });
