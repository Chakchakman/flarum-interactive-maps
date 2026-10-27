<?php

namespace ChakChakman\InteractiveMaps\Api;

use Flarum\User\User;
use ChakChakman\InteractiveMaps\Access\MapPermissions;
use ChakChakman\InteractiveMaps\Models\Map;
use ChakChakman\InteractiveMaps\Models\Token;
use Flarum\Api\JsonApiResponse;
use Psr\Http\Message\ServerRequestInterface as Request;

abstract class ApiController
{
    protected function data(Request $request): array
    {
        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = json_decode((string) $request->getBody(), true);
        }
        if (!is_array($body)) return [];

        // Accept JSON:API attribute envelopes and legacy flat request bodies.
        // The legacy form is retained for existing integrations and browser tests.
        if (isset($body['data']['attributes']) && is_array($body['data']['attributes'])) {
            return $body['data']['attributes'];
        }

        return $body;
    }

    protected function manage(Request $request): bool
    {
        $actor = \Flarum\Http\RequestUtil::getActor($request);
        return $actor instanceof User && MapPermissions::canManage($actor);
    }

    protected function error(string $message, int $status = 400): JsonApiResponse
    {
        return new JsonApiResponse([
            'errors' => [[
                'status' => (string) $status,
                'title' => $status === 403 ? 'Forbidden' : ($status === 404 ? 'Not Found' : 'Invalid Request'),
                'detail' => $message,
            ]],
        ], $status);
    }

    protected function document(array $data, int $status = 200, array $meta = []): JsonApiResponse
    {
        $document = ['data' => $data];
        if ($meta) $document['meta'] = $meta;
        return new JsonApiResponse($document, $status);
    }

    protected function mapDocument(Map $map, bool $withTokens = false, array $meta = []): JsonApiResponse
    {
        $document = ['data' => $this->mapResource($map)];
        if ($withTokens) {
            $tokens = $map->tokens()->with('owner')->orderBy('id')->get();
            $included = $tokens->map(fn (Token $token) => $this->tokenResource($token))->all();
            $document['data']['relationships'] = [
                'tokens' => [
                    'data' => array_map(
                        fn (array $token) => ['type' => $token['type'], 'id' => $token['id']],
                        $included
                    ),
                ],
            ];
            $document['included'] = $included;
        }
        if ($meta) $document['meta'] = $meta;
        return new JsonApiResponse($document);
    }

    protected function mapResource(Map $map): array
    {
        $attributes = $this->mapData($map);
        unset($attributes['id']);
        return [
            'type' => 'chak-maps',
            'id' => (string) $map->id,
            'attributes' => $attributes,
        ];
    }

    protected function tokenResource(Token $token): array
    {
        $attributes = $this->tokenData($token);
        unset($attributes['id']);
        return [
            'type' => 'chak-tokens',
            'id' => (string) $token->id,
            'attributes' => $attributes,
        ];
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
            'gridColor' => $map->grid_color ?? \ChakChakman\InteractiveMaps\Models\GridStyle::COLOR,
            'gridLineWidth' => (float) ($map->grid_line_width ?? \ChakChakman\InteractiveMaps\Models\GridStyle::WIDTH),
            'gridOffsetX' => (int) $map->grid_offset_x,
            'gridOffsetY' => (int) $map->grid_offset_y,
            'gridEnabled' => (bool) $map->grid_enabled,
            'snapToGrid' => (bool) $map->snap_to_grid,
        ];
        if ($withTokens) {
            $data['tokens'] = $map->tokens()->with('owner')->orderBy('id')->get()->map(fn (Token $token) => $this->tokenData($token))->all();
        }
        return $data;
    }

    // Caller must hold the token row lock and have checked current access.
    protected function applyTokenMove(Token $token, array $data): JsonApiResponse
    {
        if (!isset($data['x'], $data['y']) || !is_numeric($data['x']) || !is_numeric($data['y'])) {
            return $this->error('Нужны координаты x и y');
        }
        $x = (float) $data['x'];
        $y = (float) $data['y'];
        if (!is_finite($x) || !is_finite($y) || $x < 0 || $x > 1 || $y < 0 || $y > 1) {
            return $this->error('Координаты должны быть в диапазоне 0..1');
        }
        if (!is_string($data['moveVersion'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $data['moveVersion'])) {
            return new JsonApiResponse(['errors' => [[
                'status' => '428', 'code' => 'token_move_precondition',
                'detail' => 'Обновите страницу перед перемещением фишки.',
            ]]], 428);
        }
        if (!hash_equals(\ChakChakman\InteractiveMaps\Models\TokenMoveVersion::forToken($token), $data['moveVersion'])) {
            return new JsonApiResponse(['errors' => [[
                'status' => '409', 'code' => 'token_move_conflict',
                'detail' => 'Фишка уже изменена в другом окне. Положение обновлено; повторите перемещение.',
                'meta' => ['currentToken' => $this->tokenResource($token)],
            ]]], 409);
        }
        $token->x = $x;
        $token->y = $y;
        $token->save();
        // PDO may round float bindings: return the actual stored state/version.
        $token->refresh();
        return $this->document($this->tokenResource($token));
    }

    protected function tokenData(Token $token): array
    {
        $owner = $token->owner;
        return [
            'id' => $token->id,
            'mapId' => $token->map_id,
            'moveVersion' => \ChakChakman\InteractiveMaps\Models\TokenMoveVersion::forToken($token),
            'name' => $token->name,
            'imageUrl' => $token->image_url,
            'x' => (float) $token->x,
            'y' => (float) $token->y,
            'ownerUserId' => $token->owner_user_id,
            'ownerUsername' => $owner ? $owner->username : null,
        ];
    }
}
