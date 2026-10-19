<?php

use Flarum\Extend;
use ChakChakman\InteractiveMaps\Api\ListMapsController;
use ChakChakman\InteractiveMaps\Api\CreateMapController;
use ChakChakman\InteractiveMaps\Api\ShowMapController;
use ChakChakman\InteractiveMaps\Api\UpdateMapController;
use ChakChakman\InteractiveMaps\Api\CreateTokenController;
use ChakChakman\InteractiveMaps\Api\MoveTokenController;
use ChakChakman\InteractiveMaps\Api\AssignTokenController;

return [
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
        ->post('/chak-maps/{id}/tokens', 'chak.tokens.create', CreateTokenController::class)
        ->post('/chak-tokens/{id}/move', 'chak.tokens.move', MoveTokenController::class)
        ->patch('/chak-tokens/{id}/owner', 'chak.tokens.assign', AssignTokenController::class),
];
