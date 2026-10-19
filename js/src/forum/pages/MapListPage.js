import Page from 'flarum/common/components/Page';
import Link from 'flarum/common/components/Link';
import { endpoint, displayError } from '../api';

export default class MapListPage extends Page {
  oninit(vnode) {
    super.oninit(vnode);
    this.maps = [];
    this.canManage = false;
    this.loading = true;
    this.title = '';
    this.backgroundUrl = 'http://localhost:8081/map.jpg';
    this.error = '';
    this.creating = false;
    this.load();
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    app.setTitle('Карты');
  }

  async load() {
    try {
      const result = await app.request({ method: 'GET', url: endpoint('chak-maps') });
      this.maps = result.data || [];
      this.canManage = !!result.canManage;
    } catch (error) {
      this.error = displayError(error);
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  async create(event) {
    event.preventDefault();
    if (this.creating) return;
    this.creating = true;
    this.error = '';
    try {
      const result = await app.request({
        method: 'POST',
        url: endpoint('chak-maps'),
        body: { title: this.title.trim(), backgroundUrl: this.backgroundUrl.trim() },
      });
      m.route.set(app.route('chak.map', { id: result.data.id }));
    } catch (error) {
      this.error = displayError(error);
    } finally {
      this.creating = false;
      m.redraw();
    }
  }

  view() {
    return (
      <div className="container ChakMaps-page">
        <div className="ChakMaps-heading">
          <h1>🗺 Игровые карты</h1>
          <p>Форумный тактический стол: изображение, сетка и фишки игроков.</p>
        </div>
        {this.error && <p className="ChakMaps-error">{this.error}</p>}
        {this.loading ? <p>Загрузка…</p> : (
          <div className="ChakMaps-layout">
            <div className="ChakMaps-list">
              {!this.maps.length && <div className="ChakMaps-empty">Пока нет ни одной карты. Создай первую справа.</div>}
              {this.maps.map((map) => (
                <Link className="ChakMaps-card" href={app.route('chak.map', { id: map.id })}>
                  <div className="ChakMaps-cardThumb" style={{ backgroundImage: `url("${map.backgroundUrl.replace(/"/g, '%22')}")` }} />
                  <div>
                    <strong>{map.title}</strong>
                    <div className="ChakMaps-muted">Карта #{map.id} · сетка {map.gridSize}px</div>
                  </div>
                </Link>
              ))}
            </div>
            {this.canManage && (
              <form className="ChakMaps-panel" onsubmit={this.create.bind(this)}>
                <h3>Новая карта</h3>
                <label>Название</label>
                <input className="FormControl" required maxlength="160" value={this.title} oninput={(event) => this.title = event.target.value} placeholder="Склад Zetatech" />
                <label>Адрес фонового изображения</label>
                <input className="FormControl" required value={this.backgroundUrl} oninput={(event) => this.backgroundUrl = event.target.value} placeholder="http://localhost:8081/map.jpg" />
                <p className="ChakMaps-muted">Для проверки уже подставлена картинка из твоего map-correct на порту 8081.</p>
                <button type="submit" className="Button Button--primary" disabled={this.creating}>{this.creating ? 'Создание…' : 'Создать карту'}</button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }
}
