/**
 * Bounded, local-only viewport geometry.
 *
 * Source image, tokens and grid share the same intrinsic pixel coordinates.
 * Zoom/pan never change token x/y or the map's stored grid offsets.
 */
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 300;
export const DEFAULT_ZOOM = 100;

export const clampZoom = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, number))
    : DEFAULT_ZOOM;
};

export function viewportLayout(imageWidth, imageHeight, viewportWidth, viewportHeight, zoom = DEFAULT_ZOOM, panX = 0, panY = 0) {
  if (![imageWidth, imageHeight, viewportWidth, viewportHeight].every((n) => Number.isFinite(n) && n > 0)) {
    return { ready: false, width: 0, height: 0, left: 0, top: 0, panX: 0, panY: 0, scale: 1 };
  }

  const fitScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
  const scale = fitScale * clampZoom(zoom) / 100;
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  // Small images are always centered; a large image cannot be dragged
  // entirely outside the viewport in either axis.
  const limitX = Math.max(0, (width - viewportWidth) / 2);
  const limitY = Math.max(0, (height - viewportHeight) / 2);
  const safeX = Number.isFinite(panX) ? Math.max(-limitX, Math.min(limitX, panX)) : 0;
  const safeY = Number.isFinite(panY) ? Math.max(-limitY, Math.min(limitY, panY)) : 0;

  return {
    ready: true,
    width,
    height,
    left: (viewportWidth - width) / 2 + safeX,
    top: (viewportHeight - height) / 2 + safeY,
    panX: safeX,
    panY: safeY,
    scale,
  };
}
