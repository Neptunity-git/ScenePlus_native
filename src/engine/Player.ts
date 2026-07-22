import { EffectMeta } from '../shared/types';

export interface PlayerInstance {
    active: boolean;
    timer: any;
    releasing?: boolean;
    mode?: string;
    
    // Plan B specific
    mediaEl?: HTMLMediaElement | HTMLImageElement;
    module?: any;
    state?: any; // The internal state for code effects
}

export class Player {
    public effectId: string;
    public meta: EffectMeta;
    public basePath: string;
    public poolSize: number;
    public pool: PlayerInstance[];
    public activeIndex: number;
    
    private modulePromise: Promise<any> | null = null;
    private cachedMediaEl: HTMLImageElement | HTMLVideoElement | HTMLAudioElement | null = null;

    constructor(effectId: string, meta: EffectMeta, basePath: string, poolSize = 1) {
        this.effectId = effectId;
        this.meta = meta;
        this.basePath = basePath;
        this.poolSize = poolSize;
        this.pool = [];
        this.activeIndex = 0;

        this.preload();
    }

    private preload() {
        const type = this.meta.mediatype;
        const srcPath = this.meta.path.startsWith('/') ? this.meta.path.substring(1) : this.meta.path;
        
        if (type === 'code') {
            const jsPath = srcPath.replace('.html', '.js');
            let moduleUrl = this.basePath + jsPath;
            // Need to convert to a valid URL for dynamic import. 
            // In electron, file:// or custom scheme works.
            this.modulePromise = import(moduleUrl).catch(e => {
                console.error('Failed to load module:', moduleUrl, e);
                return null;
            });
        } else if (type === 'image') {
            this.cachedMediaEl = new Image();
            this.cachedMediaEl.src = this.basePath + srcPath;
        } else if (type === 'video') {
            const vid = document.createElement('video');
            vid.src = this.basePath + srcPath;
            vid.preload = 'auto';
            vid.muted = false;
            this.cachedMediaEl = vid;
        } else if (type === 'sound') {
            const aud = document.createElement('audio');
            aud.src = this.basePath + srcPath;
            aud.preload = 'auto';
            this.cachedMediaEl = aud;
        }

        // Initialize pool instances (lazy allocation of state)
        for (let i = 0; i < this.poolSize; i++) {
            this.pool.push({ active: false, timer: null });
        }
    }

    public play(env: any): PlayerInstance | null {
        if (this.pool.length === 0) return null;

        const instance = this.pool[this.activeIndex];
        this.activeIndex = (this.activeIndex + 1) % this.poolSize;

        this.stopInstance(instance);

        instance.active = true;
        instance.releasing = false;
        instance.mode = this.meta.playmode;

        const type = this.meta.mediatype;
        const mode = this.meta.playmode;

        if (type === 'video' || type === 'sound') {
            // Need a new media element for multiple instances, or reuse if pool=1
            // For now, reuse cached one if pool=1, else we'd clone it
            let mediaEl = this.cachedMediaEl as HTMLMediaElement;
            if (this.poolSize > 1) {
                 mediaEl = this.cachedMediaEl?.cloneNode(true) as HTMLMediaElement;
            }
            instance.mediaEl = mediaEl;
            if (mediaEl) {
                try {
                    if (mediaEl.readyState >= 1 || type === 'sound') mediaEl.currentTime = 0;
                } catch (err) {}
                mediaEl.loop = (mode === 'loop' || mode === 'hold');
                mediaEl.play().catch(e => console.error('Play error on', this.effectId, e));

                if (mode === 'once') {
                    mediaEl.onended = () => { this.stopInstance(instance); };
                }
            }
        } else if (type === 'image') {
            instance.mediaEl = this.cachedMediaEl as HTMLImageElement;
        } else if (type === 'code') {
            if (this.modulePromise) {
                this.modulePromise.then(mod => {
                    if (mod && mod.init) {
                        instance.module = mod;
                        instance.state = mod.init(env);
                        
                        if (!instance.active) {
                            if (mode === 'hold' && mod.release) {
                                mod.release(instance.state);
                            }
                            setTimeout(() => this.hardStopInstance(instance), 50);
                        }
                    }
                });
            }
        }

        if (mode === 'once' && type !== 'video' && type !== 'sound') {
            instance.timer = setTimeout(() => {
                this.stopInstance(instance);
            }, this.meta.duration || 1000);
        }

        return instance;
    }

    public stopInstance(instance: PlayerInstance) {
        if (!instance || !instance.active) return;

        if (this.meta.mediatype === 'code' && instance.mode === 'hold' && !instance.releasing) {
            instance.releasing = true;
            if (instance.module && instance.module.release) {
                instance.module.release(instance.state);
            }
            // Will be hard-stopped by EffectManager when module says it's done,
            // or we just hard stop it after a fallback delay.
            setTimeout(() => this.hardStopInstance(instance), 1000);
            return;
        }

        this.hardStopInstance(instance);
    }

    public panicInstance(instance: PlayerInstance) {
        this.hardStopInstance(instance);
    }

    public hardStopInstance(instance: PlayerInstance) {
        instance.active = false;
        instance.releasing = false;
        clearTimeout(instance.timer);
        instance.timer = null;

        if (this.meta.mediatype === 'video' || this.meta.mediatype === 'sound') {
            if (instance.mediaEl) {
                (instance.mediaEl as HTMLMediaElement).pause();
            }
        }
    }

    public destroy() {
        for (const instance of this.pool) {
            this.hardStopInstance(instance);
            instance.mediaEl = undefined;
            instance.module = undefined;
            instance.state = undefined;
        }
        this.pool = [];
    }
}
