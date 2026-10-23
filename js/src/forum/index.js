import { extend } from 'flarum/common/extend';
import HeaderPrimary from 'flarum/forum/components/HeaderPrimary';
import Link from 'flarum/common/components/Link';
import CommentPost from 'flarum/forum/components/CommentPost';
import EmbeddedPostMap from './components/EmbeddedPostMap';
import { shouldRenderInlineMap } from './inlineMapVisibility.mjs';
import PostControls from 'flarum/forum/utils/PostControls';
import Button from 'flarum/common/components/Button';
import { endpoint, displayError } from './api';
import { resourceBody } from './apiResponse.mjs';
import { parseMapEmbedCode } from './mapEmbedCode.mjs';

export { default as extend } from './extend';

// Link maps to saved posts through the hardened post-scoped API.
const pendingMapPosts = new Set();

async function attachMapFromPost(post) {
  const postId = post.id();
  if (!postId || pendingMapPosts.has(postId)) return;
  const input = window.prompt(
    'Вставь код из кнопки «Экспорт» в редакторе карты (например, [interactive-map id=9]):'
  );
  if (input === null) return;
  const mapId = parseMapEmbedCode(input);
  if (mapId === null) {
    window.alert('Некорректный код карты. Используй [interactive-map id=9] или номер карты.');
    return;
  }
  pendingMapPosts.add(postId);
  try {
    await app.request({
      method: 'POST',
      url: endpoint('chak-map-embeds'),
      body: resourceBody('chak-map-embeds', { postId: Number(postId), mapId }),
    });
    // This is an in-memory UI hint only. The backend validates post visibility,
    // both manager/embed permissions and post edit permission independently.
    post.pushAttributes({ hasChakMap: true });
    m.redraw();
  } catch (error) {
    window.alert('Не удалось прикрепить карту: ' + displayError(error));
  } finally {
    pendingMapPosts.delete(postId);
  }
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
  // Post menu extensions use ItemList rather than inserting keyed/unkeyed
  // siblings into the Flarum post body (a previous Mithril crash).
  extend(PostControls, 'moderationControls', function (items, post) {
    if (post.contentType() !== 'comment'
      || !post.canEdit()
      || post.isHidden() === true
      || app.forum.attribute('canEmbedChakMaps') !== true) return;

    if (post.attribute('hasChakMap') === true) {
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
