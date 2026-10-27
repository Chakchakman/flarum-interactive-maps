<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Access\MapPermissions;
use ChakChakman\InteractiveMaps\Images\MapBackgrounds;
use ChakChakman\InteractiveMaps\Models\Map;
use ChakChakman\InteractiveMaps\Models\MapEmbed;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Laminas\Diactoros\Response;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class ShowMapBackgroundController extends ApiController implements RequestHandlerInterface
{
    public function __construct(private MapBackgrounds $backgrounds) {}

    public function handle(Request $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) return $this->error('Нужна авторизация', 403)->withHeader('Cache-Control', 'private, no-store');
        $mapId = $this->id($request);
        $filename = (string) ($request->getQueryParams()['file'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}\.(png|jpg)$/D', $filename)) return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        $map = Map::find($mapId);
        if (!$map || $map->background_url !== $this->backgrounds->url($mapId, $filename)) return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        if (!MapPermissions::canManage($actor) && !Post::query()->whereVisibleTo($actor)->where('type', 'comment')
            ->whereIn('id', MapEmbed::query()->where('map_id', $mapId)->select('post_id'))->exists()) {
            return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        }
        $path = $this->backgrounds->path($mapId, $filename);
        if (!$path) return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        return new Response(new Stream($path, 'rb'), 200, [
            'Content-Type' => str_ends_with($filename, '.png') ? 'image/png' : 'image/jpeg',
            'Content-Length' => (string) filesize($path),
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
