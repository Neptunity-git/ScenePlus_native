export class ConfigModal {
    private persistence: any;
    private modal: HTMLElement;
    private btnClose: HTMLElement;
    private btnSave: HTMLElement;
    
    private inputMaxN: HTMLInputElement;
    private selectKeyEngine: HTMLSelectElement;
    private selectKeySettings: HTMLSelectElement;
    private selectSyncMode: HTMLSelectElement;
    private syncWarning: HTMLElement;
    private presetNameGrid: HTMLElement;

    private btnDocGuide: HTMLElement;
    private btnDocTosUser: HTMLElement;
    private btnDocTosCreator: HTMLElement;

    private fKeys: { name: string; code: number }[];

    public onConfigSaved?: (presetNames: Record<number, string>) => void;

    constructor(persistence: any) {
        this.persistence = persistence;
        this.modal = document.getElementById('config-modal') as HTMLElement;
        this.btnClose = document.getElementById('btn-close-config') as HTMLElement;
        this.btnSave = document.getElementById('btn-save-config') as HTMLElement;
        
        this.inputMaxN = document.getElementById('config-max-n') as HTMLInputElement;
        this.selectKeyEngine = document.getElementById('config-key-engine') as HTMLSelectElement;
        this.selectKeySettings = document.getElementById('config-key-settings') as HTMLSelectElement;
        this.selectSyncMode = document.getElementById('config-sync-mode') as HTMLSelectElement;
        this.syncWarning = document.getElementById('config-sync-warning') as HTMLElement;
        this.presetNameGrid = document.getElementById('preset-name-grid') as HTMLElement;

        this.btnDocGuide = document.getElementById('btn-doc-guide') as HTMLElement;
        this.btnDocTosUser = document.getElementById('btn-doc-tos-user') as HTMLElement;
        this.btnDocTosCreator = document.getElementById('btn-doc-tos-creator') as HTMLElement;

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

    private initUI() {
        let optionsHtml = '';
        this.fKeys.forEach(fk => {
            optionsHtml += `<option value="${fk.code}">${fk.name}</option>`;
        });
        this.selectKeyEngine.innerHTML = optionsHtml;
        this.selectKeySettings.innerHTML = optionsHtml;

        this.presetNameGrid.innerHTML = '';
        for (let i = 1; i <= 7; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 10;
            input.className = 'cyber-input';
            input.dataset.index = i.toString();
            this.presetNameGrid.appendChild(input);
        }
    }

    private bindEvents() {
        this.btnClose.addEventListener('click', () => this.close());
        
        this.btnSave.addEventListener('click', () => {
            this.saveAndApply();
        });

        if (this.selectSyncMode) {
            this.selectSyncMode.addEventListener('change', () => {
                this.updateSyncWarning();
            });
        }

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

    private updateSyncWarning() {
        if (!this.selectSyncMode || !this.syncWarning) return;
        if (this.selectSyncMode.value === 'streaming') {
            this.syncWarning.style.display = 'block';
        } else {
            this.syncWarning.style.display = 'none';
        }
    }

    public open(networkMode = 'neutral') {
        const state = this.persistence.state;
        
        this.inputMaxN.value = (state.maxN || 5).toString();
        this.selectKeyEngine.value = (state.engineKey || 66).toString();
        this.selectKeySettings.value = (state.settingsKey || 67).toString();
        if (this.selectSyncMode) {
            this.selectSyncMode.value = state.syncMode || 'streaming';
            
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
            const idx = input.dataset.index as string;
            input.value = state.presetNames[idx] || `PRESET ${idx}`;
        });

        this.modal.classList.remove('hidden');
    }

    public close() {
        this.modal.classList.add('hidden');
    }

    private async saveAndApply() {
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

        const presetNames: Record<string, string> = {};
        const inputs = this.presetNameGrid.querySelectorAll('input');
        inputs.forEach(input => {
            const idx = input.dataset.index as string;
            let val = input.value.trim();
            if (!val) val = `PRESET ${idx}`;
            presetNames[idx] = val;
        });

        this.persistence.updateConfig({
            maxN,
            engineKey,
            settingsKey,
            syncMode: this.selectSyncMode ? this.selectSyncMode.value : 'streaming',
            presetNames
        });

        if (this.onConfigSaved) {
            this.onConfigSaved(presetNames);
        }

        this.close();
    }
}
