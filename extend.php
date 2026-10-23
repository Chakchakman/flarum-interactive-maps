<?php

use Flarum\Extend;
use Flarum\Api\Resource\ForumResource;
use Flarum\Api\Resource\PostResource;
use Flarum\Post\Post;
use Flarum\Post\CommentPost;
use Flarum\Api\Schema;
use Flarum\Api\Context;
use ChakChakman\InteractiveMaps\Access\MapPermissions;
use ChakChakman\InteractiveMaps\Api\ListMapsController;
use ChakChakman\InteractiveMaps\Api\CreateMapController;
use ChakChakman\InteractiveMaps\Api\ShowMapController;
use ChakChakman\InteractiveMaps\Api\UpdateMapController;
use ChakChakman\InteractiveMaps\Api\DeleteMapController;
use ChakChakman\InteractiveMaps\Api\CreateTokenController;
use ChakChakman\InteractiveMaps\Api\MoveTokenController;
use ChakChakman\InteractiveMaps\Api\AssignTokenController;
use ChakChakman\InteractiveMaps\Api\AttachMapToPostController;
use ChakChakman\InteractiveMaps\Api\ShowPostMapController;
use ChakChakman\InteractiveMaps\Api\DetachMapFromPostController;
use ChakChakman\InteractiveMaps\Api\MovePostTokenController;
use ChakChakman\InteractiveMaps\Models\MapEmbed;
use Flarum\Post\Event\Deleted as PostDeleted;

return [
    // Remove persisted links when a comment post is deleted.
    (new Extend\Event())
        ->listen(PostDeleted::class, function (PostDeleted $event) {
            MapEmbed::query()->where('post_id', $event->post->id)->delete();
        }),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js'),

    (new Extend\ApiResource(ForumResource::class))
        ->fields(fn () => [
            Schema\Boolean::make('canManageChakMaps')
                ->get(fn ($forum, Context $context) => MapPermissions::canManage($context->getActor())),
        ]),

    // A lightweight per-post hint. Only posts already serialized by Flarum
    // can carry the flag; the actual map/tokens remain behind the existing
    // post-scoped, visibility-aware endpoint.
    (new Extend\ApiResource(PostResource::class))
        ->fields(fn () => [
            Schema\Boolean::make('hasChakMap')
                ->get(function (Post $post, Context $context): bool {
                    if (!($post instanceof CommentPost)
                        || $post->hidden_at !== null
                        || $context->getActor()->isGuest()) {
                        return false;
                    }

                    // One indexed lookup per discussion instead of one per post.
                    // PHP static variables are scoped to this HTTP request.
                    static $embedPostsByDiscussion = [];
                    $discussionId = (int) $post->discussion_id;
                    if (!isset($embedPostsByDiscussion[$discussionId])) {
                        $postIds = MapEmbed::query()
                            ->join('posts', 'posts.id', '=', 'chak_map_embeds.post_id')
                            ->where('posts.discussion_id', $discussionId)
                            ->pluck('chak_map_embeds.post_id')
                            ->all();
                        $embedPostsByDiscussion[$discussionId] = array_fill_keys($postIds, true);
                    }

                    return isset($embedPostsByDiscussion[$discussionId][$post->id]);
                }),
        ]),

    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->css(__DIR__.'/less/forum.less')
        ->route('/maps', 'chak.maps')
        ->route('/maps/{id}', 'chak.map'),

    (new Extend\Routes('api'))
        ->get('/chak-maps', 'chak.maps.index', ListMapsController::class)
        ->post('/chak-maps', 'chak.maps.create', CreateMapController::class)
        ->get('/chak-maps/{id}', 'chak.maps.show', ShowMapController::class)
        ->patch('/chak-maps/{id}', 'chak.maps.update', UpdateMapController::class)
        ->delete('/chak-maps/{id}', 'chak.maps.delete', DeleteMapController::class)
        ->post('/chak-maps/{id}/tokens', 'chak.tokens.create', CreateTokenController::class)
        ->post('/chak-tokens/{id}/move', 'chak.tokens.move', MoveTokenController::class)
        ->patch('/chak-tokens/{id}/owner', 'chak.tokens.assign', AssignTokenController::class)
        ->post('/chak-map-embeds', 'chak.map-embeds.attach', AttachMapToPostController::class)
        ->get('/chak-map-embeds/{id}', 'chak.map-embeds.show', ShowPostMapController::class)
        ->delete('/chak-map-embeds/{id}', 'chak.map-embeds.detach', DetachMapFromPostController::class)
        // A player can move only a token assigned to them on a visible, linked post.
        ->post('/chak-map-embeds/{postId}/tokens/{tokenId}/move', 'chak.map-embeds.tokens.move', MovePostTokenController::class),
];
