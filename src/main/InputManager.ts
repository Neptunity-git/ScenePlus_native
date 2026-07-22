import { screen, app } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import { WindowManager } from './WindowManager';
import * as path from 'path';

let keyblock: any = null;
try {
    keyblock = require(path.join(app.getAppPath(), 'out', 'keyblock.node'));
} catch (e) {
    console.warn('[InputManager] Could not load keyblock.node', e);
}

function uiohookToVk(uiohookCode: number): number | null {
    if (uiohookCode >= 2 && uiohookCode <= 10) return 49 + (uiohookCode - 2); // 1-9
    if (uiohookCode === 11) return 48; // 0

    const row1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
    if (uiohookCode >= 16 && uiohookCode <= 25) return row1[uiohookCode - 16].charCodeAt(0);
    
    const row2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
    if (uiohookCode >= 30 && uiohookCode <= 38) return row2[uiohookCode - 30].charCodeAt(0);
    
    const row3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
    if (uiohookCode >= 44 && uiohookCode <= 50) return row3[uiohookCode - 44].charCodeAt(0);

    return null;
}

export class InputManager {
    private windowManager: WindowManager;
    public toggleEngineKey: number = UiohookKey.F8;
    public toggleSettingsKey: number = UiohookKey.F9;
    private pressedKeys = new Set<number>();
    
    public blockAssignedKeys: boolean = false;
    private assignedKeyCodes = new Set<number>();

    constructor(windowManager: WindowManager) {
        this.windowManager = windowManager;
    }

    /** Convert screen-level cursor position to window-local CSS coordinates */
    private getLocalMousePos(): { x: number; y: number } {
        const pos = screen.getCursorScreenPoint();
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            const bounds = win.getBounds();
            const localX = pos.x - bounds.x;
            const localY = pos.y - bounds.y;
            const zoomFactor = win.webContents.getZoomFactor();
            return {
                x: localX / zoomFactor,
                y: localY / zoomFactor
            };
        }
        return pos;
    }

    public startHooks(): void {
        // Start native blocking hook FIRST
        if (keyblock) {
            keyblock.start();
            keyblock.setEnabled(this.windowManager.getState().engineOn && this.blockAssignedKeys);
            this.syncBlockedKeys();
        }

        uIOhook.on('keydown', (e) => {
            if (this.pressedKeys.has(e.keycode)) return;
            this.pressedKeys.add(e.keycode);

            const state = this.windowManager.getState();
            const mainWindow = this.windowManager.getWindow();

            // Forward key to engine if active AND it's not one of our system toggle keys
            if (state.engineOn && e.keycode !== this.toggleEngineKey && e.keycode !== this.toggleSettingsKey) {
                if (this.windowManager.isAlive() && mainWindow) {
                    mainWindow.webContents.send('keydown', e.keycode);
                }
            }

            // Toggle Engine (only if Settings are closed)
            if (e.keycode === this.toggleEngineKey) {
                if (!state.settingsOpen) {
                    const nextEngineOn = !state.engineOn;
                    this.windowManager.setState({ engineOn: nextEngineOn });
                    if (keyblock) keyblock.setEnabled(nextEngineOn && this.blockAssignedKeys);

                    if (!nextEngineOn) {
                        this.panicAllEffects();
                    }
                }
            }

            // Toggle Settings (and force engine off when opened)
            if (e.keycode === this.toggleSettingsKey) {
                const newSettingsOpen = !state.settingsOpen;
                this.windowManager.setState({
                    settingsOpen: newSettingsOpen,
                    engineOn: newSettingsOpen ? false : state.engineOn
                });
                if (keyblock) keyblock.setEnabled(!newSettingsOpen && state.engineOn && this.blockAssignedKeys);

                if (newSettingsOpen) {
                    this.panicAllEffects();
                    if (mainWindow) mainWindow.focus();
                } else {
                    if (mainWindow) mainWindow.blur();
                }
            }
        });

        uIOhook.on('keyup', (e) => {
            this.pressedKeys.delete(e.keycode);
            const state = this.windowManager.getState();

            if (state.engineOn && e.keycode !== this.toggleEngineKey && e.keycode !== this.toggleSettingsKey) {
                if (this.windowManager.isAlive()) {
                    this.windowManager.getWindow()?.webContents.send('keyup', e.keycode);
                }
            }
        });

        uIOhook.on('mousemove', (e) => {
            const state = this.windowManager.getState();
            if (state.engineOn && this.windowManager.isAlive()) {
                const pos = this.getLocalMousePos();
                this.windowManager.getWindow()?.webContents.send('mousemove', pos);
            }
        });

        uIOhook.on('mousedown', (e) => {
            const state = this.windowManager.getState();
            if (state.engineOn && this.windowManager.isAlive()) {
                const pos = this.getLocalMousePos();
                this.windowManager.getWindow()?.webContents.send('mousedown', {
                    button: e.button,
                    x: pos.x,
                    y: pos.y,
                    clicks: e.clicks
                });
            }
        });

        uIOhook.on('mouseup', (e) => {
            const state = this.windowManager.getState();
            if (state.engineOn && this.windowManager.isAlive()) {
                const pos = this.getLocalMousePos();
                this.windowManager.getWindow()?.webContents.send('mouseup', {
                    button: e.button,
                    x: pos.x,
                    y: pos.y
                });
            }
        });

        uIOhook.on('wheel', (e) => {
            const state = this.windowManager.getState();
            if (state.engineOn && this.windowManager.isAlive()) {
                const pos = this.getLocalMousePos();
                this.windowManager.getWindow()?.webContents.send('mousewheel', {
                    x: pos.x,
                    y: pos.y,
                    amount: e.amount,
                    direction: e.direction,
                    rotation: e.rotation
                });
            }
        });

        uIOhook.start();
    }

    public stopHooks(): void {
        uIOhook.stop();
        if (keyblock) keyblock.stop();
    }

    private panicAllEffects(): void {
        if (this.windowManager.isAlive()) {
            this.windowManager.getWindow()?.webContents.send('panic');
        }
    }

    public setSystemKeys(engineKey?: number, settingsKey?: number): void {
        if (engineKey !== undefined) this.toggleEngineKey = engineKey;
        if (settingsKey !== undefined) this.toggleSettingsKey = settingsKey;
    }

    public setAssignedKeys(keyCodes: number[], blockAssignedKeys?: boolean): void {
        this.assignedKeyCodes = new Set(keyCodes);
        if (blockAssignedKeys !== undefined) {
            this.blockAssignedKeys = blockAssignedKeys;
            if (keyblock) {
                const state = this.windowManager.getState();
                keyblock.setEnabled(state.engineOn && this.blockAssignedKeys);
            }
        }
        this.syncBlockedKeys();
    }
    
    private syncBlockedKeys(): void {
        if (!keyblock) return;
        keyblock.clearAllBlockedKeys();
        for (const code of this.assignedKeyCodes) {
            const vk = uiohookToVk(code);
            if (vk !== null) {
                keyblock.setBlockedKey(vk, true);
            }
        }
    }
}
