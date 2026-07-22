import { EffectMeta } from './types';

export interface IEffectManager {
    players: Record<string, any>;
    keyBindings: Record<string, string[]>;
    effectNames?: Record<string, string>;
    effectParams: Record<string, Record<string, any>>;
    onTriggerKey?: (type: 'down' | 'up', keyCode: number, effectIds: string[]) => void;
    maxN?: number;

    updateMouse(x: number, y: number): void;
    handleMouseDown(x: number, y: number, button: number): void;
    handleMouseUp(x: number, y: number, button: number): void;
    handleMouseWheel(x: number, y: number, dx: number, dy: number): void;
    registerEffect(effectId: string, meta: EffectMeta, basePath: string): void;
    bindKey(keyCode: string | number, effectIds: string[]): void;
    triggerKey(keyCode: number, type: 'down' | 'up'): void;
    handleOscTrigger(address: string, args: any[]): void;
    panic(): void;
}

export interface INetworkController {
    currentMode: string;
    activeTargetIp: string;
    activeHttpPort: number;
    discoveredDevices: string[];
    onDiscoveredDevicesChanged?: (devices: string[]) => void;

    setMode(mode: string): Promise<void>;
    attemptConnection(ip: string, onTimeout: () => void): void;
    handlePong(senderIp: string, onConnected: () => void): void;
    handlePing(senderIp: string, senderHttpPort: number): void;
    addDiscoveredDevice(ip: string): boolean;
}

export interface ISyncManager {
    syncAssetsWithUplink(ip: string, port: number): Promise<void>;
}

export interface IUIManager {
    updateImportProgress(percent: number): void;
    updateImportStatus(msg: string): void;
    refreshPresetNamesUI(names: Record<string | number, string>): void;
    hideDiagModal(): void;
    renderDiscoveredDevicesList(devices: string[], onConnectClick: (ip: string) => void): void;
}

export interface IPersistenceManager {
    state: any;
    save(): Promise<void>;
    loadState(newState?: any): Promise<any>;
    restore(): Promise<void>;
    switchPreset(presetIndex: number, isRestore?: boolean): void;
    updateConfig(configOverrides: any): void;
    renameEffect(effectId: string, newName: string): void;
}
