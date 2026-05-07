import { EffectMeta } from '../shared/types';

export interface PlayerInstance {
    el: HTMLElement;
    active: boolean;
    timer: any;
    originalOpacity: string;
    releasing?: boolean;
    mode?: string;
}

export class Player {
    public effectId: string;
    public meta: EffectMeta;
    public basePath: string;
    public poolSize: number;
    public pool: PlayerInstance[];
    public activeIndex: number;

    constructor(effectId: string, meta: EffectMeta, basePath: string, poolSize = 5) {
        this.effectId = effectId;
        this.meta = meta;
        this.basePath = basePath;
        this.poolSize = poolSize;
        this.pool = [];
        this.activeIndex = 0;

        this.initPool();
    }

    private initPool() {
        const container = document.getElementById('engine-canvas');
        if (!container) return;

        for (let i = 0; i < this.poolSize; i++) {
            const el = this.createInstance();
            if (!el) continue;

            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            el.style.position = 'absolute';
            el.style.top = '0';
            el.style.left = '0';
            el.style.width = '100vw';
            el.style.height = '100vh';
            el.style.objectFit = 'cover';
            el.style.objectPosition = 'center center';

            container.appendChild(el);
            this.pool.push({ el, active: false, timer: null, originalOpacity: '1' });
        }
    }

    private createInstance(): HTMLElement | null {
        const type = this.meta.mediatype;
        const srcPath = this.meta.path.startsWith('/') ? this.meta.path.substring(1) : this.meta.path;
        const src = this.basePath + srcPath;

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = src;
            return img;
        } else if (type === 'video') {
            const vid = document.createElement('video');
            vid.src = src;
            vid.preload = 'auto';
            vid.muted = false;
            return vid;
        } else if (type === 'sound') {
            const aud = document.createElement('audio');
            aud.src = src;
            aud.preload = 'auto';
            return aud;
        } else if (type === 'code') {
            const iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.dataset.originalSrc = src;
            iframe.style.border = 'none';
            iframe.style.pointerEvents = 'none';
            return iframe;
        }
        return null;
    }

    public play(): PlayerInstance | null {
        if (this.pool.length === 0) return null;

        const instance = this.pool[this.activeIndex];
        this.activeIndex = (this.activeIndex + 1) % this.poolSize;

        this.stopInstance(instance);

        instance.active = true;
        instance.releasing = false;
        const el = instance.el;
        if (this.meta.mediatype !== 'sound') {
            el.style.opacity = instance.originalOpacity;
        }

        const type = this.meta.mediatype;
        const mode = this.meta.playmode;

        if (type === 'video' || type === 'sound') {
            const mediaEl = el as HTMLMediaElement;
            try {
                if (mediaEl.readyState >= 1 || type === 'sound') {
                    mediaEl.currentTime = 0;
                }
            } catch (err) {}
            mediaEl.loop = (mode === 'loop' || mode === 'hold');
            mediaEl.play().catch(e => console.error('Play error on', this.effectId, e));

            if (mode === 'once') {
                mediaEl.onended = () => {
                    this.stopInstance(instance);
                };
            }
        } else if (type === 'image' || type === 'code') {
            if (type === 'code') {
                const iframe = el as HTMLIFrameElement;
                iframe.onload = () => {
                    if (instance.active && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            source: 'sceneplus-engine',
                            type: 'init',
                            meta: this.meta,
                            env: { 
                                preset: 1, 
                                screenSize: { width: window.innerWidth, height: window.innerHeight },
                                mousePos: window.currentMousePos || { x: 0, y: 0 }
                            }
                        }, '*');
                    }
                };
                iframe.src = 'about:blank';
                iframe.src = iframe.dataset.originalSrc || '';
            }

            if (mode === 'once') {
                instance.timer = setTimeout(() => {
                    this.stopInstance(instance);
                }, this.meta.duration);
            }
        }

        instance.mode = mode; 
        return instance;
    }

    public stopInstance(instance: PlayerInstance) {
        if (!instance || !instance.active) return;

        if (this.meta.mediatype === 'code' && instance.mode === 'hold' && !instance.releasing) {
            instance.releasing = true;
            const iframe = instance.el as HTMLIFrameElement;
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({ source: 'sceneplus-engine', type: 'release' }, '*');
            }
            return;
        }

        this.hardStopInstance(instance);
    }

    public panicInstance(instance: PlayerInstance) {
        if (!instance || !instance.active) return;
        if (this.meta.mediatype === 'code') {
            const iframe = instance.el as HTMLIFrameElement;
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({ source: 'sceneplus-engine', type: 'panic' }, '*');
            }
        }
        this.hardStopInstance(instance);
    }

    public hardStopInstance(instance: PlayerInstance) {
        instance.active = false;
        instance.releasing = false;
        clearTimeout(instance.timer);
        instance.timer = null;

        if (this.meta.mediatype !== 'sound') {
            instance.el.style.opacity = '0';
        }

        if (this.meta.mediatype === 'video' || this.meta.mediatype === 'sound') {
            (instance.el as HTMLMediaElement).pause();
        } else if (this.meta.mediatype === 'code') {
            (instance.el as HTMLIFrameElement).src = 'about:blank';
        }
    }

    public destroy() {
        for (const instance of this.pool) {
            this.hardStopInstance(instance);
            if (instance.el) {
                instance.el.removeAttribute('src');
                if (typeof (instance.el as any).load === 'function') {
                    try { (instance.el as any).load(); } catch (e) {}
                }
                instance.el.remove();
            }
        }
        this.pool = [];
    }
}
