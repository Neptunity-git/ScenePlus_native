import { uiLog } from './UILogger';
import { IEffectManager, IPersistenceManager, IUIManager } from '../shared/interfaces';
import { EffectLibrary } from './EffectLibrary';
import { VirtualKeyboard } from './VirtualKeyboard';
import { ConfigModal } from './ConfigModal';

export class UIManager implements IUIManager {
    private effectManager: IEffectManager;
    private effectLibrary: EffectLibrary;
    private persistence: IPersistenceManager;
    private virtualKeyboard: VirtualKeyboard;
    private configModal: ConfigModal;

    private importOverlay = document.getElementById('import-overlay') as HTMLElement;
    private importBar = document.getElementById('import-progress-bar') as HTMLElement;
    private importStatusText = document.getElementById('import-status-text') as HTMLElement;
    private importPercentText = document.getElementById('import-percent-text') as HTMLElement;
    
    private diagModal = document.getElementById('diagnostic-modal') as HTMLElement;
    private diagErrorMsg = document.getElementById('diag-error-msg') as HTMLElement;
    private diagTemplateArea = document.getElementById('diag-template-area') as HTMLTextAreaElement;
    
    private isImporting = false;

    constructor(
        effectManager: IEffectManager,
        effectLibrary: EffectLibrary,
        persistence: IPersistenceManager,
        virtualKeyboard: VirtualKeyboard,
        configModal: ConfigModal
    ) {
        this.effectManager = effectManager;
        this.effectLibrary = effectLibrary;
        this.persistence = persistence;
        this.virtualKeyboard = virtualKeyboard;
        this.configModal = configModal;

        this.setupEventListeners();
    }

