import Page from 'flarum/common/components/Page';
import Link from 'flarum/common/components/Link';
import { endpoint, displayError } from '../api';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default class MapPage extends Page {
  oninit(vnode) {
    super.oninit(vnode);
    this.mapId = String(vnode.attrs.id);
    this.map = null;
    this.canManage = false;
    this.loading = true;
    this.error = '';
    this.tokenName = '';
    this.tokenImageUrl = '';
    this.tokenOwner = '';
    this.adding = false;
    this.dragging = null;
    this.refreshTimer = null;
    this.gridSaveTimer = null;
    this.pendingGridChanges = {};
    this.gridSaveInFlight = false;
    this.tokenSaveCount = 0;
    this.tokenMoves = new Map();
    this.localEditRevision = 0;
    this.refreshRequestSeq = 0;
    this.imageUrl = null;
    this.imageDimensions = null;
    this.imageLoadFailed = false;
    this.removed = false;
    this.refresh();
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this.moveListener = this.move.bind(this);
    this.endListener = this.end.bind(this);
    window.addEventListener('pointermove', this.moveListener);
    window.addEventListener('pointerup', this.endListener);
    window.addEventListener('pointercancel', this.endListener);
    this.refreshTimer = window.setInterval(() => {
      if (!this.dragging) this.refresh(true);
    }, 5000);
  }

  onremove(vnode) {
    this.removed = true;
    window.removeEventListener('pointermove', this.moveListener);
    window.removeEventListener('pointerup', this.endListener);
    window.removeEventListener('pointercancel', this.endListener);
    window.clearInterval(this.refreshTimer);
    window.clearTimeout(this.gridSaveTimer);
  }

  hasPendingChanges() {
    return this.dragging || this.tokenSaveCount > 0 || this.gridSaveInFlight
      || this.gridSaveTimer !== null || Object.keys(this.pendingGridChanges).length > 0;
  }

  async refresh(silent = false) {
    if (this.removed || this.hasPendingChanges()) return;
    const revision = this.localEditRevision;
    const requestId = ++this.refreshRequestSeq;
    try {
      const result = await app.request({ method: 'GET', url: endpoint(`chak-maps/${this.mapId}`) });
      // A poll that began before a drag/save must never replace newer local
      // coordinates, even when the save has already completed.
      if (!this.removed && requestId === this.refreshRequestSeq
          && revision === this.localEditRevision && !this.hasPendingChanges()) {
        this.map = result.data;
        this.loadBackgroundDimensions(this.map.backgroundUrl);
        this.canManage = !!result.canManage;
        app.setTitle(this.map.title);
        if (!silent) this.error = '';
      }
    } catch (error) {
      if (!silent && !this.removed && revision === this.localEditRevision) {
        this.error = displayError(error);
      }
    } finally {
      this.loading = false;
      if (!this.removed) m.redraw();
    }
  }

  // The original image pixels are the canonical grid space on every device.
  // Image.naturalWidth/Height are accessible for ordinary cross-origin images
  // without fetching the URL from PHP (which would introduce SSRF risks).
  loadBackgroundDimensions(url) {
    if (this.imageUrl === url) return;
    this.imageUrl = url;
    this.imageDimensions = null;
    this.imageLoadFailed = false;

    const image = new Image();
    image.onload = () => {
      if (this.removed || this.imageUrl !== url) return;
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        this.imageDimensions = { width: image.naturalWidth, height: image.naturalHeight };
      } else {
        this.imageLoadFailed = true;
      }
      m.redraw();
    };
    image.onerror = () => {
      if (this.removed || this.imageUrl !== url) return;
      this.imageLoadFailed = true;
      m.redraw();
    };
    image.src = url;
  }

  isMine(token) {
    const userId = app.session.user?.id();
    return this.canManage || (!!userId && Number(userId) === Number(token.ownerUserId));
  }

  begin(event, token) {
    if (!this.isMine(token) || this.dragging) return;
    event.preventDefault();
    // Invalidates GET requests started before the user's new action.
    this.localEditRevision += 1;
    const rect = event.currentTarget.closest('.ChakMap-canvas').getBoundingClientRect();
    this.dragging = { token, element: event.currentTarget, rect, pointerId: event.pointerId, origX: token.x, origY: token.y };
    event.currentTarget.classList.add('is-dragging');
  }

  move(event) {
    if (!this.dragging || event.pointerId !== this.dragging.pointerId) return;
    const { token, element, rect } = this.dragging;
    token.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    token.y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    element.style.left = `${token.x * 100}%`;
    element.style.top = `${token.y * 100}%`;
  }

  end(event) {
    if (!this.dragging || (event && event.pointerId !== this.dragging.pointerId)) return;
    const { token, element, origX, origY } = this.dragging;
    this.dragging = null;
    element.classList.remove('is-dragging');
    if (this.map.snapToGrid && this.map.gridEnabled && this.imageDimensions) {
      const snap = (n, referenceSize, offset) => clamp(
        (Math.floor((n * referenceSize - offset) / this.map.gridSize) + 0.5) * this.map.gridSize / referenceSize + offset / referenceSize,
        0, 1
      );
      token.x = snap(token.x, this.imageDimensions.width, this.map.gridOffsetX);
      token.y = snap(token.y, this.imageDimensions.height, this.map.gridOffsetY);
    }
    element.style.left = `${token.x * 100}%`;
    element.style.top = `${token.y * 100}%`;
    this.queueTokenMove(token, { x: origX, y: origY });
  }

  // Serialize writes per token: multiple fast moves retain only the latest
  // destination, so an older POST response cannot jump the token backwards.
  queueTokenMove(token, originalPosition) {
    let entry = this.tokenMoves.get(token.id);
    if (!entry) {
      entry = { token, confirmed: originalPosition, pending: null, saving: false };
      this.tokenMoves.set(token.id, entry);
    }
    entry.token = token;
    entry.pending = { x: token.x, y: token.y };
    this.localEditRevision += 1;
    this.flushTokenMove(token.id);
  }

  async flushTokenMove(id) {
    const entry = this.tokenMoves.get(id);
    if (!entry || entry.saving || !entry.pending) return;

    const requested = entry.pending;
    entry.pending = null;
    entry.saving = true;
    this.tokenSaveCount += 1;

    try {
      const result = await app.request({
        method: 'POST',
        url: endpoint(`chak-tokens/${id}/move`),
        body: requested,
      });
      // Record server-confirmed coordinates, but never Object.assign the whole
      // stale response onto a token currently being moved by the user.
      entry.confirmed = {
        x: Number(result.data?.x ?? requested.x),
        y: Number(result.data?.y ?? requested.y),
      };
      this.error = '';
    } catch (error) {
      this.error = `Перемещение не сохранено: ${displayError(error)}`;
      // Revert only if there is no newer destination or active drag.
      // An in-progress newer move must remain under the player's control.
      if (!entry.pending && this.dragging?.token?.id !== id) {
        entry.token.x = entry.confirmed.x;
        entry.token.y = entry.confirmed.y;
      }
    } finally {
      entry.saving = false;
      this.tokenSaveCount -= 1;
      if (entry.pending) {
        this.flushTokenMove(id);
      } else if (this.dragging?.token?.id !== id) {
        this.tokenMoves.delete(id);
      }
      if (!this.removed) m.redraw();
    }
  }

  // Update the grid immediately; avoid blocking every slider movement on HTTP.
  // Consecutive edits are combined into a single request after a short pause.
  saveGrid(changes) {
    if (!this.canManage || !this.map) return;
    Object.assign(this.map, changes);
    this.localEditRevision += 1;
    Object.assign(this.pendingGridChanges, changes);
    this.error = '';
    window.clearTimeout(this.gridSaveTimer);
    this.gridSaveTimer = window.setTimeout(() => {
      this.gridSaveTimer = null;
      this.flushGridChanges();
    }, 400);
    m.redraw();
  }

  async flushGridChanges() {
    if (this.gridSaveInFlight || !Object.keys(this.pendingGridChanges).length) return;
    const changes = this.pendingGridChanges;
    this.pendingGridChanges = {};
    this.gridSaveInFlight = true;
    try {
      await app.request({
        method: 'PATCH',
        url: endpoint(`chak-maps/${this.mapId}`),
        body: changes,
      });
      // Do not replace this.map with the response: it may contain old tokens
      // or grid settings the user edited while the request was in flight.
      this.error = '';
    } catch (error) {
      // Keep edits on screen and make them retryable rather than silently
      // pretending a failed write was saved.
      this.pendingGridChanges = { ...changes, ...this.pendingGridChanges };
      this.error = `Настройки сетки не сохранены: ${displayError(error)}`;
    } finally {
      this.gridSaveInFlight = false;
      if (!this.error && Object.keys(this.pendingGridChanges).length && this.gridSaveTimer === null) {
        this.gridSaveTimer = window.setTimeout(() => {
          this.gridSaveTimer = null;
          this.flushGridChanges();
        }, 150);
      }
      m.redraw();
    }
  }

  async addToken(event) {
    event.preventDefault();
    if (this.adding) return;
    this.adding = true;
    try {
      await app.request({
        method: 'POST', url: endpoint(`chak-maps/${this.mapId}/tokens`),
        body: { name: this.tokenName.trim(), imageUrl: this.tokenImageUrl.trim(), ownerUsername: this.tokenOwner.trim() },
      });
      this.tokenName = '';
      this.error = '';
      await this.refresh();
    } catch (error) {
      this.error = displayError(error);
    } finally {
      this.adding = false;
      m.redraw();
    }
  }

  async assign(token) {
    const name = prompt(`Назначить владельца фишки «${token.name}».\nВведите username пользователя Flarum. Пусто — снять владельца.`, token.ownerUsername || '');
    if (name === null) return;
    try {
      await app.request({
        method: 'PATCH', url: endpoint(`chak-tokens/${token.id}/owner`), body: { ownerUsername: name.trim() },
      });
      this.error = '';
      await this.refresh();
    } catch (error) {
      this.error = displayError(error);
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <div className="container ChakMaps-page"><p>Загружаем карту…</p></div>;
    if (!this.map) return <div className="container ChakMaps-page"><p className="ChakMaps-error">{this.error || 'Карта не найдена'}</p></div>;

    const map = this.map;
    const imageSize = this.imageDimensions;
    const gridPatternId = `ChakMap-grid-${map.id}`;
    return (
      <div className="container ChakMaps-page ChakMap-page">
        <div className="ChakMaps-top"><Link href={app.route('chak.maps')}>← Все карты</Link><h1>{map.title}</h1><button className="Button" onclick={() => this.refresh()}>Обновить позиции</button></div>
        {this.error && <p className="ChakMaps-error">{this.error}</p>}
        <div className="ChakMap-layout">
          <div className="ChakMap-stage">
            <div className="ChakMap-canvas" style={{
              backgroundImage: `url("${map.backgroundUrl.replace(/"/g, '%22')}")`,
              aspectRatio: imageSize ? `${imageSize.width} / ${imageSize.height}` : '16 / 9',
            }}>
              {map.gridEnabled && imageSize && (
                <svg className="ChakMap-grid" viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <pattern id={gridPatternId} x={map.gridOffsetX} y={map.gridOffsetY} width={map.gridSize} height={map.gridSize} patternUnits="userSpaceOnUse">
                      <path d={`M 0 0 H ${map.gridSize} V ${map.gridSize}`} fill="none" stroke="rgba(255,255,255,.36)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    </pattern>
                  </defs>
                  <rect width={imageSize.width} height={imageSize.height} fill={`url(#${gridPatternId})`} />
                </svg>
              )}
              {map.tokens.map((token) => (
                <img
                  key={token.id}
                  draggable="false"
                  className={`ChakMap-token ${this.isMine(token) ? 'is-mine' : ''}`}
                  src={token.imageUrl}
                  title={`${token.name}${token.ownerUsername ? ` (@${token.ownerUsername})` : ' (без владельца)'}`}
                  alt={token.name}
                  style={{ left: `${token.x * 100}%`, top: `${token.y * 100}%` }}
                  onpointerdown={(event) => this.begin(event, token)}
                />
              ))}
            </div>
            {this.imageLoadFailed && <p className="ChakMaps-error">Не удалось загрузить изображение карты. Проверь адрес фона; до загрузки сетка и привязка к ней недоступны.</p>}
            <p className="ChakMaps-muted">Перетаскивай собственную фишку мышью. Администратор может двигать все фишки. Координаты сохраняются в базе Flarum.</p>
          </div>
          <div className="ChakMap-sidebar">
            <section className="ChakMaps-panel">
              <h3>Фишки ({map.tokens.length})</h3>
              {!map.tokens.length && <p className="ChakMaps-muted">Фишек пока нет.</p>}
              {map.tokens.map((token) => (
                <div className="ChakMap-tokenRow" key={token.id}>
                  <img src={token.imageUrl} alt="" />
                  <div><b>{token.name}</b><small>{token.ownerUsername ? `@${token.ownerUsername}` : 'Без владельца'}</small></div>
                  {this.canManage && <button className="Button Button--icon" title="Назначить пользователя" onclick={() => this.assign(token)}>✎</button>}
                </div>
              ))}
            </section>
            {this.canManage && (
              <>
                <section className="ChakMaps-panel">
                  <h3>Настройки сетки</h3>
                  <label>Размер клетки: {map.gridSize} условных px</label>
                  {(this.gridSaveInFlight || this.gridSaveTimer !== null || Object.keys(this.pendingGridChanges).length > 0)
                    && <p className="ChakMaps-muted">Настройки изменены — сохранение {this.gridSaveInFlight ? 'выполняется…' : 'ожидается…'}</p>}
                  <input type="range" min="12" max="256" step="1" value={map.gridSize} oninput={(e) => this.saveGrid({ gridSize: Number(e.target.value) })} />
                  <label>Сдвиг по X: {map.gridOffsetX}px</label>
                  <input type="range" min="-100" max="100" value={map.gridOffsetX} oninput={(e) => this.saveGrid({ gridOffsetX: Number(e.target.value) })} />
                  <label>Сдвиг по Y: {map.gridOffsetY}px</label>
                  <input type="range" min="-100" max="100" value={map.gridOffsetY} oninput={(e) => this.saveGrid({ gridOffsetY: Number(e.target.value) })} />
                  <label><input type="checkbox" checked={map.gridEnabled} onchange={(e) => this.saveGrid({ gridEnabled: e.target.checked })} /> Показывать сетку</label>
                  <label><input type="checkbox" checked={map.snapToGrid} onchange={(e) => this.saveGrid({ snapToGrid: e.target.checked })} /> Привязывать фишки</label>
                </section>
                <form className="ChakMaps-panel" onsubmit={this.addToken.bind(this)}>
                  <h3>Добавить фишку</h3>
                  <label>Имя</label>
                  <input className="FormControl" required value={this.tokenName} oninput={(e) => this.tokenName = e.target.value} placeholder="Сайлас МакГроу" />
                  <label>Адрес PNG/JPG</label>
                  <input className="FormControl" required value={this.tokenImageUrl} oninput={(e) => this.tokenImageUrl = e.target.value} />
                  <label>Владелец (username в Flarum)</label>
                  <input className="FormControl" value={this.tokenOwner} oninput={(e) => this.tokenOwner = e.target.value} placeholder="Можно оставить пустым" />
                  <button className="Button Button--primary" type="submit" disabled={this.adding}>Добавить</button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
