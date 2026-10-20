/**
 * Grid measurements use the source background image's natural pixels.
 * The background and the SVG grid share the same viewBox dimensions.
 */
export const FALLBACK_IMAGE = Object.freeze({ width: 1280, height: 853 });

export function validImageSize(width, height) {
  return Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0;
}

export function gridMetrics(size, offsetX, offsetY, image) {
  const width = validImageSize(image?.width, image?.height) ? image.width : FALLBACK_IMAGE.width;
  const height = validImageSize(image?.width, image?.height) ? image.height : FALLBACK_IMAGE.height;
  const cell = Math.min(256, Math.max(12, Number(size) || 64));
  return {
    width,
    height,
    cell,
    offsetX: Number(offsetX) || 0,
    offsetY: Number(offsetY) || 0,
    aspectRatio: `${width} / ${height}`,
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function snapToCellCenter(position, dimension, size, offset) {
  if (!Number.isFinite(position) || !(dimension > 0) || !(size > 0)) return clamp(position || 0, 0, 1);
  const px = clamp(position, 0, 1) * dimension;
  const cellIndex = Math.floor((px - offset) / size);
  const center = offset + (cellIndex + 0.5) * size;
  return clamp(center / dimension, 0, 1);
}
