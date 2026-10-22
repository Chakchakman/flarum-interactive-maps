<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class ListMapsController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        \Flarum\Http\RequestUtil::getActor($request)->assertRegistered();

        $maps = Map::query()->orderByDesc('id')->limit(100)->get()
            ->map(fn (Map $map) => $this->mapResource($map))->all();
        return $this->document($maps, 200, ['canManage' => $this->admin($request)]);
    }
}
