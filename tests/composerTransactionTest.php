<?php

// Run with the isolated Flarum autoloader; uses its own in-memory SQLite DB.
require $argv[1];

use ChakChakman\InteractiveMaps\Api\Middleware\AtomicComposerMap;
use Illuminate\Database\Connection;
use Laminas\Diactoros\Response\JsonResponse;
use Laminas\Diactoros\ServerRequest;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

$db = new Connection(new PDO('sqlite::memory:'));
$db->statement('create table published_posts (id integer)');
$request = (new ServerRequest([], [], '/api/posts', 'POST'))
    ->withParsedBody(['data' => ['attributes' => ['chakMapId' => 9]]]);
$middleware = new AtomicComposerMap($db);

foreach (['success', 'error-response', 'exception', 'ordinary-post'] as $scenario) {
    $db->delete('delete from published_posts');
    $handler = new class($db, $scenario) implements RequestHandlerInterface {
        public function __construct(private Connection $db, private string $scenario) {}
        public function handle(ServerRequestInterface $request): ResponseInterface
        {
            $this->db->insert('insert into published_posts (id) values (1)');
            if ($this->scenario === 'exception') throw new RuntimeException('Association failed after saving post');
            return new JsonResponse([], $this->scenario === 'error-response' ? 403 : 201);
        }
    };
    try {
        $response = $middleware->process(
            $scenario === 'ordinary-post' ? $request->withParsedBody([]) : $request,
            $handler
        );
        if ($scenario === 'exception') throw new LogicException('Expected association exception');
    } catch (RuntimeException $error) {
        if ($scenario !== 'exception' || $error->getMessage() !== 'Association failed after saving post') throw $error;
    }
    $expected = in_array($scenario, ['success', 'ordinary-post'], true) ? 1 : 0;
    if ((int) $db->selectOne('select count(*) as n from published_posts')->n !== $expected
        || $db->transactionLevel() !== 0) {
        throw new LogicException('Invalid transaction state: '.$scenario);
    }
    echo "PASS: composer transaction ".$scenario."\n";
}
