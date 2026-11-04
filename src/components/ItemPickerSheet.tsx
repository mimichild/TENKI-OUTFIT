import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES } from '@/constants/options';
import { useT } from '@/i18n';
import { ITEM_PHOTO_ASPECT } from '@/lib/photoFit';
import { FittedPhoto } from './FittedPhoto';
import { useTheme } from '@/theme/useTheme';
import type { Category, Item } from '@/types/models';
import { Chip } from './Chip';

interface Props {
  visible: boolean;
  /** 視窗上緣離螢幕頂端的距離（編輯器標題列的下緣）；沒量到時佔畫面 88% */
  topOffset?: number | null;
  items: Item[];
  selectedIds: ReadonlySet<string>;
  onToggle: (item: Item) => void;
  onClose: () => void;
}

/** 從服裝挑單品放上畫布；點一下加入，再點一下拿掉 */
export function ItemPickerSheet({ visible, topOffset, items, selectedIds, onToggle, onClose }: Props) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // 固定高度（不隨單品數量縮小），從標題列下方蓋到底
  const top = topOffset != null && topOffset > 0 ? topOffset : window.height * (1 - SHEET_FALLBACK_HEIGHT);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const shown = useMemo(
    () => [...items].filter(i => category === 'all' || i.category === category).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items, category],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable testID="picker-backdrop" style={[styles.backdrop, { height: top }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.done')} />
      <View testID="picker-sheet" style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.header, { borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('outfit.pickerTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: theme.primaryText, fontSize: 16 }}>{t('common.done')}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsBar} accessibilityRole="tablist">
          {(['all', ...CATEGORIES] as const).map(c => (
            <Chip key={c} role="tab" label={t(`category.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>
        <FlatList
          data={shown}
          keyExtractor={i => i.id}
          numColumns={3}
          style={styles.list}
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{t('outfit.pickerEmpty')}</Text>}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            const label = item.name || item.brand || t('item.untitled');
            return (
              <Pressable
                testID="picker-item"
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: selected }}
                onPress={() => onToggle(item)}
                style={styles.cell}
              >
                <View style={[styles.tile, { borderColor: selected ? theme.primary : theme.border, borderWidth: selected ? 2 : StyleSheet.hairlineWidth }]}>
                  {item.imageUri ? (
                    <FittedPhoto uri={item.imageUri} recyclingKey={item.id} />
                  ) : (
                    <View style={styles.placeholder}>
                      <Ionicons name="shirt-outline" size={24} color={theme.textMuted} />
                      <Text numberOfLines={2} style={[styles.name, { color: theme.textMuted }]}>{label}</Text>
                    </View>
                  )}
                  {selected && (
                    <View style={[styles.check, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={14} color={theme.onPrimary} />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

/** 量不到標題列位置時，視窗佔畫面的比例 */
const SHEET_FALLBACK_HEIGHT = 0.88;

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { flex: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '600' },
  tabsBar: { flexGrow: 0 },
  tabs: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  list: { flex: 1, paddingHorizontal: 2 },
  cell: { width: '33.3333%', aspectRatio: ITEM_PHOTO_ASPECT, padding: 2 },
  tile: { flex: 1, backgroundColor: '#FFFFFF' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4 },
  name: { fontSize: 12, textAlign: 'center' },
  check: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', padding: 24 },
});
