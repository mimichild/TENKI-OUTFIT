import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ItemForm } from '@/components/ItemForm';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { useItemRepository } from '@/db/ItemRepositoryContext';
import { useItem } from '@/db/useItems';
import { useT } from '@/i18n';
import { formatPrice } from '@/lib/currency';
import { moveItemToTrash, saveItem } from '@/lib/itemService';
import { pickPhoto } from '@/lib/pickPhoto';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/useTheme';

export default function ItemScreen() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const repo = useItemRepository();
  const currency = useSettingsStore(s => s.currency);
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const [editing, setEditing] = useState(false);

  if (item === undefined) return <Stack.Screen options={{ title: t('item.detail') }} />;
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
          initial={item}
          onPickPhoto={pickPhoto}
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
    [t('item.occasions'), item.occasions.length ? item.occasions.map(o => t(`occasion.${o}`)).join('、') : t('item.allOccasions')],
    [t('item.seasons'), item.seasons.length ? item.seasons.map(s => t(`season.${s}`)).join('、') : t('item.allSeasons')],
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: t('item.detail'),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('item.edit')} onPress={() => setEditing(true)} hitSlop={10}>
              <Text style={{ color: theme.primary, fontSize: 16 }}>{t('item.edit')}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <View style={[styles.photoBox, { borderColor: theme.border }]}>
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={{ flex: 1 }} contentFit="contain" />
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
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  photoBox: { aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1 },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 16,
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  value: { fontSize: 15, flexShrink: 1, textAlign: 'right' },
});
