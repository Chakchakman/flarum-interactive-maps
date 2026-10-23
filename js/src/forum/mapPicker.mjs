import { parseMapEmbedCode } from './mapEmbedCode.mjs';

export function filterPickerMaps(maps, query) {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return maps;
  const id = parseMapEmbedCode(query);
  return maps.filter((map) => id !== null
    ? Number(map.id) === id
    : String(map.title || '').toLocaleLowerCase().includes(text));
}

export function pickerMapId(maps, selectedId, query) {
  // Selection must still belong to the loaded list. Explicit IDs keep the
  // previous export-code flow available beyond the catalog's 100-map limit.
  if (selectedId !== null) {
    return maps.some((map) => Number(map.id) === selectedId) ? selectedId : null;
  }
  return parseMapEmbedCode(query);
}
