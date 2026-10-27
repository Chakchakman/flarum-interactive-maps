import { normalizeToken } from './apiResponse.mjs';

// Compare the actual view model, not a previous server snapshot: local drags
// mutate coordinates and must still be corrected by an authoritative read.
function sameToken(left, right) {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(right, key)
      && Object.is(left[key], right[key]));
}

/** Preserve unchanged objects/arrays so idle polls need no parent redraw. */
export function reconcileTokens(previous, resources) {
  if (!Array.isArray(resources)) throw new Error('Missing snapshot tokens');
  const byId = new Map(previous.map(token => [String(token.id), token]));
  const next = resources.map(resource => {
    const token = normalizeToken(resource);
    const old = byId.get(String(token.id));
    return old && sameToken(old, token) ? old : token;
  });
  return next.length === previous.length && next.every((token, index) => token === previous[index])
    ? previous : next;
}
