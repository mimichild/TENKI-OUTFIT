import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { OutfitEditor, type OutfitDraft } from '@/components/OutfitEditor';
import { LoadError } from '@/components/LoadError';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { useOutfitRepository } from '@/db/OutfitRepositoryContext';
import { useOutfitQuery } from '@/db/useOutfits';
import { useActiveItemsQuery } from '@/db/useItems';
import { useT } from '@/i18n';
import { taipeiDate } from '@/lib/cwaWeather';
import { nowIso } from '@/lib/ids';
import { deleteOutfit, saveOutfit } from '@/lib/outfitService';
import { CANVAS_HEIGHT_RATIO } from '@/lib/outfitCanvas';
import { presetPieces } from '@/lib/suggestion';
import { useSharedCanvasRatio } from '@/store/canvasStore';
import { usePieceShapes } from '@/lib/usePieceShapes';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 新增：/outfit/edit?date=YYYY-MM-DD（帶入正在看的日期）
 * 從穿搭建議存：/outfit/edit?date=...&items=id1,id2（單品自動排好位置）
 * 編輯：/outfit/edit?id=...
 */
export default function OutfitEditScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; date?: string | string[]; items?: string | string[] }>();
  // 同一個參數重複出現時 Expo Router 會給陣列，只取第一個
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const id = one(params.id);
  const date = one(params.date);
  return id ? <EditExisting id={id} /> : <CreateNew date={date && DATE_RE.test(date) ? date : null} preset={one(params.items)} />;
}

function useCommon() {
  const t = useT();
  const router = useRouter();
  const repo = useOutfitRepository();
  const itemsQuery = useActiveItemsQuery();
  return { t, router, repo, items: itemsQuery.value, itemsQuery, today: taipeiDate(nowIso()) };
}

function CreateNew({ date, preset }: { date: string | null; preset?: string }) {
  const { t, router, repo, items, itemsQuery, today } = useCommon();
  // 從穿搭建議來的單品：量好照片範圍再排版。編輯器只在第一次顯示時讀 initial，
  // 所以第一次排好就鎖住，之後單品資料變了也不會把編輯中的畫布卸掉重來
  const [initial, setInitial] = useState<OutfitDraft | null>(null);
  const presetItems = useMemo(() => (items && preset ? presetPieces(preset, items).map(p => p.item) : []), [items, preset]);
  const shapes = usePieceShapes(items && preset && !initial ? presetItems : undefined);
  // 照天氣穿搭／編輯穿搭共用的畫布比例排版（照 4:3 排的話畫布比較矮時鞋子、下著會被切掉）
  const ratio = useSharedCanvasRatio(CANVAS_HEIGHT_RATIO);
  useEffect(() => {
    if (initial || items === undefined) return;
    if (!preset) setInitial({ name: '', date, pieces: [] });
    else if (shapes) setInitial({ name: '', date, pieces: presetPieces(preset, items, shapes, ratio), canvasRatio: ratio });
  }, [initial, items, preset, shapes, date, ratio]);
  if (items === undefined && itemsQuery.error) return <LoadErrorScreen title={t('outfit.new')} onRetry={itemsQuery.retry} />;
  if (!initial || items === undefined) return <Stack.Screen options={{ headerShown: false }} />;
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
  const { t, router, repo, items, itemsQuery, today } = useCommon();
  const outfitQuery = useOutfitQuery(id);
  const outfit = outfitQuery.value;
  const failed = (outfit === undefined && outfitQuery.error) || (items === undefined && itemsQuery.error);
  if (failed) {
    return (
      <LoadErrorScreen
        title={t('outfit.edit')}
        onRetry={() => {
          if (outfitQuery.error) outfitQuery.retry();
          if (itemsQuery.error) itemsQuery.retry();
        }}
      />
    );
  }
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
        initial={{ name: outfit.name, date: outfit.date, pieces: outfit.pieces, canvasRatio: outfit.canvasRatio }}
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

function LoadErrorScreen({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title }} />
      <LoadError fill onRetry={onRetry} />
    </>
  );
}
