<?php
// ============================================================
//  Database configuration  —  NUCA 11th-Stage Lands web app
//  Default: SQLite (zero setup). To use MySQL/MariaDB on CWP,
//  set 'driver' => 'mysql' and fill the mysql[] credentials,
//  then import db/import_mysql.sql into that database.
// ============================================================
$DB = [
    'driver'      => 'sqlite',                       // 'sqlite' or 'mysql'
    'sqlite_path' => __DIR__ . '/db/lands.db',
    'users_sqlite'=> __DIR__ . '/../baytalwatan_users.db', // accounts DB — OUTSIDE web root, survives redeploys
    'mysql'       => [
        'host' => 'localhost',
        'name' => 'lands_db',
        'user' => 'lands_user',
        'pass' => '',
    ],
];

function db() {
    global $DB;
    static $pdo = null;
    if ($pdo) return $pdo;
    if ($DB['driver'] === 'mysql') {
        $m = $DB['mysql'];
        $pdo = new PDO("mysql:host={$m['host']};dbname={$m['name']};charset=utf8mb4", $m['user'], $m['pass']);
    } else {
        $pdo = new PDO('sqlite:' . $DB['sqlite_path']);
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

// Connection for user accounts. MySQL: same DB. SQLite: a separate file kept
// OUTSIDE the web root so it isn't web-served and survives redeploys.
function udb() {
    global $DB;
    static $u = null;
    if ($u) return $u;
    if (($DB['driver'] ?? 'sqlite') === 'mysql') {
        $u = db();
    } else {
        $path = getenv('LANDS_USERS_DB') ?: ($DB['users_sqlite'] ?? (__DIR__ . '/../baytalwatan_users.db'));
        $u = new PDO('sqlite:' . $path);
        $u->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $u->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }
    return $u;
}
