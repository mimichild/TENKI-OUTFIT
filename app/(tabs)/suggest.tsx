import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { useT } from '@/i18n';

export default function SuggestScreen() {
  const t = useT();
  return <ScreenPlaceholder icon="sparkles-outline" message={t('placeholder.suggest')} />;
}
