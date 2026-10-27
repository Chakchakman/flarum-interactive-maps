import { extend, override } from 'flarum/common/extend';
import Stream from 'flarum/common/utils/Stream';
import Button from 'flarum/common/components/Button';
import AttachMapModal from './components/AttachMapModal';

export default function composerMap() {
  // Flarum 2 loads composers lazily. Register hooks by module path so that
  // opening the forum never depends on those classes already being loaded.
  for (const Composer of ['flarum/forum/components/DiscussionComposer', 'flarum/forum/components/ReplyComposer']) {
    extend(Composer, 'oninit', function () {
      this.composer.fields.chakMapSelection ||= Stream(null);
    });
    extend(Composer, 'headerItems', function (items) {
      if (app.forum.attribute('canEmbedChakMaps') !== true) return;
      const selection = this.composer.fields.chakMapSelection;
      const map = selection();
      items.add('chakComposerMap', <span className="ChakComposerMap">
        <Button type="button" className="Button Button--link" icon="fas fa-map-marked-alt"
          disabled={this.loading} onclick={() => app.modal.show(AttachMapModal, {
            selection: map,
            onSelect: (chosen) => selection(chosen),
          })}>{map ? 'Карта: ' + map.title : 'Прикрепить карту'}</Button>
        {map && <Button type="button" className="Button Button--link"
          disabled={this.loading} onclick={() => selection(null)}>Убрать карту из черновика</Button>}
      </span>, -10);
    });
    extend(Composer, 'data', function (data) {
      const map = this.composer.fields.chakMapSelection?.();
      if (map && app.forum.attribute('canEmbedChakMaps') === true) {
        data.chakMapId = Number(map.id);
        data.chakMapDisplayPosition = map.displayPosition || 'below';
        data.chakMapInitiallyCollapsed = map.startsCollapsed === true;
      }
    });
    override(Composer, 'hasChanges', function (original) {
      return !!original() || !!this.composer.fields.chakMapSelection?.();
    });
  }
}
