import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import TokenOwnerInput from './TokenOwnerInput';
import { endpoint, displayError } from '../api';
import { resourceBody } from '../apiResponse.mjs';

export default class AssignTokenOwnerModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);
    this.username = this.attrs.token.ownerUsername || '';
    this.loading = false;
    this.error = '';
    this.closed = false;
  }
  className() { return 'AssignTokenOwnerModal Modal--small'; }
  title() { return 'Владелец фишки «' + this.attrs.token.name + '»'; }
  get dismissibleOptions() {
    return this.loading ? { viaCloseButton: false, viaEscKey: false, viaBackdropClick: false } : super.dismissibleOptions;
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
  async save(event) {
    event.preventDefault();
    if (this.loading || this.closed) return;
    this.loading = true;
    this.error = '';
    try {
      await app.request({
        method: 'PATCH', url: endpoint('chak-tokens/' + this.attrs.token.id + '/owner'),
        body: resourceBody('chak-tokens', { ownerUsername: this.username.trim() }),
      });
      this.loading = false;
      this.attrs.onSaved?.();
      if (!this.closed) this.hide();
    } catch (error) {
      if (!this.closed) this.error = displayError(error);
    } finally {
      this.loading = false;
      if (!this.closed) m.redraw();
    }
  }
  content() {
    return <form className="Modal-body" onsubmit={(event) => this.save(event)}>
      <label for="chak-token-owner-edit">Владелец (username в Flarum)</label>
      <TokenOwnerInput id="chak-token-owner-edit" value={this.username}
        onchange={(value) => { this.username = value; this.error = ''; }} disabled={this.loading} />
      {this.error && <p className="ChakMaps-error" role="alert">{this.error}</p>}
      <div className="AttachMapModal-actions">
        <Button type="submit" className="Button Button--primary" loading={this.loading} disabled={this.loading}>Сохранить владельца</Button>
        <Button type="button" className="Button" disabled={this.loading} onclick={() => this.hide()}>Отмена</Button>
      </div>
    </form>;
  }
}
