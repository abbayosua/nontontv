<?php
error_reporting(0);
define('DATA_DIR', __DIR__ . '/data');

function loadJSON($file) {
    $path = DATA_DIR . '/' . $file;
    if (!is_file($path)) return null;
    return json_decode(file_get_contents($path), true);
}

$action = $_GET['action'] ?? '';

if ($action === 'channels') {
    $channels = loadJSON('channels.json');
    if (!$channels) { http_response_code(500); echo json_encode(['error' => 'Run php download.php first']); exit; }

    $hasStreams = loadJSON('streams_index.json');
    $streamSet = $hasStreams ? array_flip($hasStreams) : [];

    $page = max(1, intval($_GET['page'] ?? 1));
    $perPage = 50;
    $country = $_GET['country'] ?? '';
    $category = $_GET['category'] ?? '';
    $search = $_GET['search'] ?? '';

    $channels = array_values(array_filter($channels, fn($c) => isset($streamSet[$c['id'] ?? ''])));

    if ($country) {
        $channels = array_values(array_filter($channels, fn($c) => strtolower($c['country'] ?? '') === strtolower($country)));
    }
    if ($category) {
        $channels = array_values(array_filter($channels, fn($c) => in_array($category, $c['categories'] ?? [])));
    }
    if ($search) {
        $s = strtolower($search);
        $channels = array_values(array_filter($channels, fn($c) => strpos(strtolower($c['name'] ?? ''), $s) !== false || strpos(strtolower($c['id'] ?? ''), $s) !== false));
    }

    $total = count($channels);
    $totalPages = ceil($total / $perPage);
    $offset = ($page - 1) * $perPage;

    header('Content-Type: application/json');
    echo json_encode(['items' => array_slice($channels, $offset, $perPage), 'total' => $total, 'page' => $page, 'totalPages' => $totalPages]);
    exit;
}

if ($action === 'countries') {
    header('Content-Type: application/json');
    echo json_encode(loadJSON('countries.json') ?: []);
    exit;
}

if ($action === 'categories') {
    header('Content-Type: application/json');
    echo json_encode(loadJSON('categories.json') ?: []);
    exit;
}

if ($action === 'streams') {
    $channelId = $_GET['channel'] ?? '';
    if (!$channelId) { http_response_code(400); exit('Missing channel id'); }

    $streams = loadJSON('streams.json') ?: [];
    $matches = array_values(array_filter($streams, fn($s) => ($s['channel'] ?? '') === $channelId));
    header('Content-Type: application/json');
    echo json_encode($matches);
    exit;
}

if ($action === 'logos') {
    $channelId = $_GET['channel'] ?? '';
    if (!$channelId) { http_response_code(400); exit('Missing channel id'); }

    $logos = loadJSON('logos.json') ?: [];
    $matches = array_values(array_filter($logos, fn($l) => ($l['channel'] ?? '') === $channelId && ($l['in_use'] ?? false)));
    header('Content-Type: application/json');
    echo json_encode($matches);
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NontonTV - IPTV Player</title>
<link rel="stylesheet" href="css/style.css">
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script src="https://cdn.jsdelivr.net/npm/dplayer@latest/dist/DPlayer.min.js"></script>
</head>
<body>
<div id="loadingBar"></div>
<div id="app">
    <header>
        <div class="logo">NontonTV</div>
        <div class="search-bar">
            <input type="text" id="searchInput" placeholder="Search channels..." oninput="debouncedSearch()">
        </div>
        <div class="filters">
            <select id="countryFilter" onchange="loadChannels(1)"><option value="">All Countries</option></select>
            <select id="categoryFilter" onchange="loadChannels(1)"><option value="">All Categories</option></select>
        </div>
    </header>

    <div class="main">
        <aside id="sidebar">
            <div class="channel-count" id="channelCount"></div>
            <div class="channel-list" id="channelList"></div>
            <div class="pagination" id="pagination"></div>
        </aside>

        <main id="playerArea">
            <div class="player-placeholder" id="playerPlaceholder">
                <div class="placeholder-icon">&#9654;</div>
                <h2>Select a channel to start watching</h2>
                <p>Browse channels from the list or search for your favorite channel</p>
            </div>
            <div id="dplayer" style="display:none"></div>
        </main>
    </div>
</div>

<script src="js/app.js"></script>
</body>
</html>
