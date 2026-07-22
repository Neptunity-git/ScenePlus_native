import { IEffectManager } from '../shared/interfaces';
import { EffectLibrary } from './EffectLibrary';
import { VirtualKeyboard } from './VirtualKeyboard';

export class PersistenceManager {
    private effectManager: IEffectManager;
    private effectLibrary: EffectLibrary;
    private virtualKeyboard: VirtualKeyboard;

    public state: any;

    constructor(effectManager: IEffectManager, effectLibrary: EffectLibrary, virtualKeyboard: VirtualKeyboard) {
        this.effectManager = effectManager;
        this.effectLibrary = effectLibrary;
        this.virtualKeyboard = virtualKeyboard;

        this.effectLibrary.onEffectRenamed = (effectId: string, newName: string) => {
            this.renameEffect(effectId, newName);
        };

        this.state = {
            currentPreset: 1,
            maxN: 5,
            engineKey: 66,
            settingsKey: 67,
            presetNames: {
                1: "PRESET 1", 2: "PRESET 2", 3: "PRESET 3", 4: "PRESET 4",
                5: "PRESET 5", 6: "PRESET 6", 7: "PRESET 7"
            },
            presets: {
                1: {}, 2: {}, 3: {}, 4: {},
                5: {}, 6: {}, 7: {}
            },
            customEffectNames: {}
        };
    }

    public async restore() {
        const scanResult = await window.api.scanEffects();
        if (scanResult.success && scanResult.effects && scanResult.effects.length > 0) {
            this.effectManager.effectNames = this.effectManager.effectNames || {};
            for (const { effectId, meta, basePath } of scanResult.effects) {
                this.effectManager.registerEffect(effectId, meta, basePath);
                this.effectManager.effectNames[effectId] = this._nameFromMeta(meta);
                this.effectLibrary.addCard(effectId, meta);
            }
        }

        const settingsResult = await window.api.loadSettings();
        if (settingsResult.success && settingsResult.settings) {
            if (settingsResult.settings.keyBindings && !settingsResult.settings.presets) {
                settingsResult.settings.presets = { 1: settingsResult.settings.keyBindings };
                delete settingsResult.settings.keyBindings;
            }

            this.state = { ...this.state, ...settingsResult.settings };
            
            if (this.state.customEffectNames) {
                if (!this.effectManager.effectNames) {
                    this.effectManager.effectNames = {};
                }
                for (const [id, customName] of Object.entries(this.state.customEffectNames)) {
                    if (customName && typeof customName === 'string') {
                        this.effectManager.effectNames[id] = customName;
                        const item = this.effectLibrary.allEffects.find(x => x.effectId === id);
                        if (item) {
                            const titleEl = item.card.querySelector('.card-title');
                            if (titleEl) titleEl.textContent = customName;
                            item.meta.name = customName;
                        }
                    }
                }
            }
            
            if (this.state.engineKey === 64 && this.state.settingsKey === 65) {
                this.state.engineKey = 66;
                this.state.settingsKey = 67;
            }

            this.state.presets = this.state.presets || {};
            for (let i = 1; i <= 7; i++) {
                if (!this.state.presets[i]) this.state.presets[i] = {};
            }
            if (!this.state.presetNames) this.state.presetNames = {};
            for (let i = 1; i <= 7; i++) {
                if (!this.state.presetNames[i]) this.state.presetNames[i] = `PRESET ${i}`;
            }

            this.effectManager.maxN = this.state.maxN;
            await window.api.setSystemKeys(this.state.engineKey, this.state.settingsKey);
        }

        this.switchPreset(this.state.currentPreset, true);
    }

    public switchPreset(presetIndex: number, isRestore = false) {
        if (presetIndex < 1 || presetIndex > 7) return;

        if (!isRestore) {
            this.state.presets[this.state.currentPreset] = { ...this.effectManager.keyBindings };
        }

        this.state.currentPreset = presetIndex;
        
        this.virtualKeyboard.clearAllInternal();

        const newBindings = this.state.presets[presetIndex] || {};
        for (const [keyCode, effectIds] of Object.entries(newBindings)) {
            const parsedKey = parseInt(keyCode, 10);
            this.effectManager.bindKey(parsedKey, [...(effectIds as string[])]);
            this.virtualKeyboard.updateBadge(parsedKey);
        }

        document.querySelectorAll('.cyber-btn.preset').forEach((btn, idx) => {
            if (idx + 1 === presetIndex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.save();

        if (this.effectLibrary && typeof this.effectLibrary._applyFilters === 'function') {
            this.effectLibrary._applyFilters();
        }

        this.syncAssignedKeysToMain();
    }

    public updateConfig(configOverrides: any) {
        this.state = { ...this.state, ...configOverrides };
        this.effectManager.maxN = this.state.maxN;
        window.api.setSystemKeys(this.state.engineKey, this.state.settingsKey);
        this.syncAssignedKeysToMain();
        this.save();
    }

    public async loadState(newState?: any) {
        if (!newState) {
            return this.restore();
        }
        
        this.state = { ...this.state, ...newState };
        this.effectManager.maxN = this.state.maxN;
        if (this.state.engineKey && this.state.settingsKey) {
            await window.api.setSystemKeys(this.state.engineKey, this.state.settingsKey);
        }
        this.switchPreset(this.state.currentPreset, true);
    }

    public async save() {
        this.state.presets[this.state.currentPreset] = { ...this.effectManager.keyBindings };
        this.syncAssignedKeysToMain();
        await window.api.saveSettings(this.state);
    }

    private syncAssignedKeysToMain() {
        const assignedKeyCodes: number[] = [];
        for (const [keyCodeStr, effectIds] of Object.entries(this.effectManager.keyBindings || {})) {
            if (Array.isArray(effectIds) && effectIds.length > 0) {
                const code = parseInt(keyCodeStr, 10);
                if (!isNaN(code)) assignedKeyCodes.push(code);
            }
        }
        window.api.setAssignedKeys(assignedKeyCodes, !!this.state.blockAssignedKeys);
    }

    public renameEffect(effectId: string, newName: string) {
        if (!this.state.customEffectNames) this.state.customEffectNames = {};
        this.state.customEffectNames[effectId] = newName;
        if (!this.effectManager.effectNames) this.effectManager.effectNames = {};
        this.effectManager.effectNames[effectId] = newName;
        this.save();
    }

    private _nameFromMeta(meta: any) {
        if (meta.name) return meta.name;
        let name = meta.path || '';
        if (name.includes('/')) name = name.split('/').pop();
        if (name.includes('.')) name = name.split('.')[0];
        return name || 'unnamed';
    }
}
