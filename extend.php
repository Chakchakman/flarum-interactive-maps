<?php

use Flarum\Extend;
use Flarum\Api\Resource\ForumResource;
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
        ->delete('/chak-map-embeds/{id}', 'chak.map-embeds.detach', DetachMapFromPostController::class),
];
