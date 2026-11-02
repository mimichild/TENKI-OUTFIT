import { Text } from 'react-native';

// 測試環境不載入圖示字型，避免非同步 setState 的 act() 警告
export default function Ionicons({ name }: { name: string }) {
  return <Text>{`icon:${name}`}</Text>;
}
