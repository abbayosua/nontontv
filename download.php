<?php
if (PHP_SAPI !== 'cli') exit('Run this from command line: php download.php');

echo "Downloading IPTV data...\n\n";

$dir = __DIR__ . '/data';
if (!is_dir($dir)) mkdir($dir, 0755, true);

function download($url, $dest) {
    echo "Downloading " . basename($dest) . "... ";
    $start = microtime(true);
    $ctx = stream_context_create(['http' => ['timeout' => 300, 'user_agent' => 'Mozilla/5.0']]);
    $data = @file_get_contents($url, false, $ctx);
    if ($data) {
        file_put_contents($dest, $data);
        $size = round(strlen($data) / 1024 / 1024, 1);
        $time = round(microtime(true) - $start, 1);
        echo "OK ({$size}MB in {$time}s)\n";
        return $data;
    }
    echo "FAILED\n";
    return null;
}

download('https://iptv-org.github.io/api/channels.json', "$dir/channels.json");
download('https://iptv-org.github.io/api/countries.json', "$dir/countries.json");
download('https://iptv-org.github.io/api/categories.json', "$dir/categories.json");
download('https://iptv-org.github.io/api/logos.json', "$dir/logos.json");

echo "\nDownloading M3U playlist... ";
$m3u = download('https://iptv-org.github.io/iptv/index.m3u', "$dir/index.m3u");
if (!$m3u) { echo "\nFATAL: Could not download M3U\n"; exit(1); }

echo "\nParsing M3U playlist... ";
$lines = explode("\n", $m3u);
$streams = [];
$channelIds = [];
$current = null;
$extvlcopt = [];

foreach ($lines as $line) {
    $line = trim($line);
    if ($line === '') continue;

    if (str_starts_with($line, '#EXTVLCOPT:')) {
        $opt = substr($line, 11);
        if (str_starts_with($opt, 'http-referrer=')) {
            $extvlcopt['referrer'] = substr($opt, 14);
        } elseif (str_starts_with($opt, 'http-user-agent=')) {
            $extvlcopt['user_agent'] = substr($opt, 16);
        }
        continue;
    }

    if (str_starts_with($line, '#EXTINF:')) {
        $current = ['referrer' => null, 'user_agent' => null, 'quality' => null, 'label' => null];
        $extvlcopt = [];

        preg_match('/tvg-id="([^"]*)"/', $line, $m);
        $channel = $m[1] ?? '';
        if (str_contains($channel, '@')) $channel = substr($channel, 0, strpos($channel, '@'));
        $current['channel'] = $channel ?: null;

        preg_match('/http-referrer="([^"]*)"/', $line, $m);
        if (!empty($m[1])) $current['referrer'] = $m[1];

        preg_match('/http-user-agent="([^"]*)"/', $line, $m);
        if (!empty($m[1])) $current['user_agent'] = $m[1];

        $commaPos = strrpos($line, ',');
        if ($commaPos !== false) {
            $name = trim(substr($line, $commaPos + 1));
            $current['title'] = $name;
            if (preg_match('/\((\d+p)\)/', $name, $qm)) {
                $current['quality'] = $qm[1];
            } elseif (preg_match('/\((\d+i)\)/', $name, $qm)) {
                $current['quality'] = $qm[1];
            }
        }
        continue;
    }

    if (!str_starts_with($line, '#') && $current) {
        $current['url'] = $line;
        if (isset($extvlcopt['referrer'])) $current['referrer'] = $extvlcopt['referrer'];
        if (isset($extvlcopt['user_agent'])) $current['user_agent'] = $extvlcopt['user_agent'];
        if ($current['channel']) {
            $streams[] = $current;
            $channelIds[$current['channel']] = true;
        }
        $current = null;
    }
}

file_put_contents("$dir/streams.json", json_encode($streams));
file_put_contents("$dir/streams_index.json", json_encode(array_keys($channelIds)));
echo "OK (" . count($streams) . " streams, " . count($channelIds) . " channels)\n";

echo "\nBuilding logo index... ";
$logos = json_decode(file_get_contents("$dir/logos.json"), true);
$logoIndex = [];
foreach ($logos as $l) {
    $ch = $l['channel'] ?? '';
    if ($ch && ($l['in_use'] ?? false) && !isset($logoIndex[$ch])) {
        $logoIndex[$ch] = $l['url'];
    }
}
file_put_contents("$dir/logos_index.json", json_encode($logoIndex));
echo "(" . count($logoIndex) . " logos)\n";

echo "\nDone.\n";
