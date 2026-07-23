import { uiLog } from '../ui/UILogger';
import { IEffectManager, IPersistenceManager } from '../shared/interfaces';
import { EffectLibrary } from '../ui/EffectLibrary';

export class SyncManager {
    private effectManager: IEffectManager;
    private effectLibrary: EffectLibrary;
    private persistence: IPersistenceManager;
    private indicatorSync: HTMLElement | null;
    private activeSyncCount = 0;

    constructor(
        effectManager: IEffectManager, 
        effectLibrary: EffectLibrary, 
        persistence: IPersistenceManager
    ) {
        this.effectManager = effectManager;
        this.effectLibrary = effectLibrary;
        this.persistence = persistence;
        this.indicatorSync = document.getElementById('sync-indicator');
    }

    private updateSyncIndicator() {
        if (!this.indicatorSync) return;
        if (this.activeSyncCount > 0) {
            this.indicatorSync.classList.remove('hidden');
        } else {
            this.indicatorSync.classList.add('hidden');
        }
    }

    public async syncAssetsWithUplink(ip: string, port: number) {
        const syncMode = this.persistence.state.syncMode || 'streaming';
        
        this.activeSyncCount++;
        this.updateSyncIndicator();

        uiLog(`[SYNC] Fetching asset manifest from uplink...`, 'default');
        try {
            const response = await fetch(`http://${ip}:${port}/api/effects`);
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const remoteAssets = await response.json();
            
            let dlHashes = [];
            let streamedCount = 0;
            let blockedCount = 0;

            for (const remote of remoteAssets) {
                const hash = remote.effectId;
                const meta = remote.meta;

                if (!this.effectManager.players[hash]) {
                    if (syncMode === 'streaming') {
                        const streamingBasePath = `http://${ip}:${port}/stream/${hash}/`;
                        this.effectManager.registerEffect(hash, meta, streamingBasePath);
                        
                        this.effectManager.effectNames = this.effectManager.effectNames || {};
                        this.effectManager.effectNames[hash] = meta.name || hash;
                        
                        this.effectLibrary.addCard(hash, meta);
                        streamedCount++;
                    } else {
                        dlHashes.push(hash);
                    }
                }
            }
            
            if (syncMode === 'streaming') {
                uiLog(`[SYNC] Streaming Active: Mounted ${streamedCount} assets remotely.`, 'import');
                window.api.sendOsc(ip, '/sceneplus/sys/sync-progress', [100]);
                return;
            }

            if (dlHashes.length === 0) {
                uiLog(`[SYNC] Local library is up to date.`, 'import');
                return;
            }
            
            uiLog(`[SYNC] Downloading ${dlHashes.length} missing asset(s)...`, 'import');
            
            for (let i = 0; i < dlHashes.length; i++) {
                const hash = dlHashes[i];
                const dlUrl = `http://${ip}:${port}/api/download/${hash}`;
                
                uiLog(`[SYNC] (${i+1}/${dlHashes.length}) DL: ${hash.substring(0,8)}...`, 'default');
                
                const tempFile = await window.api.downloadAsset(dlUrl, hash);
                if (tempFile) {
                    const isGuest = (syncMode === 'guest');
                    
                    const result = await window.api.importEffectBackground(tempFile, isGuest, hash);
                    if (result.success && result.meta && result.basePath && result.hash) {
                        this.effectManager.registerEffect(result.hash, result.meta, result.basePath);
                        
                        this.effectManager.effectNames = this.effectManager.effectNames || {};
                        this.effectManager.effectNames[result.hash] = result.meta.name || result.hash;
                        
                        this.effectLibrary.addCard(result.hash, result.meta);
                        uiLog(`[SYNC] Installed: ${result.meta.name}`, 'default');
                    } else {
                        uiLog(`[SYNC] Install Failed: ${result.error}`, 'error');
                    }
                }
            }
            
            uiLog(`[SYNC] Synchronization complete.`, 'import');
        } catch (err: any) {
            uiLog(`[SYNC] Sync failed: ${err.message}`, 'error');
        } finally {
            this.activeSyncCount--;
            this.updateSyncIndicator();
        }
    }
}
