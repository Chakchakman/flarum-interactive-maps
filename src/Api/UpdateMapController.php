<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class UpdateMapController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        if (!$this->admin($request)) return $this->error('Нет прав', 403);
        $map = Map::find($this->id($request));
        if (!$map) return $this->error('Карта не найдена', 404);
        $data = $this->data($request);

        if (array_key_exists('title', $data)) {
            $title = trim((string) $data['title']);
            if (!$title || mb_strlen($title) > 160) return $this->error('Неверное название');
            $map->title = $title;
        }
        if (array_key_exists('backgroundUrl', $data)) {
            if (!$this->url($data['backgroundUrl'])) return $this->error('Неверная ссылка на фон');
            $map->background_url = $data['backgroundUrl'];
        }
        if (array_key_exists('gridSize', $data)) {
            $size = filter_var($data['gridSize'], FILTER_VALIDATE_INT);
            if ($size === false || $size < 12 || $size > 256) return $this->error('Размер сетки: от 12 до 256 пикселей');
            $map->grid_size = $size;
        }
        foreach (['gridOffsetX' => 'grid_offset_x', 'gridOffsetY' => 'grid_offset_y'] as $field => $column) {
            if (array_key_exists($field, $data)) {
                $v = filter_var($data[$field], FILTER_VALIDATE_INT);
                if ($v === false || $v < -256 || $v > 256) return $this->error('Смещение: от -256 до 256 пикселей');
                $map->$column = $v;
            }
        }
        foreach (['gridEnabled' => 'grid_enabled', 'snapToGrid' => 'snap_to_grid'] as $field => $column) {
            if (array_key_exists($field, $data)) {
                if (!is_bool($data[$field])) return $this->error('Неверное значение переключателя');
                $map->$column = $data[$field];
            }
        }
        $map->save();
        return new JsonResponse(['data' => $this->mapData($map, true)]);
    }
}
