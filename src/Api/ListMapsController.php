<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class ListMapsController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $maps = Map::query()->orderByDesc('id')->limit(100)->get()
            ->map(fn (Map $map) => $this->mapData($map))->all();
        return new JsonResponse(['data' => $maps, 'canManage' => $this->admin($request)]);
    }
}
