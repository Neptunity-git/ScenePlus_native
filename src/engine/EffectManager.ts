import { Player, PlayerInstance } from './Player';
import { EffectMeta } from '../shared/types';

class TriggerGroup {
    public keyCode: number | string;
    public entries: { player: Player; instance: PlayerInstance }[];

    constructor(keyCode: number | string) {
        this.keyCode = keyCode;
        this.entries = [];
    }

    public add(player: Player, instance: PlayerInstance | null) {
        if (instance) {
            this.entries.push({ player, instance });
        }
    }

    public stopAll() {
        for (const entry of this.entries) {
            entry.player.stopInstance(entry.instance);
        }
        this.entries = [];
    }
}

export class EffectManager {
    public maxN: number;
    public activeGroups: TriggerGroup[];
    public players: Record<string, Player>;
    public keyBindings: Record<string, string[]>;
    public effectNames?: Record<string, string>;
    public onTriggerKey?: (type: 'down' | 'up', keyCode: number, effectIds: string[]) => void;
    private heldKeys: Set<number | string>;
    
    // Shared Canvas
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null;
    
    // Env
    private mousePos = { x: 0, y: 0 };
    private mouseState = { left: false, right: false, middle: false };
    
    // Performance tracking
    private lastFrameTime = 0;
    private currentFps = 60;
    private currentDeltaTime = 16.67;
    
    // Per-effect custom params
    public effectParams: Record<string, Record<string, any>> = {};

    constructor(maxN = 1) {
        this.maxN = maxN;
        this.activeGroups = [];
        this.players = {};
        this.keyBindings = {};
        this.heldKeys = new Set();
        
        this.canvas = document.getElementById('global-effects-canvas') as HTMLCanvasElement;
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.renderLoop = this.renderLoop.bind(this);
        requestAnimationFrame(this.renderLoop);
    }
    
    private resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    public updateMouse(x: number, y: number) {
        this.mousePos = { x, y };
        (window as any).currentMousePos = this.mousePos;
    }
    
    public handleMouseDown(x: number, y: number, button: number) {
        this.updateMouse(x, y);
        if (button === 1) this.mouseState.left = true;
        else if (button === 2) this.mouseState.right = true;
        else if (button === 3) this.mouseState.middle = true;
    }
    
    public handleMouseUp(x: number, y: number, button: number) {
        this.updateMouse(x, y);
        if (button === 1) this.mouseState.left = false;
        else if (button === 2) this.mouseState.right = false;
        else if (button === 3) this.mouseState.middle = false;
    }
    
    public handleMouseWheel(x: number, y: number, dx: number, dy: number) {
        this.updateMouse(x, y);
    }

    public registerEffect(effectId: string, meta: EffectMeta, basePath: string) {
        if (this.players[effectId]) {
            this.players[effectId].destroy();
        }
        this.players[effectId] = new Player(effectId, meta, basePath, this.maxN);
    }

    public bindKey(keyCode: string | number, effectIds: string[]) {
        this.keyBindings[keyCode.toString()] = effectIds;
    }

    public triggerKey(keyCode: number, type: 'down' | 'up') {
        if (type === 'down') this.triggerDown(keyCode);
        else this.triggerUp(keyCode);
    }

    public handleOscTrigger(address: string, args: any[]) {
        // e.g. /sceneplus/play <effectId>
        if (address === '/sceneplus/play') {
            const effectId = args[0];
            const code = args[1] || 'OSC';
            this.triggerRemoteDown(effectId, code);
        } else if (address === '/sceneplus/stop') {
            const effectId = args[0];
            const code = args[1] || 'OSC';
            this.triggerRemoteUp(effectId, code);
        }
    }

    public triggerRemoteDown(effectId: string, keyCode: number | string) {
        const virtualKeyCode = `REMOTE_${keyCode}`;
        const player = this.players[effectId];
        if (player) {
            const group = new TriggerGroup(virtualKeyCode);
            const isLoopToggleOff = this.handleLoopToggle(virtualKeyCode, player);
            if (!isLoopToggleOff) {
                const instance = player.play(this.getEnv());
                group.add(player, instance);
            }
            if (group.entries.length > 0) {
                this.activeGroups.push(group);
                this.enforceFIFO();
            }
        }
    }

    public triggerRemoteUp(effectId: string, keyCode: number | string) {
        const virtualKeyCode = `REMOTE_${keyCode}`;
        let cleanGroups = false;
        for (const group of this.activeGroups) {
            if (group.keyCode === virtualKeyCode) {
                let allStoppedInGroup = true;
                group.entries.forEach(entry => {
                    if (entry.player.effectId === effectId && entry.player.meta.playmode === 'hold') {
                        entry.player.stopInstance(entry.instance);
                    }
                    if (entry.instance.active) {
                        allStoppedInGroup = false;
                    }
                });
                if (allStoppedInGroup) cleanGroups = true;
            }
        }
        if (cleanGroups) {
            this.activeGroups = this.activeGroups.filter(g => g.entries.some(e => e.instance.active));
        }
    }

