import Component from 'flarum/common/Component';

/** Clipboard access happens only on an explicit click/paste in this control. */
export default class ImageUploadInput extends Component {
  oninit(vnode) { super.oninit(vnode); this.error = ''; this.reading = false; this.removed = false; }
  onremove() { this.removed = true; }

  select(file) {
    if (this.removed || this.attrs.disabled) return;
    this.error = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { this.error = 'Изображение: не более 10 МиБ.'; return; }
    this.attrs.onSelect(file);
  }

  paste(event) {
    if (this.attrs.disabled) return;
    event.preventDefault();
    const item = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && /^image\/(png|jpeg)$/.test(item.type));
    if (item) this.select(item.getAsFile());
    else this.error = 'В буфере нет изображения PNG или JPEG. Можно выбрать файл с устройства.';
    m.redraw();
  }

  async readClipboard() {
    if (this.reading || this.attrs.disabled) return;
    this.error = ''; this.reading = true; m.redraw();
    try {
      if (!navigator.clipboard?.read) throw new Error('unavailable');
      const items = await navigator.clipboard.read();
      const item = items.find(item => item.types.some(type => type === 'image/png' || type === 'image/jpeg'));
      const type = item?.types.find(type => type === 'image/png' || type === 'image/jpeg');
      if (!item || !type) throw new Error('empty');
      const blob = await item.getType(type);
      this.select(new File([blob], type === 'image/png' ? 'clipboard.png' : 'clipboard.jpg', { type }));
    } catch (_error) {
      if (!this.removed) this.error = 'Не удалось прочитать изображение. Нажмите Ctrl+V в поле ниже или выберите файл.';
    } finally {
      if (!this.removed) { this.reading = false; m.redraw(); }
    }
  }

  view() {
    const { id, disabled, selectedFile } = this.attrs;
    return <div className="ChakImageUpload">
      <input id={id} hidden type="file" oncreate={vnode => this.fileInput = vnode.dom} accept="image/png,image/jpeg" aria-label={this.attrs.fileLabel} disabled={disabled || this.reading}
        onchange={event => { const file = event.target.files?.[0]; event.target.value = ''; this.select(file); }} />
      <button className="Button Button--small" type="button" disabled={disabled || this.reading}
        onclick={() => this.fileInput?.click()}>Выбрать файл с устройства</button>
      <button className="Button Button--small" type="button" disabled={disabled || this.reading}
        onclick={() => this.readClipboard()}>Вставить изображение из буфера</button>
      <input className="FormControl ChakImageUpload-paste" type="text" value="" disabled={disabled || this.reading}
        aria-label={this.attrs.pasteLabel || 'Вставить изображение из буфера'} placeholder="Или нажмите здесь Ctrl+V с изображением"
        onpaste={event => this.paste(event)} oninput={event => event.target.value = ''} />
      {selectedFile && <div><span>{selectedFile.name}</span> <button type="button" className="Button Button--link" disabled={disabled}
        onclick={() => { this.error = ''; this.attrs.onSelect(null); }}>Убрать выбранный файл</button></div>}
      {this.error && <p className="ChakMaps-error" role="alert">{this.error}</p>}
    </div>;
  }
}
