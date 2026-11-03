import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { CANVAS_HEIGHT_RATIO, pieceBox } from '@/lib/outfitCanvas';
import { resolvePhotoUri } from '@/lib/photoStorage';
import type { Item, OutfitItemPlacement, OutfitPiece } from '@/types/models';

/** 單品在畫布上的方框位置、大小、旋轉與疊放順序 */
export function pieceStyle(p: OutfitItemPlacement, width: number): ViewStyle {
  const { left, top, size } = pieceBox(p, width);
  return { position: 'absolute', left, top, width: size, height: size, zIndex: p.z, transform: [{ rotate: `${p.rotation}rad` }] };
}

export function PieceImage({ item }: { item: Item }) {
  if (item.imageUri) {
    return <Image source={resolvePhotoUri(item.imageUri)} style={styles.fill} contentFit="contain" recyclingKey={item.id} />;
  }
  return (
    <View style={[styles.fill, styles.placeholder]}>
      <Ionicons name="shirt-outline" size={28} color="#9A9A9A" />
      {!!(item.name || item.brand) && <Text numberOfLines={2} style={styles.name}>{item.name || item.brand}</Text>}
    </View>
  );
}

/** 唯讀的穿搭畫布（天氣穿搭頁、清單縮圖） */
export function OutfitCanvasView({ pieces, width }: { pieces: OutfitPiece[]; width: number }) {
  return (
    <View style={[styles.canvas, { width, height: width * CANVAS_HEIGHT_RATIO }]} pointerEvents="none">
      {pieces.map(p => (
        <View key={p.itemId} style={pieceStyle(p, width)}>
          <PieceImage item={p.item} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: '#FFFFFF', overflow: 'hidden' },
  fill: { flex: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  name: { color: '#8A8A8A', fontSize: 12, textAlign: 'center' },
});
