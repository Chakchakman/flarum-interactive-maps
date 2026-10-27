import { extend } from 'flarum/common/extend';
import HeaderPrimary from 'flarum/forum/components/HeaderPrimary';
import Link from 'flarum/common/components/Link';
import Comment from 'flarum/forum/components/Comment';
import { insertMapAtBody } from './embedPresentation.mjs';
import CommentPost from 'flarum/forum/components/CommentPost';
import EmbeddedPostMap from './components/EmbeddedPostMap';
import { shouldRenderInlineMap } from './inlineMapVisibility.mjs';
import PostControls from 'flarum/forum/utils/PostControls';
import Button from 'flarum/common/components/Button';
import { endpoint, displayError } from './api';
import AttachMapModal from './components/AttachMapModal';
import composerMap from './composerMap';

export { default as extend } from './extend';

// Link maps to saved posts through the hardened post-scoped API.
const pendingMapPosts = new Set();

function attachMapFromPost(post) {
  if (!post.id() || pendingMapPosts.has(post.id())) return;
  app.modal.show(AttachMapModal, { post });
}

async function detachMapFromPost(post) {
  const postId = post.id();
  if (!postId || pendingMapPosts.has(postId)
      || !window.confirm('Открепить карту от этого сообщения? Сама карта и фишки сохранятся.')) return;
  pendingMapPosts.add(postId);
  try {
    await app.request({
      method: 'DELETE',
      url: endpoint('chak-map-embeds/' + encodeURIComponent(postId)),
    });
    post.pushAttributes({ hasChakMap: false });
    m.redraw();
  } catch (error) {
    window.alert('Не удалось открепить карту: ' + displayError(error));
  } finally {
    pendingMapPosts.delete(postId);
  }
}

app.initializers.add('chakchakman-interactive-maps', () => {
  composerMap();
  // Post menu extensions use ItemList rather than inserting keyed/unkeyed
  // siblings into the Flarum post body (a previous Mithril crash).
  extend(PostControls, 'moderationControls', function (items, post) {
    if (post.contentType() !== 'comment'
      || !post.canEdit()
      || post.isHidden() === true
      || app.forum.attribute('canEmbedChakMaps') !== true) return;

    if (post.attribute('hasChakMap') === true) {
      items.add('chakMapPresentation', <Button icon="fas fa-sliders-h"
        onclick={() => app.modal.show(AttachMapModal, { post, settingsOnly: true })}>Отображение карты</Button>);
      items.add('chakDetachMap', <Button icon="fas fa-unlink"
        onclick={() => detachMapFromPost(post)}>Открепить карту</Button>);
    } else {
      items.add('chakAttachMap', <Button icon="fas fa-map-marked-alt"
        onclick={() => attachMapFromPost(post)}>Прикрепить карту</Button>);
    }
  });

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
      const comment = children.find(child => child?.tag === Comment);
      if (comment) {
        comment.attrs.chakMapPost = post;
        comment.attrs.chakInvalidateParent = () => this.subtree.invalidate();
      } else {
        insertMapAtBody(children, <EmbeddedPostMap postId={post.id()}
          startsCollapsed={post.attribute('chakMapStartsCollapsed')}
          invalidateParent={() => this.subtree.invalidate()} />, post.attribute('chakMapPosition'));
      }
    }
  });
  extend(Comment.prototype, 'view', function (children) {
    const post = this.attrs.chakMapPost;
    if (!post) return;
    insertMapAtBody(children, <EmbeddedPostMap postId={post.id()}
      startsCollapsed={post.attribute('chakMapStartsCollapsed')}
      invalidateParent={this.attrs.chakInvalidateParent} />, post.attribute('chakMapPosition'));
  });
  extend(HeaderPrimary.prototype, 'items', function (items) {
    // The permission is serialized by the server on the ForumResource.
    // Hiding the link is only UX; the API independently enforces access.
    if (app.forum.attribute('canManageChakMaps') === true) {
      items.add('chak-maps-link', <Link href={app.route('chak.maps')}>🗺 Карты</Link>, 15);
    }
  });
});
