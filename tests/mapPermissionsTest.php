<?php

// A dependency-light test of the extension's permission guard. This stub is
// used ONLY in the PHP CLI test process; it does not load Flarum or modify DB.
namespace Flarum\User {
    class User
    {
        public function __construct(
            private bool $guest,
            private bool $admin,
            private bool $hasManage
        ) {}

        public function isGuest(): bool { return $this->guest; }
        public function isAdmin(): bool { return $this->admin; }
        public function hasPermission(string $permission): bool
        {
            if ($permission !== 'chakchakman-interactive-maps.map.manage') {
                throw new \RuntimeException('Unexpected permission name');
            }
            return $this->hasManage;
        }
    }
}

namespace {
    require __DIR__ . '/../src/Access/MapPermissions.php';

    use ChakChakman\InteractiveMaps\Access\MapPermissions;
    use Flarum\User\User;

    $cases = [
        'administrator' => [new User(false, true, false), true],
        'assigned GM group' => [new User(false, false, true), true],
        'ordinary registered user' => [new User(false, false, false), false],
        'guest without permissions' => [new User(true, false, false), false],
        'guest with accidental permission' => [new User(true, false, true), false],
    ];

    foreach ($cases as $name => [$actor, $expected]) {
        $actual = MapPermissions::canManage($actor);
        if ($actual !== $expected) {
            fwrite(STDERR, "FAIL: {$name}; expected " . (int) $expected . "\n");
            exit(1);
        }
        echo "PASS: {$name}\n";
    }
}
