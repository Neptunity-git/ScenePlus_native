export interface AppState {
    engineOn: boolean;
    settingsOpen: boolean;
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
    presetNames?: Record<number, string>;
    [key: string]: any;
}
