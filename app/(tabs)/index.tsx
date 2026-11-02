import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';
import { useT } from '@/i18n';

export default function WeatherScreen() {
  const t = useT();
  return <ScreenPlaceholder icon="partly-sunny-outline" message={t('placeholder.weather')} />;
}
