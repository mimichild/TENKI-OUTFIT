import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiKeyField } from '@/components/ApiKeyField';
import { OptionPicker } from '@/components/OptionPicker';
import { COUNTIES, type County } from '@/constants/options';
import { useTrashItems } from '@/db/useItems';
import { THEME_COLOR_KEYS, THEME_COLORS } from '@/constants/themeColors';
import { LANGUAGE_LABELS, LANGUAGES, useT, type Language } from '@/i18n';
import { builtInCwaKey } from '@/lib/cwaKey';
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '@/lib/currency';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme, type Theme } from '@/theme/useTheme';

type PickerKind = 'language' | 'region' | 'currency' | null;

export default function SettingsScreen() {
  const t = useT();
  const theme = useTheme();
  const settings = useSettingsStore();
  const router = useRouter();
  const trash = useTrashItems();
  const [picker, setPicker] = useState<PickerKind>(null);
  const close = () => setPicker(null);
  const hasBuiltInKey = builtInCwaKey() !== '';

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Section title={t('settings.sectionGeneral')} theme={theme}>
        <Row theme={theme} label={t('settings.language')} value={LANGUAGE_LABELS[settings.language]} onPress={() => setPicker('language')} />
        <Row theme={theme} label={t('settings.currency')} value={`${settings.currency} ${CURRENCIES[settings.currency].symbol}`} onPress={() => setPicker('currency')} />
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.text }]}>{t('settings.themeColor')}</Text>
        </View>
        <View style={styles.swatches}>
          {THEME_COLOR_KEYS.map(key => {
            const selected = key === settings.themeColor;
            return (
              <Pressable
                key={key}
                onPress={() => settings.update({ themeColor: key })}
                accessibilityRole="button"
                accessibilityLabel={t(`theme.${key}`)}
                accessibilityState={{ selected }}
                style={styles.swatchWrap}
              >
                <View style={[styles.swatch, { backgroundColor: THEME_COLORS[key].primary, borderColor: selected ? theme.text : 'transparent' }]}>
                  {selected && <Ionicons name="checkmark" size={18} color={THEME_COLORS[key].onPrimary} />}
                </View>
                <Text style={[styles.swatchLabel, { color: theme.textMuted }]}>{t(`theme.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={t('settings.sectionWeather')} theme={theme}>
        <Row theme={theme} label={t('settings.region')} value={settings.county} onPress={() => setPicker('region')} />
        {/* 一律顯示：有內建授權碼時，想用自己額度的人仍可填自己的（自己的優先） */}
        <View style={styles.keyBlock}>
          <Text style={[styles.label, { color: theme.text }]}>{t('settings.cwaApiKey')}</Text>
          <ApiKeyField theme={theme} />
          <Text style={[styles.hint, { color: theme.textMuted }]}>{t('settings.cwaApiKeyHint')}</Text>
          {hasBuiltInKey && <Text style={[styles.hint, { color: theme.textMuted }]}>{t('settings.cwaApiKeyBuiltIn')}</Text>}
        </View>
      </Section>

      <Section title={t('settings.sectionData')} theme={theme}>
        <Row
          theme={theme}
          label={t('settings.trash')}
          value={trash ? t('settings.trashCount', { count: trash.length }) : ''}
          onPress={() => router.push('/trash')}
        />
        <Row theme={theme} label={t('settings.backup')} value={t('settings.backupValue')} onPress={() => router.push('/backup')} />
      </Section>

      <OptionPicker<Language>
        visible={picker === 'language'}
        title={t('settings.language')}
        options={LANGUAGES}
        selected={settings.language}
        getLabel={l => LANGUAGE_LABELS[l]}
        onSelect={language => settings.update({ language })}
        onClose={close}
      />
      <OptionPicker<County>
        visible={picker === 'region'}
        title={t('settings.region')}
        options={COUNTIES}
        selected={settings.county}
        onSelect={county => settings.update({ county, town: '' })}
        onClose={close}
      />
      <OptionPicker<CurrencyCode>
        visible={picker === 'currency'}
        title={t('settings.currency')}
        options={CURRENCY_CODES}
        selected={settings.currency}
        getLabel={c => `${c}  ${CURRENCIES[c].symbol}`}
        onSelect={currency => settings.update({ currency })}
        onClose={close}
      />
    </ScrollView>
  );
}

function Section({ title, theme, children }: { title: string; theme: Theme; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>
    </View>
  );
}

interface RowProps {
  theme: Theme;
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
}

function Row({ theme, label, value, onPress, disabled }: RowProps) {
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || !onPress }}
    >
      <Text style={[styles.label, { color: disabled ? theme.textMuted : theme.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.value, { color: theme.textMuted }]}>{value}</Text>
        {!disabled && <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 16 },
  value: { fontSize: 15 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 14, gap: 4 },
  swatchWrap: { alignItems: 'center', width: 56, gap: 4 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { fontSize: 11 },
  keyBlock: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  hint: { fontSize: 12 },
});
