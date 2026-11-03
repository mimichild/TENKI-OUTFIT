import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { OutfitCanvasView } from '@/components/OutfitCanvasView';

const sizeOf = () => StyleSheet.flatten(screen.getByTestId('outfit-canvas-view').props.style);

describe('OutfitCanvasView', () => {
  it('依每套穿搭自己的畫布比例顯示', () => {
    render(<OutfitCanvasView pieces={[]} width={100} ratio={1.8} />);
    expect(sizeOf()).toMatchObject({ width: 100, height: 180 });
  });

  it('沒給比例時是 3:4', () => {
    render(<OutfitCanvasView pieces={[]} width={90} />);
    expect(sizeOf()).toMatchObject({ width: 90, height: 120 });
  });
});
