/**
 * Convert the typed JSON:API representation to the flat view-model consumed
 * by the beta.2-beta.6 map UI. The read adapters retain legacy compatibility
 * while the backend is migrated; they do not affect database storage.
 */
const idOf = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('Неверный ID ресурса карты');
  return n;
};

export function normalizeToken(resource) {
  if (!resource || typeof resource !== 'object') {
    throw new Error('Некорректные данные фишки');
  }
  if (resource.type !== undefined && resource.type !== 'chak-tokens') {
    throw new Error('Неизвестный тип фишки');
  }
  if (resource.attributes && resource.type === 'chak-tokens') {
    return { ...resource.attributes, id: idOf(resource.id) };
  }
  return resource;
}

export function normalizeMap(resource, included = []) {
  if (!resource || typeof resource !== 'object') throw new Error('Некорректные данные карты');
  if (resource.type !== undefined && resource.type !== 'chak-maps') {
    throw new Error('Неизвестный тип карты');
  }
  if (resource.attributes && resource.type === 'chak-maps') {
    const byId = new Map(
      included.filter((item) => item?.type === 'chak-tokens')
        .map((item) => [String(item.id), item])
    );
    const references = resource.relationships?.tokens?.data || [];
    return {
      ...resource.attributes,
      id: idOf(resource.id),
      tokens: references.map((ref) => {
        const token = byId.get(String(ref.id));
        if (!token) throw new Error(`Отсутствует фишка #${ref.id} в JSON:API included`);
        return normalizeToken(token);
      }),
    };
  }
  return {
    ...resource,
    tokens: Array.isArray(resource.tokens) ? resource.tokens : [],
  };
}

export function normalizeMapList(response) {
  if (!Array.isArray(response?.data)) throw new Error('Некорректный ответ списка карт');
  return response.data.map((resource) => normalizeMap(resource));
}

export function normalizeMapResponse(response) {
  return normalizeMap(response?.data, response?.included || []);
}

export function canManageResponse(response) {
  return !!(response?.meta?.canManage ?? response?.canManage);
}

export function resourceBody(type, attributes) {
  return { data: { type, attributes } };
}

export function apiErrorMessage(error) {
  const response = error?.response;
  const errors = response?.errors || error?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const detail = errors[0]?.detail || errors[0]?.title;
    if (detail) return String(detail);
  }
  if (response?.error) return String(response.error);
  if (error?.message) return String(error.message);
  return 'Неизвестная ошибка';
}
