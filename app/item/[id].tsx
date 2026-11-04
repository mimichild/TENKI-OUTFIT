import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FittedPhoto } from '@/components/FittedPhoto';
import { ItemForm } from '@/components/ItemForm';
import { LoadError } from '@/components/LoadError';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { useItemRepository } from '@/db/ItemRepositoryContext';
import { useActiveItemsQuery, useItemQuery } from '@/db/useItems';
import { useT } from '@/i18n';
import { formatPrice } from '@/lib/currency';
import { adjacentItems, itemQueryParams, parseItemQueryParams } from '@/lib/itemQueries';
import { inferStyle } from '@/lib/itemStyle';
import { useAutoColor } from '@/lib/useAutoColor';
import { moveItemToTrash, saveItem } from '@/lib/itemService';
import { pickPhoto } from '@/lib/pickPhoto';
import { removeBackground } from '@/lib/backgroundRemoval';
import { ITEM_PHOTO_ASPECT } from '@/lib/photoFit';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/useTheme';

export default function ItemScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const repo = useItemRepository();
  const currency = useSettingsStore(s => s.currency);
  const params = useLocalSearchParams<{ id: string; category?: string; sort?: string; seasons?: string; occasions?: string; dir?: string }>();
  const { id } = params;
  const { value: item, error, retry } = useItemQuery(id);
  const { value: allItems } = useActiveItemsQuery();
  const autoColor = useAutoColor(item?.imageUri ?? null);
  const [editing, setEditing] = useState(false);

  // 左右滑換到隔壁的單品（服裝頁格子的順序，沿用篩選與排序）：由左往右 = 前一格，由右往左 = 後一格
  const query = useMemo(
    () => parseItemQueryParams(params),
    [params.category, params.sort, params.seasons, params.occasions], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const neighbors = useMemo(
    () => (allItems ? adjacentItems(allItems, query, id) : { prev: null, next: null }),
    [allItems, query, id],
  );
  const go = (dir: 'prev' | 'next') => {
    const target = neighbors[dir];
    // replace：滑過好幾件後按返回，直接回到服裝頁
    if (target) router.replace({ pathname: '/item/[id]', params: { id: target, ...itemQueryParams(query), dir } });
  };
  // 水平滑超過 20px 才啟動，上下捲動時讓給 ScrollView
  const swipe = Gesture.Pan()
    .withTestId('item-swipe')
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd(e => {
      if (e.translationX >= SWIPE_DISTANCE) go('prev');
      else if (e.translationX <= -SWIPE_DISTANCE) go('next');
    });
  // 從哪邊滑進來：前一格從左邊進來，後一格從右邊進來
  const animation = params.dir === 'prev' ? 'slide_from_left' : params.dir === 'next' ? 'slide_from_right' : undefined;

  if (item === undefined) {
    return (
      <>
        <Stack.Screen options={{ title: t('item.detail') }} />
        {error ? <LoadError fill onRetry={retry} /> : null}
      </>
    );
  }
  if (item === null) {
    return (
      <>
        <Stack.Screen options={{ title: t('item.detail') }} />
        <ScreenPlaceholder icon="help-circle-outline" message={t('item.notFound')} />
      </>
    );
  }

  if (editing) {
    return (
      <>
        <Stack.Screen options={{ title: t('item.edit'), headerRight: undefined }} />
        <ItemForm
          initial={{
            name: item.name, brand: item.brand, category: item.category, price: item.price,
            occasions: item.occasions, seasons: item.seasons, imageUri: item.imageUri, originalUri: item.originalUri,
            color: item.color ?? null, style: item.style ?? null,
          }}
          onPickPhoto={pickPhoto}
          onRemoveBackground={removeBackground}
          onSubmit={async (input, photo) => {
            await saveItem(repo, item, input, photo);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={async () => {
            await moveItemToTrash(repo, item.id);
            router.back();
          }}
        />
      </>
    );
  }

  const title = item.name || item.brand || t('item.untitled');
  const rows: [string, string][] = [
    [t('item.brand'), item.brand || '—'],
    [t('item.category'), t(`category.${item.category}`)],
    [t('item.price'), formatPrice(item.price, currency)],
    [t('item.occasions'), item.occasions.length ? item.occasions.map(o => t(`occasion.${o}`)).join(t('common.listSeparator')) : t('item.allOccasions')],
    [t('item.seasons'), item.seasons.length ? item.seasons.map(s => t(`season.${s}`)).join(t('common.listSeparator')) : t('item.allSeasons')],
  ];
  // 沒手動設定時顯示自動判斷的結果（加註「自動」）
  const color = item.color ?? autoColor;
  const style = item.style ?? inferStyle(item);
  rows.push(
    [t('item.color'), color ? t(`color.${color}`) + (item.color ? '' : t('item.autoSuffix')) : '—'],
    [t('item.style'), style ? t(`style.${style}`) + (item.style ? '' : t('item.autoSuffix')) : t('item.anyStyle')],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('item.detail'),
          animation,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('item.edit')} onPress={() => setEditing(true)} hitSlop={10}>
              <Text style={{ color: theme.primaryText, fontSize: 16 }}>{t('item.edit')}</Text>
            </Pressable>
          ),
        }}
      />
      <GestureDetector gesture={swipe}>
        <ScrollView
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={styles.content}
          accessibilityActions={[
            ...(neighbors.prev ? [{ name: 'prev', label: t('item.prev') }] : []),
            ...(neighbors.next ? [{ name: 'next', label: t('item.next') }] : []),
          ]}
          onAccessibilityAction={e => {
            const name = e.nativeEvent.actionName;
            if (name === 'prev' || name === 'next') go(name);
          }}
        >
          <View style={[styles.photoBox, { borderColor: theme.border }]}>
            {item.imageUri ? (
              <FittedPhoto uri={item.imageUri} />
            ) : (
              <View style={styles.noPhoto}>
                <Ionicons name="image-outline" size={40} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted }}>{t('item.noPhoto')}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {rows.map(([label, value]) => (
              <View key={label} style={[styles.row, { borderColor: theme.border }]}>
                <Text style={{ color: theme.textMuted, fontSize: 15 }}>{label}</Text>
                <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </GestureDetector>
    </>
  );
}

/** 水平滑多遠（px）才換單品 */
const SWIPE_DISTANCE = 60;

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  photoBox: { aspectRatio: ITEM_PHOTO_ASPECT, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1 },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 16,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  value: { fontSize: 15, flexShrink: 1, textAlign: 'right' },
});
