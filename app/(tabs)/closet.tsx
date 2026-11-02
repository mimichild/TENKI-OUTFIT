import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { useT } from '@/i18n';

export default function ClosetScreen() {
  const t = useT();
  return <ScreenPlaceholder icon="shirt-outline" message={t('placeholder.closet')} />;
}
