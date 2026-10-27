import ImageUploadInput from '../components/ImageUploadInput';
import Page from 'flarum/common/components/Page';
import Link from 'flarum/common/components/Link';
import { endpoint, displayError } from '../api';
import { canManageResponse, normalizeMap, normalizeMapList, resourceBody } from '../apiResponse.mjs';

export default class MapListPage extends Page {
  oninit(vnode) {
    super.oninit(vnode);
    this.maps = [];
    this.canManage = false;
    this.loading = true;
    this.title = '';
    this.backgroundUrl = '';
    this.imageFile = null;
    this.error = '';
    this.creating = false;
    this.deletingIds = new Set();
    this.staffAllowed = app.forum.attribute('canManageChakMaps') === true;
    if (this.staffAllowed) this.load();
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    app.setTitle('Карты');
  }

  async load() {
    try {
      const result = await app.request({ method: 'GET', url: endpoint('chak-maps') });
      this.maps = normalizeMapList(result);
      this.canManage = canManageResponse(result);
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
    if (this.imageFile && this.imageFile.size > 10 * 1024 * 1024) { this.error = 'Изображение: не более 10 МиБ.'; return; }
    this.creating = true;
    this.error = '';
    try {
      let upload;
      if (this.imageFile) {
        upload = new FormData(); upload.append('title', this.title.trim()); upload.append('image', this.imageFile);
      }
      const result = await app.request({
        method: 'POST',
        url: endpoint('chak-maps'),
        body: upload || resourceBody('chak-maps', {
          title: this.title.trim(),
          backgroundUrl: this.backgroundUrl.trim(),
        }),
        ...(upload ? { serialize: value => value } : {}),
        errorHandler: () => {},
      });
      m.route.set(app.route('chak.map', { id: normalizeMap(result.data).id }));
    } catch (error) {
      this.error = displayError(error);
    } finally {
      this.creating = false;
      m.redraw();
    }
  }

  async deleteMap(map) {
    if (!this.canManage || this.deletingIds.has(map.id)) return;
    const confirmed = window.confirm(
      `Удалить карту «${map.title}» (#${map.id}) вместе со ВСЕМИ фишками?\n\nЭто действие необратимо.`
    );
    if (!confirmed) return;

    this.deletingIds.add(map.id);
    this.error = '';
    m.redraw();
    try {
      await app.request({
        method: 'DELETE',
        url: endpoint(`chak-maps/${map.id}`),
      });
      this.maps = this.maps.filter((entry) => entry.id !== map.id);
    } catch (error) {
      this.error = `Не удалось удалить карту #${map.id}: ${displayError(error)}`;
    } finally {
      this.deletingIds.delete(map.id);
      m.redraw();
    }
  }

  view() {
    if (!this.staffAllowed) {
      return <div className="container ChakMaps-page">
        <p className="ChakMaps-error">Каталог карт доступен только администрации и назначенным мастерам.</p>
        <p><Link href="/">← На форум</Link></p>
      </div>;
    }

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
                <div className="ChakMaps-cardRow" key={map.id}>
                  <Link className="ChakMaps-card" href={app.route('chak.map', { id: map.id })}>
                    <img className="ChakMaps-cardThumb" src={map.backgroundUrl}
                      loading="lazy" decoding="async" alt="" />
                    <div>
                      <strong>{map.title}</strong>
                      <div className="ChakMaps-muted">Карта #{map.id} · сетка {map.gridSize}px</div>
                    </div>
                  </Link>
                  {this.canManage && (
                    <button type="button" className="Button Button--danger ChakMaps-deleteButton"
                      disabled={this.deletingIds.has(map.id)}
                      title={`Удалить карту #${map.id} и все её фишки`}
                      onclick={() => this.deleteMap(map)}>
                      {this.deletingIds.has(map.id) ? 'Удаление…' : 'Удалить'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {this.canManage && (
              <form className="ChakMaps-panel" onsubmit={this.create.bind(this)}>
                <h3>Новая карта</h3>
                <label for="chak-map-title">Название</label>
                <input id="chak-map-title" className="FormControl" required disabled={this.creating} maxlength="160" value={this.title} oninput={(event) => this.title = event.target.value} placeholder="введите название карты" />
                <label for="chak-map-background-url">Адрес фонового изображения</label>
                <input id="chak-map-background-url" className="FormControl" required={!this.imageFile} disabled={this.creating || !!this.imageFile} value={this.backgroundUrl} oninput={(event) => this.backgroundUrl = event.target.value} placeholder="https://example.com/map.jpg" />
                <label for="chak-map-background-file">Или загрузите изображение с устройства</label>
                <ImageUploadInput id="chak-map-background-file" pasteLabel="Вставить изображение карты из буфера" selectedFile={this.imageFile} disabled={this.creating}
                  onSelect={file => { this.imageFile = file; this.error = ''; }} />
                <p className="ChakMaps-muted">PNG или JPEG, до 10 МиБ, 8192 px по стороне и 16 мегапикселей. Действуют также лимиты сервера.</p>
                <button type="submit" className="Button Button--primary" disabled={this.creating}>{this.creating ? 'Создание…' : 'Создать карту'}</button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }
}
