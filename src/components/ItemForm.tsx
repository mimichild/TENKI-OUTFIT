import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATEGORIES, COLOR_SWATCHES, COLORS, OCCASIONS, SEASONS, STYLES } from '@/constants/options';
import type { ItemInput } from '@/db/itemRepository';
import { useT } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';
import type { BgRemovalResult } from '@/lib/backgroundRemoval';
import type { PhotoChange } from '@/lib/itemService';
import type { PhotoSource } from '@/lib/pickPhoto';
import { inferStyle } from '@/lib/itemStyle';
import { ITEM_PHOTO_ASPECT } from '@/lib/photoFit';
import { useAutoColor } from '@/lib/useAutoColor';
import { resolvePhotoUri } from '@/lib/photoStorage';
import { FittedPhoto } from './FittedPhoto';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme, type Theme } from '@/theme/useTheme';
import { Chip } from './Chip';
import { PHOTO_EDITOR_SUPPORTED, PhotoEditor } from './PhotoEditor';

export const EMPTY_ITEM_INPUT: ItemInput = {
  name: '', brand: '', category: 'top', price: null, occasions: [], seasons: [], imageUri: null, originalUri: null,
};

interface Props {
  initial: ItemInput;
  /** 回傳暫存 URI；取消回傳 null；沒有權限時丟出錯誤 */
  onPickPhoto: (source: PhotoSource) => Promise<string | null>;
  /** 自動去背（畫面注入 removeBackground；測試注入假的） */
  onRemoveBackground: (uri: string) => Promise<BgRemovalResult>;
  onSubmit: (input: ItemInput, photo: PhotoChange) => void | Promise<unknown>;
  onCancel: () => void;
  /** 有傳才顯示「刪除」（移到暫存區） */
  onDelete?: () => void | Promise<unknown>;
}

