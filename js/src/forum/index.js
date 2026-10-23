import { extend } from 'flarum/common/extend';
import HeaderPrimary from 'flarum/forum/components/HeaderPrimary';
import Link from 'flarum/common/components/Link';
import CommentPost from 'flarum/forum/components/CommentPost';
import EmbeddedPostMap from './components/EmbeddedPostMap';

export { default as extend } from './extend';

app.initializers.add('chakchakman-interactive-maps', () => {
  // Render only on posts that the Flarum post resource explicitly marks
  // as having an attached map. No scanning arbitrary HTML and no guessing IDs.
  extend(CommentPost.prototype, 'content', function (children) {
    const post = this.attrs.post;
    if (post.contentType() === 'comment'
        && post.attribute('hasChakMap') === true
        && !post.isHidden()
        && app.session.user) {
      children.push(<EmbeddedPostMap key={`chak-post-map-${post.id()}`} postId={post.id()} />);
    }
  });
  extend(HeaderPrimary.prototype, 'items', function (items) {
    // The permission is serialized by the server on the ForumResource.
    // Hiding the link is only UX; the API independently enforces access.
    if (app.forum.attribute('canManageChakMaps') === true) {
      items.add('chak-maps-link', <Link href={app.route('chak.maps')}>🗺 Карты</Link>, 15);
    }
  });
});
