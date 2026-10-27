<?php

// Deterministic race fixture. Never run against the owner's forum.
$root = $argv[1] ?? '';
if (!in_array('--isolated-forum', $argv, true) || !is_file($root.'/config.php')) throw new RuntimeException('Isolated forum required');
$config = require $root.'/config.php';
if (!in_array(parse_url($config['url'] ?? '', PHP_URL_HOST), ['127.0.0.1', 'localhost'], true)
    || !preg_match('/^flarum_(smoke|grid_style_[0-9]+)$/D', $config['database']['database'] ?? '')) {
    throw new RuntimeException('Only disposable local/CI databases are allowed');
}
$site = require $root.'/site.php';
$container = $site->bootApp()->getContainer();
$db = $container->make(\Illuminate\Database\ConnectionInterface::class);
$db->beginTransaction();
try {
    $token = $db->table('chak_tokens')->where('id', (int) ($argv[2] ?? 0))->lockForUpdate()->first();
    if (!$token || !preg_match('/^Conflict race token [0-9]+$/D', $token->name)) throw new RuntimeException('Synthetic race token required');
    $owner = $db->table('users')->find($token->owner_user_id);
    $admin = $db->table('users')->where('username', 'smokeadmin')->first();
    if (!$owner || !preg_match('/^race[0-9]+$/D', $owner->username) || !$admin) throw new RuntimeException('Synthetic race owner required');
    echo "LOCKED\n"; fflush(STDOUT);
    if (trim((string) fgets(STDIN)) !== 'WAIT') throw new RuntimeException('WAIT required');
    echo "OBSERVING".PHP_EOL; fflush(STDOUT);
    // Observe from an independent autocommit connection: metadata snapshots
    // inside the locked transaction can hide a newly waiting transaction.
    $settings = $config['database'];
    $observer = new PDO('mysql:host='.$settings['host'].';port='.($settings['port'] ?? 3306).';dbname='.$settings['database'],
        $settings['username'], $settings['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $deadline = microtime(true) + 10;
    $waiting = false;
    do {
        // MariaDB's information_schema lock-wait view may lag the engine.
        // Require the monitor's exact PRIMARY record for this fixture token.
        $status = $observer->query('SHOW ENGINE INNODB STATUS')->fetch(PDO::FETCH_ASSOC)['Status'];
        foreach (preg_split('/---TRANSACTION /', $status) as $transaction) {
            if (str_contains($transaction, 'LOCK WAIT')
                && str_contains($transaction, 'index PRIMARY')
                && str_contains($transaction, 'of table `'.$settings['database'].'`.`'.$db->getTablePrefix().'chak_tokens`')
                && str_contains($transaction, '0: len 4; hex '.sprintf('%08x', $token->id).';')) {
                $waiting = true;
                break;
            }
        }
        if ($waiting) break;
        usleep(50000);
    } while (microtime(true) < $deadline);
    if (!$waiting) throw new RuntimeException('Movement never waited for the locked token');
    echo "WAITING\n"; fflush(STDOUT);
    if (trim((string) fgets(STDIN)) !== 'COMMIT') throw new RuntimeException('COMMIT required');
    $db->table('chak_tokens')->where('id', $token->id)->update(['owner_user_id' => $admin->id]);
    $db->commit();
    echo "COMMITTED\n"; fflush(STDOUT);
} catch (Throwable $error) {
    fwrite(STDERR, get_class($error).': '.$error->getMessage().PHP_EOL);
    throw $error;
} finally {
    if ($db->transactionLevel() > 0) $db->rollBack();
}
