/**
 * PersistenceManager: saves/restores effect library and key bindings
 * across app restarts via the IPC bridge to main.js. Supports 8 presets.
 */
export class PersistenceManager {
    constructor(effectManager, effectLibrary, virtualKeyboard) {
        this.effectManager = effectManager;
        this.effectLibrary = effectLibrary;
        this.virtualKeyboard = virtualKeyboard;

        // Default settings structure
        this.state = {
            currentPreset: 1,
            maxN: 5,
            engineKey: 66, // F8 in uiohook-napi
            settingsKey: 67, // F9 in uiohook-napi
            presetNames: {
                1: "PRESET 1", 2: "PRESET 2", 3: "PRESET 3", 4: "PRESET 4",
                5: "PRESET 5", 6: "PRESET 6", 7: "PRESET 7"
            },
            presets: {
                // Each preset maps keyCode -> [effectIds]
                1: {}, 2: {}, 3: {}, 4: {},
                5: {}, 6: {}, 7: {}
            }
        };
    }

    /**
     * Called once at startup. Loads all previously imported effects from disk
     * and restores key assignments from settings.json.
     */
    async restore() {
        // 1. Scan effects directory for previously imported effects
        const scanResult = await window.api.scanEffects();
        if (scanResult.success && scanResult.effects.length > 0) {
            this.effectManager.effectNames = this.effectManager.effectNames || {};
            for (const { effectId, meta, basePath } of scanResult.effects) {
                this.effectManager.registerEffect(effectId, meta, basePath);
                this.effectManager.effectNames[effectId] = this._nameFromMeta(meta);
                this.effectLibrary.addCard(effectId, meta);
            }
        }

        // 2. Restore settings from JSON
        const settingsResult = await window.api.loadSettings();
        if (settingsResult.success && settingsResult.settings) {
            // Migrate legacy settings (pre-preset era) to Preset 1
            if (settingsResult.settings.keyBindings && !settingsResult.settings.presets) {
                settingsResult.settings.presets = { 1: settingsResult.settings.keyBindings };
                delete settingsResult.settings.keyBindings;
            }

            // Merge loaded settings with defaults
            this.state = { ...this.state, ...settingsResult.settings };
            
            // Migration: Correct the previous default mapping mistake (64/65 -> 66/67)
            if (this.state.engineKey === 64 && this.state.settingsKey === 65) {
                this.state.engineKey = 66; // F8
                this.state.settingsKey = 67; // F9
            }

            // Ensure presets object exists fully
            this.state.presets = this.state.presets || {};
            for (let i = 1; i <= 7; i++) {
                if (!this.state.presets[i]) this.state.presets[i] = {};
            }
            if (!this.state.presetNames) this.state.presetNames = {};
            for (let i = 1; i <= 7; i++) {
                if (!this.state.presetNames[i]) this.state.presetNames[i] = `PRESET ${i}`;
            }

            // Apply loaded globals
            this.effectManager.maxN = this.state.maxN;
            await window.api.setSystemKeys(this.state.engineKey, this.state.settingsKey);
        }

        // Load the active preset
        this.switchPreset(this.state.currentPreset, true);
    }

    /**
     * Switches to a different preset. Updates UI and EffectManager.
     */
    switchPreset(presetIndex, isRestore = false) {
        if (presetIndex < 1 || presetIndex > 7) return;

        // 1. Save current state to memory (unless restoring initially)
        if (!isRestore) {
            this.state.presets[this.state.currentPreset] = { ...this.effectManager.keyBindings };
        }


        // 2. Switch
        this.state.currentPreset = presetIndex;
        
        // 3. Clear existing bindings in effect manager
        this.virtualKeyboard.clearAllInternal(); // Clears bindings without triggering save internally

        // 4. Apply new bindings
        const newBindings = this.state.presets[presetIndex] || {};
        for (const [keyCode, effectIds] of Object.entries(newBindings)) {
            const parsedKey = parseInt(keyCode, 10);
            this.effectManager.bindKey(parsedKey, [...effectIds]);
            this.virtualKeyboard.updateBadge(parsedKey);
        }

        // 5. Update UI active button
        document.querySelectorAll('.cyber-btn.preset').forEach((btn, idx) => {
            if (idx + 1 === presetIndex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 6. Save to disk
        this.save();

        // 7. Safeguard: Refresh effect library filters in case layout shifted
        if (this.effectLibrary && typeof this.effectLibrary._applyFilters === 'function') {
            this.effectLibrary._applyFilters();
        }
    }

    /**
     * Updates global config (Max N, Keys, Names)
     */
    updateConfig(configOverrides) {
        this.state = { ...this.state, ...configOverrides };
        this.effectManager.maxN = this.state.maxN;
        window.api.setSystemKeys(this.state.engineKey, this.state.settingsKey);
        this.save();
    }

    /**
     * Saves current state to disk
     */
    async save() {
        // Ensure current active bindings are synced to the active preset slot in memory
        this.state.presets[this.state.currentPreset] = { ...this.effectManager.keyBindings };
        await window.api.saveSettings(this.state);
    }

    _nameFromMeta(meta) {
        if (meta.name) return meta.name;
        let name = meta.path || '';
        if (name.includes('/')) name = name.split('/').pop();
        if (name.includes('.')) name = name.split('.')[0];
        return name || 'unnamed';
    }
}
