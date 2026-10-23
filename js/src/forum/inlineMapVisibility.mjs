// Pure authorization-adjacent client visibility rule.
// Only the PHP post-scoped endpoint enforces access to real map data.
export function shouldRenderInlineMap({ isComment, hasLinkedMap, isHidden, authenticated }) {
  return isComment === true
    && hasLinkedMap === true
    && isHidden === false
    && authenticated === true;
}
