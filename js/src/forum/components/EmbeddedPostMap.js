import Component from 'flarum/common/Component';
import { endpoint } from '../api';
import { normalizeMapResponse } from '../apiResponse.mjs';
import { FALLBACK_IMAGE, gridMetrics, validImageSize } from '../gridGeometry.mjs';
import MapBoard from './MapBoard';

// Read-only alpha: the eventual player movement must use an authorized
// post-scoped API, never the old manager-only token movement endpoint.
export default class EmbeddedPostMap extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.postId = String(vnode.attrs.postId);
    this.map = null;
    this.loading = false;
    this.requested = false;
    this.unavailable = false;
    this.removed = false;
    this.imageUrl = null;
    this.imageDimensions = FALLBACK_IMAGE;
    this.imageStatus = 'loading';
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    // Do not fetch remote images or full map/token payloads until a post is
    // near the viewport. Many posts in a thread need no map requests.
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.observer.disconnect();
          this.load();
        }
      }, { rootMargin: '250px 0px' });
      this.observer.observe(vnode.dom);
    } else {
      this.load();
    }
  }

  onremove(vnode) {
    super.onremove(vnode);
    this.removed = true;
    this.observer?.disconnect();
  }

  requestRedraw() {
    if (this.removed) return;
    this.attrs.invalidateParent?.();
    m.redraw();
  }

  async load() {
    if (this.loading || this.removed) return;
    this.requested = true;
    this.loading = true;
    this.unavailable = false;
    try {
      const response = await app.request({
        method: 'GET',
        url: endpoint(`chak-map-embeds/${this.postId}`),
      });
      const result = normalizeMapResponse(response);
      if (!Array.isArray(result.tokens)) throw new Error('Map tokens were missing');
      if (this.removed) return;
      this.map = result;
      this.loadImage(result.backgroundUrl);
    } catch (_error) {
      // Keep forbidden, hidden, deleted or unreachable maps out of the post.
      // Never echo API details or identifiers to the viewer.
      if (!this.removed) {
        this.map = null;
        this.unavailable = true;
      }
    } finally {
      this.loading = false;
      this.requestRedraw();
    }
  }

  loadImage(url) {
    if (!url || this.imageUrl === url) return;
    this.imageUrl = url;
    this.imageStatus = 'loading';
    this.imageDimensions = FALLBACK_IMAGE;
    const img = new Image();
    img.onload = () => {
      if (this.removed || this.imageUrl !== url) return;
      if (validImageSize(img.naturalWidth, img.naturalHeight)) {
        this.imageDimensions = { width: img.naturalWidth, height: img.naturalHeight };
        this.imageStatus = 'ready';
      } else {
        this.imageStatus = 'error';
      }
      this.requestRedraw();
    };
    img.onerror = () => {
      if (this.removed || this.imageUrl !== url) return;
      this.imageStatus = 'error';
      this.requestRedraw();
    };
    img.src = url;
  }

  view() {
    const map = this.map;
    return (
      <section className="ChakMapEmbed" aria-label="Интерактивная карта">
        {!this.requested && <p className="ChakMaps-muted">Игровая карта загрузится при прокрутке сюда.</p>}
        {this.loading && <p className="ChakMaps-muted">Загружаем игровую карту…</p>}
        {!this.loading && this.unavailable && (
          <p className="ChakMaps-muted">Карта в этом сообщении сейчас недоступна.</p>
        )}
        {!this.loading && map && (
          <>
            <div className="ChakMapEmbed-heading">
              <strong>{map.title}</strong>
              <button type="button" className="Button Button--link Button--small"
                onclick={() => this.load()}>Обновить карту</button>
            </div>
            <MapBoard map={map}
              metrics={gridMetrics(map.gridSize, map.gridOffsetX, map.gridOffsetY, this.imageDimensions)}
              readOnly={true} />
            <p className="ChakMaps-muted">Режим просмотра: перемещение фишек внутри сообщения появится в следующей версии.</p>
          </>
        )}
      </section>
    );
  }
}
