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
        \Flarum\Http\RequestUtil::getActor($request)->assertRegistered();

        $id = $this->id($request);
        if ($id < 1) return $this->error('Неверный номер карты в API-запросе', 400);
        $map = Map::find($id);
        if (!$map) return $this->error('Карта не найдена', 404);
        return new JsonResponse(['data' => $this->mapData($map, true), 'canManage' => $this->admin($request)]);
    }
}
