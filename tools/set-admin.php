<?php
// One-time admin seeder — run on the server (password stays in your shell, not the repo):
//   php /home/bayt/public_html/tools/set-admin.php aleimam@live.com 'YOUR_PASSWORD' 'Your Name'
require __DIR__ . '/../config.php';

$email = strtolower(trim($argv[1] ?? ''));
$pass  = $argv[2] ?? '';
$name  = $argv[3] ?? 'Administrator';
if ($email === '' || $pass === '') { fwrite(STDERR, "usage: php set-admin.php EMAIL PASSWORD [NAME]\n"); exit(1); }

$drv = $GLOBALS['DB']['driver'] ?? 'sqlite';
$pdo = udb();
if ($drv === 'mysql')
    $pdo->exec("CREATE TABLE IF NOT EXISTS users(id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(120), email VARCHAR(190) UNIQUE, phone VARCHAR(30), password_hash VARCHAR(255), created_at VARCHAR(40), role VARCHAR(10) NOT NULL DEFAULT 'user') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
else
    $pdo->exec("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT, email TEXT UNIQUE, phone TEXT, password_hash TEXT, created_at TEXT, role TEXT NOT NULL DEFAULT 'user')");
try { $pdo->exec("ALTER TABLE users ADD COLUMN role " . ($drv === 'mysql' ? "VARCHAR(10) NOT NULL DEFAULT 'user'" : "TEXT NOT NULL DEFAULT 'user'")); } catch (Throwable $e) {}

$h = password_hash($pass, PASSWORD_DEFAULT);
$st = $pdo->prepare('SELECT id FROM users WHERE email = ?'); $st->execute([$email]);
if ($st->fetch()) {
    $pdo->prepare('UPDATE users SET password_hash = ?, role = ?, full_name = ? WHERE email = ?')->execute([$h, 'admin', $name, $email]);
    echo "Updated existing user as ADMIN: $email\n";
} else {
    $pdo->prepare('INSERT INTO users(full_name, email, phone, password_hash, created_at, role) VALUES(?,?,?,?,?,?)')->execute([$name, $email, '', $h, gmdate('c'), 'admin']);
    echo "Created ADMIN user: $email\n";
}
echo "Done. Sign in with this email + password to access the Admin panel.\n";
