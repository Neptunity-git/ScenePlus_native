import { EffectManager } from '../engine/EffectManager';
import { EffectMeta } from '../shared/types';

export class EffectLibrary {
    public container: HTMLElement;
    private effectManager: EffectManager;
    public allEffects: { effectId: string; meta: EffectMeta; card: HTMLElement }[] = [];

    private _filterMedia: string = 'all';
    private _filterMode: string = 'all';
    private _filterSearch: string = '';

    constructor(containerId: string, effectManager: EffectManager) {
        const c = document.getElementById(containerId);
        if (!c) throw new Error(`Container ${containerId} not found`);
        this.container = c;
        this.effectManager = effectManager;

        this._setupFileDropZone();
        this._setupFilterControls();
    }

    private _setupFileDropZone() {
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                this.container.classList.add('drag-over');
            }
        });

        this.container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.classList.remove('drag-over');
        });
    }

    private _setupFilterControls() {
        const mediaSelect = document.getElementById('filter-media') as HTMLSelectElement;
        const modeSelect = document.getElementById('filter-mode') as HTMLSelectElement;
        const searchInput = document.getElementById('library-search-input') as HTMLInputElement;

        if (mediaSelect) {
            mediaSelect.addEventListener('change', () => {
                this._filterMedia = mediaSelect.value;
                this._applyFilters();
            });
        }
        if (modeSelect) {
            modeSelect.addEventListener('change', () => {
                this._filterMode = modeSelect.value;
                this._applyFilters();
            });
        }
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this._filterSearch = searchInput.value.trim().toLowerCase();
                this._applyFilters();
            });
        }
    }

    public _applyFilters() {
        for (const { effectId, meta, card } of this.allEffects) {
            const matchMedia = this._filterMedia === 'all' || meta.mediatype === this._filterMedia;
            const matchMode = this._filterMode === 'all' || meta.playmode === this._filterMode;

            let displayName = this.effectManager.effectNames?.[effectId] || effectId;
            const matchSearch = !this._filterSearch || displayName.toLowerCase().includes(this._filterSearch);

            card.style.display = (matchMedia && matchMode && matchSearch) ? '' : 'none';
        }
    }

    public addCard(effectId: string, meta: EffectMeta) {
        const card = document.createElement('div');
        card.className = 'effect-card';
        card.draggable = true;
        card.dataset.effectId = effectId;

        let displayName = this.effectManager.effectNames?.[effectId] || effectId;

        const titleEl = document.createElement('div');
        titleEl.className = 'card-title';
        titleEl.textContent = displayName;

        const actionsEl = document.createElement('div');
        actionsEl.className = 'card-actions';

        const metaEl = document.createElement('div');
        metaEl.className = 'card-meta';
        metaEl.innerHTML = `<span class="card-type">${meta.mediatype}</span><span class="card-mode">${meta.playmode}</span>`;

        const playBtn = document.createElement('button');
        playBtn.className = 'card-play-btn';
        playBtn.innerHTML = '▶';

        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const player = this.effectManager.players[effectId];
            if (!player) return;

            const instance = player.play();
            if (!instance) return;
            if (instance.el && (instance.el as any).onended) (instance.el as any).onended = null;

            const stopTimer = setTimeout(() => {
                player.stopInstance(instance);
            }, 3000);

            if (instance.el && (meta.mediatype === 'video' || meta.mediatype === 'sound')) {
                (instance.el as HTMLMediaElement).onended = () => {
                    clearTimeout(stopTimer);
                    player.stopInstance(instance);
                };
            }
        });

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete Effect';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await window.api.confirmDialog({
                message: 'Permanently delete this effect? This action cannot be undone.',
                detail: `[ ${displayName} ]`
            });

            if (ok) {
                const targetPlayer = this.effectManager.players[effectId];
                if (targetPlayer && typeof targetPlayer.destroy === 'function') {
                    targetPlayer.destroy();
                }

                const result = await window.api.deleteEffect(effectId);
                if (result && result.success) {
                    card.remove();
                    this.allEffects = this.allEffects.filter(x => x.effectId !== effectId);
                    delete this.effectManager.players[effectId];
                    if (this.effectManager.effectNames) {
                        delete this.effectManager.effectNames[effectId];
                    }
                    this.container.dispatchEvent(new CustomEvent('effect-deleted', { detail: { effectId } }));
                }
            }
        });

        btnGroup.appendChild(deleteBtn);
        btnGroup.appendChild(playBtn);

        actionsEl.appendChild(metaEl);
        actionsEl.appendChild(btnGroup);
        card.appendChild(titleEl);
        card.appendChild(actionsEl);

        card.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', effectId);
                e.dataTransfer.effectAllowed = 'copyMove';
            }
            card.style.opacity = '0.5';
        });
        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
        });

        this.container.appendChild(card);
        this.allEffects.push({ effectId, meta, card });
        this._applyFilters();
    }
}
