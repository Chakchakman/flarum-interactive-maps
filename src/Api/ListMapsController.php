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
        if (!$this->manage($request)) return $this->error('Доступ к каталогу карт разрешён только мастерам', 403);

        $maps = Map::query()->orderByDesc('id')->limit(100)->get()
            ->map(fn (Map $map) => $this->mapResource($map))->all();
        return $this->document($maps, 200, ['canManage' => $this->manage($request)]);
    }
}
