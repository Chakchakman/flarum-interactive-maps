<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Access\MapPermissions;
use ChakChakman\InteractiveMaps\Images\TokenImages;
use ChakChakman\InteractiveMaps\Models\Token;
use ChakChakman\InteractiveMaps\Models\MapEmbed;
use Flarum\Http\RequestUtil;
use Flarum\Post\Post;
use Laminas\Diactoros\Response;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class ShowTokenImageController extends ApiController implements RequestHandlerInterface
{
    public function __construct(private TokenImages $images) {}

    public function handle(Request $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) return $this->error('Нужна авторизация', 403)->withHeader('Cache-Control', 'private, no-store');
        $tokenId = $this->id($request);
        $key = (string) ($request->getQueryParams()['file'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/D', $key)) return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        $token = Token::query()->whereHas('map')->find($tokenId);
        if (!$token || $token->image_url !== $this->images->url($tokenId, $key)) return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        if (!MapPermissions::canManage($actor) && !Post::query()->whereVisibleTo($actor)->where('posts.type', 'comment')
            ->whereIn('posts.id', MapEmbed::query()->where('map_id', $token->map_id)->select('post_id'))->exists()) {
            return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        }
        $path = $this->images->path($tokenId, $key.'.png') ?? $this->images->path($tokenId, $key.'.jpg');
        if (!$path) return $this->error('Изображение недоступно', 404)->withHeader('Cache-Control', 'private, no-store');
        return new Response(new Stream($path, 'rb'), 200, [
            'Content-Type' => str_ends_with($path, '.png') ? 'image/png' : 'image/jpeg',
            'Content-Length' => (string) filesize($path),
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
