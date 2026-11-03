import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { addMonths, monthOf } from '@/lib/calendar';
import { useTheme } from '@/theme/useTheme';
import { MonthGrid } from './MonthGrid';

interface Props {
  visible: boolean;
  value: string | null;
  today: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

export function DatePickerSheet({ visible, value, today, onSelect, onClose }: Props) {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(monthOf(value ?? today));
  useEffect(() => {
    if (visible) setMonth(monthOf(value ?? today));
  }, [visible, value, today]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.header, { borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('outfit.pickDate')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: theme.primary, fontSize: 16 }}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          <MonthGrid
            month={month}
            today={today}
            selected={value}
            onSelect={date => {
              onSelect(date);
              onClose();
            }}
            onPrev={() => setMonth(m => addMonths(m, -1))}
            onNext={() => setMonth(m => addMonths(m, 1))}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 12 },
});
