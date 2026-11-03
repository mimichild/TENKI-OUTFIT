import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRouter } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { HeaderIconButton } from '@/components/HeaderIconButton';
import { ItemFilterSheet } from '@/components/ItemFilterSheet';
import { ItemTile } from '@/components/ItemTile';
import { LoadError } from '@/components/LoadError';
import { CATEGORIES } from '@/constants/options';
import { useActiveItemsQuery } from '@/db/useItems';
import { useT } from '@/i18n';
import { applyItemQuery, DEFAULT_ITEM_QUERY, isQueryFiltered, type ItemQuery } from '@/lib/itemQueries';
import { useTheme } from '@/theme/useTheme';

const TABS = ['all', ...CATEGORIES] as const;

export default function ClosetScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { value: items, error, retry } = useActiveItemsQuery();
  const [query, setQuery] = useState<ItemQuery>(DEFAULT_ITEM_QUERY);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filterLabel = t('closet.filter');
  const filtered = isQueryFiltered(query);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderIconButton icon="options-outline" label={filterLabel} active={filtered} onPress={() => setSheetOpen(true)} />
      ),
    });
  }, [navigation, filterLabel, filtered]);

  const visible = useMemo(() => (items ? applyItemQuery(items, query) : []), [items, query]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.tabsBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map(c => (
            <Chip key={c} role="tab" label={t(`category.${c}`)} selected={query.category === c} onPress={() => setQuery(q => ({ ...q, category: c }))} />
          ))}
        </ScrollView>
      </View>

      {items === undefined ? (error ? <LoadError fill onRetry={retry} /> : null) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="shirt-outline" size={44} color={theme.primaryText} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {t(items.length === 0 ? 'closet.empty' : 'closet.emptyFiltered')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={i => i.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <ItemTile item={item} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} />
          )}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('closet.add')}
        onPress={() =>
          router.push({ pathname: '/item/new', params: query.category === 'all' ? {} : { category: query.category } })
        }
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <Ionicons name="add" size={30} color={theme.onPrimary} />
      </Pressable>

      <ItemFilterSheet visible={sheetOpen} query={query} onChange={setQuery} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  grid: { paddingBottom: 96 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  fab: {
    position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
});
