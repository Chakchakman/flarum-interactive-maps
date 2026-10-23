// Pure authorization-adjacent client visibility rule.
// Only the PHP post-scoped endpoint enforces access to real map data.
export function shouldRenderInlineMap({ isComment, hasLinkedMap, isHidden, authenticated }) {
  return isComment === true
    && hasLinkedMap === true
    // Flarum 2 omits hiddenAt on ordinary visible comments, so
    // post.isHidden() may be undefined instead of false.
    && isHidden !== true
    && authenticated === true;
}
