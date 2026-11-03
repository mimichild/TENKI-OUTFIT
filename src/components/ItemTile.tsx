import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { ITEM_PHOTO_ASPECT } from '@/lib/photoFit';
import { FittedPhoto } from './FittedPhoto';
import { useTheme } from '@/theme/useTheme';
import type { Item } from '@/types/models';

export function ItemTile({ item, onPress }: { item: Item; onPress: () => void }) {
  const theme = useTheme();
  const t = useT();
  const label = item.name || item.brand || t('item.untitled');
  return (
    <Pressable testID="item-tile" accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.cell}>
      <View style={[styles.inner, { borderColor: theme.border }]}>
        {item.imageUri ? (
          <FittedPhoto uri={item.imageUri} recyclingKey={item.id} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="shirt-outline" size={28} color={theme.textMuted} />
            <Text numberOfLines={2} style={[styles.name, { color: theme.textMuted }]}>{label}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.3333%', aspectRatio: ITEM_PHOTO_ASPECT, padding: 1 },
  // 去背後的單品放在白底上最好看，深色模式也維持白底
  inner: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 6 },
  name: { fontSize: 12, textAlign: 'center' },
});
