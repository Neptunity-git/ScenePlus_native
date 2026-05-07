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
    private heldKeys: Set<number | string>;

    constructor(maxN = 5) {
        this.maxN = maxN;
        this.activeGroups = [];
        this.players = {};
        this.keyBindings = {};
        this.heldKeys = new Set();
    }

    public registerEffect(effectId: string, meta: EffectMeta, basePath: string) {
        if (this.players[effectId]) {
            console.log('Overwriting existing effect', effectId);
        }
        this.players[effectId] = new Player(effectId, meta, basePath, this.maxN);
    }

    public bindKey(keyCode: string | number, effectIds: string[]) {
        this.keyBindings[keyCode.toString()] = effectIds;
    }

    public triggerRemoteDown(effectId: string, keyCode: number | string) {
        const virtualKeyCode = `REMOTE_${keyCode}`;
        const player = this.players[effectId];
        if (player) {
            const group = new TriggerGroup(virtualKeyCode);
            const isLoopToggleOff = this.handleLoopToggle(virtualKeyCode, player);
            if (!isLoopToggleOff) {
                const instance = player.play();
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

    public triggerDown(keyCode: number) {
        if (this.heldKeys.has(keyCode)) return;
        this.heldKeys.add(keyCode);

        const effectIds = this.keyBindings[keyCode.toString()] || [];
        if (effectIds.length === 0) return;

        const group = new TriggerGroup(keyCode);

        effectIds.forEach(id => {
            const player = this.players[id];
            if (player) {
                const isLoopToggleOff = this.handleLoopToggle(keyCode, player);
                if (!isLoopToggleOff) {
                    const instance = player.play();
                    group.add(player, instance);
                }
            }
        });

        if (group.entries.length > 0) {
            this.activeGroups.push(group);
            this.enforceFIFO();
        }
    }

    public triggerUp(keyCode: number) {
        this.heldKeys.delete(keyCode);

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
    }

    private enforceFIFO() {
        while (this.activeGroups.length > this.maxN) {
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
}
