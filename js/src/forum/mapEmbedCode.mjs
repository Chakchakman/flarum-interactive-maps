// Only a numeric map identifier is exported, never arbitrary HTML or iframe.
// An exported code grants no access: the attach API enforces all permissions.
export function mapEmbedCode(id) {
  const value = String(id);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error('Некорректный ID карты');
  }
  return `[interactive-map id=${value}]`;
}

export function parseMapEmbedCode(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  const match = /^(?:\[interactive-map\s+id=([1-9]\d*)\]|([1-9]\d*))$/.exec(value);
  const id = match?.[1] ?? match?.[2];
  return id && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}
