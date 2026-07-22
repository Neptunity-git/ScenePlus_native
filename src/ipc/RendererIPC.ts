import { IEffectManager, INetworkController, ISyncManager, IUIManager, IPersistenceManager } from '../shared/interfaces';
import { uiLog } from '../ui/UILogger';

type OscHandler = (args: any[], senderIp: string) => void;

export class RendererIPC {
    private effectManager: IEffectManager;
    private networkController: INetworkController;
    private syncManager: ISyncManager;
    private uiManager: IUIManager;
    private persistence: IPersistenceManager;
    private oscHandlers: Map<string, OscHandler> = new Map();

    constructor(
        effectManager: IEffectManager,
        networkController: INetworkController,
        syncManager: ISyncManager,
        uiManager: IUIManager,
        persistence: IPersistenceManager
    ) {
        this.effectManager = effectManager;
        this.networkController = networkController;
        this.syncManager = syncManager;
        this.uiManager = uiManager;
        this.persistence = persistence;

        this.initOscRouter();
    }

    public registerOscHandler(address: string, handler: OscHandler) {
        this.oscHandlers.set(address, handler);
    }

    private initOscRouter() {
        this.registerOscHandler('/sceneplus/sys/discover', (_args, senderIp) => {
            window.api.sendOsc(senderIp, '/sceneplus/sys/discovered', [this.networkController.activeHttpPort]);
        });

        this.registerOscHandler('/sceneplus/sys/discovered', (_args, senderIp) => {
            this.networkController.addDiscoveredDevice(senderIp);
        });

        this.registerOscHandler('/sceneplus/sys/ping', (args, senderIp) => {
            const port = args[0] || 0;
            this.networkController.handlePing(senderIp, port);
        });

        this.registerOscHandler('/sceneplus/sys/pong', (args, senderIp) => {
            this.networkController.handlePong(senderIp, () => {
                this.syncManager.syncAssetsWithUplink(senderIp, args[0] || 0);
            });
        });

        this.registerOscHandler('/sceneplus/sys/sync-progress', (args) => {
            const p = args[0];
            uiLog(`[UPLINK] Sync progress: ${p}%`, 'import');
        });
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

        // Transmit OSC trigger signals when in TRANSMIT mode with active connection
        this.effectManager.onTriggerKey = (type: 'down' | 'up', keyCode: number, effectIds: string[]) => {
            if (this.networkController.currentMode === 'send' && this.networkController.activeTargetIp) {
                const oscAddress = type === 'down' ? '/sceneplus/play' : '/sceneplus/stop';
                for (const id of effectIds) {
                    window.api.sendOsc(this.networkController.activeTargetIp, oscAddress, [id, keyCode]);
                }
            }
        };

        window.api.onPanic(() => {
            uiLog('!!! PANIC !!! ALL EFFECTS KILLED', 'error');
            this.effectManager.panic();
        });

        window.api.onImportProgress((percent: number) => this.uiManager.updateImportProgress(percent));
        window.api.onImportStatus((msg: string) => this.uiManager.updateImportStatus(msg));

        window.api.onOscMessage((msg: { address: string; args: any[]; rinfo: { address: string; port: number } }) => {
            const { address, args, rinfo } = msg;
            const senderIp = rinfo.address;

            const registeredHandler = this.oscHandlers.get(address);
            if (registeredHandler) {
                registeredHandler(args, senderIp);
                return;
            }

            // Route standard OSC triggers to EffectManager
            if (this.networkController.currentMode === 'receive' || address.startsWith('/sceneplus/')) {
                this.effectManager.handleOscTrigger(address, args);
            }
        });
    }
}