    private setupEventListeners() {
        const configBtn = document.querySelector('.cyber-btn.icon[title="Details / Settings"]');
        if (configBtn) {
            configBtn.addEventListener('click', () => {
                this.configModal.open('neutral'); // the actual mode is handled elsewhere, default to neutral for UI purposes
            });
        }

        const presetBtns = document.querySelectorAll('.cyber-btn.preset');
        presetBtns.forEach((btn, idx) => {
            btn.addEventListener('click', () => {
                this.persistence.switchPreset(idx + 1);
                uiLog(`Switched to Preset ${idx + 1}`, 'default');
            });
        });

        this.configModal.onConfigSaved = (newNames: Record<number, string>) => {
            this.refreshPresetNamesUI(newNames);
            uiLog('Global System Configuration Saved', 'default');
        };

        const btnCloseDiag = document.getElementById('btn-close-diag');
        if (btnCloseDiag) {
            btnCloseDiag.addEventListener('click', () => {
                this.diagModal.classList.add('hidden');
            });
        }

        const btnCopyDiag = document.getElementById('btn-copy-diag');
        if (btnCopyDiag) {
            btnCopyDiag.addEventListener('click', () => {
                this.diagTemplateArea.select();
                document.execCommand('copy');
                uiLog('Diagnostic template copied to clipboard.', 'default');
                btnCopyDiag.textContent = 'COPIED!';
                setTimeout(() => {
                    btnCopyDiag.textContent = 'COPY TO CLIPBOARD';
                }, 2000);
            });
        }

        this.effectLibrary.container.addEventListener('effect-deleted', (e: any) => {
            const { effectId } = e.detail;
            for (const keyCode in this.effectManager.keyBindings) {
                this.effectManager.keyBindings[keyCode] = this.effectManager.keyBindings[keyCode].filter((id: string) => id !== effectId);
                this.virtualKeyboard.updateBadge(parseInt(keyCode, 10));
            }
            if (this.persistence.state && this.persistence.state.presets) {
                for (const p in this.persistence.state.presets) {
                    for (const k in this.persistence.state.presets[p]) {
                        this.persistence.state.presets[p][k] = this.persistence.state.presets[p][k].filter((id: string) => id !== effectId);
                    }
                }
            }
            this.persistence.save();
            uiLog(`Effect deleted permanently.`, 'error');
        });

        const libraryGrid = document.getElementById('library-grid');
        if (libraryGrid) {
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
                            await this.importEffect(filePath, f.name);
                        }
                    }
                }
            });
        }

        const btnAddEffect = document.getElementById('btn-add-effect');
        if (btnAddEffect) {
            btnAddEffect.addEventListener('click', async () => {
                const result = await window.api.openFileDialog();
                if (result.canceled || !result.files || result.files.length === 0) return;

                for (const filePath of result.files) {
                    const fileName = filePath.split(/[\\/]/).pop() || 'unknown';
                    await this.importEffect(filePath, fileName);
                }
            });
        }

        const btnClearKeys = document.getElementById('btn-clear-keys');
        if (btnClearKeys) {
            btnClearKeys.addEventListener('click', async () => {
                const ok = await window.api.confirmDialog({
                    message: 'All key assignments will be cleared. Continue?',
                    detail: 'This will reset the current preset bindings.'
                });
                if (ok) {
                    this.virtualKeyboard.clearAll();
                    this.persistence.save();
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
    }

    public async importEffect(filePath: string, fileName: string) {
        if (this.isImporting) return;
        
        this.isImporting = true;
        this.importOverlay.classList.remove('hidden');
        this.importBar.style.width = '0%';
        this.importPercentText.textContent = '0%';
        this.importStatusText.textContent = 'PREPARING STREAM...';

        const result = await window.api.importEffectBackground(filePath);
        
        this.isImporting = false;
        this.importOverlay.classList.add('hidden');

        if (result.success && result.hash && result.meta && result.basePath) {
            if (this.effectLibrary.allEffects.some(e => e.effectId === result.hash)) {
                 uiLog(`Duplicate effect skipped: ${fileName}`, 'default');
                 return;
            }

            const displayName = result.meta.name || fileName.replace(/\.(scenefx|zip)$/, '');
            this.effectManager.registerEffect(result.hash, result.meta, result.basePath);
            this.effectManager.effectNames = this.effectManager.effectNames || {};
            this.effectManager.effectNames[result.hash] = displayName;
            this.effectLibrary.addCard(result.hash, result.meta);
            uiLog(`✔ Imported [${displayName}]  ${result.meta.mediatype}/${result.meta.playmode}`, 'import');
        } else {
            uiLog(`✘ Import failed: ${fileName}`, 'error');
            if (result.diagnostic) {
                this.showDiagnostic(result.error || 'Unknown Error', result.template || '');
            } else {
                await window.api.alertDialog({ 
                    message: 'Failed to load effect', 
                    detail: result.error || 'Unknown Error' 
                });
            }
        }
    }

    public showDiagnostic(error: string, template: string) {
        this.diagErrorMsg.textContent = error;
        this.diagTemplateArea.value = template;
        this.diagModal.classList.remove('hidden');
    }
    
    public updateImportProgress(percent: number) {
        if (this.importBar) this.importBar.style.width = `${percent}%`;
        if (this.importPercentText) this.importPercentText.textContent = `${percent}%`;
    }

    public updateImportStatus(message: string) {
        if (this.importStatusText) this.importStatusText.textContent = message.toUpperCase();
    }
    
    public hideDiagModal() {
        if (this.diagModal) this.diagModal.classList.add('hidden');
    }

    public refreshPresetNamesUI(namesObj: Record<string | number, string>) {
        if (!namesObj) return;
        const presetBtns = document.querySelectorAll('.cyber-btn.preset');
        presetBtns.forEach((btn, idx) => {
            const i = (idx + 1).toString();
            const val = namesObj[i] || namesObj[idx + 1];
            if (val) btn.textContent = val;
        });
    }

    public renderDiscoveredDevicesList(devices: string[], onConnectClick: (ip: string) => void) {
        const listEl = document.getElementById('osc-device-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        
        if (devices.length === 0) {
            listEl.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 6px;">No devices found</div>';
            return;
        }

        devices.forEach(ip => {
            const card = document.createElement('div');
            card.style.background = 'rgba(0, 20, 25, 0.6)';
            card.style.border = '1px solid rgba(20, 250, 200, 0.35)';
            card.style.borderRadius = '4px';
            card.style.padding = '6px 8px';
            card.style.marginBottom = '6px';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'space-between';
            card.style.gap = '6px';
            card.style.boxShadow = 'inset 0 0 8px rgba(20, 250, 200, 0.1)';

            const ipContainer = document.createElement('div');
            ipContainer.style.display = 'flex';
            ipContainer.style.flexDirection = 'column';
            ipContainer.style.overflow = 'hidden';

            const ipLabel = document.createElement('span');
            ipLabel.style.fontFamily = 'monospace';
            ipLabel.style.fontSize = '0.85rem';
            ipLabel.style.fontWeight = 'bold';
            ipLabel.style.color = 'var(--neon-cyan)';
            ipLabel.style.textShadow = '0 0 4px rgba(20, 250, 200, 0.4)';
            ipLabel.style.whiteSpace = 'nowrap';
            ipLabel.style.overflow = 'hidden';
            ipLabel.style.textOverflow = 'ellipsis';
            ipLabel.textContent = ip;

            const subLabel = document.createElement('span');
            subLabel.style.fontSize = '0.58rem';
            subLabel.style.color = 'var(--text-muted)';
            subLabel.style.marginTop = '1px';
            subLabel.textContent = 'RECEIVER NODE';

            ipContainer.appendChild(ipLabel);
            ipContainer.appendChild(subLabel);

            const connectBtn = document.createElement('button');
            connectBtn.className = 'cyber-btn accent';
            connectBtn.style.fontSize = '0.65rem';
            connectBtn.style.padding = '4px 8px';
            connectBtn.style.whiteSpace = 'nowrap';
            connectBtn.style.flexShrink = '0';
            connectBtn.style.lineHeight = '1';
            connectBtn.textContent = 'CONNECT';
            connectBtn.onclick = () => onConnectClick(ip);

            card.appendChild(ipContainer);
            card.appendChild(connectBtn);
            listEl.appendChild(card);
        });
    }
}
