const API = {
    channels: 'index.php?action=channels',
    countries: 'index.php?action=countries',
    categories: 'index.php?action=categories',
    streams: 'index.php?action=streams&channel=',
    logos: 'index.php?action=logos&channel=',
};

let currentChannel = null;
let currentPage = 1;
let hls = null;

function $(id) { return document.getElementById(id); }

function showLoadingBar(show) {
    const bar = $('loadingBar');
    bar.classList.toggle('active', show);
    if (show) bar.style.width = '60%';
    else { bar.style.width = '100%'; setTimeout(() => { bar.style.width = '0'; bar.classList.remove('active'); }, 300); }
}

async function fetchJSON(url) {
    try {
        showLoadingBar(true);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error('Fetch error:', e);
        return null;
    } finally {
        showLoadingBar(false);
    }
}

async function loadCountries() {
    const data = await fetchJSON(API.countries);
    if (!data) return;
    const sel = $('countryFilter');
    data.sort((a, b) => a.name.localeCompare(b.name));
    data.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = `${c.flag} ${c.name}`;
        sel.appendChild(opt);
    });
}

async function loadCategories() {
    const data = await fetchJSON(API.categories);
    if (!data) return;
    const sel = $('categoryFilter');
    data.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
    });
}

async function loadChannels(page) {
    currentPage = page || 1;
    const country = $('countryFilter').value;
    const category = $('categoryFilter').value;
    const search = $('searchInput').value.trim();

    let url = `${API.channels}&page=${currentPage}`;
    if (country) url += `&country=${country}`;
    if (category) url += `&category=${category}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const data = await fetchJSON(url);
    if (!data || data.error) {
        $('channelList').innerHTML = '<div class="loading" style="padding:20px">Data not found. Run: <code>php download.php</code></div>';
        return;
    }

    $('channelCount').textContent = `${data.total.toLocaleString()} channels`;
    renderChannelList(data.items);
    renderPagination(data);
}

function renderChannelList(channels) {
    const list = $('channelList');
    if (!channels.length) {
        list.innerHTML = '<div class="loading" style="padding:20px">No channels found</div>';
        return;
    }

    list.innerHTML = channels.map(ch => {
        const logo = `https://raw.githubusercontent.com/iptv-org/database/master/logos/${ch.id}.png`;
        const country = ch.country || '';
        const cats = (ch.categories || []).join(', ');
        const active = currentChannel && currentChannel.id === ch.id ? 'active' : '';
        return `<div class="channel-item ${active}" onclick="selectChannel('${ch.id}')" data-id="${ch.id}">
            <img class="ch-logo" src="${logo}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 36 36%22><rect fill=%22%232a2a30%22 width=%2236%22 height=%2236%22/><text x=%2218%22 y=%2222%22 text-anchor=%22middle%22 fill=%22%23888890%22 font-size=%2214%22>${(ch.name[0]||'?').toUpperCase()}</text></svg>'">
            <div class="ch-info">
                <div class="ch-name">${ch.name}</div>
                <div class="ch-meta">${country}${cats ? ' · ' + cats : ''}</div>
            </div>
        </div>`;
    }).join('');
}

function renderPagination(data) {
    const pag = $('pagination');
    if (data.totalPages <= 1) { pag.innerHTML = ''; return; }

    let html = '';
    if (data.page > 1) html += `<button onclick="loadChannels(${data.page - 1})">Prev</button>`;

    const start = Math.max(1, data.page - 2);
    const end = Math.min(data.totalPages, data.page + 2);
    if (start > 1) html += `<button onclick="loadChannels(1)">1</button>${start > 2 ? '<button disabled>...</button>' : ''}`;
    for (let i = start; i <= end; i++) {
        html += `<button class="${i === data.page ? 'active' : ''}" onclick="loadChannels(${i})">${i}</button>`;
    }
    if (end < data.totalPages) html += `${end < data.totalPages - 1 ? '<button disabled>...</button>' : ''}<button onclick="loadChannels(${data.totalPages})">${data.totalPages}</button>`;
    if (data.page < data.totalPages) html += `<button onclick="loadChannels(${data.page + 1})">Next</button>`;

    pag.innerHTML = html;
}

