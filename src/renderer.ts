import { EffectManager } from './engine/EffectManager';
import { VirtualKeyboard } from './ui/VirtualKeyboard';
import { EffectLibrary } from './ui/EffectLibrary';
import { PersistenceManager } from './ui/PersistenceManager';
import { ConfigModal } from './ui/ConfigModal';
import { uiLog, setupModeInfoPanel } from './ui/UILogger';
import { DocsViewer } from './ui/DocsViewer';

import { NetworkController } from './network/NetworkController';
import { SyncManager } from './network/SyncManager';
import { UIManager } from './ui/UIManager';
import { RendererIPC } from './ipc/RendererIPC';

// Setup OS UI Scaling
function initZoom() {
    const baseHeight = 720;
    const currentHeight = window.screen.height;
    const zoomFactor = currentHeight / baseHeight;
    window.api.setZoomFactor(zoomFactor);
}
initZoom();
window.addEventListener('resize', initZoom);

// Core Managers
const effectManager = new EffectManager(1); // Reduced poolSize
const virtualKeyboard = new VirtualKeyboard('keyboard-grid', effectManager);
const effectLibrary = new EffectLibrary('library-grid', effectManager);
const persistence = new PersistenceManager(effectManager, effectLibrary, virtualKeyboard);
virtualKeyboard.onAssignmentChanged = () => persistence.save();
const configModal = new ConfigModal(persistence);
const docsViewer = new DocsViewer();

// Docs Binding
document.getElementById('btn-doc-guide')?.addEventListener('click', () => {
    docsViewer.openDocument('Official_Guide_For_Creators.md', 'CREATOR GUIDE');
});
document.getElementById('btn-doc-tos-user')?.addEventListener('click', () => {
    docsViewer.openDocument('ToS_For_Users.md', 'USER TERMS OF SERVICE');
});
document.getElementById('btn-doc-tos-creator')?.addEventListener('click', () => {
    docsViewer.openDocument('ToS_For_Creators.md', 'CREATOR TERMS OF SERVICE');
});

// Composer Binding
document.getElementById('btn-make-fx')?.addEventListener('click', () => {
    window.api.openEffectComposer();
});

window.api.onEffectComposed((data: any) => {
    if (effectLibrary.allEffects.some(e => e.effectId === data.hash)) {
        return;
    }
    const displayName = data.meta.name || data.hash;
    effectManager.registerEffect(data.hash, data.meta, data.basePath);
    effectManager.effectNames = effectManager.effectNames || {};
    effectManager.effectNames[data.hash] = displayName;
    effectLibrary.addCard(data.hash, data.meta);
    uiLog(`✔ Composed [${displayName}]  ${data.meta.mediatype}/${data.meta.playmode}`, 'import');
});

// Sub Controllers
const uiManager = new UIManager(effectManager, effectLibrary, persistence, virtualKeyboard, configModal);
const syncManager = new SyncManager(effectManager, effectLibrary, persistence);
const networkController = new NetworkController((ip, port) => {
    syncManager.syncAssetsWithUplink(ip, port);
});

// IPC Router
const ipc = new RendererIPC(effectManager, networkController, syncManager, uiManager, persistence);
ipc.setupBindings();

// UI Mode Switcher
setupModeInfoPanel(async (mode: string) => {
    await networkController.setMode(mode);
    
    // UI specific logic for mode switching
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
    } else if (mode === 'send') {
        const oscScanBtn = document.getElementById('btn-osc-scan');
        if (oscScanBtn) {
            oscScanBtn.onclick = () => {
                networkController.discoveredDevices = [];
                window.api.scanSubnet();
            };
        }
        const oscConnectBtn = document.getElementById('btn-osc-connect');
        const manualIpInput = document.getElementById('osc-target-ip') as HTMLInputElement;
        if (oscConnectBtn && manualIpInput) {
            oscConnectBtn.onclick = () => {
                const ip = manualIpInput.value.trim();
                if (!ip) return;
                networkController.attemptConnection(ip, () => {
                    // on Timeout
                });
            };
        }
    }
});

// Global Window State
let engineOn = true;
let settingsOpen = false;

const offIndicator = document.getElementById('off-indicator');
const settingsPanel = document.getElementById('settings-panel');

export function toggleEngine() {
    window.api.setAppState({ engineOn: !engineOn });
}

export function toggleSettings() {
    window.api.setAppState({ settingsOpen: !settingsOpen });
}

window.api.onStateChanged((state: any) => {
    engineOn = state.engineOn;
    settingsOpen = state.settingsOpen;

    if (engineOn) {
        if (offIndicator) offIndicator.classList.add('hidden');
        uiLog('Engine ON', 'default');
    } else {
        if (offIndicator) offIndicator.classList.remove('hidden');
        uiLog('Engine OFF', 'error');
        effectManager.panic();
    }

    if (settingsOpen) {
        if (settingsPanel) settingsPanel.classList.remove('hidden');
    } else {
        if (settingsPanel) settingsPanel.classList.add('hidden');
        if (configModal) configModal.close();
        if (virtualKeyboard) virtualKeyboard.dismissPopup();
        if (uiManager) uiManager.hideDiagModal();
        docsViewer.hide();
    }
});



// Init
persistence.loadState().then(() => {
    uiManager.refreshPresetNamesUI(persistence.state.presetNames);
});
