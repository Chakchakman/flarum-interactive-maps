import Page from 'flarum/common/components/Page';
import Link from 'flarum/common/components/Link';
import { endpoint, displayError } from '../api';
import { LatestTokenMoveQueue } from '../tokenMoveQueue.mjs';

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
    this.removed = false;
    this.localRevision = 0;
    this.refreshSeq = 0;
    this.gridSaving = 0;
    this.moves = new LatestTokenMoveQueue(
      async (id, position) => {
        const response = await app.request({
          method: 'POST',
          url: endpoint(`chak-tokens/${id}/move`),
          body: position,
        });
        return response.data;
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
  }

  hasPendingLocalChanges() {
    return !!this.dragging || this.moves.hasPending() || this.gridSaving > 0;
  }

  async refresh(silent = false) {
    if (this.removed || this.hasPendingLocalChanges()) return;
    const revision = this.localRevision;
    const requestId = ++this.refreshSeq;
    try {
      const result = await app.request({ method: 'GET', url: endpoint(`chak-maps/${this.mapId}`) });
      // A GET started before the user dragged a token or edited the grid
      // must not overwrite newer client state even when the write finished.
      if (!this.removed && !this.hasPendingLocalChanges()
          && revision === this.localRevision && requestId === this.refreshSeq) {
        this.map = result.data;
        this.canManage = !!result.canManage;
        app.setTitle(this.map.title);
        if (!silent) this.error = '';
      }
    } catch (error) {
      if (!silent && !this.removed && revision === this.localRevision) {
        this.error = displayError(error);
      }
    } finally {
      this.loading = false;
      if (!this.removed) m.redraw();
    }
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
    if (this.map.snapToGrid && this.map.gridEnabled) {
      // Grid units are measured against the original 1280 x 853 map,
      // not against the browser window, so resizing preserves cell positions.
      const snap = (n, referenceSize, offset) => clamp(
        (Math.floor((n * referenceSize - offset) / this.map.gridSize) + 0.5) * this.map.gridSize / referenceSize + offset / referenceSize,
        0, 1
      );
      token.x = snap(token.x, 1280, this.map.gridOffsetX);
      token.y = snap(token.y, 853, this.map.gridOffsetY);
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

  async saveGrid(changes) {
    if (!this.canManage) return;
    const previous = { ...this.map };
    this.localRevision += 1;
    this.gridSaving += 1;
    Object.assign(this.map, changes);
    m.redraw();
    try {
      const result = await app.request({
        method: 'PATCH', url: endpoint(`chak-maps/${this.mapId}`), body: changes,
      });
      // Keep the live token collection: grid PATCH responses can contain
      // outdated token positions from the time of the request.
      this.map = { ...result.data, tokens: this.map.tokens };
      this.error = '';
    } catch (error) {
      this.map = { ...previous, tokens: this.map.tokens };
      this.error = displayError(error);
    } finally {
      this.gridSaving -= 1;
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
    return (
      <div className="container ChakMaps-page ChakMap-page">
        <div className="ChakMaps-top"><Link href={app.route('chak.maps')}>← Все карты</Link><h1>{map.title}</h1><button className="Button" onclick={() => this.refresh()}>Обновить позиции</button></div>
        {this.error && <p className="ChakMaps-error">{this.error}</p>}
        <div className="ChakMap-layout">
          <div className="ChakMap-stage">
            <div className="ChakMap-canvas" style={{ backgroundImage: `url("${map.backgroundUrl.replace(/"/g, '%22')}")` }}>
              {map.gridEnabled && (
                <div className="ChakMap-grid" style={{
                  backgroundSize: `${map.gridSize * 100 / 1280}% ${map.gridSize * 100 / 853}%`,
                  backgroundPosition: `${map.gridOffsetX * 100 / 1280}% ${map.gridOffsetY * 100 / 853}%`,
                }} />
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
                  <label>Размер клетки: {map.gridSize} условных px</label>
                  <input type="range" min="12" max="256" step="1" value={map.gridSize} onchange={(e) => this.saveGrid({ gridSize: Number(e.target.value) })} />
                  <label>Сдвиг по X: {map.gridOffsetX}px</label>
                  <input type="range" min="-100" max="100" value={map.gridOffsetX} onchange={(e) => this.saveGrid({ gridOffsetX: Number(e.target.value) })} />
                  <label>Сдвиг по Y: {map.gridOffsetY}px</label>
                  <input type="range" min="-100" max="100" value={map.gridOffsetY} onchange={(e) => this.saveGrid({ gridOffsetY: Number(e.target.value) })} />
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
