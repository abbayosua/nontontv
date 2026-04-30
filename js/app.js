const API = {
    channels: 'index.php?action=channels',
    countries: 'index.php?action=countries',
    categories: 'index.php?action=categories',
    streams: 'index.php?action=streams&channel=',
    logos: 'index.php?action=logos&channel=',
};

let currentPage = 1;
let dp = null;
let retryTimer = null;

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
        return `<div class="channel-item" onclick="selectChannel('${ch.id}')" data-id="${ch.id}">
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

function detectStreamType(url) {
    const u = url.toLowerCase();
    if (u.includes('.m3u8')) return 'hls';
    if (u.includes('.flv')) return 'flv';
    if (u.includes('.mpd')) return 'dash';
    return 'auto';
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

    if (dp) { dp.destroy(); dp = null; }

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`.channel-item[data-id="${channelId}"]`);
    if (activeEl) activeEl.classList.add('active');

    $('playerPlaceholder').style.display = 'none';
    $('dplayer').style.display = 'block';

    const quality = streams.map(s => {
        let url = s.url;
        if (s.referrer || s.user_agent) {
            url = `proxy.php?url=${encodeURIComponent(s.url)}${s.referrer ? '&referrer=' + encodeURIComponent(s.referrer) : ''}${s.user_agent ? '&ua=' + encodeURIComponent(s.user_agent) : ''}`;
        }
        return {
            name: s.quality || 'Auto',
            url: url,
            type: detectStreamType(url),
        };
    });

    try {
        dp = new DPlayer({
            container: document.getElementById('dplayer'),
            autoplay: true,
            live: true,
            screenshot: true,
            hotkey: true,
            theme: '#4f8cff',
            video: {
                quality: quality,
                defaultQuality: 0,
                pic: logoUrl,
            },
        });

        dp.on('canplay', () => dp.notice('Live', 2000));
        dp.on('error', () => dp.notice('Stream error', 3000));
        dp.on('waiting', () => {});
        dp.on('playing', () => dp.notice('Live', 2000));
    } catch (e) {
        console.error('DPlayer init error:', e);
        $('playerPlaceholder').style.display = 'flex';
        $('dplayer').style.display = 'none';
    }

    showLoadingBar(false);
}

loadCountries();
loadCategories();
loadChannels(1);
