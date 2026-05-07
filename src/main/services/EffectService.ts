import { app, protocol, utilityProcess } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';
import * as http from 'http';
import { WindowManager } from '../WindowManager';
import { EffectMeta, ImportResult } from '../../shared/types';

export class EffectService {
    private windowManager: WindowManager;
    private readonly assetsDir: string;

    constructor(windowManager: WindowManager) {
        this.windowManager = windowManager;
        this.assetsDir = path.join(app.getAppPath(), 'assets');
    }

    public getEffectsDir(): string {
        return path.join(app.getPath('userData'), 'effects');
    }

    public initializeWelcomePack(): void {
        const effectsDir = this.getEffectsDir();
        if (!fs.existsSync(effectsDir)) {
            fs.mkdirSync(effectsDir, { recursive: true });
        }

        const existing = fs.readdirSync(effectsDir).filter(f => {
            return fs.statSync(path.join(effectsDir, f)).isDirectory();
        });

        if (existing.length > 0) return;

        console.log('[WELCOME] First run detected. Installing official samples...');
        const samples = ['mouse_particle.scenefx', 'cyber_invert.scenefx', 'gravity_distortion.scenefx'];

        samples.forEach(s => {
            const src = path.join(this.assetsDir, s);
            if (fs.existsSync(src)) {
                try {
                    const buffer = fs.readFileSync(src);
                    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
                    
                    const dest = path.join(effectsDir, hash);
                    if (!fs.existsSync(dest)) {
                        fs.mkdirSync(dest, { recursive: true });
                        const zip = new AdmZip(src);
                        zip.extractAllTo(dest, true);
                        console.log(`[WELCOME] Successfully installed: ${s} (ID: ${hash.substring(0,8)})`);
                    }
                } catch (err) {
                    console.error(`[WELCOME] Failed to import ${s}:`, err);
                }
            }
        });
    }

    public registerFileProtocol(): void {
        protocol.registerFileProtocol('scene', (request, callback) => {
            const urlPath = request.url.substring(8);

            if (urlPath.startsWith('_core/')) {
                const corePath = path.join(this.assetsDir, urlPath.substring(6));
                return callback({ path: path.normalize(corePath) });
            }

            const decodedPath = decodeURIComponent(urlPath);
            const filePath = path.join(this.getEffectsDir(), decodedPath);
            callback({ path: path.normalize(filePath) });
        });
    }

    public async importEffectBackground(sourcePath: string, customDestOrIsGuest: string | boolean): Promise<ImportResult> {
        return new Promise((resolve) => {
            try {
                let finalDest = this.getEffectsDir();
                if (typeof customDestOrIsGuest === 'string') {
                    finalDest = customDestOrIsGuest;
                } else if (customDestOrIsGuest === true) {
                    const timestamp = Date.now();
                    const folderName = `sceneplus-guest-${timestamp}`;
                    finalDest = path.join(os.tmpdir(), folderName);
                    if (!fs.existsSync(finalDest)) {
                        fs.mkdirSync(finalDest, { recursive: true });
                    }
                }

                // Path to worker.js in out dir
                const workerPath = path.join(app.getAppPath(), 'out/worker.js');
                const worker = utilityProcess.fork(workerPath);

                worker.postMessage({
                    action: 'process-import',
                    filePath: sourcePath,
                    destDir: finalDest
                });

                const win = this.windowManager.getWindow();

                worker.on('message', (msg: any) => {
                    if (msg.type === 'progress') {
                        win?.webContents.send('import-progress', msg.percent);
                    } else if (msg.type === 'status') {
                        win?.webContents.send('import-status', msg.message);
                    } else if (msg.type === 'success') {
                        resolve({ 
                            success: true, 
                            hash: msg.hash, 
                            meta: msg.meta, 
                            basePath: msg.basePath 
                        });
                    } else if (msg.type === 'error') {
                        resolve({ 
                            success: false, 
                            error: msg.error, 
                            diagnostic: msg.diagnostic || false, 
                            template: msg.template || '' 
                        });
                    }
                });

                worker.on('exit', (code) => {
                    if (code !== 0) {
                        resolve({ success: false, error: `Worker exited with code ${code}` });
                    }
                });
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }

    public scanEffects(): { success: boolean; effects?: any[]; error?: string } {
        try {
            const dir = this.getEffectsDir();
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            const effects = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const metaPath = path.join(dir, entry.name, 'meta.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        effects.push({
                            effectId: entry.name,
                            meta,
                            basePath: `scene://${entry.name}/`,
                        });
                    }
                }
            }
            return { success: true, effects };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public unpackEffectSync(buffer: ArrayBuffer, effectId: string): { success: boolean; meta?: any; effectId?: string; basePath?: string; error?: string } {
        try {
            if (!buffer) return { success: false, error: 'Source ZIP buffer is empty' };

            const destDir = path.join(this.getEffectsDir(), effectId);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            const zip = new AdmZip(Buffer.from(buffer));
            zip.extractAllTo(destDir, true);

            const metaPath = path.join(destDir, 'meta.json');
            if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                return { success: true, meta, effectId, basePath: `scene://${effectId}/` };
            } else {
                return { success: false, error: `meta.json not found after extraction` };
            }
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public deleteEffect(effectId: string): { success: boolean; error?: string } {
        try {
            const destDir = path.join(this.getEffectsDir(), effectId);
            if (fs.existsSync(destDir)) {
                fs.rmSync(destDir, { recursive: true, force: true });
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public async downloadAsset(url: string, hash: string): Promise<string | null> {
        return new Promise((resolve) => {
            const tempPath = path.join(os.tmpdir(), `${hash}_dl.scenefx`);
            const file = fs.createWriteStream(tempPath);
            http.get(url, (response) => {
                if (response.statusCode === 200) {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(() => resolve(tempPath));
                    });
                } else {
                    file.close();
                    fs.unlink(tempPath, () => {});
                    resolve(null);
                }
            }).on('error', () => {
                fs.unlink(tempPath, () => {});
                resolve(null);
            });
        });
    }

    public cleanupGuestFolders(): { success: boolean } {
        try {
            const tmpDir = os.tmpdir();
            const files = fs.readdirSync(tmpDir);
            let count = 0;
            for (const file of files) {
                if (file.startsWith('sceneplus-guest-')) {
                    const fullPath = path.join(tmpDir, file);
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    count++;
                }
            }
            if (count > 0) console.log(`[CLEANUP] Removed ${count} orphaned guest folder(s)`);
            return { success: true };
        } catch(e) {
            console.error('[CLEANUP] Failed:', e);
            return { success: false };
        }
    }
}
