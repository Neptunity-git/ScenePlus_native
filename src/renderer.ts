import { EffectManager } from './engine/EffectManager';
import { VirtualKeyboard } from './ui/VirtualKeyboard';
import { EffectLibrary } from './ui/EffectLibrary';
import { PersistenceManager } from './ui/PersistenceManager';
import { ConfigModal } from './ui/ConfigModal';
import { uiLog, setupModeInfoPanel, markLogUnread, getKeyLabel } from './ui/UILogger';

const diagModal = document.getElementById('diagnostic-modal') as HTMLElement;
const diagErrorMsg = document.getElementById('diag-error-msg') as HTMLElement;
const diagTemplateArea = document.getElementById('diag-template-area') as HTMLTextAreaElement;
const btnCloseDiag = document.getElementById('btn-close-diag') as HTMLElement;
const btnCopyDiag = document.getElementById('btn-copy-diag') as HTMLElement;

const indicatorSync = document.getElementById('sync-indicator') as HTMLElement;
let activeSyncCount = 0;

const effectManager = new EffectManager(5);
const virtualKeyboard = new VirtualKeyboard('keyboard-grid', effectManager);
const effectLibrary = new EffectLibrary('library-grid', effectManager);
const persistence = new PersistenceManager(effectManager, effectLibrary, virtualKeyboard);
const configModal = new ConfigModal(persistence);

const offIndicator = document.getElementById('off-indicator') as HTMLElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLElement;
const libraryGrid = document.getElementById('library-grid') as HTMLElement;
const btnAddEffect = document.getElementById('btn-add-effect') as HTMLElement;

const importOverlay = document.getElementById('import-overlay') as HTMLElement;
const importBar = document.getElementById('import-progress-bar') as HTMLElement;
const importStatusText = document.getElementById('import-status-text') as HTMLElement;
const importPercentText = document.getElementById('import-percent-text') as HTMLElement;
let isImporting = false;

let currentNetworkMode = 'neutral';
let activeTargetIp = '';
let activeHttpPort = 0;
let pendingTargetIp = '';
let pingTimeoutId: any = null;

let discoveredDevices: string[] = [];
let receivedConnections = new Map<string, {port: number, lastSeen: number}>();

setupModeInfoPanel(async (mode: string) => {
    currentNetworkMode = mode;
    activeTargetIp = ''; 
    pendingTargetIp = '';
    activeHttpPort = 0;
    if (pingTimeoutId) clearTimeout(pingTimeoutId);
    pingTimeoutId = null;
    
    if (mode === 'neutral') {
        await window.api.stopOscServer();
        await window.api.stopHttpServer();
    } else {
        const startRes = await window.api.startOscServer();
        if (!startRes.success) {
            uiLog('Failed to bind UDP port 8000', 'error');
        }
        
        if (mode === 'send') {
            const httpRes = await window.api.startHttpServer();
            if (httpRes.success && httpRes.port) {
                activeHttpPort = httpRes.port;
            } else {
                uiLog(`Failed to start HTTP server: ${httpRes.error}`, 'error');
            }
        } else {
            await window.api.stopHttpServer();
        }
    }
    
    if (mode === 'receive') {
        const allIps = await window.api.getAllLocalIps();
        const ipListEl = document.getElementById('osc-local-ip-list');
        if (ipListEl) {
            ipListEl.innerHTML = '';
            allIps.forEach(entry => {
                const item = document.createElement('div');
                item.className = 'mode-info-item cyber-ip-display';
                item.style.marginBottom = '4px';
                item.innerHTML = `<div style="font-size: 1.1rem;">${entry.ip}</div><div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 2px;">${entry.name}</div>`;
                ipListEl.appendChild(item);
            });
            if (allIps.length === 0) {
                ipListEl.innerHTML = '<div class="mode-info-item" style="text-align: center; color: var(--text-muted);">No IPv4 interfaces found</div>';
            }
        }
        
        const devs = document.getElementById('osc-connected-devices');
        if (devs) {
            devs.textContent = '(NONE)';
            devs.style.color = 'var(--text-muted)';
            devs.style.textShadow = 'none';
        }
        receivedConnections.clear();
        
        uiLog('RECEIVE MODE: Listening on port 8000', 'import');
    } else if (mode === 'send') {
        uiLog('TRANSMIT: Scan or enter IP manually', 'default');
        
        const btnScan = document.getElementById('btn-osc-scan');
        const deviceList = document.getElementById('osc-device-list');
        const btnConnect = document.getElementById('btn-osc-connect');
        const inputIp = document.getElementById('osc-target-ip') as HTMLInputElement;
        
        if (btnScan && deviceList) {
            btnScan.addEventListener('click', async () => {
                btnScan.textContent = 'SCANNING...';
                btnScan.style.color = 'var(--neon-yellow)';
                btnScan.style.borderColor = 'var(--neon-yellow)';
                deviceList.innerHTML = '';
                discoveredDevices = [];
                
                uiLog('Scanning local subnets...', 'default');
                const result = await window.api.scanSubnet();
                if (result.subnets) {
                    uiLog(`Scanning ${result.subnets.length} subnet(s): ${result.subnets.join(', ')}`, 'default');
                }
                
                setTimeout(() => {
                    btnScan.textContent = 'SCAN NETWORK';
                    btnScan.style.color = '';
                    btnScan.style.borderColor = '';
                    if (discoveredDevices.length === 0) {
                        deviceList.innerHTML = '<div style="color: var(--text-muted); text-align: center; font-size: 0.8rem; padding: 5px;">(No devices found)</div>';
                        uiLog('No receivers found on LAN', 'error');
                    } else {
                        uiLog(`Found ${discoveredDevices.length} receiver(s)`, 'import');
                    }
                }, 2000);
            });
        }
        
        if (btnConnect && inputIp) {
            const doConnect = () => {
                let ipStr = inputIp.value.trim();
                if (!ipStr) {
                    uiLog('ERROR: IP is empty', 'error');
                    return;
                }
                if (ipStr.includes(':')) {
                    ipStr = ipStr.split(':')[0];
                    inputIp.value = ipStr;
                }
                const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (ipv4Regex.test(ipStr)) {
                    attemptConnection(ipStr, btnConnect);
                } else {
                    uiLog('ERROR: Invalid IPv4 format', 'error');
                }
            };
            btnConnect.addEventListener('click', doConnect);
            inputIp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') doConnect();
            });
        }
    }
});

