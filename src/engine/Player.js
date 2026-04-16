export class Player {
    constructor(effectId, meta, basePath, poolSize = 5) {
        this.effectId = effectId;
        this.meta = meta;
        this.basePath = basePath;
        this.poolSize = poolSize;
        this.pool = [];
        this.activeIndex = 0;

        this.initPool();
    }

    initPool() {
        const container = document.getElementById('engine-canvas');
        if (!container) return;

        for (let i = 0; i < this.poolSize; i++) {
            const el = this.createInstance();
            if (!el) continue;

            // Common styles to cover the screen but remain invisible by default
            el.style.opacity = '0';
            el.style.pointerEvents = 'none'; // Ensure it's click-through
            el.style.position = 'absolute';
            el.style.top = '0';
            el.style.left = '0';
            el.style.width = '100vw';
            el.style.height = '100vh';
            el.style.objectFit = 'cover';         // Fill entire screen, no black bars
            el.style.objectPosition = 'center center';

            container.appendChild(el);
            this.pool.push({ el, active: false, timer: null, originalOpacity: '1' });
        }
    }

    createInstance() {
        const type = this.meta.mediatype;
        // Fix path slashes for consistency
        const srcPath = this.meta.path.startsWith('/') ? this.meta.path.substring(1) : this.meta.path;
        const src = this.basePath + srcPath;

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = src;
            return img;
        } else if (type === 'video') {
            const vid = document.createElement('video');
            vid.src = src;
            vid.preload = 'auto'; // Preload into memory
            vid.muted = false; // Audio policy in main.js allows it to play with sound
            return vid;
        } else if (type === 'sound') {
            const aud = document.createElement('audio');
            aud.src = src;
            aud.preload = 'auto';
            return aud;
        } else if (type === 'code') {
            const iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.dataset.originalSrc = src; // Store to prevent 'about:blank' loop leak
            iframe.style.border = 'none';
            iframe.style.pointerEvents = 'none'; // Click-through for safety
            return iframe;
        }
        return null;
    }

    play() {
        if (this.pool.length === 0) return null;

        const instance = this.pool[this.activeIndex];
        this.activeIndex = (this.activeIndex + 1) % this.poolSize;

        // Force stop if it was already playing (to reset logic)
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
            try {
                if (el.readyState >= 1 || type === 'sound') {
                    el.currentTime = 0;
                }
            } catch (err) {}
            el.loop = (mode === 'loop' || mode === 'hold');
            el.play().catch(e => console.error('Play error on', this.effectId, e));

            if (mode === 'once') {
                el.onended = () => {
                    this.stopInstance(instance);
                };
            }
        } else if (type === 'image' || type === 'code') {
            if (type === 'code') {
                el.onload = () => {
                    if (instance.active) {
                        el.contentWindow.postMessage({
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
                // Trigger reload using the cached original source rather than reading el.src which might be 'about:blank'
                el.src = 'about:blank';
                el.src = el.dataset.originalSrc;
            }

            // "once" requires duration in meta (Validated in worker.js)
            if (mode === 'once') {
                instance.timer = setTimeout(() => {
                    this.stopInstance(instance);
                }, this.meta.duration);
            }
        }

        // Track state for future Level 2 API
        instance.mode = mode; 

        return instance;
    }

    stopInstance(instance) {
        if (!instance || !instance.active) return;

        if (this.meta.mediatype === 'code' && instance.mode === 'hold' && !instance.releasing) {
            instance.releasing = true;
            instance.el.contentWindow.postMessage({ source: 'sceneplus-engine', type: 'release' }, '*');
            // Do NOT hard stop yet, wait for finish() or panic()
            return;
        }

        this.hardStopInstance(instance);
    }

    panicInstance(instance) {
        if (!instance || !instance.active) return;
        if (this.meta.mediatype === 'code') {
            instance.el.contentWindow.postMessage({ source: 'sceneplus-engine', type: 'panic' }, '*');
        }
        this.hardStopInstance(instance);
    }

    hardStopInstance(instance) {
        instance.active = false;
        instance.releasing = false;
        clearTimeout(instance.timer);
        instance.timer = null;

        if (this.meta.mediatype !== 'sound') {
            instance.el.style.opacity = '0';
        }

        if (this.meta.mediatype === 'video' || this.meta.mediatype === 'sound') {
            instance.el.pause();
        } else if (this.meta.mediatype === 'code') {
            instance.el.src = 'about:blank';
        }
    }

    destroy() {
        for (const instance of this.pool) {
            this.hardStopInstance(instance);
            if (instance.el) {
                // Clear out src to release Windows file locks
                instance.el.removeAttribute('src');
                if (typeof instance.el.load === 'function') {
                    try { instance.el.load(); } catch (e) {}
                }
                // Remove from DOM
                instance.el.remove();
            }
        }
        this.pool = [];
    }
}
