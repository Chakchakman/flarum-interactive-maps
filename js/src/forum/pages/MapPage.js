import { terminalMoveError } from '../tokenMoveConflict.mjs';
import ImageUploadInput from '../components/ImageUploadInput';
import UploadTokenImageModal from '../components/UploadTokenImageModal';
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
import MapBoard from '../components/MapBoard';
import { mapEmbedCode } from '../mapEmbedCode.mjs';
import TokenOwnerInput from '../components/TokenOwnerInput';
import AssignTokenOwnerModal from '../components/AssignTokenOwnerModal';
import { gridStyle } from '../gridStyle.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const GRID_FIELDS = ['gridSize', 'gridOffsetX', 'gridOffsetY', 'gridEnabled', 'snapToGrid', 'gridColor', 'gridLineWidth'];
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
    this.exportMessage = '';
    this.uploadingBackground = false;
    this.tokenName = '';
    this.tokenImageUrl = '';
    this.tokenFile = null;
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
      async (id, position, confirmed) => {
        const response = await app.request({
          method: 'POST',
          url: endpoint(`chak-tokens/${id}/move`),
          body: resourceBody('chak-tokens', { ...position, moveVersion: confirmed.moveVersion }),
          errorHandler: () => {},
        });
        return normalizeToken(response.data);
      },
      {
        onSuccess: (id, saved) => {
          const token = this.map?.tokens.find(item => String(item.id) === String(id));
          if (token && saved?.moveVersion) token.moveVersion = saved.moveVersion;
          if (this.error.startsWith('Перемещение не сохранено:')) this.error = '';
        },
        onFailure: (id, lastConfirmed, error) => {
          if (this.removed) return;
          this.error = `Перемещение не сохранено: ${displayError(error)}`;
          if (terminalMoveError(error) && String(this.dragging?.token.id) === id) {
            const drag = this.dragging;
            drag.element.classList.remove('is-dragging');
            this.dragging = null;
            this.localRevision += 1;
          }
          // Do not interrupt a newer drag in progress on transient errors. The player may already
          // be carrying the token towards another valid destination.
          if (String(this.dragging?.token.id) !== id) {
            const current = this.map?.tokens.find((token) => String(token.id) === id);
            if (current) {
              current.x = lastConfirmed.x;
              current.y = lastConfirmed.y;
              if (lastConfirmed.moveVersion) current.moveVersion = lastConfirmed.moveVersion;
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
    return this.uploadingBackground || !!this.dragging || this.moves.hasPending() || this.gridUpdates.hasPending();
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
      Object.assign(loaded, gridStyle(loaded));
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
    if (this.uploadingBackground || !this.isMine(token) || this.dragging) return;
    event.preventDefault();
    this.localRevision += 1;
    const rect = event.currentTarget.closest('.ChakMap-canvas').getBoundingClientRect();
    this.dragging = {
      token, element: event.currentTarget, rect,
      pointerId: event.pointerId, origX: token.x, origY: token.y, moveVersion: token.moveVersion,
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
    const { token, element, origX, origY, moveVersion } = this.dragging;
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
      { x: origX, y: origY, moveVersion }
    );
    m.redraw();
  }

  async copyExportCode() {
    if (!this.map || !this.canManage) return;
    const code = mapEmbedCode(this.map.id);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(code);
      this.exportMessage = 'Код скопирован. Открой сообщение и выбери в меню «Прикрепить карту».';
    } catch (_error) {
      // Clipboard API may not be available outside secure contexts.
      window.prompt('Скопируй код карты:', code);
      this.exportMessage = 'Код можно вставить через меню сообщения «Прикрепить карту».';
    }
    m.redraw();
  }

  saveGrid(changes) {
    if (this.uploadingBackground || !this.canManage || !this.map) return;
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
      let upload;
      if (this.tokenFile) {
        upload = new FormData(); upload.append('name', this.tokenName.trim()); upload.append('ownerUsername', this.tokenOwner.trim()); upload.append('image', this.tokenFile);
      }
      await app.request({
        method: 'POST', url: endpoint(`chak-maps/${this.mapId}/tokens`),
        body: upload || resourceBody('chak-tokens', {
          name: this.tokenName.trim(),
          imageUrl: this.tokenImageUrl.trim(),
          ownerUsername: this.tokenOwner.trim(),
        }),
        ...(upload ? { serialize: value => value } : {}), errorHandler: () => {},
      });
      this.tokenName = '';
      this.tokenFile = null;
      this.error = '';
      await this.refresh();
    } catch (error) {
      this.error = displayError(error);
    } finally {
      this.adding = false;
      m.redraw();
    }
  }

  async uploadBackground(file) {
    if (!file || this.uploadingBackground || !this.canManage || !this.map) return;
    if (this.hasPendingLocalChanges()) { this.error = 'Дождитесь сохранения фишек и сетки перед заменой фона.'; return; }
    if (file.size > 10 * 1024 * 1024) { this.error = 'Изображение: не более 10 МиБ.'; return; }
    this.uploadingBackground = true; this.localRevision++; this.error = '';
    try {
      const body = new FormData(); body.append('image', file);
      const response = await app.request({ method: 'POST', url: endpoint(`chak-maps/${this.mapId}/background`),
        body, serialize: value => value, errorHandler: () => {} });
      if (!this.removed) {
        this.map.backgroundUrl = normalizeMapResponse(response).backgroundUrl;
        this.loadBackgroundDimensions(this.map.backgroundUrl); this.lastRemoteSnapshot = null;
      }
    } catch (error) {
      if (!this.removed) this.error = 'Не удалось загрузить фон: ' + displayError(error);
    } finally {
      this.uploadingBackground = false;
      if (!this.removed) m.redraw();
    }
  }

  changeTokenImage(token) {
    app.modal.show(UploadTokenImageModal, { token, onSaved: saved => {
      if (this.removed) return;
      const current = this.map?.tokens.find(item => String(item.id) === String(saved.id));
      if (current) current.imageUrl = saved.imageUrl;
      this.localRevision++; this.lastRemoteSnapshot = null; this.error = ''; m.redraw();
    } });
  }

  assign(token) {
    app.modal.show(AssignTokenOwnerModal, {
      token,
      onSaved: () => {
        this.error = '';
        void this.refresh();
      },
    });
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
        <div className="ChakMaps-top"><Link href={app.route('chak.maps')}>← Все карты</Link><h1>{map.title}</h1><button className="Button" onclick={() => this.refresh()}>Обновить позиции</button>{this.canManage && <button className="Button Button--primary" type="button" onclick={() => this.copyExportCode()}>Экспорт · Копировать код</button>}</div>
        {this.exportMessage && <p className="ChakMaps-muted" role="status">{this.exportMessage}</p>}
        {this.error && <p className="ChakMaps-error">{this.error}</p>}
        <div className="ChakMap-layout">
          <div className="ChakMap-stage">
            <MapBoard map={map} metrics={metrics} readOnly={this.uploadingBackground} gridPatternId={this.gridPatternId}
              canMoveToken={(token) => this.isMine(token)}
              onTokenPointerDown={(event, token) => this.begin(event, token)} />
            <p className="ChakMaps-muted">Редактор для мастеров: перемещайте фишки и назначайте владельцев. Игроки управляют своими фишками в сообщениях обсуждений.</p>
          </div>
          <div className="ChakMap-sidebar">
            {this.canManage && <section className="ChakMaps-panel">
              <label for="chak-map-replace-background">Загрузить новый фон с устройства</label>
              <ImageUploadInput id="chak-map-replace-background" pasteLabel="Вставить новый фон из буфера" disabled={this.uploadingBackground} onSelect={file => this.uploadBackground(file)} />
              <p className="ChakMaps-muted">PNG или JPEG, до 10 МиБ. Фишки и настройки сетки сохраняются.</p>
              {this.uploadingBackground && <p role="status">Загружаем фон…</p>}
            </section>}

            <section className="ChakMaps-panel">
              <h3>Фишки ({map.tokens.length})</h3>
              {!map.tokens.length && <p className="ChakMaps-muted">Фишек пока нет.</p>}
              {map.tokens.map((token) => (
                <div className="ChakMap-tokenRow" key={token.id}>
                  <img src={token.imageUrl} alt="" />
                  <div><b>{token.name}</b><small>{token.ownerUsername ? `@${token.ownerUsername}` : 'Без владельца'}</small></div>
                  {this.canManage && <button type="button" className="Button Button--icon" title="Изменить изображение"
                    aria-label={'Изменить изображение: ' + token.name} onclick={() => this.changeTokenImage(token)}>▧</button>}
                  {this.canManage && <button className="Button Button--icon" title="Назначить пользователя"
                    aria-label={'Назначить владельца: ' + token.name} onclick={() => this.assign(token)}>✎</button>}
                </div>
              ))}
            </section>
            {this.canManage && (
              <>
                <section className="ChakMaps-panel">
                  <h3>Настройки сетки</h3>
                  <label for="chak-grid-color">Цвет сетки</label>
                  <input id="chak-grid-color" type="color" value={map.gridColor}
                    oninput={(e) => this.saveGrid({ gridColor: e.target.value })} />
                  <label for="chak-grid-line-width">Толщина сетки: {map.gridLineWidth} px</label>
                  <input id="chak-grid-line-width" type="range" min="0.5" max="5" step="0.5"
                    value={map.gridLineWidth} oninput={(e) => this.saveGrid({ gridLineWidth: Number(e.target.value) })} />
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
                  <label for="chak-token-name">Имя</label>
                  <input id="chak-token-name" className="FormControl" required value={this.tokenName} oninput={(e) => this.tokenName = e.target.value} placeholder="Имя фишки" />
                  <label for="chak-token-image">Адрес PNG/JPG</label>
                  <input id="chak-token-image" className="FormControl" required={!this.tokenFile} disabled={this.adding || !!this.tokenFile} value={this.tokenImageUrl} oninput={(e) => this.tokenImageUrl = e.target.value} />
                  <label for="chak-token-file">Или изображение с устройства / из буфера</label>
                  <ImageUploadInput id="chak-token-file" pasteLabel="Вставить изображение новой фишки из буфера" selectedFile={this.tokenFile} disabled={this.adding}
                    onSelect={file => { this.tokenFile = file; this.error = ''; }} />
                  <p className="ChakMaps-muted">PNG/JPEG до 10 МиБ; сохраняется версия до 512 px с исходными пропорциями.</p>
                  <label for="chak-token-owner-new">Владелец (username в Flarum)</label>
                  <TokenOwnerInput id="chak-token-owner-new" value={this.tokenOwner}
                    onchange={(value) => this.tokenOwner = value} disabled={this.adding} />
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
