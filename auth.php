<?php
// Account system: register / login / logout / session check.
// Passwords are hashed (bcrypt). Users are stored in a separate DB outside the
// web root (config: users_sqlite) so they survive redeploys and aren't web-served.
session_start();
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/config.php';

function jexit($d){ echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function reqbody(){ $j = json_decode(file_get_contents('php://input'), true); return is_array($j) ? $j : $_POST; }

function ensure_users_table($pdo){
    global $DB;
    if (($DB['driver'] ?? 'sqlite') === 'mysql') {
        $pdo->exec("CREATE TABLE IF NOT EXISTS users(
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            phone VARCHAR(30),
            password_hash VARCHAR(255) NOT NULL,
            created_at VARCHAR(40),
            role VARCHAR(10) NOT NULL DEFAULT 'user'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } else {
        $pdo->exec("CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            phone TEXT,
            password_hash TEXT NOT NULL,
            created_at TEXT,
            role TEXT NOT NULL DEFAULT 'user'
        )");
    }
    // migrate older tables that pre-date the role column
    try { $pdo->exec("ALTER TABLE users ADD COLUMN role " . ((($DB['driver'] ?? 'sqlite')==='mysql') ? "VARCHAR(10) NOT NULL DEFAULT 'user'" : "TEXT NOT NULL DEFAULT 'user'")); } catch (Throwable $e) {}
}

try {
    $action = $_GET['action'] ?? '';
    $pdo = udb();
    ensure_users_table($pdo);

    if ($action === 'me') {
        if (!empty($_SESSION['uid'])) {
            $st = $pdo->prepare('SELECT id, full_name, email, phone, role FROM users WHERE id = ?');
            $st->execute([$_SESSION['uid']]);
            $u = $st->fetch();
            if ($u) jexit(['auth' => true, 'user' => $u]);
        }
        jexit(['auth' => false]);
    }

    if ($action === 'register') {
        $b = reqbody();
        $name  = trim($b['full_name'] ?? '');
        $email = strtolower(trim($b['email'] ?? ''));
        $phone = trim($b['phone'] ?? '');
        $pass  = (string)($b['password'] ?? '');
        if (mb_strlen($name) < 2)                              jexit(['error' => 'الرجاء إدخال الاسم بالكامل']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL))        jexit(['error' => 'البريد الإلكتروني غير صحيح']);
        if (!preg_match('/^[0-9+\-\s()]{6,20}$/', $phone))     jexit(['error' => 'رقم الهاتف غير صحيح']);
        if (strlen($pass) < 6)                                 jexit(['error' => 'كلمة المرور يجب أن تكون 6 أحرف على الأقل']);

        $st = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $st->execute([$email]);
        if ($st->fetch()) jexit(['error' => 'هذا البريد الإلكتروني مسجّل بالفعل، سجّل الدخول']);

        $st = $pdo->prepare('INSERT INTO users(full_name, email, phone, password_hash, created_at) VALUES(?,?,?,?,?)');
        $st->execute([$name, $email, $phone, password_hash($pass, PASSWORD_DEFAULT), gmdate('c')]);
        $_SESSION['uid'] = $pdo->lastInsertId();
        jexit(['auth' => true, 'user' => ['full_name' => $name, 'email' => $email, 'phone' => $phone, 'role' => 'user']]);
    }

    if ($action === 'login') {
        $b = reqbody();
        $email = strtolower(trim($b['email'] ?? ''));
        $pass  = (string)($b['password'] ?? '');
        $st = $pdo->prepare('SELECT * FROM users WHERE email = ?');
        $st->execute([$email]);
        $u = $st->fetch();
        if (!$u || !password_verify($pass, $u['password_hash'])) {
            usleep(300000); // small delay to slow brute force
            jexit(['error' => 'البريد الإلكتروني أو كلمة المرور غير صحيحة']);
        }
        $_SESSION['uid'] = $u['id'];
        jexit(['auth' => true, 'user' => ['full_name' => $u['full_name'], 'email' => $u['email'], 'phone' => $u['phone'], 'role' => $u['role'] ?? 'user']]);
    }

    if ($action === 'logout') { $_SESSION = []; @session_destroy(); jexit(['ok' => true]); }

    jexit(['error' => 'unknown action']);
} catch (Throwable $e) {
    http_response_code(500);
    jexit(['error' => 'server error: ' . $e->getMessage()]);
}
