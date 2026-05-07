import { APP_KEYS_TO_UIOHOOK } from './VirtualKeyboard';

const MAX_LOG_ENTRIES = 50;

function padded(n: number): string {
    return String(n).padStart(2, '0');
}

function timestamp(): string {
    const d = new Date();
    return `${padded(d.getHours())}:${padded(d.getMinutes())}:${padded(d.getSeconds())}`;
}

export function getKeyLabel(keyCode: number): string {
    for (const [char, code] of Object.entries(APP_KEYS_TO_UIOHOOK)) {
        if (code === keyCode) return char;
    }
    return String(keyCode);
}

export function uiLog(message: string, type: string = 'default'): void {
    const container = document.getElementById('console-log');
    if (!container) return;

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = timestamp();
    entry.appendChild(time);

    const text = document.createTextNode(message);
    entry.appendChild(text);

    container.appendChild(entry);

    const panelBody = container.parentElement;
    if (panelBody) {
        panelBody.scrollTop = panelBody.scrollHeight;
    }

    while (container.children.length > MAX_LOG_ENTRIES) {
        if (container.firstChild) container.removeChild(container.firstChild);
    }
}

export function markLogUnread(): void {
    const container = document.getElementById('console-log');
    if (!container) return;

    const existing = container.querySelector('.log-unread-separator');
    if (existing) existing.remove();

    const sep = document.createElement('div');
    sep.className = 'log-unread-separator';
    sep.textContent = '--- UNREAD ---';
    container.appendChild(sep);

    const panelBody = container.parentElement;
    if (panelBody) {
        panelBody.scrollTop = panelBody.scrollHeight;
    }
}

const MODE_INFO: Record<string, string> = {
    neutral: `<p class="mode-info-hint">NEUTRAL MODE.\nPress keys to trigger assigned effects.</p>`,
    send: `
        <p class="mode-info-hint">TRANSMIT MODE.<br>Find receivers on LAN.</p>
        <div class="mode-info-section">
            <button id="btn-osc-scan" class="cyber-btn accent" style="width: 100%; display: block; font-size: 0.75rem; padding: 6px;">SCAN NETWORK</button>
            <div id="osc-device-list" style="margin-top: 8px;"></div>
        </div>
        <div class="mode-info-section" id="osc-manual-section">
            <h4>MANUAL IP</h4>
            <input type="text" id="osc-target-ip" class="cyber-input" style="text-align: center; margin-top: 5px; width: 100%; box-sizing: border-box; font-size: 0.9rem; padding: 6px;" placeholder="192.168.x.x">
            <button id="btn-osc-connect" class="cyber-btn accent" style="width: 100%; display: block; margin-top: 8px; font-size: 0.75rem; padding: 6px;">CONNECT</button>
        </div>`,
    receive: `
        <p class="mode-info-hint">RECEIVE MODE.<br>Awaiting incoming data packets on port 8000...</p>
        <div class="mode-info-section">
            <h4>LOCAL HOST IPs</h4>
            <div id="osc-local-ip-list"></div>
        </div>
        <div class="mode-info-section">
            <h4>CONNECTED DEVICE</h4>
            <div class="mode-info-item" id="osc-connected-devices" style="text-align: center; font-family: monospace; color: var(--text-muted);">(NONE)</div>
        </div>`
};

export function setupModeInfoPanel(onModeSwitch?: (mode: string) => void): void {
    const body = document.getElementById('mode-info-body');
    if (!body) return;

    document.querySelectorAll('.cyber-btn.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;

            document.querySelectorAll('.cyber-btn.tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = (btn as HTMLElement).dataset.mode || 'neutral';
            body.innerHTML = MODE_INFO[mode] || '';

            if (onModeSwitch) onModeSwitch(mode);
        });
    });
}
