<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class ShowMapController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        if (!$this->manage($request)) return $this->error('Доступ к каталогу карт разрешён только мастерам', 403);

        $map = Map::find($this->id($request));
        if (!$map) return $this->error('Карта не найдена', 404);
        return $this->mapDocument($map, true, ['canManage' => $this->manage($request)]);
    }
}