/** '' → null；不合法 → undefined */
export function parsePrice(text: string): number | null | undefined {
  const cleaned = text.replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

type CutoutState = 'running' | BgRemovalResult['status'] | null;

const CUTOUT_MESSAGE = {
  running: 'item.cutoutRunning',
  ok: 'item.cutoutDone',
  unavailable: 'item.cutoutUnavailable',
  noSubject: 'item.cutoutNoSubject',
  failed: 'item.cutoutFailed',
} as const;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export function ItemForm({ initial, onPickPhoto, onRemoveBackground, onSubmit, onCancel, onDelete }: Props) {
  const t = useT();
  const theme = useTheme();
  const currency = useSettingsStore(s => s.currency);
  const [form, setForm] = useState(initial);
  const [priceText, setPriceText] = useState(initial.price == null ? '' : String(initial.price));
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cutout, setCutout] = useState<CutoutState>(null);
  const [editingPhoto, setEditingPhoto] = useState(false);
  /** 每次選照片 +1；較慢回來的舊去背結果比對不符就丟掉 */
  const pickSeq = useRef(0);

  const previewUri = photo.kind === 'replace' ? photo.imageUri : photo.kind === 'remove' ? null : initial.imageUri;
  // 顏色、風格沒手動選時自動判斷（資料庫只存手動選的，null = 自動）
  const autoColor = useAutoColor(cutout === 'running' ? null : previewUri);
  const autoStyle = inferStyle(form);
  const shownColor = form.color ?? autoColor;
  const shownStyle = form.style ?? autoStyle;
  const busy = saving || cutout === 'running';

  /** 手動修改用的兩張圖：目前顯示圖 + 補回筆刷的來源（沒有原圖的舊資料就用顯示圖） */
  const editable =
    photo.kind === 'replace'
      ? { imageUri: photo.imageUri, originalUri: photo.originalUri }
      : photo.kind === 'keep' && initial.imageUri
        ? {
            imageUri: resolvePhotoUri(initial.imageUri)!,
            originalUri: resolvePhotoUri(initial.originalUri ?? initial.imageUri)!,
          }
        : null;

  const finishEditing = (uri: string) => {
    if (editable) setPhoto({ kind: 'replace', originalUri: editable.originalUri, imageUri: uri });
    setCutout(null);
    setEditingPhoto(false);
  };
  const update = (patch: Partial<ItemInput>) => setForm(f => ({ ...f, ...patch }));

  const pick = async (source: PhotoSource) => {
    setError(null);
    let uri: string | null;
    try {
      uri = await onPickPhoto(source);
    } catch {
      setError(t(source === 'camera' ? 'item.cameraDenied' : 'item.libraryDenied'));
      return;
    }
    if (!uri) return;

    const seq = ++pickSeq.current;
    setPhoto({ kind: 'replace', originalUri: uri, imageUri: uri });
    setCutout('running');
    let result: BgRemovalResult;
    try {
      result = await onRemoveBackground(uri);
    } catch (e) {
      result = { status: 'failed', error: e };
    }
    if (seq !== pickSeq.current) return;
    // 去背成功：丟掉選到的原尺寸照片，只留縮小原圖（介面上不顯示，給手動「補回」筆刷用）
    if (result.status === 'ok') {
      setPhoto({ kind: 'replace', originalUri: result.originalUri, imageUri: result.uri });
    } else {
      if (result.status === 'failed') console.warn('自動去背失敗', result.error);
      // 沒去背成功：有轉正縮小版就用它（編輯器不會載入原尺寸大圖、方向也正確）
      if (result.originalUri) setPhoto({ kind: 'replace', originalUri: result.originalUri, imageUri: result.originalUri });
    }
    setCutout(result.status);
  };

  const removePhoto = () => {
    pickSeq.current++;
    setCutout(null);
    setPhoto({ kind: 'remove' });
  };

  /** 非同步動作期間鎖住按鈕，失敗時顯示錯誤（避免連點、避免未處理的 rejection） */
  const runLocked = (result: void | Promise<unknown>) => {
    if (!(result instanceof Promise)) return;
    setSaving(true);
    result.catch(() => setError(t('item.saveFailed'))).finally(() => setSaving(false));
  };

  const submit = () => {
    if (busy) return;
    const price = parsePrice(priceText);
    if (price === undefined) return setError(t('item.priceInvalid'));
    setError(null);
    runLocked(onSubmit({ ...form, name: form.name.trim(), brand: form.brand.trim(), price }, photo));
  };

  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.photoBox}>
          {previewUri ? (
            <FittedPhoto uri={previewUri} />
          ) : (
            <View style={s.photoEmpty}>
              <Ionicons name="image-outline" size={40} color={theme.textMuted} />
              <Text style={s.muted}>{t('item.noPhoto')}</Text>
            </View>
          )}
        </View>
        {cutout && (
          <View style={s.cutoutRow} accessibilityLiveRegion="polite">
            {cutout === 'running' && <ActivityIndicator size="small" color={theme.textMuted} />}
            <Text style={s.muted}>{t(CUTOUT_MESSAGE[cutout])}</Text>
          </View>
        )}
        <View style={s.chipRow}>
          <Chip label={t(previewUri ? 'item.reupload' : 'item.pickLibrary')} selected={false} onPress={() => pick('library')} />
          <Chip label={t('item.takePhoto')} selected={false} onPress={() => pick('camera')} />
          {PHOTO_EDITOR_SUPPORTED && editable && cutout !== 'running' && (
            <Chip label={t('item.editPhoto')} selected={false} onPress={() => setEditingPhoto(true)} />
          )}
          {previewUri && <Chip label={t('item.removePhoto')} selected={false} onPress={removePhoto} />}
        </View>

        <Field theme={theme} label={t('item.brand')}>
          <TextInput accessibilityLabel={t('item.brand')} value={form.brand} onChangeText={brand => update({ brand })} style={s.input} />
        </Field>
        <Field theme={theme} label={t('item.name')}>
          <TextInput accessibilityLabel={t('item.name')} value={form.name} onChangeText={name => update({ name })} style={s.input} />
        </Field>
        <Field
          theme={theme}
          label={t('item.category')}
          hint={form.category === 'inner' || form.category === 'overlay' ? t(`item.categoryHint.${form.category}`) : undefined}
        >
          <View style={s.chipRow}>
            {CATEGORIES.map(c => (
              <Chip key={c} label={t(`category.${c}`)} selected={form.category === c} onPress={() => update({ category: c })} />
            ))}
          </View>
        </Field>
        <Field theme={theme} label={t('item.price')}>
          <View style={s.priceRow}>
            <Text style={s.symbol}>{CURRENCIES[currency].symbol}</Text>
            <TextInput
              accessibilityLabel={t('item.price')}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              style={[s.input, { flex: 1 }]}
            />
          </View>
        </Field>
        <Field
          theme={theme}
          label={t('item.color')}
          hint={form.color ? t('item.colorManual') : autoColor ? t('item.colorAuto', { color: t(`color.${autoColor}`) }) : t('item.colorAutoNone')}
        >
          <View style={s.chipRow}>
            {COLORS.map(c => (
              <Chip
                key={c}
                role="radio"
                swatch={COLOR_SWATCHES[c]}
                label={t(`color.${c}`)}
                selected={shownColor === c}
                auto={!form.color}
                autoNote={t('item.autoNote')}
                // 再點一次手動選的顏色 = 改回自動判斷
                onPress={() => update({ color: form.color === c ? null : c })}
              />
            ))}
          </View>
        </Field>
        <Field
          theme={theme}
          label={t('item.style')}
          hint={form.style ? t('item.styleManual') : autoStyle ? t('item.styleAuto', { style: t(`style.${autoStyle}`) }) : t('item.styleNone')}
        >
          <View style={s.chipRow}>
            {STYLES.map(x => (
              <Chip
                key={x}
                role="radio"
                label={t(`style.${x}`)}
                selected={shownStyle === x}
                auto={!form.style}
                autoNote={t('item.autoNote')}
                onPress={() => update({ style: form.style === x ? null : x })}
              />
            ))}
          </View>
        </Field>
        <Field theme={theme} label={t('item.occasions')} hint={t('item.allOccasions')}>
          <View style={s.chipRow}>
            {OCCASIONS.map(o => (
              <Chip key={o} label={t(`occasion.${o}`)} selected={form.occasions.includes(o)} onPress={() => update({ occasions: toggle(form.occasions, o) })} />
            ))}
          </View>
        </Field>
        <Field theme={theme} label={t('item.seasons')} hint={t('item.allSeasons')}>
          <View style={s.chipRow}>
            {SEASONS.map(x => (
              <Chip key={x} label={t(`season.${x}`)} selected={form.seasons.includes(x)} onPress={() => update({ seasons: toggle(form.seasons, x) })} />
            ))}
          </View>
        </Field>
        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
      {editingPhoto && editable && (
        <PhotoEditor
          imageUri={editable.imageUri}
          originalUri={editable.originalUri}
          onDone={finishEditing}
          onCancel={() => setEditingPhoto(false)}
        />
      )}

      <View style={s.actions}>
        {onDelete && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('item.delete')}
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={() => runLocked(onDelete())}
            style={[s.action, s.deleteAction]}
          >
            <Text style={s.deleteText}>{t('item.delete')}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onCancel} style={[s.action, s.secondary]}>
          <Text style={{ color: theme.text, fontSize: 16 }}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('item.save')}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={submit}
          style={[s.action, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]}
        >
          <Text style={s.primaryText}>{t('item.save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({ theme, label, hint, children }: { theme: Theme; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      {children}
      {hint && <Text style={{ color: theme.textMuted, fontSize: 12 }}>{hint}</Text>}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    content: { padding: 16, gap: 18, paddingBottom: 32 },
    photoBox: { aspectRatio: ITEM_PHOTO_ASPECT, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.border },
    photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    muted: { color: theme.textMuted, fontSize: 13 },
    cutoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    input: {
      borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 16, color: theme.text, backgroundColor: theme.surface,
    },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    symbol: { color: theme.textMuted, fontSize: 16 },
    error: { color: '#D93025', fontSize: 14 },
    actions: {
      flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border, backgroundColor: theme.surface,
    },
    action: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
    secondary: { borderWidth: 1, borderColor: theme.border },
    deleteAction: { borderWidth: 1, borderColor: '#D93025' },
    deleteText: { color: '#D93025', fontSize: 16 },
    primaryText: { color: theme.onPrimary, fontSize: 16, fontWeight: '600' },
  });
