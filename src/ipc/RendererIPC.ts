import { EffectManager } from '../engine/EffectManager';
import { NetworkController } from '../network/NetworkController';
import { SyncManager } from '../network/SyncManager';
import { UIManager } from '../ui/UIManager';
import { PersistenceManager } from '../ui/PersistenceManager';
import { uiLog } from '../ui/UILogger';

export class RendererIPC {
    private effectManager: EffectManager;
    private networkController: NetworkController;
    private syncManager: SyncManager;
    private uiManager: UIManager;
    private persistence: PersistenceManager;

    constructor(
        effectManager: EffectManager,
        networkController: NetworkController,
        syncManager: SyncManager,
        uiManager: UIManager,
        persistence: PersistenceManager
    ) {
        this.effectManager = effectManager;
        this.networkController = networkController;
        this.syncManager = syncManager;
        this.uiManager = uiManager;
        this.persistence = persistence;
    }

    public setupBindings() {
        window.api.onMouseMove((pos: { x: number; y: number }) => this.effectManager.updateMouse(pos.x, pos.y));
        window.api.onMouseDown((data: { button: number; x: number; y: number; clicks: number }) => this.effectManager.handleMouseDown(data.x, data.y, data.button));
        window.api.onMouseUp((data: { button: number; x: number; y: number }) => this.effectManager.handleMouseUp(data.x, data.y, data.button));
        window.api.onMouseWheel((data: { x: number; y: number; amount: number; direction: number; rotation: number }) => {
            const dx = data.direction === 1 ? data.amount : 0;
            const dy = data.direction === 0 ? data.amount : 0;
            this.effectManager.handleMouseWheel(data.x, data.y, dx, dy);
        });

        window.api.onKeyDown((keyCode: number) => this.effectManager.triggerKey(keyCode, 'down'));
        window.api.onKeyUp((keyCode: number) => this.effectManager.triggerKey(keyCode, 'up'));

        window.api.onPanic(() => {
            uiLog('!!! PANIC !!! ALL EFFECTS KILLED', 'error');
            this.effectManager.panic();
        });

        window.api.onImportProgress((percent: number) => this.uiManager.updateImportProgress(percent));
        window.api.onImportStatus((msg: string) => this.uiManager.updateImportStatus(msg));

        window.api.onOscMessage((msg: { address: string; args: any[]; rinfo: { address: string; port: number } }) => {
            const { address, args, rinfo } = msg;
            const senderIp = rinfo.address;
            if (address === '/sceneplus/sys/ping') {
                const port = args[0] || 0;
                this.networkController.handlePing(senderIp, port);
                return;
            }

            if (address === '/sceneplus/sys/pong') {
                this.networkController.handlePong(senderIp, () => {
                    this.syncManager.syncAssetsWithUplink(senderIp, args[0] || 0);
                });
                return;
            }
            
            if (address === '/sceneplus/sys/sync-progress') {
                const p = args[0];
                uiLog(`[UPLINK] Sync progress: ${p}%`, 'import');
                return;
            }

            // Route standard OSC triggers to EffectManager
            if (this.networkController.currentMode === 'receive') {
                this.effectManager.handleOscTrigger(address, args);
            }
        });
    }
}
