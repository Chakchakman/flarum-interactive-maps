<?php

// Dependency-light policy tests. Never connects to Flarum's database.
namespace Flarum\User {
    class User
    {
        public function __construct(
            public int $id,
            private bool $guest = false,
            private bool $admin = false,
            private bool $manage = false
        ) {}

        public function isGuest(): bool { return $this->guest; }
        public function isAdmin(): bool { return $this->admin; }
        public function hasPermission(string $permission): bool
        {
            return $permission === 'chakchakman-interactive-maps.map.manage' && $this->manage;
        }
    }
}

namespace Flarum\Post {
    class Post
    {
        public function __construct(private bool $visible = true) {}
        public function isVisibleTo(\Flarum\User\User $actor): bool { return $this->visible; }
    }
    class CommentPost extends Post {}
}

namespace ChakChakman\InteractiveMaps\Models {
    class Token
    {
        public function __construct(public int $map_id, public ?int $owner_user_id) {}
    }
}

namespace {
    require __DIR__.'/../src/Access/MapPermissions.php';
    require __DIR__.'/../src/Access/PostMapAccess.php';
    require __DIR__.'/../src/Access/PostTokenMoveAccess.php';

    use ChakChakman\InteractiveMaps\Access\PostTokenMoveAccess;
    use ChakChakman\InteractiveMaps\Models\Token;
    use Flarum\User\User;
    use Flarum\Post\Post;
    use Flarum\Post\CommentPost;

    $post = new CommentPost(true);
    $hidden = new CommentPost(false);
    $own = new Token(9, 12);
    $unassigned = new Token(9, null);
    $foreignMap = new Token(77, 12);
    $player = new User(12);
    $other = new User(13);
    $guest = new User(12, true);
    $admin = new User(1, false, true);
    $manager = new User(14, false, false, true);
    $cases = [
        'owner moves assigned token on visible linked map' => [$player, $post, $own, 9, true],
        'other player denied' => [$other, $post, $own, 9, false],
        'guest denied even if assigned matching id' => [$guest, $post, $own, 9, false],
        'unassigned token denied' => [$player, $post, $unassigned, 9, false],
        'wrong map denied even for owner' => [$player, $post, $foreignMap, 9, false],
        'wrong map denied even for admin' => [$admin, $post, $foreignMap, 9, false],
        'hidden post denies owner' => [$player, $hidden, $own, 9, false],
        'hidden post denies admin' => [$admin, $hidden, $own, 9, false],
        'event/non-comment post denies player' => [$player, new Post(true), $own, 9, false],
        'admin moves any visible linked token' => [$admin, $post, $unassigned, 9, true],
        'assigned manager moves any visible linked token' => [$manager, $post, $unassigned, 9, true],
        'manager blocked if post hidden' => [$manager, $hidden, $own, 9, false],
    ];

    foreach ($cases as $name => [$actor, $comment, $token, $mapId, $expected]) {
        $actual = PostTokenMoveAccess::canMove($actor, $comment, $token, $mapId);
        if ($actual !== $expected) {
            throw new \RuntimeException("FAIL: {$name}");
        }
        echo "PASS: {$name}\n";
    }
}
