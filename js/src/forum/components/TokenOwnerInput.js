import Component from 'flarum/common/Component';
import { endpoint, displayError } from '../api';

let nextOwnerInput = 0;

export default class TokenOwnerInput extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.id = this.attrs.id || 'chak-token-owner-' + (++nextOwnerInput);
    this.results = [];
    this.active = -1;
    this.open = false;
    this.loading = false;
    this.error = '';
    this.sequence = 0;
    this.removed = false;
  }
  onremove() {
    this.removed = true;
    this.cancelSearch();
  }
  cancelSearch() {
    clearTimeout(this.timer);
    this.sequence++;
    this.loading = false;
    this.active = -1;
  }
  search(value) {
    this.cancelSearch();
    this.results = [];
    this.active = -1;
    this.error = '';
    const prefix = value.trim();
    this.open = Array.from(prefix).length >= 3;
    if (!this.open) return;
    this.loading = true;
    const sequence = this.sequence;
    this.timer = setTimeout(async () => {
      try {
        const response = await app.request({
          method: 'GET', url: endpoint('chak-map-users'), params: { prefix },
        });
        if (!this.removed && sequence === this.sequence) {
          this.results = response.data.map((user) => ({ id: user.id, username: user.attributes.username }));
        }
      } catch (error) {
        if (!this.removed && sequence === this.sequence) this.error = displayError(error);
      } finally {
        if (!this.removed && sequence === this.sequence) {
          this.loading = false;
          m.redraw();
        }
      }
    }, 250);
  }
  choose(username) {
    this.cancelSearch();
    this.attrs.onchange(username);
    this.results = [];
    this.open = false;
    this.error = '';
  }
  keydown(event) {
    if (event.key === 'Escape') {
      if (this.open) event.stopPropagation();
      this.cancelSearch();
      this.open = false;
      return;
    }
    if (!this.open || !this.results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.active = this.active < 0
        ? (step > 0 ? 0 : this.results.length - 1)
        : (this.active + step + this.results.length) % this.results.length;
    } else if (event.key === 'Enter' && this.active >= 0) {
      event.preventDefault();
      this.choose(this.results[this.active].username);
    }
  }
  view() {
    return <div className="TokenOwnerInput" onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        this.cancelSearch();
        this.open = false;
      }
    }}>
      <input id={this.id} className="FormControl" type="text" role="combobox" maxlength="100"
        autocomplete="off" value={this.attrs.value || ''} disabled={this.attrs.disabled}
        aria-autocomplete="list" aria-expanded={String(this.open)}
        aria-controls={this.open ? this.id + '-list' : undefined}
        aria-activedescendant={this.active >= 0 ? this.id + '-option-' + this.active : undefined}
        aria-describedby={this.id + '-help'} placeholder="Можно оставить пустым"
        oninput={(event) => {
          this.attrs.onchange(event.target.value);
          this.search(event.target.value);
        }}
        onfocus={() => this.search(this.attrs.value || '')}
        onkeydown={(event) => this.keydown(event)} />
      <small id={this.id + '-help'} className="ChakMaps-muted">Введите минимум 3 символа username. Пусто — без владельца.</small>
      {this.open && <div className="TokenOwnerInput-dropdown">
        {this.loading && <p role="status">Поиск пользователей…</p>}
        {this.error && <p className="ChakMaps-error" role="alert">{this.error}</p>}
        {!this.loading && !this.error && !this.results.length && <p role="status">Пользователи не найдены.</p>}
        <div id={this.id + '-list'} role="listbox" aria-label="Пользователи">
          {this.results.map((user, index) => <button type="button" role="option" key={user.id}
            id={this.id + '-option-' + index} tabindex="-1"
            aria-selected={String(this.active === index)} disabled={this.attrs.disabled}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => this.choose(user.username)}>@{user.username}</button>)}
        </div>
      </div>}
    </div>;
  }
}
