<?php
if (PHP_SAPI !== 'cli') exit('Run this from command line: php download.php');

echo "Downloading IPTV data...\n\n";

$files = [
    'channels.json'  => 'https://iptv-org.github.io/api/channels.json',
    'streams.json'   => 'https://iptv-org.github.io/api/streams.json',
    'countries.json' => 'https://iptv-org.github.io/api/countries.json',
    'categories.json'=> 'https://iptv-org.github.io/api/categories.json',
    'logos.json'     => 'https://iptv-org.github.io/api/logos.json',
];

$dir = __DIR__ . '/data';
if (!is_dir($dir)) mkdir($dir, 0755, true);

foreach ($files as $name => $url) {
    $dest = "$dir/$name";
    echo "Downloading $name... ";
    $start = microtime(true);
    $ctx = stream_context_create(['http' => ['timeout' => 300, 'user_agent' => 'Mozilla/5.0']]);
    $data = @file_get_contents($url, false, $ctx);
    if ($data) {
        file_put_contents($dest, $data);
        $size = round(strlen($data) / 1024 / 1024, 1);
        $time = round(microtime(true) - $start, 1);
        echo "OK ({$size}MB in {$time}s)\n";
    } else {
        echo "FAILED\n";
    }
}

echo "\nBuilding stream index... ";
$streams = json_decode(file_get_contents("$dir/streams.json"), true);
$channelIds = [];
foreach ($streams as $s) {
    if (!empty($s['channel'])) $channelIds[$s['channel']] = true;
}
file_put_contents("$dir/streams_index.json", json_encode(array_keys($channelIds)));
echo "(" . count($channelIds) . " channels with streams)\n";

echo "\nDone. Downloaded " . count($files) . " files to data/\n";
