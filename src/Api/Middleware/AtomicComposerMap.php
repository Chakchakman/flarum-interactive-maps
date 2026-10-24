<?php

namespace ChakChakman\InteractiveMaps\Api\Middleware;

use Illuminate\Database\ConnectionInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/** Only map-bearing creation requests need an outer transaction. */
final class AtomicComposerMap implements MiddlewareInterface
{
    public function __construct(private ConnectionInterface $connection) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $body = $request->getParsedBody();
        $attributes = is_array($body) ? ($body['data']['attributes'] ?? []) : [];
        if ($request->getMethod() !== 'POST'
            || !preg_match('~/(posts|discussions)/?$~', $request->getUri()->getPath())
            || !is_array($attributes)
            || !array_key_exists('chakMapId', $attributes)) {
            return $handler->handle($request);
        }

        $level = $this->connection->transactionLevel();
        $this->connection->beginTransaction();
        try {
            $response = $handler->handle($request);
            if ($response->getStatusCode() >= 400) {
                $this->connection->rollBack($level);
            } else {
                $this->connection->commit();
            }
            return $response;
        } catch (\Throwable $error) {
            $this->connection->rollBack($level);
            throw $error;
        }
    }
}
