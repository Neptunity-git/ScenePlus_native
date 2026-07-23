import { uiLog } from '../ui/UILogger';

export class NetworkController {
    public currentMode: string = 'neutral';
    public activeTargetIp: string = '';
    public activeHttpPort: number = 0;
    public pendingTargetIp: string = '';
    
    private pingTimeoutId: any = null;
    public discoveredDevices: string[] = [];
    public onDiscoveredDevicesChanged?: (devices: string[]) => void;
    public onReceivedConnectionsChanged?: (connections: Map<string, {port: number, lastSeen: number}>) => void;
    public onActiveTargetChanged?: (targetIp: string) => void;
    public receivedConnections = new Map<string, {port: number, lastSeen: number}>();
    private localIps: string[] = [];
    
    private onConnectionEstablished: (ip: string, port: number) => void;

    constructor(onConnectionEstablished: (ip: string, port: number) => void) {
        this.onConnectionEstablished = onConnectionEstablished;
        this.refreshLocalIps();
    }

    private async refreshLocalIps() {
        try {
            const ifaces = await window.api.getAllLocalIps();
            this.localIps = ifaces.map(i => i.ip);
        } catch (e) {
            this.localIps = [];
        }
    }

    public async setMode(mode: string): Promise<void> {
        this.currentMode = mode;
        this.activeTargetIp = ''; 
        this.pendingTargetIp = '';
        this.activeHttpPort = 0;
        if (this.pingTimeoutId) clearTimeout(this.pingTimeoutId);
        this.pingTimeoutId = null;
        await this.refreshLocalIps();

        if (this.onActiveTargetChanged) {
            this.onActiveTargetChanged('');
        }

        if (mode === 'neutral') {
            await window.api.stopOscServer();
            await window.api.stopHttpServer();
        } else {
            const startRes = await window.api.startOscServer();
            if (!startRes.success) {
                uiLog('Failed to bind UDP port 8000', 'error');
            }
            
            if (mode === 'send') {
                const httpRes = await window.api.startHttpServer();
                if (httpRes.success && httpRes.port) {
                    this.activeHttpPort = httpRes.port;
                } else {
                    uiLog(`Failed to start HTTP server: ${httpRes.error}`, 'error');
                }
            } else {
                await window.api.stopHttpServer();
            }
        }

        if (mode === 'receive') {
            this.receivedConnections.clear();
            if (this.onReceivedConnectionsChanged) {
                this.onReceivedConnectionsChanged(this.receivedConnections);
            }
            uiLog('RECEIVE MODE: Listening on port 8000', 'import');
        } else if (mode === 'send') {
            uiLog('TRANSMIT: Scan or enter IP manually', 'default');
        }
    }

    public attemptConnection(ip: string, onTimeout: () => void): void {
        this.pendingTargetIp = ip;
        uiLog(`PINGING ${ip}...`, 'default');
        window.api.sendOsc(ip, '/sceneplus/sys/ping', [this.activeHttpPort]);
        
        if (this.pingTimeoutId) clearTimeout(this.pingTimeoutId);
        this.pingTimeoutId = setTimeout(() => {
            uiLog(`CONNECTION FAILED: No response from ${ip}`, 'error');
            this.pendingTargetIp = '';
            onTimeout();
        }, 2000);
    }

    public handlePong(senderIp: string, onConnected: () => void): void {
        if (this.pendingTargetIp) {
            clearTimeout(this.pingTimeoutId);
            this.pingTimeoutId = null;
            this.activeTargetIp = this.pendingTargetIp;
            this.pendingTargetIp = '';
            
            uiLog(`UPLINK SECURED: Connected to ${this.activeTargetIp}`, 'fire');
            if (this.onActiveTargetChanged) {
                this.onActiveTargetChanged(this.activeTargetIp);
            }
            onConnected();
        }
    }

    public handlePing(senderIp: string, senderHttpPort: number): void {
        if (this.currentMode !== 'receive') {
            uiLog(`[RX] Rejected connection from ${senderIp} (not in RECEIVE mode)`, 'error');
            return;
        }

        window.api.sendOsc(senderIp, '/sceneplus/sys/pong', []);

        if (!this.receivedConnections.has(senderIp)) {
            uiLog(`[RX] ◀ NEW LINK ESTABLISHED: ${senderIp}:${senderHttpPort}`, 'import');
            this.receivedConnections.set(senderIp, { port: senderHttpPort, lastSeen: Date.now() });
            this.onConnectionEstablished(senderIp, senderHttpPort);
        } else {
            const conn = this.receivedConnections.get(senderIp);
            if (conn) conn.lastSeen = Date.now();
        }

        if (this.onReceivedConnectionsChanged) {
            this.onReceivedConnectionsChanged(this.receivedConnections);
        }
    }

    public addDiscoveredDevice(ip: string): boolean {
        if (this.localIps.includes(ip) || ip === '127.0.0.1' || ip === 'localhost') return false;
        if (this.discoveredDevices.includes(ip)) return false;
        this.discoveredDevices.push(ip);
        if (this.onDiscoveredDevicesChanged) {
            this.onDiscoveredDevicesChanged(this.discoveredDevices);
        }
        return true;
    }
}
