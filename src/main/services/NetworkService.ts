import { Client, Server } from 'node-osc';
import * as os from 'os';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { WindowManager } from '../WindowManager';
import { NetworkInterfaceInfo } from '../../shared/types';

export class NetworkService {
    private oscServer: Server | null = null;
    private persistentOscClient: Client | null = null;
    private currentTargetIp: string | null = null;

    private httpServer: http.Server | null = null;
    private httpPort: number = 0;

    private windowManager: WindowManager;

    constructor(windowManager: WindowManager) {
        this.windowManager = windowManager;
    }

    public getLocalIp(): string {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const ifaces = interfaces[name];
            if (!ifaces) continue;
            for (const iface of ifaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    public getAllLocalIps(): NetworkInterfaceInfo[] {
        const result: NetworkInterfaceInfo[] = [];
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const ifaces = interfaces[name];
            if (!ifaces) continue;
            for (const iface of ifaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    result.push({ ip: iface.address, name: name });
                }
            }
        }
        return result;
    }

    // --- OSC Server / Client ---

    public startOscServer(): { success: boolean; error?: string } {
        if (this.oscServer) return { success: true };
        try {
            this.oscServer = new Server(8000, '0.0.0.0', () => {
                console.log('[OSC] Server listening on port 8000');
            });
            this.oscServer.on('message', (msg: any, rinfo: any) => {
                const address = msg[0];
                const args = msg.slice(1);
                let senderIp = rinfo?.address || 'unknown';
                if (senderIp.startsWith('::ffff:')) {
                    senderIp = senderIp.replace('::ffff:', '');
                }
                const normalizedRinfo = { ...rinfo, address: senderIp };
                console.log(`[OSC-RX] ${address} from ${senderIp}:${rinfo?.port}`);
                
                const win = this.windowManager.getWindow();
                if (win && !win.isDestroyed()) {
                    win.webContents.send('osc-message', { address, args, rinfo: normalizedRinfo });
                }
            });
            this.oscServer.on('error', (err: any) => {
                console.error('[OSC Server Error]', err.message);
            });
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public stopOscServer(): { success: boolean } {
        if (this.oscServer) {
            this.oscServer.close();
            this.oscServer = null;
            console.log('[OSC] Server stopped');
        }
        return { success: true };
    }

    public sendOsc(targetIp: string, address: string, args: any[]): { success: boolean; error?: string } {
        try {
            if (!this.persistentOscClient || this.currentTargetIp !== targetIp) {
                if (this.persistentOscClient) {
                    try { this.persistentOscClient.close(); } catch(e) {}
                }
                this.persistentOscClient = new Client(targetIp, 8000);
                this.currentTargetIp = targetIp;
            }
            this.persistentOscClient.send(address, ...args);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public async scanSubnet(): Promise<{ success: boolean; subnets?: string[]; error?: string }> {
        try {
            const interfaces = os.networkInterfaces();
            const subnets: string[] = [];
            for (const name of Object.keys(interfaces)) {
                const ifaces = interfaces[name];
                if (!ifaces) continue;
                for (const iface of ifaces) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        const parts = iface.address.split('.');
                        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
                        if (!subnets.includes(subnet)) subnets.push(subnet);
                    }
                }
            }
            
            for (const subnet of subnets) {
                for (let i = 1; i <= 254; i++) {
                    const ip = `${subnet}.${i}`;
                    try {
                        const c = new Client(ip, 8000);
                        c.send('/sceneplus/sys/discover', () => {
                            c.close();
                        });
                    } catch (e) { /* ignore */ }
                }
            }
            return { success: true, subnets };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    // --- HTTP Server ---

    public async startHttpServer(): Promise<{ success: boolean; port?: number; error?: string }> {
        if (this.httpServer) return { success: true, port: this.httpPort };
        
        return new Promise((resolve) => {
            try {
                this.httpServer = http.createServer((req, res) => {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    
                    const url = new URL(req.url || '', `http://${req.headers.host}`);
                    const pathname = url.pathname;
                    const effectsDir = path.join(app.getPath('userData'), 'effects');
                    
                    if (pathname === '/api/effects') {
                        try {
                            if (!fs.existsSync(effectsDir)) return res.end('[]');
                            const effectRoots = fs.readdirSync(effectsDir);
                            const results: any[] = [];
                            for (const hash of effectRoots) {
                                const metaPath = path.join(effectsDir, hash, 'meta.json');
                                if (fs.existsSync(metaPath)) {
                                    try {
                                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                                        results.push({ effectId: hash, meta });
                                    } catch(e) {}
                                }
                            }
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(results));
                        } catch (err) {
                            res.writeHead(500);
                            res.end('Server error');
                        }
                    } else if (pathname.startsWith('/api/download/')) {
                        const hash = pathname.split('/')[3];
                        if (!hash) return res.writeHead(400) && res.end('Bad Request');
                        
                        const scenefxPath = path.join(effectsDir, hash, `${hash}.scenefx`);
                        if (fs.existsSync(scenefxPath)) {
                            const stat = fs.statSync(scenefxPath);
                            res.writeHead(200, {
                                'Content-Type': 'application/zip',
                                'Content-Length': stat.size.toString(),
                                'Content-Disposition': `attachment; filename="${hash}.scenefx"`
                            });
                            fs.createReadStream(scenefxPath).pipe(res);
                        } else {
                            res.writeHead(404);
                            res.end('.scenefx not found');
                        }
                    } else if (pathname.startsWith('/stream/')) {
                        const parts = pathname.split('/');
                        const hash = parts[2];
                        if (!hash || parts.length < 4) return res.writeHead(400) && res.end();
                        
                        const relPath = decodeURIComponent(parts.slice(3).join('/'));
                        const targetFile = path.join(effectsDir, hash, relPath);
                        
                        const normalizedTarget = path.normalize(targetFile);
                        if (!normalizedTarget.startsWith(path.join(effectsDir, hash))) {
                            res.writeHead(403);
                            return res.end('Forbidden');
                        }
                        
                        if (fs.existsSync(normalizedTarget)) {
                            const ext = path.extname(normalizedTarget).toLowerCase();
                            let mime = 'application/octet-stream';
                            if (ext === '.html') mime = 'text/html';
                            else if (ext === '.css') mime = 'text/css';
                            else if (ext === '.js') mime = 'application/javascript';
                            else if (ext === '.mp4') mime = 'video/mp4';
                            else if (ext === '.webm') mime = 'video/webm';
                            else if (ext === '.mp3') mime = 'audio/mpeg';
                            else if (ext === '.png') mime = 'image/png';
                            else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
                            else if (ext === '.gif') mime = 'image/gif';
                            else if (ext === '.svg') mime = 'image/svg+xml';
                            
                            const stat = fs.statSync(normalizedTarget);
                            const range = req.headers.range;
                            
                            if (range && (mime.startsWith('video/') || mime.startsWith('audio/'))) {
                                const rangeParts = range.replace(/bytes=/, "").split("-");
                                const start = parseInt(rangeParts[0], 10);
                                const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : stat.size - 1;
                                const chunksize = (end - start) + 1;
                                
                                res.writeHead(206, {
                                    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                                    'Accept-Ranges': 'bytes',
                                    'Content-Length': chunksize.toString(),
                                    'Content-Type': mime
                                });
                                fs.createReadStream(normalizedTarget, { start, end }).pipe(res);
                            } else {
                                res.writeHead(200, {
                                    'Content-Type': mime,
                                    'Content-Length': stat.size.toString()
                                });
                                fs.createReadStream(normalizedTarget).pipe(res);
                            }
                        } else {
                            res.writeHead(404);
                            res.end('Not found');
                        }
                    } else {
                        res.writeHead(404);
                        res.end();
                    }
                });
                
                this.httpServer.listen(0, '0.0.0.0', () => {
                    this.httpPort = (this.httpServer!.address() as any).port;
                    console.log(`[HTTP] Server listening on port ${this.httpPort}`);
                    resolve({ success: true, port: this.httpPort });
                });
                
                this.httpServer.on('error', (err: any) => {
                    resolve({ success: false, error: err.message });
                });
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }

    public stopHttpServer(): { success: boolean } {
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
            this.httpPort = 0;
            console.log('[HTTP] Server stopped');
        }
        return { success: true };
    }
}
