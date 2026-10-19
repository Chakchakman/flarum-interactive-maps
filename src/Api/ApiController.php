<?php

namespace ChakChakman\InteractiveMaps\Api;

use Flarum\User\User;
use ChakChakman\InteractiveMaps\Models\Map;
use ChakChakman\InteractiveMaps\Models\Token;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;

abstract class ApiController
{
    protected function data(Request $request): array
    {
        $body = $request->getParsedBody();
        if (is_array($body) && count($body)) {
            return $body;
        }
        $parsed = json_decode((string) $request->getBody(), true);
        return is_array($parsed) ? $parsed : [];
    }

    protected function admin(Request $request): bool
    {
        $actor = \Flarum\Http\RequestUtil::getActor($request);
        return $actor instanceof User && $actor->isAdmin();
    }

    protected function error(string $message, int $status = 400): JsonResponse
    {
        return new JsonResponse(['error' => $message], $status);
    }

    protected function id(Request $request): int
    {
        return (int) ($request->getQueryParams()['id'] ?? 0);
    }

    protected function url($url): bool
    {
        if (!is_string($url) || strlen($url) > 2048 || $url === '') return false;
        if (preg_match('~^/(?!/)~', $url)) return true;
        return (bool) preg_match('~^https?://~i', $url);
    }

    protected function mapData(Map $map, bool $withTokens = false): array
    {
        $data = [
            'id' => $map->id,
            'title' => $map->title,
            'backgroundUrl' => $map->background_url,
            'creatorId' => $map->creator_id,
            'gridSize' => (int) $map->grid_size,
            'gridOffsetX' => (int) $map->grid_offset_x,
            'gridOffsetY' => (int) $map->grid_offset_y,
            'gridEnabled' => (bool) $map->grid_enabled,
            'snapToGrid' => (bool) $map->snap_to_grid,
        ];
        if ($withTokens) {
            $data['tokens'] = $map->tokens()->orderBy('id')->get()->map(fn (Token $token) => $this->tokenData($token))->all();
        }
        return $data;
    }

    protected function tokenData(Token $token): array
    {
        $owner = $token->owner_user_id ? User::find($token->owner_user_id) : null;
        return [
            'id' => $token->id,
            'mapId' => $token->map_id,
            'name' => $token->name,
            'imageUrl' => $token->image_url,
            'x' => (float) $token->x,
            'y' => (float) $token->y,
            'ownerUserId' => $token->owner_user_id,
            'ownerUsername' => $owner ? $owner->username : null,
        ];
    }
}
