export interface AppState {
    engineOn: boolean;
    settingsOpen: boolean;
    displayId?: number;
}

export interface DisplayInfo {
    id: number;
    label: string;
    bounds: { x: number; y: number; width: number; height: number };
    isPrimary: boolean;
}

export interface EffectMeta {
    name: string;
    description: string;
    mediatype: string;
    playmode: string;
    version: string;
    author: string;
    usesSDK?: boolean;
    main?: string;
    [key: string]: any;
}

export interface ImportResult {
    success: boolean;
    hash?: string;
    meta?: EffectMeta;
    basePath?: string;
    error?: string;
    diagnostic?: boolean;
    template?: string;
}

export interface NetworkInterfaceInfo {
    ip: string;
    name: string;
}

export interface CaptureResult {
    success: boolean;
    dataUrl?: string;
    error?: string;
}

export interface ConfirmDialogOptions {
    message?: string;
    detail?: string;
}

export interface AlertDialogOptions {
    message?: string;
    detail?: string;
}

export interface SettingsConfig {
    maxEffects?: number;
    syncMode?: string;
    blockAssignedKeys?: boolean;
    displayId?: number;
    presetNames?: Record<number, string>;
    folderPaths?: string[];
    effectFolders?: Record<string, string>;
    [key: string]: any;
}
