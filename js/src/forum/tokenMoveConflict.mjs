export function currentConflictToken(error) {
  const entry = error?.response?.errors?.find(item => item.code === 'token_move_conflict');
  const resource = entry?.meta?.currentToken;
  const token = resource?.type === 'chak-tokens' ? { ...resource.attributes, id: resource.id } : null;
  if (!token || !Number.isFinite(token.x) || !Number.isFinite(token.y)
      || token.x < 0 || token.x > 1 || token.y < 0 || token.y > 1
      || typeof token.moveVersion !== 'string' || !/^[a-f0-9]{64}$/.test(token.moveVersion)) return null;
  return token;
}

export function terminalMoveError(error) {
  return [403, 404, 409, 428].includes(Number(error?.status));
}