function attemptConnection(ip: string, btn: HTMLElement | null) {
    pendingTargetIp = ip;
    if (btn) {
        btn.textContent = 'CONNECTING...';
        btn.style.borderColor = 'var(--neon-yellow)';
        btn.style.color = 'var(--neon-yellow)';
    }
    uiLog(`PINGING ${ip}...`, 'default');
    window.api.sendOsc(ip, '/sceneplus/sys/ping', [activeHttpPort]);
    
    if (pingTimeoutId) clearTimeout(pingTimeoutId);
    pingTimeoutId = setTimeout(() => {
        uiLog(`CONNECTION FAILED: No response from ${ip}`, 'error');
        if (btn) {
            btn.textContent = 'CONNECT';
            btn.style.borderColor = '';
            btn.style.color = '';
        }
        pendingTargetIp = '';
    }, 2000);
}

function addDiscoveredDevice(ip: string) {
    if (discoveredDevices.includes(ip)) return;
    discoveredDevices.push(ip);
    
    const deviceList = document.getElementById('osc-device-list');
    if (!deviceList) return;
    
    const item = document.createElement('div');
    item.className = 'osc-device-item';
    item.textContent = ip;
    item.style.cssText = 'background: rgba(20, 250, 200, 0.05); border: 1px solid rgba(20, 250, 200, 0.3); padding: 6px 8px; margin-bottom: 4px; font-family: monospace; font-size: 0.85rem; color: var(--neon-cyan); cursor: pointer; text-align: center; transition: all 0.2s;';
    item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(20, 250, 200, 0.15)';
        item.style.boxShadow = '0 0 8px rgba(20, 250, 200, 0.3)';
    });
    item.addEventListener('mouseleave', () => {
        item.style.background = 'rgba(20, 250, 200, 0.05)';
        item.style.boxShadow = 'none';
    });
    item.addEventListener('click', () => {
        attemptConnection(ip, null);
    });
    deviceList.appendChild(item);
}

function refreshConnectedDevicesUI() {
    const devs = document.getElementById('osc-connected-devices');
    if (!devs) return;

    if (receivedConnections.size === 0) {
        devs.textContent = '(NONE)';
        devs.style.color = 'var(--text-muted)';
        devs.style.textShadow = 'none';
        return;
    }

    const ips = Array.from(receivedConnections.keys());
    devs.textContent = ips.join(', ');
    devs.style.color = 'var(--neon-green)';
    devs.style.textShadow = '0 0 5px var(--neon-green)';
}

