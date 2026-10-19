export const endpoint = (path) => `${app.forum.attribute('apiUrl')}/${path}`;

export function displayError(error) {
  if (error?.response?.error) return error.response.error;
  if (error?.message) return error.message;
  return 'Неизвестная ошибка';
}
