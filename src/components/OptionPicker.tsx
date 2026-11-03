import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/useTheme';

interface Props<T extends string> {
  visible: boolean;
  title: string;
  options: readonly T[];
  selected: T;
  getLabel?: (value: T) => string;
  onSelect: (value: T) => void;
  onClose: () => void;
}

export function OptionPicker<T extends string>({
  visible, title, options, selected, getLabel = v => v, onSelect, onClose,
}: Props<T>) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.header, { borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: theme.primaryText, fontSize: 16 }}>{t('common.done')}</Text>
          </Pressable>
        </View>
        <ScrollView>
          {options.map(item => (
            <Pressable
              key={item}
              style={styles.row}
              onPress={() => { onSelect(item); onClose(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: item === selected }}
            >
              <Text style={[styles.rowText, { color: theme.text }]}>{getLabel(item)}</Text>
              {item === selected && <Ionicons name="checkmark" size={20} color={theme.primaryText} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '60%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '600' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  rowText: { fontSize: 16 },
});
