import { apiErrorMessage } from './apiResponse.mjs';

export const endpoint = (path) => `${app.forum.attribute('apiUrl')}/${path}`;

export function displayError(error) {
  return apiErrorMessage(error);
}