persistence.restore().then(() => {
    uiLog('Session restored from disk.', 'import');
    refreshPresetNamesUI(persistence.state.presetNames);
}).catch((err: any) => {
    uiLog(`Restore failed: ${err.message}`, 'error');
});

configModal.onConfigSaved = (newNames: Record<number, string>) => {
    refreshPresetNamesUI(newNames);
    uiLog('Global System Configuration Saved', 'default');
};

function updateSyncIndicator() {
    if (!indicatorSync) return;
    if (activeSyncCount > 0) {
        indicatorSync.classList.remove('hidden');
    } else {
        indicatorSync.classList.add('hidden');
    }
}

const configBtn = document.querySelector('.cyber-btn.icon');
if (configBtn) {
    configBtn.addEventListener('click', () => {
        configModal.open(currentNetworkMode);
    });
}

const presetBtns = document.querySelectorAll('.cyber-btn.preset');
presetBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
        persistence.switchPreset(idx + 1);
        uiLog(`Switched to Preset ${idx + 1}`, 'default');
    });
});

function refreshPresetNamesUI(namesObj: Record<string, string>) {
    if (!namesObj) return;
    presetBtns.forEach((btn, idx) => {
        const i = (idx + 1).toString();
        if (namesObj[i]) btn.textContent = namesObj[i];
    });
}

virtualKeyboard.onAssignmentChanged = () => persistence.save();

let lastSettingsOpen = false;
window.api.onStateChanged((state) => {
    if (configModal) configModal.close();
    if (virtualKeyboard) virtualKeyboard.dismissPopup();
    if (diagModal) diagModal.classList.add('hidden');

    if (state.settingsOpen) {
        settingsPanel.classList.remove('hidden');
        effectLibrary._applyFilters();
    } else {
        if (lastSettingsOpen) {
            markLogUnread();
        }
        settingsPanel.classList.add('hidden');
    }
    lastSettingsOpen = state.settingsOpen;

    if (!state.engineOn && !state.settingsOpen) {
        offIndicator.classList.remove('hidden');
    } else {
        offIndicator.classList.add('hidden');
    }
});

window.currentMousePos = { x: 0, y: 0 };
window.api.onMouseMove((pos) => {
    window.currentMousePos = pos;
    document.querySelectorAll('iframe').forEach(ifr => {
       if (ifr.contentWindow) {
           ifr.contentWindow.postMessage({ source: 'sceneplus-engine', type: 'mousemove', pos }, '*');
       }
    });
});

const MOUSE_BUTTON_NAMES: Record<number, string> = {
    1: 'left', 2: 'right', 3: 'middle', 4: 'side1', 5: 'side2'
};

window.api.onMouseDown((data) => {
    const buttonName = MOUSE_BUTTON_NAMES[data.button] || `button${data.button}`;
    document.querySelectorAll('iframe').forEach(ifr => {
        if (ifr.contentWindow) {
            ifr.contentWindow.postMessage({
                source: 'sceneplus-engine',
                type: 'mousedown',
                button: buttonName,
                buttonCode: data.button,
                x: data.x,
                y: data.y,
                clicks: data.clicks
            }, '*');
        }
    });
});

window.api.onMouseUp((data) => {
    const buttonName = MOUSE_BUTTON_NAMES[data.button] || `button${data.button}`;
    document.querySelectorAll('iframe').forEach(ifr => {
        if (ifr.contentWindow) {
            ifr.contentWindow.postMessage({
                source: 'sceneplus-engine',
                type: 'mouseup',
                button: buttonName,
                buttonCode: data.button,
                x: data.x,
                y: data.y
            }, '*');
        }
    });
});

window.api.onMouseWheel((data) => {
    document.querySelectorAll('iframe').forEach(ifr => {
        if (ifr.contentWindow) {
            ifr.contentWindow.postMessage({
                source: 'sceneplus-engine',
                type: 'mousewheel',
                x: data.x,
                y: data.y,
                amount: data.amount,
                direction: data.direction,
                rotation: data.rotation
            }, '*');
        }
    });
});

