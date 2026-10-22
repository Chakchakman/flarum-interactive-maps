import Page from 'flarum/common/components/Page';
import Link from 'flarum/common/components/Link';
import { endpoint, displayError } from '../api';
import {
  normalizeMapResponse,
  normalizeToken,
  canManageResponse,
  resourceBody,
} from '../apiResponse.mjs';
import { LatestTokenMoveQueue } from '../tokenMoveQueue.mjs';
import { DebouncedGridSaveQueue } from '../gridSaveQueue.mjs';
import { FALLBACK_IMAGE, gridMetrics, snapToCellCenter, validImageSize } from '../gridGeometry.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const GRID_FIELDS = ['gridSize', 'gridOffsetX', 'gridOffsetY', 'gridEnabled', 'snapToGrid'];
const gridSettings = (map) => Object.fromEntries(GRID_FIELDS.map((key) => [key, map[key]]));
let nextPatternId = 0;

export default class MapPage extends Page {
  oninit(vnode) {
    super.oninit(vnode);
    this.mapId = String(vnode.attrs.id);
    this.staffAllowed = app.forum.attribute('canManageChakMaps') === true;
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
    this.removed = false;
    this.localRevision = 0;
    this.refreshInFlight = false;
    this.lastRemoteSnapshot = null;
    this.gridPatternId = `chak-map-grid-${++nextPatternId}`;
    this.imageUrl = null;
    this.imageDimensions = FALLBACK_IMAGE;
    this.imageStatus = 'loading';
    this.gridConfirmed = null;
    this.gridUpdates = new DebouncedGridSaveQueue(
      async (changes) => {
        const response = await app.request({
          method: 'PATCH',
          url: endpoint(`chak-maps/${this.mapId}`),
          body: resourceBody('chak-maps', changes),
        });
        if (!response?.data) throw new Error('Пустой ответ при сохранении сетки');
        return normalizeMapResponse(response);
      },
      {
        delay: 400,
        onSuccess: (saved) => {
          this.gridConfirmed = gridSettings(saved);
          if (this.removed) return;
          if (this.error.startsWith('Не удалось сохранить сетку:')) this.error = '';
          m.redraw();
        },
        onFailure: (error, batch, pending) => {
          if (this.removed) return;
          for (const key of Object.keys(batch)) {
            // If there is already a newer queued value for this slider,
            // do not replace it with a stale server-confirmed value.
            if (!Object.prototype.hasOwnProperty.call(pending, key)
                && this.gridConfirmed && this.map) {
              this.map[key] = this.gridConfirmed[key];
            }
          }
          this.error = `Не удалось сохранить сетку: ${displayError(error)}`;
          m.redraw();
        },
        onDrained: () => {
          if (!this.removed) m.redraw();
        },
      }
    );
    this.moves = new LatestTokenMoveQueue(
      async (id, position) => {
        const response = await app.request({
          method: 'POST',
          url: endpoint(`chak-tokens/${id}/move`),
          body: resourceBody('chak-tokens', position),
        });
        return normalizeToken(response.data);
      },
      {
        onSuccess: () => {
          if (this.error.startsWith('Перемещение не сохранено:')) this.error = '';
        },
        onFailure: (id, lastConfirmed, error) => {
          if (this.removed) return;
          this.error = `Перемещение не сохранено: ${displayError(error)}`;
          // Do not interrupt a newer drag in progress. The player may already
          // be carrying the token towards another valid destination.
          if (String(this.dragging?.token.id) !== id) {
            const current = this.map?.tokens.find((token) => String(token.id) === id);
            if (current) {
              current.x = lastConfirmed.x;
              current.y = lastConfirmed.y;
            }
          }
        },
        onDrained: () => {
          if (!this.removed) m.redraw();
        },
      }
    );
    if (this.staffAllowed) this.refresh();
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    if (!this.staffAllowed) return;
    this.moveListener = this.move.bind(this);
    this.endListener = this.end.bind(this);
    window.addEventListener('pointermove', this.moveListener);
    window.addEventListener('pointerup', this.endListener);
    window.addEventListener('pointercancel', this.endListener);
    // Inactive browser tabs must not continuously query the entire map.
    // Upon returning to this tab, fetch once immediately so remote changes
    // are shown without waiting for the next polling tick.
    this.visibilityListener = () => {
      if (!document.hidden) void this.refresh(true);
    };
    document.addEventListener('visibilitychange', this.visibilityListener);
    this.refreshTimer = window.setInterval(() => {
      if (!document.hidden && !this.dragging) void this.refresh(true);
    }, 5000);
  }

