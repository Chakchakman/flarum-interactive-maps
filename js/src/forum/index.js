import { extend } from 'flarum/common/extend';
import HeaderPrimary from 'flarum/forum/components/HeaderPrimary';
import Link from 'flarum/common/components/Link';

export { default as extend } from './extend';

app.initializers.add('chakchakman-interactive-maps', () => {
  extend(HeaderPrimary.prototype, 'items', function (items) {
    // The permission is serialized by the server on the ForumResource.
    // Hiding the link is only UX; the API independently enforces access.
    if (app.forum.attribute('canManageChakMaps') === true) {
      items.add('chak-maps-link', <Link href={app.route('chak.maps')}>🗺 Карты</Link>, 15);
    }
  });
});
