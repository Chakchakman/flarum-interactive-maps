import { presentationOptions } from '../embedPresentation.mjs';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import { endpoint, displayError } from '../api';
import { normalizeMapList, resourceBody } from '../apiResponse.mjs';
import { filterPickerMaps, pickerMapId } from '../mapPicker.mjs';

export default class AttachMapModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);
    this.maps = [];
    this.query = '';
    this.selectedId = null;
    this.loadingMaps = false;
    this.loading = false;
    this.error = '';
    this.loadError = '';
    this.closed = false;
    this.presentation = presentationOptions(this.attrs.settingsOnly ? {
      displayPosition: this.attrs.post?.attribute('chakMapPosition'),
      startsCollapsed: this.attrs.post?.attribute('chakMapStartsCollapsed'),
    } : this.attrs.selection);
    if (!this.attrs.settingsOnly) this.loadMaps();
  }

  className() { return 'AttachMapModal Modal--medium'; }
  title() { return this.attrs.settingsOnly ? 'Отображение карты' : 'Прикрепить карту'; }

  get dismissibleOptions() {
    return this.loading
      ? { viaCloseButton: false, viaEscKey: false, viaBackdropClick: false }
      : super.dismissibleOptions;
  }

  hide() {
    if (this.loading) return;
    this.closed = true;
    super.hide();
  }

  onremove(vnode) {
    this.closed = true;
    super.onremove(vnode);
  }

  async loadMaps() {
    if (this.loadingMaps || this.closed) return;
    this.loadingMaps = true;
    this.loadError = '';
    try {
      const result = await app.request({ method: 'GET', url: endpoint('chak-maps') });
      if (!this.closed) this.maps = normalizeMapList(result);
    } catch (error) {
      if (!this.closed) this.loadError = displayError(error);
    } finally {
      this.loadingMaps = false;
      if (!this.closed) m.redraw();
    }
  }

  async attach(event) {
    event.preventDefault();
    const mapId = pickerMapId(this.maps, this.selectedId, this.query);
    if ((!mapId && !this.attrs.settingsOnly) || this.loading || this.closed) return;
    if (this.attrs.onSelect) {
      const map = this.maps.find((item) => Number(item.id) === mapId);
      this.attrs.onSelect({ id: mapId, title: map?.title || 'Карта #' + mapId, ...this.presentation });
      this.hide();
      return;
    }
    const post = this.attrs.post;
    const postId = post?.id();
    if (!postId) return;
    this.loading = true;
    this.error = '';
    try {
      await app.request({
        method: this.attrs.settingsOnly ? 'PATCH' : 'POST',
        url: endpoint('chak-map-embeds' + (this.attrs.settingsOnly ? '/' + postId : '')),
        body: resourceBody('chak-map-embeds', { postId: Number(postId), mapId, ...this.presentation }),
      });
      // UI hint only; the server independently checks all access permissions.
      post.pushAttributes({ hasChakMap: true, chakMapPosition: this.presentation.displayPosition,
        chakMapStartsCollapsed: this.presentation.startsCollapsed });
      this.loading = false;
      if (!this.closed) this.hide();
    } catch (error) {
      if (!this.closed) this.error = 'Не удалось прикрепить карту: ' + displayError(error);
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  content() {
    const maps = filterPickerMaps(this.maps, this.query);
    const mapId = pickerMapId(this.maps, this.selectedId, this.query);
    return <form className="Modal-body AttachMapModal-body" onsubmit={(event) => this.attach(event)}>
      {!this.attrs.settingsOnly && <>
      <label for="chak-map-search">Название карты, ID или код экспорта</label>
      <input id="chak-map-search" className="FormControl" value={this.query}
        disabled={this.loading} placeholder="Например: Склад или [interactive-map id=9]"
        oninput={(event) => { this.query = event.target.value; this.selectedId = null; this.error = ''; }} />
      <p className="helpText">Поиск по 100 последним картам. Другую карту можно прикрепить по ID или коду экспорта.</p>
      {this.loadingMaps && <p role="status">Загрузка карт…</p>}
      {this.loadError && <div role="alert" className="ChakMaps-error">
        <p>{this.loadError}</p>
        <Button type="button" className="Button" disabled={this.loadingMaps || this.loading}
          onclick={() => this.loadMaps()}>Повторить загрузку</Button>
      </div>}
      {!this.loadingMaps && !this.loadError && !maps.length &&
        <p>{this.maps.length ? 'Карты не найдены.' : 'В каталоге пока нет карт.'}</p>}
      <div className="AttachMapModal-list" aria-label="Доступные карты">
        {maps.map((map) => <button key={map.id} type="button"
          className="AttachMapModal-map" aria-pressed={String(this.selectedId === Number(map.id))}
          disabled={this.loading} onclick={() => { this.selectedId = Number(map.id); this.error = ''; }}>
          <img src={map.backgroundUrl} alt="" loading="lazy" decoding="async" />
          <span><strong>{map.title}</strong><small>Карта #{map.id}</small></span>
        </button>)}
      </div>
      </>}
      <label for="chak-map-position">Расположение карты</label>
      <select id="chak-map-position" className="FormControl" disabled={this.loading}
        value={this.presentation.displayPosition}
        onchange={event => this.presentation.displayPosition = event.target.value}>
        <option value="above">Над текстом</option><option value="below">Под текстом</option>
      </select>
      <label for="chak-map-collapsed">Начальное состояние</label>
      <select id="chak-map-collapsed" className="FormControl" disabled={this.loading}
        value={String(this.presentation.startsCollapsed)}
        onchange={event => this.presentation.startsCollapsed = event.target.value === 'true'}>
        <option value="false">Развёрнута</option><option value="true">Свёрнута</option>
      </select>
      {this.error && <p className="ChakMaps-error" role="alert">{this.error}</p>}
      <div className="AttachMapModal-actions">
        <Button type="submit" className="Button Button--primary" loading={this.loading}
          disabled={(!mapId && !this.attrs.settingsOnly) || this.loading}>{this.attrs.settingsOnly ? 'Сохранить' : mapId ? `Прикрепить карту #${mapId}` : 'Выбери карту'}</Button>
        <Button type="button" className="Button" disabled={this.loading} onclick={() => this.hide()}>Отмена</Button>
      </div>
    </form>;
  }
}
