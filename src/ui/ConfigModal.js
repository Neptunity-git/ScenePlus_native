/**
 * Manages the UI Settings Modal (F-keys, Max N, Preset Names)
 */
export class ConfigModal {
    constructor(persistence) {
        this.persistence = persistence;
        this.modal = document.getElementById('config-modal');
        this.btnClose = document.getElementById('btn-close-config');
        this.btnSave = document.getElementById('btn-save-config');
        
        this.inputMaxN = document.getElementById('config-max-n');
        this.selectKeyEngine = document.getElementById('config-key-engine');
        this.selectKeySettings = document.getElementById('config-key-settings');
        this.selectSyncMode = document.getElementById('config-sync-mode');
        this.syncWarning = document.getElementById('config-sync-warning');
        this.presetNameGrid = document.getElementById('preset-name-grid');

        // Document Buttons
        this.btnDocGuide = document.getElementById('btn-doc-guide');
        this.btnDocTosUser = document.getElementById('btn-doc-tos-user');
        this.btnDocTosCreator = document.getElementById('btn-doc-tos-creator');

        // UIOHook F-key mappings (F1 to F12)
        this.fKeys = [
            { name: 'F1', code: 59 }, { name: 'F2', code: 60 },
            { name: 'F3', code: 61 }, { name: 'F4', code: 62 },
            { name: 'F5', code: 63 }, { name: 'F6', code: 64 },
            { name: 'F7', code: 65 }, { name: 'F8', code: 66 },
            { name: 'F9', code: 67 }, { name: 'F10', code: 68 },
            { name: 'F11', code: 87 }, { name: 'F12', code: 88 }
        ];

        this.initUI();
        this.bindEvents();
    }

    initUI() {
        // Populate F-Key dropdowns
        let optionsHtml = '';
        this.fKeys.forEach(fk => {
            optionsHtml += `<option value="${fk.code}">${fk.name}</option>`;
        });
        this.selectKeyEngine.innerHTML = optionsHtml;
        this.selectKeySettings.innerHTML = optionsHtml;

        // Populate Preset Rename Inputs
        this.presetNameGrid.innerHTML = '';
        for (let i = 1; i <= 7; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 10;
            input.className = 'cyber-input';
            input.dataset.index = i;
            this.presetNameGrid.appendChild(input);
        }
    }

    bindEvents() {
        // We open the modal from renderer.js via open()
        this.btnClose.addEventListener('click', () => this.close());
        
        this.btnSave.addEventListener('click', () => {
            this.saveAndApply();
        });

        if (this.selectSyncMode) {
            this.selectSyncMode.addEventListener('change', () => {
                this.updateSyncWarning();
            });
        }

        // Bind Document Buttons
        if (this.btnDocGuide) {
            this.btnDocGuide.addEventListener('click', () => {
                window.api.openDocument('Official_Guide_For_Creators.html');
            });
        }
        if (this.btnDocTosUser) {
            this.btnDocTosUser.addEventListener('click', () => {
                window.api.openDocument('ToS_For_Users.html');
            });
        }
        if (this.btnDocTosCreator) {
            this.btnDocTosCreator.addEventListener('click', () => {
                window.api.openDocument('ToS_For_Creators.html');
            });
        }
    }

    updateSyncWarning() {
        if (!this.selectSyncMode || !this.syncWarning) return;
        if (this.selectSyncMode.value === 'streaming') {
            this.syncWarning.style.display = 'block';
        } else {
            this.syncWarning.style.display = 'none';
        }
    }

    open(networkMode = 'neutral') {
        const state = this.persistence.state;
        
        // Load current state into inputs
        this.inputMaxN.value = state.maxN || 5;
        this.selectKeyEngine.value = state.engineKey || 66; // F8 fallback
        this.selectKeySettings.value = state.settingsKey || 67; // F9 fallback
        if (this.selectSyncMode) {
            this.selectSyncMode.value = state.syncMode || 'streaming';
            
            // Phase 4.2 Fix: Lock sync mode if network is active to prevent inconsistencies
            if (networkMode !== 'neutral') {
                this.selectSyncMode.disabled = true;
                this.selectSyncMode.title = "Cannot change sync mode while network is active";
            } else {
                this.selectSyncMode.disabled = false;
                this.selectSyncMode.title = "";
            }
        }

        this.updateSyncWarning();

        const inputs = this.presetNameGrid.querySelectorAll('input');
        inputs.forEach(input => {
            const idx = input.dataset.index;
            input.value = state.presetNames[idx] || `PRESET ${idx}`;
        });

        this.modal.classList.remove('hidden');
    }

    close() {
        this.modal.classList.add('hidden');
    }

    async saveAndApply() {
        // 1. Validation
        const engineKey = parseInt(this.selectKeyEngine.value, 10);
        const settingsKey = parseInt(this.selectKeySettings.value, 10);
        
        if (engineKey === settingsKey) {
            await window.api.alertDialog({
                message: 'Configuration Error',
                detail: 'Cannot bind Engine Toggle and Settings Toggle to the same key!'
            });
            return;
        }

        let maxN = parseInt(this.inputMaxN.value, 10);
        if (isNaN(maxN) || maxN < 1) maxN = 1;

        // 2. Gather names
        const presetNames = {};
        const inputs = this.presetNameGrid.querySelectorAll('input');
        inputs.forEach(input => {
            const idx = input.dataset.index;
            let val = input.value.trim();
            if (!val) val = `PRESET ${idx}`;
            presetNames[idx] = val;
        });

        // 3. Save via persistence
        this.persistence.updateConfig({
            maxN,
            engineKey,
            settingsKey,
            syncMode: this.selectSyncMode ? this.selectSyncMode.value : 'streaming',
            presetNames
        });

        // 4. Fire callback to tell renderer to update the sticky header UI
        if (this.onConfigSaved) {
            this.onConfigSaved(presetNames);
        }

        this.close();
    }
}