  onremove(vnode) {
    if (!this.staffAllowed) return;
    // Commit an unsent slider value when navigating away from the editor.
    void this.gridUpdates.flushNow();
    this.removed = true;
    window.removeEventListener('pointermove', this.moveListener);
    window.removeEventListener('pointerup', this.endListener);
    window.removeEventListener('pointercancel', this.endListener);
    window.clearInterval(this.refreshTimer);
    document.removeEventListener('visibilitychange', this.visibilityListener);
  }

  hasPendingLocalChanges() {
    return !!this.dragging || this.moves.hasPending() || this.gridUpdates.hasPending();
  }

  async refresh(silent = false) {
    // Docker/Windows may take longer than the 5-second poll interval.
    // Never start another GET while one is still in flight: otherwise every
    // successful response can be discarded as stale and the map stays blank.
    if (this.removed || this.refreshInFlight || this.hasPendingLocalChanges()) return;
    this.refreshInFlight = true;
    const revision = this.localRevision;
    let redrawNeeded = !silent;

    try {
      const result = await app.request({ method: 'GET', url: endpoint(`chak-maps/${this.mapId}`) });
      const loaded = normalizeMapResponse(result);
      if (!Array.isArray(loaded.tokens)) {
        throw new Error(`Некорректный ответ API для карты #${this.mapId}`);
      }
      // A GET started before a drag or grid edit must never overwrite those
      // edits, even if the write finished while this GET was pending.
      if (!this.removed && !this.hasPendingLocalChanges()
          && revision === this.localRevision) {
        const snapshot = JSON.stringify([canManageResponse(result), loaded]);
        if (!silent || this.map === null || snapshot !== this.lastRemoteSnapshot) {
          this.map = loaded;
          this.gridConfirmed = gridSettings(loaded);
          this.canManage = canManageResponse(result);
          this.loadBackgroundDimensions(this.map.backgroundUrl);
          app.setTitle(this.map.title);
          this.lastRemoteSnapshot = snapshot;
          redrawNeeded = true;
        }
        if (!silent) this.error = '';
      }
    } catch (error) {
      if (!this.removed && !silent && revision === this.localRevision) {
        this.error = `Не удалось загрузить карту #${this.mapId}: ${displayError(error)}`;
      }
    } finally {
      this.refreshInFlight = false;
      const wasLoading = this.loading;
      this.loading = false;
      if (!this.removed && (redrawNeeded || wasLoading)) m.redraw();
    }
  }

