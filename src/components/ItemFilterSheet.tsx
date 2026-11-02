import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OCCASIONS, SEASONS } from '@/constants/options';
import { useT } from '@/i18n';
import { ITEM_SORTS, type ItemQuery } from '@/lib/itemQueries';
import { useTheme } from '@/theme/useTheme';
import { Chip } from './Chip';

interface Props {
  visible: boolean;
  query: ItemQuery;
  onChange: (query: ItemQuery) => void;
  onClose: () => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export function ItemFilterSheet({ visible, query, onChange, onClose }: Props) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const title = (text: string) => <Text style={[styles.section, { color: theme.text }]}>{text}</Text>;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.done')} />
      <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.header, { borderColor: theme.border }]}>
          <Pressable onPress={() => onChange({ ...query, seasons: [], occasions: [] })} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: theme.textMuted, fontSize: 15 }}>{t('filter.clear')}</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{t('closet.filter')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: theme.primary, fontSize: 16 }}>{t('common.done')}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {title(t('sort.title'))}
          <View style={styles.row}>
            {ITEM_SORTS.map(sort => (
              <Chip key={sort} role="radio" label={t(`sort.${sort}`)} selected={query.sort === sort} onPress={() => onChange({ ...query, sort })} />
            ))}
          </View>
          {title(t('item.seasons'))}
          <View style={styles.row}>
            {SEASONS.map(x => (
              <Chip key={x} role="checkbox" label={t(`season.${x}`)} selected={query.seasons.includes(x)} onPress={() => onChange({ ...query, seasons: toggle(query.seasons, x) })} />
            ))}
          </View>
          {title(t('item.occasions'))}
          <View style={styles.row}>
            {OCCASIONS.map(o => (
              <Chip key={o} role="checkbox" label={t(`occasion.${o}`)} selected={query.occasions.includes(o)} onPress={() => onChange({ ...query, occasions: toggle(query.occasions, o) })} />
            ))}
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t('filter.hint')}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '600' },
  body: { padding: 20, gap: 12 },
  section: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
