import { screen } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import { WindowManager } from './WindowManager';

export class InputManager {
    private windowManager: WindowManager;
    public toggleEngineKey: number = UiohookKey.F8;
    public toggleSettingsKey: number = UiohookKey.F9;
    private pressedKeys = new Set<number>();

    constructor(windowManager: WindowManager) {
        this.windowManager = windowManager;
    }

    /** Convert screen-level cursor position to window-local coordinates */
    private getLocalMousePos(): { x: number; y: number } {
        const pos = screen.getCursorScreenPoint();
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            const bounds = win.getBounds();
            return { x: pos.x - bounds.x, y: pos.y - bounds.y };
        }
        return pos;
    }

    public startHooks(): void {
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
                    this.windowManager.setState({ engineOn: !state.engineOn });
                    if (!this.windowManager.getState().engineOn) {
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
}
