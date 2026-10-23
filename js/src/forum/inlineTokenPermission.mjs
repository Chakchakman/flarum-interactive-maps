// Cosmetic client guard only; authorization is always rechecked in PHP.
export function canDragPostToken({ actorId, canManageMaps, ownerUserId }) {
  if (actorId == null || String(actorId) === '') return false;
  return canManageMaps === true ||
    (ownerUserId != null && String(ownerUserId) === String(actorId));
}
