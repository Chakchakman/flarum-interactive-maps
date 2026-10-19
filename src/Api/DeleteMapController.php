<?php

namespace ChakChakman\InteractiveMaps\Api;

use ChakChakman\InteractiveMaps\Models\Map;
use Illuminate\Support\Facades\DB;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface;

class DeleteMapController extends ApiController implements RequestHandlerInterface
{
    public function handle(Request $request): Response
    {
        if (!$this->admin($request)) {
            return $this->error('Нет прав на удаление карты', 403);
        }

        $id = $this->id($request);
        if ($id < 1) {
            return $this->error('Неверный номер карты', 400);
        }

        $deleted = DB::transaction(function () use ($id): bool {
            $map = Map::query()->lockForUpdate()->find($id);
            if (!$map) {
                return false;
            }

            // Foreign keys are not declared in the original beta migration.
            // Explicitly delete the tokens so we don't leave orphan records.
            $map->tokens()->delete();
            $map->delete();

            return true;
        });

        if (!$deleted) {
            return $this->error('Карта не найдена', 404);
        }

        return new JsonResponse(['success' => true]);
    }
}
