import { endpoint } from './api';
import { VisiblePostMapSync } from './postMapSync.mjs';

let shared;
export function postMapSync() {
  if (!shared) {
    shared = new VisiblePostMapSync(ids => app.request({
      method: 'GET', url: endpoint('chak-map-sync'), params: { postIds: ids.join(',') },
      background: true, timeout: 15000, errorHandler: () => {},
    }));
    document.addEventListener('visibilitychange', () => shared.wake());
  }
  return shared;
}