window.addEventListener('message', async (e) => {
    const msg = e.data;
    if (!msg || msg.source !== 'sceneplus-effect') return;

    if (msg.type === 'finish') {
        const players = Object.values(effectManager.players);
        for (const p of players) {
            for (const inst of p.pool) {
                if ((inst.el as HTMLIFrameElement).contentWindow === e.source) {
                    p.hardStopInstance(inst);
                    effectManager.activeGroups.forEach(g => {
                        g.entries = g.entries.filter(en => en.instance.active);
                    });
                    effectManager.activeGroups = effectManager.activeGroups.filter(g => g.entries.length > 0);
                }
            }
        }
    } else if (msg.type === 'capture') {
        const result = await window.api.captureScreen(msg.resolution);
        if (e.source) {
            (e.source as Window).postMessage({
                source: 'sceneplus-engine',
                type: 'capture-response',
                id: msg.id,
                dataUrl: result.dataUrl,
                error: result.error
            }, '*');
        }
    }
});

window.api.onImportProgress((percent) => {
    if (importBar) importBar.style.width = `${percent}%`;
    if (importPercentText) importPercentText.textContent = `${percent}%`;
});

window.api.onImportStatus((message) => {
    if (importStatusText) importStatusText.textContent = message.toUpperCase();
});

window.api.onPanic(() => {
    effectManager.panic();
    uiLog('PANIC: all effects killed', 'error');

    if (currentNetworkMode === 'send' && activeTargetIp) {
        window.api.sendOsc(activeTargetIp, `/sceneplus/sys/panic`, []);
        uiLog(`[TX] PANIC Sent to ${activeTargetIp}`, 'error');
    }
});

window.api.onKeyDown((keycode) => {
    const keyStr = keycode.toString();
    const effectIds = effectManager.keyBindings[keyStr] || [];

    if (currentNetworkMode !== 'receive') {
        effectManager.triggerDown(keycode);
    }

    if (effectIds.length > 0) {
        effectIds.forEach(id => {
            const name = effectManager.effectNames?.[id] || id.split('-')[0];
            const label = getKeyLabel(keycode);

            if (currentNetworkMode === 'send') {
                if (activeTargetIp) {
                    window.api.sendOsc(activeTargetIp, `/sceneplus/remote/down`, [id, keycode]);
                    uiLog(`[TX] ▶ [${name}]`, 'fire');
                } else {
                    uiLog(`▶ [${name}] (TX FAILED: NO TARGET IP)`, 'error');
                }
            } else if (currentNetworkMode === 'neutral') {
                uiLog(`▶ [${name}]  key=${label}`, 'fire');
            }
        });
    }
});

window.api.onKeyUp((keycode) => {
    const keyStr = keycode.toString();
    const effectIds = effectManager.keyBindings[keyStr] || [];

    if (currentNetworkMode !== 'receive') {
        effectManager.triggerUp(keycode);
    }

    if (currentNetworkMode === 'send' && effectIds.length > 0 && activeTargetIp) {
        effectIds.forEach(id => {
            window.api.sendOsc(activeTargetIp, `/sceneplus/remote/up`, [id, keycode]);
        });
    }
});

window.api.onOscMessage(async (msg: any) => {
    if (currentNetworkMode === 'send') {
        if (msg.address === '/sceneplus/sys/pong') {
            const responderIp = msg.rinfo?.address;
            if (pendingTargetIp) {
                clearTimeout(pingTimeoutId);
                pingTimeoutId = null;
                activeTargetIp = pendingTargetIp;
                pendingTargetIp = '';
                
                uiLog(`UPLINK SECURED: Connected to ${activeTargetIp}`, 'fire');
                const btnConnect = document.getElementById('btn-osc-connect');
                if (btnConnect) {
                    btnConnect.textContent = 'CONNECTED';
                    btnConnect.style.borderColor = 'var(--neon-green)';
                    btnConnect.style.color = 'var(--neon-green)';
                }
            }
        } else if (msg.address === '/sceneplus/sys/announce') {
            const deviceIp = msg.rinfo?.address;
            const localIps = await window.api.getAllLocalIps();
            const localIpList = localIps.map(e => e.ip);
            if (deviceIp && !localIpList.includes(deviceIp)) {
                addDiscoveredDevice(deviceIp);
            }
        }
        return;
    }

    if (currentNetworkMode !== 'receive') return;
    
    if (msg.address === '/sceneplus/sys/discover') {
        const senderIp = msg.rinfo?.address || 'unknown';
        if (senderIp !== 'unknown') {
            window.api.sendOsc(senderIp, '/sceneplus/sys/announce', []);
        }
        return;
    }

    if (msg.address === '/sceneplus/sys/ping') {
        const senderIp = msg.rinfo?.address || 'unknown';
        const senderHttpPort = msg.args[0] || 0;
        
        if (senderIp !== 'unknown') {
            window.api.sendOsc(senderIp, '/sceneplus/sys/pong', []);
        }

        if (!receivedConnections.has(senderIp)) {
            uiLog(`[RX] ◀ NEW LINK ESTABLISHED: ${senderIp}:${senderHttpPort}`, 'import');
            receivedConnections.set(senderIp, { port: senderHttpPort, lastSeen: Date.now() });
            syncAssetsWithUplink(senderIp, senderHttpPort);
            refreshConnectedDevicesUI();
        } else {
            const conn = receivedConnections.get(senderIp);
            if (conn) conn.lastSeen = Date.now();
        }
        return;
    }

    if (msg.address === '/sceneplus/sys/panic') {
        effectManager.panic();
        uiLog(`[RX] ◀ PANIC RECEIVED`, 'error');
        return;
    }

    const [effectId, keyCode] = msg.args;
    const name = effectManager.effectNames?.[effectId] || (effectId ? effectId.split('-')[0] : 'Unknown');

    if (msg.address === '/sceneplus/remote/down') {
        effectManager.triggerRemoteDown(effectId, keyCode);
        uiLog(`[RX] ◀ [${name}]`, 'fire');
    } else if (msg.address === '/sceneplus/remote/up') {
        effectManager.triggerRemoteUp(effectId, keyCode);
    }
});

