export function presentationOptions(value = {}) {
  return { displayPosition: value?.displayPosition === 'above' ? 'above' : 'below',
    startsCollapsed: value?.startsCollapsed === true };
}

/** Keep the map beside the text body, after Flarum's author/header controls. */
export function insertMapAtBody(children, map, position) {
  const index = children.findIndex(child => String(child?.attrs?.className || '')
    .split(/\s+/).includes('Post-body'));
  children.splice(index < 0 ? children.length : index + (position === 'above' ? 0 : 1), 0, map);
}
