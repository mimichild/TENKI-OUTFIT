import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ItemForm, EMPTY_ITEM_INPUT } from '@/components/ItemForm';
import { CATEGORIES } from '@/constants/options';
import { useItemRepository } from '@/db/ItemRepositoryContext';
import { useT } from '@/i18n';
import { saveItem } from '@/lib/itemService';
import { pickPhoto } from '@/lib/pickPhoto';
import { removeBackground } from '@/lib/backgroundRemoval';
import type { Category } from '@/types/models';

export default function NewItemScreen() {
  const t = useT();
  const router = useRouter();
  const repo = useItemRepository();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const initialCategory = (CATEGORIES as string[]).includes(category ?? '') ? (category as Category) : 'top';

  return (
    <>
      <Stack.Screen options={{ title: t('item.new') }} />
      <ItemForm
        initial={{ ...EMPTY_ITEM_INPUT, category: initialCategory }}
        onPickPhoto={pickPhoto}
        onRemoveBackground={removeBackground}
        onSubmit={async (input, photo) => {
          await saveItem(repo, null, input, photo);
          router.back();
        }}
        onCancel={() => router.back()}
      />
    </>
  );
}
