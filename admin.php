<?php
// Admin API: user management + site settings.
// settings_get is public (so appearance/feature flags apply for everyone);
// everything else requires an admin session.
session_start();
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/config.php';

function jexit($d){ echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function reqbody(){ $j = json_decode(file_get_contents('php://input'), true); return is_array($j) ? $j : $_POST; }

$DEFAULTS = [
    'site_title'      => 'بيت الوطن',
    'site_sub_ar'     => '',
    'site_sub_en'     => '',
    'accent'          => '#061e48',
    'show_analytics'  => '1',
    'show_premium'    => '1',
    'show_down'       => '1',
];

function ensure_settings($pdo){
    global $DB;
    if (($DB['driver'] ?? 'sqlite') === 'mysql')
        $pdo->exec("CREATE TABLE IF NOT EXISTS settings(k VARCHAR(50) PRIMARY KEY, v TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    else
        $pdo->exec("CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)");
}
function get_settings($pdo){
    global $DEFAULTS;
    ensure_settings($pdo);
    $out = $DEFAULTS;
    foreach ($pdo->query("SELECT k, v FROM settings")->fetchAll() as $r) $out[$r['k']] = $r['v'];
    return $out;
}
function set_kv($pdo, $k, $v){
    $u = $pdo->prepare("UPDATE settings SET v = ? WHERE k = ?");
    $u->execute([$v, $k]);
    if ($u->rowCount() === 0) { $i = $pdo->prepare("INSERT INTO settings(k, v) VALUES(?, ?)"); $i->execute([$k, $v]); }
}

try {
    $pdo = udb();
    $action = $_GET['action'] ?? '';

    if ($action === 'settings_get') { jexit(['settings' => get_settings($pdo)]); }

    // ---- admin-only beyond this point ----
    $me = null;
    if (!empty($_SESSION['uid'])) {
        $st = $pdo->prepare('SELECT id, full_name, email, role FROM users WHERE id = ?');
        $st->execute([$_SESSION['uid']]);
        $me = $st->fetch() ?: null;
    }
    if (!$me || ($me['role'] ?? '') !== 'admin') { http_response_code(403); jexit(['error' => 'forbidden']); }

    if ($action === 'users') {
        $rows = $pdo->query("SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY id DESC")->fetchAll();
        jexit(['users' => $rows, 'count' => count($rows)]);
    }
    if ($action === 'set_role') {
        $b = reqbody();
        $st = $pdo->prepare('UPDATE users SET role = ? WHERE id = ?');
        $st->execute([($b['role'] ?? '') === 'admin' ? 'admin' : 'user', (int)($b['id'] ?? 0)]);
        jexit(['ok' => true]);
    }
    if ($action === 'delete_user') {
        $b = reqbody();
        if ((int)($b['id'] ?? 0) === (int)$me['id']) jexit(['error' => 'لا يمكنك حذف حسابك']);
        $st = $pdo->prepare('DELETE FROM users WHERE id = ?');
        $st->execute([(int)($b['id'] ?? 0)]);
        jexit(['ok' => true]);
    }
    if ($action === 'settings_set') {
        $b = reqbody();
        ensure_settings($pdo);
        foreach (array_keys($GLOBALS['DEFAULTS']) as $k) if (array_key_exists($k, $b)) set_kv($pdo, $k, (string)$b[$k]);
        jexit(['ok' => true, 'settings' => get_settings($pdo)]);
    }
    jexit(['error' => 'unknown action']);
} catch (Throwable $e) {
    http_response_code(500);
    jexit(['error' => 'server error: ' . $e->getMessage()]);
}