async function syncAssetsWithUplink(ip: string, port: number) {
    const syncMode = persistence.state.syncMode || 'streaming';
    
    activeSyncCount++;
    updateSyncIndicator();

    uiLog(`[SYNC] Fetching asset manifest from uplink...`, 'default');
    try {
        const response = await fetch(`http://${ip}:${port}/api/effects`);
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const remoteAssets = await response.json();
        
        let dlHashes = [];
        let streamedCount = 0;
        let blockedCount = 0;

        for (const remote of remoteAssets) {
            const hash = remote.effectId;
            const meta = remote.meta;

            if (!effectManager.players[hash]) {
                if (syncMode === 'streaming') {
                    if (meta.usesSDK) {
                        uiLog(`[OSC-RX] ⚠ Blocked: SDK Effects require Mode A/B (${meta.name})`, 'error');
                        blockedCount++;
                    } else {
                        const streamingBasePath = `http://${ip}:${port}/stream/${hash}/`;
                        effectManager.registerEffect(hash, meta, streamingBasePath);
                        
                        effectManager.effectNames = effectManager.effectNames || {};
                        effectManager.effectNames[hash] = meta.name || hash;
                        
                        effectLibrary.addCard(hash, meta);
                        streamedCount++;
                    }
                } else {
                    dlHashes.push(hash);
                }
            }
        }
        
        if (syncMode === 'streaming') {
            uiLog(`[SYNC] Streaming Active: Mounted ${streamedCount} assets remotely.`, 'import');
            window.api.sendOsc(ip, '/sceneplus/sys/sync-progress', [100]);
            return;
        }

        if (dlHashes.length === 0) {
            uiLog(`[SYNC] Local library is up to date.`, 'import');
            return;
        }
        
        uiLog(`[SYNC] Downloading ${dlHashes.length} missing asset(s)...`, 'import');
        
        for (let i = 0; i < dlHashes.length; i++) {
            const hash = dlHashes[i];
            const dlUrl = `http://${ip}:${port}/api/download/${hash}`;
            
            uiLog(`[SYNC] (${i+1}/${dlHashes.length}) DL: ${hash.substring(0,8)}...`, 'default');
            
            const tempFile = await window.api.downloadAsset(dlUrl, hash);
            if (tempFile) {
                const isGuest = (syncMode === 'guest');
                
                const result = await window.api.importEffectBackground(tempFile, isGuest);
                if (result.success && result.meta && result.basePath && result.hash) {
                    effectManager.registerEffect(result.hash, result.meta, result.basePath);
                    
                    effectManager.effectNames = effectManager.effectNames || {};
                    effectManager.effectNames[result.hash] = result.meta.name || result.hash;
                    
                    effectLibrary.addCard(result.hash, result.meta);
                    uiLog(`[SYNC] Installed: ${result.meta.name}`, 'default');
                } else {
                    uiLog(`[SYNC] Install Failed: ${result.error}`, 'error');
                }
            }
        }
        
        uiLog(`[SYNC] Synchronization complete.`, 'import');
    } catch (err: any) {
        uiLog(`[SYNC] Sync failed: ${err.message}`, 'error');
    } finally {
        activeSyncCount--;
        updateSyncIndicator();
    }
}

