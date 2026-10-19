<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class CreateMapController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        if (!$this->admin($request)) return $this->error('Только администратор создаёт карты в v0.1', 403);
        $data = $this->data($request);
        $title = trim((string) ($data['title'] ?? ''));
        $url = $data['backgroundUrl'] ?? '';
        if ($title === '' || mb_strlen($title) > 160 || !$this->url($url)) {
            return $this->error('Укажите название (до 160 символов) и адрес изображения http(s) либо /path');
        }
        $map = new Map();
        $map->title = $title;
        $map->background_url = $url;
        $map->creator_id = \Flarum\Http\RequestUtil::getActor($request)->id;
        $map->grid_size = 64;
        $map->grid_enabled = true;
        $map->snap_to_grid = true;
        $map->grid_offset_x = 0;
        $map->grid_offset_y = 0;
        $map->save();
        return new JsonResponse(['data' => $this->mapData($map)], 201);
    }
}
