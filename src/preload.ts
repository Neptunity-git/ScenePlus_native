import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron';
import { AppState, ImportResult, NetworkInterfaceInfo, CaptureResult, ConfirmDialogOptions, AlertDialogOptions, SettingsConfig } from './shared/types';

export const api = {
    // State & key events from main process
    onStateChanged: (callback: (state: AppState) => void) => ipcRenderer.on('state-changed', (_event, value) => callback(value)),
    onPanic: (callback: () => void) => ipcRenderer.on('panic', () => callback()),
    onKeyDown: (callback: (keycode: number) => void) => ipcRenderer.on('keydown', (_event, keycode) => callback(keycode)),
    onKeyUp: (callback: (keycode: number) => void) => ipcRenderer.on('keyup', (_event, keycode) => callback(keycode)),
    onMouseMove: (callback: (pos: { x: number; y: number }) => void) => ipcRenderer.on('mousemove', (_event, pos) => callback(pos)),
    onMouseDown: (callback: (data: { button: number; x: number; y: number; clicks: number }) => void) => ipcRenderer.on('mousedown', (_event, data) => callback(data)),
    onMouseUp: (callback: (data: { button: number; x: number; y: number }) => void) => ipcRenderer.on('mouseup', (_event, data) => callback(data)),
    onMouseWheel: (callback: (data: { x: number; y: number; amount: number; direction: number; rotation: number }) => void) => ipcRenderer.on('mousewheel', (_event, data) => callback(data)),

    // Effect management
    unpackEffect: (buffer: ArrayBuffer, effectId: string): Promise<{success: boolean; meta?: any; effectId?: string; basePath?: string; error?: string}> => ipcRenderer.invoke('unpack-effect', buffer, effectId),
    importEffectBackground: (sourcePath: string, customDestOrIsGuest?: string | boolean): Promise<ImportResult> => ipcRenderer.invoke('import-effect-background', sourcePath, customDestOrIsGuest),
    readDoc: (docName: string): Promise<{success: boolean; content?: string; error?: string}> => ipcRenderer.invoke('read-doc', docName),
    exportDoc: (docName: string, content: string): Promise<{success: boolean; error?: string}> => ipcRenderer.invoke('export-doc', docName, content),
    deleteEffect: (effectId: string): Promise<{success: boolean; error?: string}> => ipcRenderer.invoke('delete-effect', effectId),
    scanEffects: (): Promise<{success: boolean; effects?: any[]; error?: string}> => ipcRenderer.invoke('scan-effects'),
    captureScreen: (resolution: string): Promise<CaptureResult> => ipcRenderer.invoke('capture-screen', resolution),
    
    // Effect Composer
    openEffectComposer: (): Promise<{success: boolean}> => ipcRenderer.invoke('open-effect-composer'),
    saveComposedEffect: (meta: string, assetData: any): Promise<{success: boolean; hash?: string; error?: string}> => ipcRenderer.invoke('save-composed-effect', meta, assetData),
    selectAssetFile: (filters?: any[]): Promise<{canceled: boolean; file: string | null}> => ipcRenderer.invoke('select-asset-file', filters),
    onEffectComposed: (callback: (data: { hash: string; meta: any; basePath: string }) => void) => ipcRenderer.on('effect-composed', (_event, data) => callback(data)),

    // Listeners for progress
    onImportProgress: (callback: (percent: number) => void) => ipcRenderer.on('import-progress', (_event, value) => callback(value)),
    onImportStatus: (callback: (message: string) => void) => ipcRenderer.on('import-status', (_event, message) => callback(message)),

    // File picker
    openFileDialog: (): Promise<{canceled: boolean; files: string[]}> => ipcRenderer.invoke('open-file-dialog'),

    // Persistence & Settings
    setSystemKeys: (engineCode?: number, settingsCode?: number): Promise<{success: boolean}> => ipcRenderer.invoke('set-system-keys', engineCode, settingsCode),
    setAssignedKeys: (keyCodes: number[], blockAssignedKeys?: boolean): Promise<{success: boolean}> => ipcRenderer.invoke('set-assigned-keys', keyCodes, blockAssignedKeys),
    saveSettings: (settings: SettingsConfig): Promise<{success: boolean; error?: string}> => ipcRenderer.invoke('save-settings', settings),
    loadSettings: (): Promise<{success: boolean; settings: SettingsConfig | null; error?: string}> => ipcRenderer.invoke('load-settings'),
    setAppState: (state: Partial<AppState>): Promise<{success: boolean}> => ipcRenderer.invoke('set-app-state', state),

    // Async Dialogs
    confirmDialog: (options: ConfirmDialogOptions): Promise<boolean> => ipcRenderer.invoke('confirm-dialog', options),
    alertDialog: (options: AlertDialogOptions): Promise<void> => ipcRenderer.invoke('alert-dialog', options),

    // OSC Networking
    getLocalIp: (): Promise<string> => ipcRenderer.invoke('get-local-ip'),
    getAllLocalIps: (): Promise<NetworkInterfaceInfo[]> => ipcRenderer.invoke('get-all-local-ips'),
    startOscServer: (): Promise<{success: boolean; error?: string}> => ipcRenderer.invoke('start-osc-server'),
    stopOscServer: (): Promise<{success: boolean}> => ipcRenderer.invoke('stop-osc-server'),
    sendOsc: (targetIp: string, address: string, args: any[]): Promise<{success: boolean; error?: string}> => ipcRenderer.invoke('send-osc', targetIp, address, args),
    scanSubnet: (): Promise<{success: boolean; subnets?: string[]; error?: string}> => ipcRenderer.invoke('scan-subnet'),
    onOscMessage: (callback: (msg: any) => void) => ipcRenderer.on('osc-message', (_event, msg) => callback(msg)),

    // HTTP Sync & Streaming
    startHttpServer: (): Promise<{success: boolean; port?: number; error?: string}> => ipcRenderer.invoke('start-http-server'),
    stopHttpServer: (): Promise<{success: boolean}> => ipcRenderer.invoke('stop-http-server'),
    downloadAsset: (url: string, hash: string): Promise<string | null> => ipcRenderer.invoke('download-asset', url, hash),

    // WebUtils for path resolution (Electron 28+)
    getPathForFile: (file: File): string => {
        return webUtils.getPathForFile(file);
    },

    // UI Scaling
    setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor)
};

contextBridge.exposeInMainWorld('api', api);

// Declare the window property for TypeScript
declare global {
    interface Window {
        api: typeof api;
        currentMousePos: { x: number; y: number };
    }
}
