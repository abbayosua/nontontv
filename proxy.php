<?php
$url = $_GET['url'] ?? '';
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    exit('Invalid URL');
}

$referrer = $_GET['referrer'] ?? '';
$userAgent = $_GET['ua'] ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

$opts = [
    'http' => [
        'method' => 'GET',
        'timeout' => 30,
        'user_agent' => $userAgent,
        'follow_location' => 1,
        'max_redirects' => 5,
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ],
];

if ($referrer) {
    $opts['http']['header'] = "Referer: $referrer\r\n";
}

$context = stream_context_create($opts);

// Try to detect if it's an HLS playlist
$ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
$isHLS = in_array($ext, ['m3u8', 'm3u']) || strpos($url, '.m3u8') !== false;

if ($isHLS) {
    $content = @file_get_contents($url, false, $context);
    if ($content === false) {
        http_response_code(502);
        exit('Failed to fetch stream');
    }

    // Determine content type
    if (str_starts_with($content, '#EXTM3U')) {
        header('Content-Type: application/vnd.apple.mpegurl');
    } else {
        header('Content-Type: video/MP2T');
    }

    // If it's a master playlist, rewrite segment URLs through proxy
    if (str_starts_with($content, '#EXTM3U')) {
        $baseUrl = $url;
        $parts = explode('/', $url);
        array_pop($parts);
        $base = implode('/', $parts) . '/';

        $lines = explode("\n", $content);
        foreach ($lines as &$line) {
            $trimmed = trim($line);
            if ($trimmed && !str_starts_with($trimmed, '#') && !filter_var($trimmed, FILTER_VALIDATE_URL)) {
                $line = str_replace($trimmed, 'proxy.php?url=' . urlencode($base . $trimmed) . ($referrer ? '&referrer=' . urlencode($referrer) : '') . '&ua=' . urlencode($userAgent), $line);
            }
        }
        $content = implode("\n", $lines);
    }

    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-cache');
    echo $content;
    exit;
}

// Direct stream proxy (TS segments, etc.)
$content = @file_get_contents($url, false, $context);
if ($content === false) {
    http_response_code(502);
    exit('Failed to fetch stream');
}

$mime = mime_content_type($url) ?: 'video/mp4';
if (!$mime) {
    $ext = pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION);
    $mime = match ($ext) {
        'ts' => 'video/MP2T',
        'aac' => 'audio/aac',
        'mp4' => 'video/mp4',
        default => 'application/octet-stream',
    };
}

header('Content-Type: ' . $mime);
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache');
echo $content;
