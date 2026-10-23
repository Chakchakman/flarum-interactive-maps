<?php

namespace Flarum\User {
    class User
    {
        public function __construct(
            private bool $guest,
            private bool $admin,
            private array $permissions = [],
            private bool $canEdit = false
        ) {}
        public function isGuest(): bool { return $this->guest; }
        public function isAdmin(): bool { return $this->admin; }
        public function hasPermission(string $permission): bool { return in_array($permission, $this->permissions, true); }
        public function can(string $ability, $subject): bool { return $ability === 'edit' && $this->canEdit; }
    }
}

namespace Flarum\Post {
    class Post {
        public function __construct(private bool $visible = true) {}
        public function isVisibleTo(\Flarum\User\User $actor): bool { return $this->visible; }
    }
    class CommentPost extends Post {}
}

namespace {
    require __DIR__ . '/../src/Access/MapPermissions.php';
    require __DIR__ . '/../src/Access/PostMapAccess.php';

    use ChakChakman\InteractiveMaps\Access\MapPermissions;
    use ChakChakman\InteractiveMaps\Access\PostMapAccess;
    use Flarum\User\User;
    use Flarum\Post\Post;
    use Flarum\Post\CommentPost;

    $manage = MapPermissions::MANAGE;
    $embed = MapPermissions::EMBED;
    $cases = [
        'authorized GM can attach visible editable comment' => [new User(false, false, [$manage, $embed], true), new CommentPost(true), true],
        'GM missing embed permission cannot attach' => [new User(false, false, [$manage], true), new CommentPost(true), false],
        'GM missing map management cannot attach' => [new User(false, false, [$embed], true), new CommentPost(true), false],
        'GM cannot attach to uneditable post' => [new User(false, false, [$manage, $embed], false), new CommentPost(true), false],
        'GM cannot attach to hidden post' => [new User(false, false, [$manage, $embed], true), new CommentPost(false), false],
        'ordinary member cannot attach' => [new User(false, false, [], true), new CommentPost(true), false],
        'guest cannot attach' => [new User(true, false, [$manage, $embed], true), new CommentPost(true), false],
        'only comment post can be embedded' => [new User(false, true, [], true), new Post(true), false],
        'admin can attach visible editable comment' => [new User(false, true, [], true), new CommentPost(true), true],
    ];
    foreach ($cases as $name => [$actor, $post, $expected]) {
        if (PostMapAccess::canAttach($actor, $post) !== $expected) {
            throw new \RuntimeException("Attach rights assertion failed: {$name}");
        }
        echo "PASS: {$name}\n";
    }

    $player = new User(false, false);
    $guest = new User(true, false);
    if (!PostMapAccess::canView($player, new CommentPost(true))) throw new \RuntimeException('visible player read');
    if (PostMapAccess::canView($player, new CommentPost(false))) throw new \RuntimeException('private post leaked');
    if (PostMapAccess::canView($guest, new CommentPost(true))) throw new \RuntimeException('guest read leaked');
    if (PostMapAccess::canView($player, new Post(true))) throw new \RuntimeException('noncomment post leaked');
    echo "PASS: player post visibility matrix\n";
}