    private triggerDown(keyCode: number) {
        if (this.heldKeys.has(keyCode)) return;
        this.heldKeys.add(keyCode);

        const effectIds = this.keyBindings[keyCode.toString()] || [];
        if (effectIds.length === 0) return;

        if (this.onTriggerKey) {
            this.onTriggerKey('down', keyCode, effectIds);
        }

        const group = new TriggerGroup(keyCode);

        effectIds.forEach(id => {
            const player = this.players[id];
            if (player) {
                const isLoopToggleOff = this.handleLoopToggle(keyCode, player);
                if (!isLoopToggleOff) {
                    const instance = player.play(this.getEnv());
                    group.add(player, instance);
                }
            }
        });

        if (group.entries.length > 0) {
            this.activeGroups.push(group);
            this.enforceFIFO();
        }
    }

    private triggerUp(keyCode: number) {
        this.heldKeys.delete(keyCode);

        const effectIds = this.keyBindings[keyCode.toString()] || [];
        if (effectIds.length > 0 && this.onTriggerKey) {
            this.onTriggerKey('up', keyCode, effectIds);
        }

        let cleanGroups = false;
        for (const group of this.activeGroups) {
            if (group.keyCode === keyCode) {
                let allStoppedInGroup = true;
                group.entries.forEach(entry => {
                    if (entry.player.meta.playmode === 'hold') {
                        entry.player.stopInstance(entry.instance);
                    }
                    if (entry.instance.active) {
                        allStoppedInGroup = false;
                    }
                });
                if (allStoppedInGroup) cleanGroups = true;
            }
        }

        if (cleanGroups) {
            this.activeGroups = this.activeGroups.filter(g => g.entries.some(e => e.instance.active));
        }
    }

    public panic() {
        for (const group of this.activeGroups) {
            for (const entry of group.entries) {
                entry.player.panicInstance(entry.instance);
            }
        }
        this.activeGroups = [];
        this.heldKeys.clear();
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    private enforceFIFO() {
        // Since we reduced poolSize to 1, maxN might just be how many keys we hold at once,
        // but for global FIFO we limit active groups.
        while (this.activeGroups.length > 20) { // arbitrary high limit
            const oldGroup = this.activeGroups.shift();
            if (oldGroup) oldGroup.stopAll();
        }
    }

    private handleLoopToggle(keyCode: string | number, player: Player): boolean {
        if (player.meta.playmode !== 'loop') return false;

        let foundAndStopped = false;

        for (let i = this.activeGroups.length - 1; i >= 0; i--) {
            const group = this.activeGroups[i];
            if (group.keyCode === keyCode) {
                const entryIndex = group.entries.findIndex(e => e.player === player && e.instance.active);
                if (entryIndex !== -1) {
                    const entry = group.entries[entryIndex];
                    entry.player.stopInstance(entry.instance);
                    foundAndStopped = true;
                    break;
                }
            }
        }
        return foundAndStopped;
    }
    
    private getEnv(effectId?: string) {
        return {
            screenSize: { width: window.innerWidth, height: window.innerHeight },
            mousePos: this.mousePos,
            mouseState: this.mouseState,
            performance: { fps: this.currentFps, deltaTime: this.currentDeltaTime },
            params: effectId ? (this.effectParams[effectId] || {}) : {}
        };
    }
    
    private renderLoop(timestamp: number) {
        if (!this.ctx || !this.canvas) {
            requestAnimationFrame(this.renderLoop);
            return;
        }
        
        // FPS tracking
        if (this.lastFrameTime > 0) {
            this.currentDeltaTime = timestamp - this.lastFrameTime;
            const instantFps = 1000 / Math.max(this.currentDeltaTime, 1);
            this.currentFps = this.currentFps * 0.9 + instantFps * 0.1; // EMA smoothing
        }
        this.lastFrameTime = timestamp;
        
        // Clear entire canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Clean up inactive groups
        this.activeGroups = this.activeGroups.filter(g => g.entries.some(e => e.instance.active || e.instance.releasing));
        
        const env = this.getEnv();
        
        // Render all active instances
        for (const group of this.activeGroups) {
            for (const entry of group.entries) {
                if (entry.instance.active || entry.instance.releasing) {
                    const type = entry.player.meta.mediatype;
                    
                    if (type === 'image' || type === 'video') {
                        if (entry.instance.mediaEl) {
                            this.ctx.drawImage(entry.instance.mediaEl as CanvasImageSource, 0, 0, this.canvas.width, this.canvas.height);
                        }
                    } else if (type === 'code') {
                        if (entry.instance.module && entry.instance.module.render) {
                            const env = this.getEnv(entry.player.effectId);
                            const isAlive = entry.instance.module.render(this.ctx, entry.instance.state, env, timestamp);
                            if (isAlive === false) {
                                entry.player.hardStopInstance(entry.instance);
                            }
                        }
                    }
                }
            }
        }
        
        requestAnimationFrame(this.renderLoop);
    }
}
