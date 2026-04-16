import { Player } from './Player.js';

class TriggerGroup {
    constructor(keyCode) {
        this.keyCode = keyCode;
        this.entries = []; // { player, instance }
    }

    add(player, instance) {
        if (instance) {
            this.entries.push({ player, instance });
        }
    }

    stopAll() {
        for (const entry of this.entries) {
            entry.player.stopInstance(entry.instance);
        }
        this.entries = [];
    }
}

export class EffectManager {
    constructor(maxN = 5) {
        this.maxN = maxN;
        this.activeGroups = []; // FIFO queue constraint by N
        this.players = {}; // effectId -> Player object
        this.keyBindings = {}; // keyCode -> array of effectIds
        this.heldKeys = new Set();
    }

    // Register a loaded effect and initialize its player pool
    registerEffect(effectId, meta, basePath) {
        if (this.players[effectId]) {
            // Usually we'd garbage collect old DOM here if overwritten
            console.log('Overwriting existing effect', effectId);
        }
        this.players[effectId] = new Player(effectId, meta, basePath, this.maxN);
    }

    // Assign multiple effects to a single key (virtual keyboard)
    bindKey(keyCode, effectIds) {
        this.keyBindings[keyCode] = effectIds;
    }

    // Trigger from network (Master/Slave architecture)
    triggerRemoteDown(effectId, keyCode) {
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

    triggerRemoteUp(effectId, keyCode) {
        const virtualKeyCode = `REMOTE_${keyCode}`;
        let cleanGroups = false;
        for (const group of this.activeGroups) {
            if (group.keyCode === virtualKeyCode) {
                let allStoppedInGroup = true;
                group.entries.forEach(entry => {
                    // Only release if it matches the effectId and is 'hold'
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

    // Called precisely when the uIOhook says 'keydown'
    triggerDown(keyCode) {
        if (this.heldKeys.has(keyCode)) return;
        this.heldKeys.add(keyCode);

        const effectIds = this.keyBindings[keyCode] || [];
        if (effectIds.length === 0) return;

        const group = new TriggerGroup(keyCode);

        effectIds.forEach(id => {
            const player = this.players[id];
            if (player) {
                // Loop toggle logic check:
                // If it's playmode "loop", we toggle it off if it's currently looping.
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

    // Called when the uIOhook says 'keyup'
    triggerUp(keyCode) {
        this.heldKeys.delete(keyCode);

        // Find any active instances matching this keyCode that have mode === 'hold'
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

        // Optional: clean up dead groups from activeGroups arrays
        if (cleanGroups) {
            this.activeGroups = this.activeGroups.filter(g => g.entries.some(e => e.instance.active));
        }
    }

    // Panic: Destroy all running effects
    panic() {
        for (const group of this.activeGroups) {
            for (const entry of group.entries) {
                entry.player.panicInstance(entry.instance);
            }
        }
        this.activeGroups = [];
        this.heldKeys.clear();
    }

    // Internals
    enforceFIFO() {
        while (this.activeGroups.length > this.maxN) {
            const oldGroup = this.activeGroups.shift();
            oldGroup.stopAll();
        }
    }

    handleLoopToggle(keyCode, player) {
        if (player.meta.playmode !== 'loop') return false;

        let foundAndStopped = false;

        // Loop backwards to remove from newest to oldest
        for (let i = this.activeGroups.length - 1; i >= 0; i--) {
            const group = this.activeGroups[i];
            if (group.keyCode === keyCode) {
                const entryIndex = group.entries.findIndex(e => e.player === player && e.instance.active);
                if (entryIndex !== -1) {
                    const entry = group.entries[entryIndex];
                    entry.player.stopInstance(entry.instance);
                    foundAndStopped = true;
                    // Break so we only toggle off one instance of this looper per downpress
                    break;
                }
            }
        }
        return foundAndStopped;
    }
}
