import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { OutfitEditor, type OutfitDraft } from '@/components/OutfitEditor';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { useOutfitRepository } from '@/db/OutfitRepositoryContext';
import { useOutfit } from '@/db/useOutfits';
import { useActiveItems } from '@/db/useItems';
import { useT } from '@/i18n';
import { taipeiDate } from '@/lib/cwaWeather';
import { nowIso } from '@/lib/ids';
import { deleteOutfit, saveOutfit } from '@/lib/outfitService';
import { presetPieces } from '@/lib/suggestion';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 新增：/outfit/edit?date=YYYY-MM-DD（帶入正在看的日期）
 * 從穿搭建議存：/outfit/edit?date=...&items=id1,id2（單品自動排好位置）
 * 編輯：/outfit/edit?id=...
 */
export default function OutfitEditScreen() {
  const { id, date, items } = useLocalSearchParams<{ id?: string; date?: string; items?: string }>();
  return id ? <EditExisting id={id} /> : <CreateNew date={date && DATE_RE.test(date) ? date : null} preset={items} />;
}

function useCommon() {
  const t = useT();
  const router = useRouter();
  const repo = useOutfitRepository();
  const items = useActiveItems();
  return { t, router, repo, items, today: taipeiDate(nowIso()) };
}

function CreateNew({ date, preset }: { date: string | null; preset?: string }) {
  const { t, router, repo, items, today } = useCommon();
  if (items === undefined) return <Stack.Screen options={{ headerShown: false }} />;
  const initial: OutfitDraft = { name: '', date, pieces: presetPieces(preset, items) };
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OutfitEditor
        title={t('outfit.new')}
        initial={initial}
        items={items}
        today={today}
        onSave={async input => {
          await saveOutfit(repo, null, input);
          router.back();
        }}
        onCancel={() => router.back()}
      />
    </>
  );
}

function EditExisting({ id }: { id: string }) {
  const { t, router, repo, items, today } = useCommon();
  const outfit = useOutfit(id);
  if (outfit === undefined || items === undefined) return <Stack.Screen options={{ headerShown: false }} />;
  if (outfit === null) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: t('outfit.edit') }} />
        <ScreenPlaceholder icon="help-circle-outline" message={t('outfit.notFound')} />
      </>
    );
  }
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OutfitEditor
        title={t('outfit.edit')}
        initial={{ name: outfit.name, date: outfit.date, pieces: outfit.pieces }}
        items={items}
        today={today}
        onSave={async input => {
          await saveOutfit(repo, id, input);
          router.back();
        }}
        onCancel={() => router.back()}
        onDelete={async () => {
          await deleteOutfit(repo, id);
          router.back();
        }}
      />
    </>
  );
}
