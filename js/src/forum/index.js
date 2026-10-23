import { extend } from 'flarum/common/extend';
import HeaderPrimary from 'flarum/forum/components/HeaderPrimary';
import Link from 'flarum/common/components/Link';
import CommentPost from 'flarum/forum/components/CommentPost';
import EmbeddedPostMap from './components/EmbeddedPostMap';
import { shouldRenderInlineMap } from './inlineMapVisibility.mjs';

export { default as extend } from './extend';

app.initializers.add('chakchakman-interactive-maps', () => {
  // Render only on posts that the Flarum post resource explicitly marks
  // as having an attached map. No scanning arbitrary HTML and no guessing IDs.
  extend(CommentPost.prototype, 'content', function (children) {
    const post = this.attrs.post;
    if (shouldRenderInlineMap({
      isComment: post.contentType() === 'comment',
      hasLinkedMap: post.attribute('hasChakMap'),
      isHidden: post.isHidden(),
      authenticated: !!app.session.user,
    })) {
      // Flarum's CommentPost uses SubtreeRetainer. Force a parent diff after
      // an async board/image load or the child can remain stuck on "loading".
      // CommentPost.content() contains unkeyed Flarum nodes. Adding a keyed
      // child mixes vnode key modes and crashes Mithril's entire post stream.
      children.push(<EmbeddedPostMap postId={post.id()}
        invalidateParent={() => this.subtree.invalidate()} />);
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
