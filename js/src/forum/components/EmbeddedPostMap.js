import Component from 'flarum/common/Component';
import { endpoint, displayError } from '../api';
import { normalizeMapResponse, normalizeToken, resourceBody } from '../apiResponse.mjs';
import { LatestTokenMoveQueue } from '../tokenMoveQueue.mjs';
import { FALLBACK_IMAGE, gridMetrics, snapToCellCenter, validImageSize } from '../gridGeometry.mjs';
import MapBoard from './MapBoard';
import { postMapSync } from '../sharedPostMapSync';
import { canDragPostToken } from '../inlineTokenPermission.mjs';

// Interactive post map: all movement writes go through a post-scoped,
// visibility-checked route. The staff editor uses a separate API.
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
    this.dragging = null;
    this.moveError = '';
    this.syncError = '';
    this.syncEpoch = 0;
    this.serverCanManage = null;
    this.moves = new LatestTokenMoveQueue(
      async (id, coords) => {
        const response = await app.request({
          method: 'POST',
          url: endpoint(`chak-map-embeds/${this.postId}/tokens/${id}/move`),
          body: resourceBody('chak-tokens', coords),
        });
        return normalizeToken(response.data);
      },
      {
        onSuccess: () => {
          this.moveError = '';
        },
        onFailure: (id, lastConfirmed, error) => {
          if (this.removed) return;
          const token = this.map?.tokens.find((item) => String(item.id) === String(id));
          if (token && String(this.dragging?.token.id) !== String(id)) {
            token.x = lastConfirmed.x;
            token.y = lastConfirmed.y;
          }
          this.moveError = 'Не удалось переместить фишку: ' + displayError(error);
        },
        onDrained: () => {
          this.requestRedraw();
        },
      }
    );
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this.syncRegistration = postMapSync().register(this.postId, {
      isBusy: () => this.loading || !!this.dragging || this.moves.hasPending(),
      epoch: () => this.syncEpoch,
      apply: snapshot => this.applySnapshot(snapshot),
      onError: error => {
        if (error.status === 403 || error.status === 404) this.applySnapshot({ available: false });
        else {
          this.syncError = 'Не удалось обновить позиции. Повторяем автоматически…';
          this.requestRedraw();
        }
      },
    });
    // Do not fetch remote images or full map/token payloads until a post is
    // near the viewport. Many posts in a thread need no map requests.
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        const visible = entries.some(entry => entry.isIntersecting);
        this.syncRegistration.setActive(visible);
        if (visible && !this.requested) void this.load();
      }, { rootMargin: '250px 0px' });
      this.observer.observe(vnode.dom);
    } else {
      this.syncRegistration.setActive(true);
      this.load();
    }
  }

  onremove(vnode) {
    super.onremove(vnode);
    this.removed = true;
    this.observer?.disconnect();
    this.syncRegistration?.remove();
    this.detachDragListeners();
  }

  requestRedraw() {
    if (this.removed) return;
    this.attrs.invalidateParent?.();
    m.redraw();
  }

  applySnapshot(snapshot) {
    if (this.removed) return;
    this.syncError = '';
    if (!snapshot.available) {
      this.map = null;
      this.unavailable = true;
    } else if (!this.map || String(this.map.id) !== String(snapshot.mapId)) {
      this.map = null;
      void this.load();
      this.requestRedraw();
      return;
    } else {
      if (!Array.isArray(snapshot.tokens)) throw new Error('Missing snapshot tokens');
      this.map.tokens = snapshot.tokens.map(normalizeToken);
      this.serverCanManage = snapshot.canManageMaps === true;
      this.unavailable = false;
    }
    this.requestRedraw();
  }

  async load() {
    // An in-flight refresh must not overwrite a local drag or queued write.
    if (this.loading || this.removed || this.dragging || this.moves.hasPending()) return;
    const epoch = ++this.syncEpoch;
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
      if (this.removed || this.syncEpoch !== epoch || this.dragging || this.moves.hasPending()) return;
      this.map = result;
      this.loadImage(result.backgroundUrl);
    } catch (_error) {
      // Keep forbidden, hidden, deleted or unreachable maps out of the post.
      // Never echo API details or identifiers to the viewer.
      if (!this.removed && this.syncEpoch === epoch) {
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

  canMoveToken(token) {
    return canDragPostToken({
      actorId: app.session.user?.id(),
      canManageMaps: this.serverCanManage ?? (app.forum.attribute('canManageChakMaps') === true),
      ownerUserId: token.ownerUserId,
    });
  }

  detachDragListeners() {
    if (!this.moveListener) return;
    window.removeEventListener('pointermove', this.moveListener);
    window.removeEventListener('pointerup', this.endListener);
    window.removeEventListener('pointercancel', this.cancelListener);
    this.moveListener = null;
    this.endListener = null;
    this.cancelListener = null;
  }

  beginDrag(event, token) {
    if (this.dragging || !this.canMoveToken(token) || !this.map) return;
    this.syncEpoch += 1;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.closest('.ChakMap-canvas')?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    this.dragging = {
      token,
      pointerId: event.pointerId,
      element: event.currentTarget,
      rect,
      origX: token.x,
      origY: token.y,
    };
    event.currentTarget.classList.add('is-dragging');
    this.moveListener = (e) => this.moveDrag(e);
    this.endListener = (e) => this.endDrag(e, false);
    this.cancelListener = (e) => this.endDrag(e, true);
    window.addEventListener('pointermove', this.moveListener);
    window.addEventListener('pointerup', this.endListener);
    window.addEventListener('pointercancel', this.cancelListener);
  }

  moveDrag(event) {
    if (!this.dragging || event.pointerId !== this.dragging.pointerId) return;
    const { token, element, rect } = this.dragging;
    token.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    token.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    element.style.left = `${token.x * 100}%`;
    element.style.top = `${token.y * 100}%`;
  }

  endDrag(event, cancelled) {
    if (!this.dragging || event.pointerId !== this.dragging.pointerId) return;
    const { token, element, origX, origY } = this.dragging;
    this.dragging = null;
    this.detachDragListeners();
    element.classList.remove('is-dragging');

    if (cancelled) {
      token.x = origX;
      token.y = origY;
    } else if (this.map.snapToGrid && this.map.gridEnabled && this.imageStatus === 'ready') {
      const metrics = gridMetrics(
        this.map.gridSize,
        this.map.gridOffsetX,
        this.map.gridOffsetY,
        this.imageDimensions
      );
      token.x = snapToCellCenter(token.x, metrics.width, metrics.cell, metrics.offsetX);
      token.y = snapToCellCenter(token.y, metrics.height, metrics.cell, metrics.offsetY);
    }

    element.style.left = `${token.x * 100}%`;
    element.style.top = `${token.y * 100}%`;
    if (!cancelled && (token.x !== origX || token.y !== origY)) {
      this.moves.enqueue(
        token.id,
        { x: token.x, y: token.y },
        { x: origX, y: origY }
      );
    }
    this.requestRedraw();
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
              invalidateParent={() => this.attrs.invalidateParent?.()}
              canMoveToken={(token) => this.canMoveToken(token)}
              onTokenPointerDown={(event, token) => this.beginDrag(event, token)} />
            {this.syncError && <p className="ChakMaps-muted" role="status">{this.syncError}</p>}
            {this.moveError && <p className="ChakMaps-error">{this.moveError}</p>}
            <p className="ChakMaps-muted">Перетаскивайте свою фишку. Для остальных фишек доступен только просмотр.</p>
          </>
        )}
      </section>
    );
  }
}
