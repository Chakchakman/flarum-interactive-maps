<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class DeleteMapController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        // Hiding a Delete button is not authorization: enforce rights here.
        if (!$this->admin($request)) {
            return $this->error('Недостаточно прав для удаления карты', 403);
        }

        $id = $this->id($request);
        if ($id <= 0) {
            return $this->error('Некорректный идентификатор карты', 400);
        }

        // Flarum's Eloquent models already know their database connection.
        // Do not rely on Laravel's DB facade having an application root.
        $connection = (new Map())->getConnection();
        $deleted = $connection->transaction(function () use ($id): bool {
            $map = Map::query()->whereKey($id)->lockForUpdate()->first();
            if (!$map) {
                return false;
            }

            // The current schema has no ON DELETE CASCADE constraint.
            // Remove tokens in the same transaction to avoid orphan rows.
            $map->tokens()->delete();
            $map->delete();

            return true;
        });

        if (!$deleted) {
            return $this->error('Карта не найдена', 404);
        }

        return new JsonResponse(['success' => true, 'id' => $id]);
    }
}
