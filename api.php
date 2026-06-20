<?php
// JSON API for the lands app. Actions: ping, meta, plots, plot.
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
require __DIR__ . '/config.php';

$SORTABLE = ['id','city','city_en','project','zone_id','block','plot','area','base_per_m',
             'corner','garden','sea','total_per_m','total_price','down_payment'];

function param($k, $d = null) { return isset($_GET[$k]) && $_GET[$k] !== '' ? $_GET[$k] : $d; }

try {
    $action = param('action', 'plots');
    $pdo = db();

    if ($action === 'ping') { echo json_encode(['ok' => true]); exit; }

    if ($action === 'meta') {
        $totals = $pdo->query("SELECT COUNT(*) plots, COUNT(DISTINCT city) cities, COUNT(DISTINCT zone_id) zones,
                               COUNT(DISTINCT project) projects, ROUND(SUM(area)) area, ROUND(SUM(total_price)) value
                               FROM plots")->fetch();
        $cities = $pdo->query("SELECT city name, city_en en, COUNT(*) count, ROUND(SUM(total_price)) value,
                               ROUND(SUM(area)) area FROM plots GROUP BY city, city_en ORDER BY count DESC")->fetchAll();
        $ranges = $pdo->query("SELECT MIN(area) amin, MAX(area) amax, MIN(total_per_m) pmin, MAX(total_per_m) pmax,
                               MIN(total_price) tmin, MAX(total_price) tmax, MIN(down_payment) dmin, MAX(down_payment) dmax
                               FROM plots")->fetch();
        echo json_encode(['totals' => $totals, 'cities' => $cities, 'ranges' => $ranges], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'plot') {
        $st = $pdo->prepare("SELECT * FROM plots WHERE id = ?");
        $st->execute([(int)param('id', 0)]);
        echo json_encode($st->fetch() ?: null, JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---- action=plots : filter + sort + paginate ----
    $where = []; $args = [];

    $cities = param('cities');
    if ($cities) {
        $list = explode(',', $cities);
        $where[] = 'city IN (' . implode(',', array_fill(0, count($list), '?')) . ')';
        foreach ($list as $c) $args[] = $c;
    }
    $rangeMap = ['pmin'=>['total_per_m','>='],'pmax'=>['total_per_m','<='],
                 'amin'=>['area','>='],'amax'=>['area','<='],
                 'tmin'=>['total_price','>='],'tmax'=>['total_price','<='],
                 'dmin'=>['down_payment','>='],'dmax'=>['down_payment','<=']];
    foreach ($rangeMap as $p => $cfg) {
        $v = param($p);
        if ($v !== null && is_numeric($v)) { $where[] = "{$cfg[0]} {$cfg[1]} ?"; $args[] = (float)$v; }
    }
    $prem = param('prem');
    if ($prem === 'any')    $where[] = 'has_premium = 1';
    elseif ($prem === 'none') $where[] = 'has_premium = 0';
    elseif ($prem === 'corner') $where[] = 'corner > 0';
    elseif ($prem === 'garden') $where[] = 'garden > 0';
    elseif ($prem === 'sea')    $where[] = 'sea > 0';

    $q = param('q');
    if ($q) {
        $like = '%' . $q . '%';
        $where[] = '(city LIKE ? OR block LIKE ? OR project LIKE ? OR CAST(plot AS CHAR) LIKE ?)';
        array_push($args, $like, $like, $like, $like);
    }

    $wsql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $sort = param('sort', 'total_price');
    if (!in_array($sort, $GLOBALS['SORTABLE'], true)) $sort = 'total_price';
    $dir = strtolower(param('dir', 'desc')) === 'asc' ? 'ASC' : 'DESC';

    $per = max(1, min(10000, (int)param('per', 50)));
    $page = max(1, (int)param('page', 1));
    $offset = ($page - 1) * $per;

    $cnt = $pdo->prepare("SELECT COUNT(*) FROM plots $wsql");
    $cnt->execute($args);
    $total = (int)$cnt->fetchColumn();

    $sql = "SELECT * FROM plots $wsql ORDER BY $sort $dir, id ASC LIMIT $per OFFSET $offset";
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();

    echo json_encode([
        'total' => $total, 'page' => $page, 'per' => $per,
        'pages' => max(1, (int)ceil($total / $per)), 'rows' => $rows
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