  loadBackgroundDimensions(url) {
    if (this.imageUrl === url || !url) return;
    this.imageUrl = url;
    this.imageStatus = 'loading';
    this.imageDimensions = FALLBACK_IMAGE;

    const image = new Image();
    image.onload = () => {
      if (this.removed || this.imageUrl !== url) return;
      if (validImageSize(image.naturalWidth, image.naturalHeight)) {
        this.imageDimensions = { width: image.naturalWidth, height: image.naturalHeight };
        this.imageStatus = 'ready';
      } else {
        this.imageStatus = 'error';
      }
      m.redraw();
    };
    image.onerror = () => {
      if (this.removed || this.imageUrl !== url) return;
      this.imageStatus = 'error';
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
    this.localRevision += 1;
    const rect = event.currentTarget.closest('.ChakMap-canvas').getBoundingClientRect();
    this.dragging = {
      token, element: event.currentTarget, rect,
      pointerId: event.pointerId, origX: token.x, origY: token.y,
    };
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
    if (!this.dragging || event.pointerId !== this.dragging.pointerId) return;
    const { token, element, origX, origY } = this.dragging;
    this.dragging = null;
    element.classList.remove('is-dragging');
    if (this.map.snapToGrid && this.map.gridEnabled && this.imageStatus === 'ready') {
      const metrics = gridMetrics(
        this.map.gridSize, this.map.gridOffsetX, this.map.gridOffsetY, this.imageDimensions
      );
      token.x = snapToCellCenter(token.x, metrics.width, metrics.cell, metrics.offsetX);
      token.y = snapToCellCenter(token.y, metrics.height, metrics.cell, metrics.offsetY);
    }
    element.style.left = `${token.x * 100}%`;
    element.style.top = `${token.y * 100}%`;
    this.localRevision += 1;
    this.moves.enqueue(
      token.id,
      { x: token.x, y: token.y },
      { x: origX, y: origY }
    );
    m.redraw();
  }

  saveGrid(changes) {
    if (!this.canManage || !this.map) return;
    this.localRevision += 1;
    Object.assign(this.map, changes);
    this.gridUpdates.queue(changes);
    m.redraw();
  }

  async addToken(event) {
    event.preventDefault();
    if (this.adding) return;
    this.adding = true;
    try {
      await app.request({
        method: 'POST', url: endpoint(`chak-maps/${this.mapId}/tokens`),
        body: resourceBody('chak-tokens', {
          name: this.tokenName.trim(),
          imageUrl: this.tokenImageUrl.trim(),
          ownerUsername: this.tokenOwner.trim(),
        }),
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
        method: 'PATCH', url: endpoint(`chak-tokens/${token.id}/owner`),
        body: resourceBody('chak-tokens', { ownerUsername: name.trim() }),
      });
      this.error = '';
      await this.refresh();
    } catch (error) {
      this.error = displayError(error);
      m.redraw();
    }
  }

  view() {
    if (!this.staffAllowed) {
      return <div className="container ChakMaps-page">
        <p className="ChakMaps-error">Редактор карт доступен только администрации и назначенным мастерам.</p>
        <p><Link href="/">← На форум</Link></p>
      </div>;
    }

    if (this.loading) return <div className="container ChakMaps-page"><p>Загружаем карту…</p></div>;
    if (!this.map) return <div className="container ChakMaps-page">
      <p className="ChakMaps-error">{this.error || `Не удалось загрузить карту #${this.mapId}. Проверь ответ API.`}</p>
      <p><Link href={app.route('chak.maps')}>← К списку карт</Link></p>
    </div>;

    const map = this.map;
    const metrics = gridMetrics(
      map.gridSize, map.gridOffsetX, map.gridOffsetY, this.imageDimensions
    );
    return (
      <div className="container ChakMaps-page ChakMap-page">
        <div className="ChakMaps-top"><Link href={app.route('chak.maps')}>← Все карты</Link><h1>{map.title}</h1><button className="Button" onclick={() => this.refresh()}>Обновить позиции</button></div>
        {this.error && <p className="ChakMaps-error">{this.error}</p>}
        <div className="ChakMap-layout">
          <div className="ChakMap-stage">
            <div className="ChakMap-canvas" style={{
              backgroundImage: `url("${map.backgroundUrl.replace(/"/g, '%22')}")`,
              aspectRatio: metrics.aspectRatio,
            }}>
              {map.gridEnabled && (
                <svg className="ChakMap-grid" aria-hidden="true"
                  viewBox={`0 0 ${metrics.width} ${metrics.height}`}
                  preserveAspectRatio="none">
                  <defs>
                    <pattern id={this.gridPatternId} patternUnits="userSpaceOnUse"
                      x={metrics.offsetX} y={metrics.offsetY}
                      width={metrics.cell} height={metrics.cell}>
                      <path d={`M 0 0 L ${metrics.cell} 0 M 0 0 L 0 ${metrics.cell}`}
                        fill="none" stroke="rgba(255,255,255,.48)" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect x="0" y="0" width={metrics.width} height={metrics.height}
                    fill={`url(#${this.gridPatternId})`} />
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
                  <p className="ChakMaps-muted">Сетка рассчитана в пикселях исходного изображения ({metrics.width} × {metrics.height}). Изменения отправляются через 400 мс после настройки.</p>
                  {this.imageStatus === 'error' && <p className="ChakMaps-error">Не удалось определить размеры фона. Проверь URL изображения: привязка к сетке временно отключена.</p>}
                  <label>Размер клетки: {map.gridSize} px</label>
                  <input type="range" min="12" max="256" step="1" value={map.gridSize} oninput={(e) => this.saveGrid({ gridSize: Number(e.target.value) })} />
                  <label>Сдвиг по X: {map.gridOffsetX}px</label>
                  <input type="range" min="-256" max="256" step="1" value={map.gridOffsetX} oninput={(e) => this.saveGrid({ gridOffsetX: Number(e.target.value) })} />
                  <label>Сдвиг по Y: {map.gridOffsetY}px</label>
                  <input type="range" min="-256" max="256" step="1" value={map.gridOffsetY} oninput={(e) => this.saveGrid({ gridOffsetY: Number(e.target.value) })} />
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
