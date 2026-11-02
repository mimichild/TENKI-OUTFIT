import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATEGORIES, OCCASIONS, SEASONS } from '@/constants/options';
import type { ItemInput } from '@/db/itemRepository';
import { useT } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';
import type { PhotoChange } from '@/lib/itemService';
import type { PhotoSource } from '@/lib/pickPhoto';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme, type Theme } from '@/theme/useTheme';
import { Chip } from './Chip';

export const EMPTY_ITEM_INPUT: ItemInput = {
  name: '', brand: '', category: 'top', price: null, occasions: [], seasons: [], imageUri: null, originalUri: null,
};

interface Props {
  initial: ItemInput;
  /** 回傳暫存 URI；取消回傳 null；沒有權限時丟出錯誤 */
  onPickPhoto: (source: PhotoSource) => Promise<string | null>;
  onSubmit: (input: ItemInput, photo: PhotoChange) => void | Promise<unknown>;
  onCancel: () => void;
  /** 有傳才顯示「刪除」（移到暫存區） */
  onDelete?: () => void;
}

/** '' → null；不合法 → undefined */
export function parsePrice(text: string): number | null | undefined {
  const cleaned = text.replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export function ItemForm({ initial, onPickPhoto, onSubmit, onCancel, onDelete }: Props) {
  const t = useT();
  const theme = useTheme();
  const currency = useSettingsStore(s => s.currency);
  const [form, setForm] = useState(initial);
  const [priceText, setPriceText] = useState(initial.price == null ? '' : String(initial.price));
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewUri = photo.kind === 'replace' ? photo.uri : photo.kind === 'remove' ? null : initial.imageUri;
  const update = (patch: Partial<ItemInput>) => setForm(f => ({ ...f, ...patch }));

  const pick = async (source: PhotoSource) => {
    setError(null);
    try {
      const uri = await onPickPhoto(source);
      if (uri) setPhoto({ kind: 'replace', uri });
    } catch {
      setError(t(source === 'camera' ? 'item.cameraDenied' : 'item.libraryDenied'));
    }
  };

  const submit = () => {
    const price = parsePrice(priceText);
    if (price === undefined) return setError(t('item.priceInvalid'));
    setError(null);
    const result = onSubmit({ ...form, name: form.name.trim(), brand: form.brand.trim(), price }, photo);
    if (!(result instanceof Promise)) return;
    setSaving(true);
    result.catch(() => setError(t('item.saveFailed'))).finally(() => setSaving(false));
  };

  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.photoBox}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={s.photo} contentFit="contain" />
          ) : (
            <View style={s.photoEmpty}>
              <Ionicons name="image-outline" size={40} color={theme.textMuted} />
              <Text style={s.muted}>{t('item.noPhoto')}</Text>
            </View>
          )}
        </View>
        {photo.kind === 'replace' && <Text style={[s.muted, s.center]}>{t('item.cutoutPending')}</Text>}
        <View style={s.chipRow}>
          <Chip label={t(previewUri ? 'item.reupload' : 'item.pickLibrary')} selected={false} onPress={() => pick('library')} />
          <Chip label={t('item.takePhoto')} selected={false} onPress={() => pick('camera')} />
          {previewUri && <Chip label={t('item.removePhoto')} selected={false} onPress={() => setPhoto({ kind: 'remove' })} />}
        </View>

        <Field theme={theme} label={t('item.brand')}>
          <TextInput accessibilityLabel={t('item.brand')} value={form.brand} onChangeText={brand => update({ brand })} style={s.input} />
        </Field>
        <Field theme={theme} label={t('item.name')}>
          <TextInput accessibilityLabel={t('item.name')} value={form.name} onChangeText={name => update({ name })} style={s.input} />
        </Field>
        <Field theme={theme} label={t('item.category')}>
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

      <View style={s.actions}>
        {onDelete && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('item.delete')} onPress={onDelete} style={[s.action, s.deleteAction]}>
            <Text style={s.deleteText}>{t('item.delete')}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onCancel} style={[s.action, s.secondary]}>
          <Text style={{ color: theme.text, fontSize: 16 }}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('item.save')}
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={submit}
          style={[s.action, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
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
    photoBox: { aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.border },
    photo: { flex: 1 },
    photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    muted: { color: theme.textMuted, fontSize: 13 },
    center: { textAlign: 'center', marginTop: -8 },
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
    primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  });