async function importEffect(filePath: string, fileName: string) {
    if (isImporting) return;
    
    isImporting = true;
    importOverlay.classList.remove('hidden');
    importBar.style.width = '0%';
    importPercentText.textContent = '0%';
    importStatusText.textContent = 'PREPARING STREAM...';

    const result = await window.api.importEffectBackground(filePath);
    
    isImporting = false;
    importOverlay.classList.add('hidden');

    if (result.success && result.hash && result.meta && result.basePath) {
        if (effectLibrary.allEffects.some(e => e.effectId === result.hash)) {
             uiLog(`Duplicate effect skipped: ${fileName}`, 'default');
             return;
        }

        const displayName = result.meta.name || fileName.replace(/\.(scenefx|zip)$/, '');
        effectManager.registerEffect(result.hash, result.meta, result.basePath);
        effectManager.effectNames = effectManager.effectNames || {};
        effectManager.effectNames[result.hash] = displayName;
        effectLibrary.addCard(result.hash, result.meta);
        uiLog(`✔ Imported [${displayName}]  ${result.meta.mediatype}/${result.meta.playmode}`, 'import');
    } else {
        uiLog(`✘ Import failed: ${fileName}`, 'error');
        if (result.diagnostic) {
            showDiagnostic(result.error || 'Unknown Error', result.template || '');
        } else {
            await window.api.alertDialog({ 
                message: 'Failed to load effect', 
                detail: result.error || 'Unknown Error' 
            });
        }
    }
}

function showDiagnostic(error: string, template: string) {
    diagErrorMsg.textContent = error;
    diagTemplateArea.value = template;
    diagModal.classList.remove('hidden');
}

btnCloseDiag.addEventListener('click', () => {
    diagModal.classList.add('hidden');
});

btnCopyDiag.addEventListener('click', () => {
    diagTemplateArea.select();
    document.execCommand('copy');
    uiLog('Diagnostic template copied to clipboard.', 'default');
    btnCopyDiag.textContent = 'COPIED!';
    setTimeout(() => {
        btnCopyDiag.textContent = 'COPY TO CLIPBOARD';
    }, 2000);
});

effectLibrary.container.addEventListener('effect-deleted', (e: any) => {
    const { effectId } = e.detail;
    for (const keyCode in effectManager.keyBindings) {
        effectManager.keyBindings[keyCode] = effectManager.keyBindings[keyCode].filter((id: string) => id !== effectId);
        virtualKeyboard.updateBadge(parseInt(keyCode, 10));
    }
    if (persistence.state && persistence.state.presets) {
        for (const p in persistence.state.presets) {
            for (const k in persistence.state.presets[p]) {
                persistence.state.presets[p][k] = persistence.state.presets[p][k].filter((id: string) => id !== effectId);
            }
        }
    }
    persistence.save();
    uiLog(`Effect deleted permanently.`, 'error');
});

libraryGrid.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

libraryGrid.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    libraryGrid.classList.remove('drag-over');
    if (e.dataTransfer && !e.dataTransfer.types.includes('Files')) return;

    if (e.dataTransfer) {
        for (const f of Array.from(e.dataTransfer.files)) {
            if (f.name.endsWith('.scenefx') || f.name.endsWith('.zip')) {
                const filePath = window.api.getPathForFile(f);
                await importEffect(filePath, f.name);
            }
        }
    }
});

btnAddEffect.addEventListener('click', async () => {
    const result = await window.api.openFileDialog();
    if (result.canceled || !result.files || result.files.length === 0) return;

    for (const filePath of result.files) {
        const fileName = filePath.split(/[\\/]/).pop() || 'unknown';
        await importEffect(filePath, fileName);
    }
});

const btnClearKeys = document.getElementById('btn-clear-keys');
if (btnClearKeys) {
    btnClearKeys.addEventListener('click', async () => {
        const ok = await window.api.confirmDialog({
            message: 'All key assignments will be cleared. Continue?',
            detail: 'This will reset the current preset bindings.'
        });
        if (ok) {
            virtualKeyboard.clearAll();
            persistence.save();
            uiLog('All key assignments cleared.', 'default');
        }
    });
}

const btnExitApp = document.getElementById('btn-exit-app');
if (btnExitApp) {
    btnExitApp.addEventListener('click', async () => {
        const ok = await window.api.confirmDialog({
            message: 'Exit ScenePlus+?',
            detail: 'Make sure your work is saved.'
        });
        if (ok) {
            window.close();
        }
    });
}
