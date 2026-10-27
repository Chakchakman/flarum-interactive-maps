import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import { endpoint, displayError } from '../api';
import { normalizeToken } from '../apiResponse.mjs';
import ImageUploadInput from './ImageUploadInput';

export default class UploadTokenImageModal extends Modal {
  oninit(vnode) { super.oninit(vnode); this.file = null; this.loading = false; this.error = ''; this.removed = false; }
  onremove(vnode) { this.removed = true; super.onremove(vnode); }
  className() { return 'UploadTokenImageModal Modal--small'; }
  title() { return 'Изображение фишки: ' + this.attrs.token.name; }
  get dismissibleOptions() { return this.loading ? { viaCloseButton: false, viaEscKey: false, viaBackdropClick: false } : super.dismissibleOptions; }
  hide() { if (!this.loading) super.hide(); }
  async save(event) {
    event.preventDefault();
    if (!this.file || this.loading) return;
    this.loading = true; this.error = '';
    try {
      const body = new FormData(); body.append('image', this.file);
      const response = await app.request({ method: 'POST', url: endpoint(`chak-tokens/${this.attrs.token.id}/image`),
        body, serialize: value => value, errorHandler: () => {} });
      if (this.removed) return;
      this.attrs.onSaved(normalizeToken(response.data)); this.loading = false; this.hide();
    } catch (error) { if (!this.removed) this.error = displayError(error); }
    finally { this.loading = false; if (!this.removed) m.redraw(); }
  }
  content() {
    return <form className="Modal-body" onsubmit={event => this.save(event)}>
      <ImageUploadInput id="chak-token-replace-image" fileLabel="Выбрать изображение фишки с устройства" pasteLabel="Вставить изображение фишки из буфера" selectedFile={this.file} disabled={this.loading} onSelect={file => this.file = file} />
      <p className="ChakMaps-muted">PNG или JPEG. Изображение уменьшается до 512 px с сохранением пропорций.</p>
      {this.error && <p role="alert" className="ChakMaps-error">{this.error}</p>}
      <Button type="submit" className="Button Button--primary" disabled={!this.file || this.loading} loading={this.loading}>Сохранить изображение</Button>
      <Button type="button" className="Button" disabled={this.loading} onclick={() => this.hide()}>Отмена</Button>
    </form>;
  }
}
