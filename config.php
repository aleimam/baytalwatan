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
