<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class ShowMapController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        $map = Map::find($this->id($request));
        if (!$map) return $this->error('Карта не найдена', 404);
        return new JsonResponse(['data' => $this->mapData($map, true), 'canManage' => $this->admin($request)]);
    }
}
