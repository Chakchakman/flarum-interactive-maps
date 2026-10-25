export const DEFAULT_GRID_COLOR = '#ffffff';
export const DEFAULT_GRID_LINE_WIDTH = 1;
export const GRID_OPACITY = 0.48;

export function gridStyle(map = {}) {
  const color = map.gridColor;
  const width = map.gridLineWidth;
  return {
    gridColor: typeof color === 'string' && color.length === 7 && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_GRID_COLOR,
    gridLineWidth: typeof width === 'number' && Number.isFinite(width) && width >= 0.5 && width <= 5 && Number.isInteger(width * 2)
      ? width : DEFAULT_GRID_LINE_WIDTH,
  };
}
