import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { TRASH_RETENTION_DAYS } from '@/constants/options';
import { useItemRepository } from '@/db/ItemRepositoryContext';
import { useTrashItems } from '@/db/useItems';
import { useT } from '@/i18n';
import { trashDaysLeft } from '@/lib/itemQueries';
import { purgeItem, restoreItem } from '@/lib/itemService';
import { resolvePhotoUri } from '@/lib/photoStorage';
import { useTheme } from '@/theme/useTheme';

export default function TrashScreen() {
  const t = useT();
  const theme = useTheme();
  const repo = useItemRepository();
  const items = useTrashItems();
  // 永久刪除要點兩次：第一次只標記，第二次才真的刪（不用系統對話框）
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const now = new Date(Date.now()).toISOString();

  const run = (action: () => Promise<void>) =>
    action()
      .catch(e => console.warn('暫存區操作失敗', e))
      .finally(() => setConfirmId(null));

  return (
    <>
      <Stack.Screen options={{ title: t('trash.title') }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={items ?? []}
        keyExtractor={i => i.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.hint, { color: theme.textMuted }]}>{t('trash.hint', { days: TRASH_RETENTION_DAYS })}</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>{t('trash.archiveNote')}</Text>
          </View>
        }
        ListEmptyComponent={
          items ? (
            <View style={styles.empty}>
              <Ionicons name="trash-outline" size={40} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, fontSize: 15 }}>{t('trash.empty')}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const name = item.name || item.brand || t('item.untitled');
          const confirming = confirmId === item.id;
          const purgeLabel = t(confirming ? 'trash.confirmPurge' : 'trash.purge');
          return (
            <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.thumb, { borderColor: theme.border }]}>
                {item.imageUri ? (
                  <Image source={resolvePhotoUri(item.imageUri)} style={{ flex: 1 }} contentFit="contain" />
                ) : (
                  <Ionicons name="shirt-outline" size={22} color={theme.textMuted} style={{ alignSelf: 'center', marginTop: 17 }} />
                )}
              </View>
              <View style={styles.info}>
                <Text testID="trash-name" numberOfLines={1} style={[styles.name, { color: theme.text }]}>{name}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  {t('trash.daysLeft', { days: trashDaysLeft(item.deletedAt!, now, TRASH_RETENTION_DAYS) })}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('trash.restore')} ${name}`}
                    onPress={() => run(() => restoreItem(repo, item.id))}
                    style={[styles.action, { borderColor: theme.primary }]}
                  >
                    <Text style={{ color: theme.primary, fontSize: 14 }}>{t('trash.restore')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${purgeLabel} ${name}`}
                    onPress={() => (confirming ? run(() => purgeItem(repo, item.id)) : setConfirmId(item.id))}
                    style={[styles.action, { borderColor: '#D93025', backgroundColor: confirming ? '#D93025' : 'transparent' }]}
                  >
                    <Text style={{ color: confirming ? '#FFFFFF' : '#D93025', fontSize: 14 }}>{purgeLabel}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  header: { gap: 2, marginBottom: 4 },
  hint: { fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
  row: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
});
