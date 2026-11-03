import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { PieceShape } from '@/lib/outfitLayout';
import { measurePhoto } from '@/lib/photoBounds';
import { fitContent } from '@/lib/photoFit';
import { resolvePhotoUri } from '@/lib/photoStorage';

/**
 * 單品照片：量出照片裡真正有衣服的範圍，裁掉透明留白後放大填滿外框（不改動照片檔）。
 * 量測中或量不到時，先用整張照片 contain 顯示。
 */
export function FittedPhoto({ uri, recyclingKey }: { uri: string; recyclingKey?: string }) {
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [measured, setMeasured] = useState<{ uri: string; shape: PieceShape | null }>();

  useEffect(() => {
    let alive = true;
    measurePhoto(uri).then(shape => {
      if (alive) setMeasured({ uri, shape });
    });
    return () => {
      alive = false;
    };
  }, [uri]);

  const shape = measured?.uri === uri ? measured.shape : null;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame(f => (f.w === width && f.h === height ? f : { w: width, h: height }));
  };
  const source = resolvePhotoUri(uri);

  return (
    <View style={styles.frame} onLayout={onLayout}>
      {shape ? (
        <Image source={source} style={[styles.absolute, fitContent(shape, shape.aspect, frame.w, frame.h)]} contentFit="fill" recyclingKey={recyclingKey} />
      ) : (
        <Image source={source} style={styles.frame} contentFit="contain" recyclingKey={recyclingKey} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  absolute: { position: 'absolute' },
});