let searchTimeout = null;
function debouncedSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadChannels(1), 400);
}

async function selectChannel(channelId) {
    showLoadingBar(true);

    const streams = await fetchJSON(API.streams + channelId);
    if (!streams || streams.length === 0) {
        showLoadingBar(false);
        return;
    }

    const logos = await fetchJSON(API.logos + channelId);
    const logoUrl = logos && logos.length > 0 ? logos[0].url : `https://raw.githubusercontent.com/iptv-org/database/master/logos/${channelId}.png`;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`.channel-item[data-id="${channelId}"]`);
    if (activeEl) activeEl.classList.add('active');

    $('playerPlaceholder').style.display = 'none';
    $('playerWrapper').style.display = 'flex';

    let streamHtml = '<div class="stream-selector">';
    streams.forEach((s, i) => {
        const label = s.quality ? `${s.title} (${s.quality})` : s.title;
        streamHtml += `<button class="stream-btn ${i === 0 ? 'active' : ''}" onclick="playStream(${i})" data-idx="${i}">${label}</button>`;
    });
    streamHtml += '</div>';
    const oldSelector = $('playerWrapper').querySelector('.stream-selector');
    if (oldSelector) oldSelector.remove();

    $('playerInfo').innerHTML = `
        <img class="pi-logo" src="${logoUrl}" alt="" onerror="this.style.display='none'">
        <div class="pi-name">${streams[0].title || channelId}</div>
        <div class="pi-status"><span class="dot buffering" id="statusDot"></span><span id="statusText">Loading...</span></div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = streamHtml;
    $('playerWrapper').insertBefore(wrapper.firstElementChild, $('playerInfo'));

    currentChannel = { id: channelId, streams, currentIdx: 0 };
    playStream(0);
    showLoadingBar(false);
}

function playStream(idx) {
    if (!currentChannel || !currentChannel.streams[idx]) return;
    currentChannel.currentIdx = idx;

    const stream = currentChannel.streams[idx];
    const video = $('videoPlayer');

    document.querySelectorAll('.stream-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.stream-btn[data-idx="${idx}"]`);
    if (btn) btn.classList.add('active');

    if (hls) { hls.destroy(); hls = null; }

    const url = stream.url;
    const needsProxy = stream.referrer || stream.user_agent;

    let streamUrl = url;
    if (needsProxy) {
        streamUrl = `proxy.php?url=${encodeURIComponent(url)}${stream.referrer ? '&referrer=' + encodeURIComponent(stream.referrer) : ''}${stream.user_agent ? '&ua=' + encodeURIComponent(stream.user_agent) : ''}`;
    }

    updateStatus('buffering', 'Connecting...');

    if (Hls.isSupported() && (streamUrl.includes('.m3u8') || needsProxy)) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true, fragLoadingTimeOut: 30000, manifestLoadingTimeOut: 30000 });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); updateStatus('live', 'Live'); });
        hls.on(Hls.Events.ERROR, (e, data) => { if (data.fatal) updateStatus('error', 'Stream error'); });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); updateStatus('live', 'Live'); });
        video.addEventListener('error', () => updateStatus('error', 'Playback error'));
    } else {
        video.src = streamUrl;
        video.play().catch(() => updateStatus('error', 'Cannot play this stream'));
        updateStatus('live', 'Live');
    }

    video.addEventListener('waiting', () => updateStatus('buffering', 'Buffering...'));
    video.addEventListener('playing', () => updateStatus('live', 'Live'));
    video.addEventListener('stalled', () => updateStatus('buffering', 'Stalled...'));
}

function updateStatus(type, text) {
    const dot = $('statusDot');
    const txt = $('statusText');
    if (dot) dot.className = 'dot ' + type;
    if (txt) txt.textContent = text;
}

loadCountries();
loadCategories();
loadChannels(1);

document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        const video = $('videoPlayer');
        if (video.paused) video.play(); else video.pause();
    }
    if (e.key === 'f' || e.key === 'F') { const video = $('videoPlayer'); if (video.requestFullscreen) video.requestFullscreen(); }
    if (e.key === 'm' || e.key === 'M') { const video = $('videoPlayer'); video.muted = !video.muted; }
});
