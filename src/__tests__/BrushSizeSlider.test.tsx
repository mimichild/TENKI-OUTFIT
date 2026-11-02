import { fireEvent, render, screen } from '@testing-library/react-native';
import { BrushSizeSlider } from '@/components/BrushSizeSlider';
import { BRUSH_MAX, BRUSH_MIN } from '@/lib/maskEditing';

function setup(value: number) {
  const onChange = jest.fn();
  render(<BrushSizeSlider value={value} onChange={onChange} label="筆刷" />);
  return onChange;
}

describe('BrushSizeSlider', () => {
  it('exposes the current size to screen readers as an adjustable control', () => {
    setup(28);
    const slider = screen.getByRole('adjustable', { name: '筆刷' });
    expect(slider.props.accessibilityValue).toEqual({ min: BRUSH_MIN, max: BRUSH_MAX, now: 28, text: '28' });
  });

  it('increments and decrements with accessibility actions, clamped to the range', () => {
    const onChange = setup(28);
    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange.mock.calls).toEqual([[32], [24]]);
  });

  it('does not go past the maximum', () => {
    const onChange = setup(BRUSH_MAX - 1);
    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenCalledWith(BRUSH_MAX);
  });
});
