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

        window.addEventListener('effect-meta-updated', (e: any) => {
            const { effectId, meta } = e.detail;
            const item = this.allEffects.find(x => x.effectId === effectId);
            if (item) {
                item.meta = meta;

                let displayName = this.effectManager.effectNames?.[effectId];
                // If it wasn't manually renamed in the UI, use meta.name
                if (!this.effectManager.effectNames || !this.effectManager.effectNames[effectId]) {
                    displayName = meta.name || effectId;
                } else if (displayName === effectId && meta.name) {
                    displayName = meta.name;
                }

                const titleEl = item.card.querySelector('.card-title');
                if (titleEl && !titleEl.querySelector('input')) {
                    titleEl.textContent = displayName || effectId;
                }

                const metaEl = item.card.querySelector('.card-meta');
                if (metaEl) {
                    metaEl.innerHTML = `<span class="card-type">${meta.mediatype}</span><span class="card-mode">${meta.playmode}</span>`;
                }
                this._applyFilters();
            }
        });
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

    public onEffectRenamed?: (effectId: string, newName: string) => void;

    public addCard(effectId: string, meta: EffectMeta) {
        const card = document.createElement('div');
        card.className = 'effect-card';
        card.draggable = true;
        card.dataset.effectId = effectId;

        let displayName = this.effectManager.effectNames?.[effectId] || meta.name || effectId;

        const cardInfoEl = document.createElement('div');
        cardInfoEl.className = 'card-info';

        const titleEl = document.createElement('div');
        titleEl.className = 'card-title';
        titleEl.textContent = displayName;
        titleEl.title = 'Double click to rename';

        // Double-click on title to rename inline
        titleEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._startInlineRename(effectId, meta, titleEl);
        });

        const metaEl = document.createElement('div');
        metaEl.className = 'card-meta';
        metaEl.innerHTML = `<span class="card-type">${meta.mediatype}</span><span class="card-mode">${meta.playmode}</span>`;

        cardInfoEl.appendChild(metaEl);
        cardInfoEl.appendChild(titleEl);

        const actionsEl = document.createElement('div');
        actionsEl.className = 'card-actions';

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '6px';

        // Rename Button (Sleek Pen SVG)
        const renameBtn = document.createElement('button');
        renameBtn.className = 'card-rename-btn';
        renameBtn.title = 'Rename Effect';
        renameBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._startInlineRename(effectId, meta, titleEl);
        });

        // Delete Button (Sleek Trash SVG)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.title = 'Delete Effect';
        deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const currentName = this.effectManager.effectNames?.[effectId] || meta.name || effectId;
            const ok = await window.api.confirmDialog({
                message: 'Permanently delete this effect? This action cannot be undone.',
                detail: `[ ${currentName} ]`
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
                } else {
                    window.api.alertDialog({
                        message: 'Failed to completely delete the effect.',
                        detail: `The files might be opened in an external editor (like VSCode). Please close the editor and try deleting again.\n\nError: ${result?.error || 'Unknown error'}`
                    });
                }
            }
        });

        // Edit Button (Code <svg>)
        const editBtn = document.createElement('button');
        editBtn.className = 'card-edit-btn';
        editBtn.title = 'Edit Source (Fork)';
        editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
        editBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            const currentName = this.effectManager.effectNames?.[effectId] || meta.name || effectId;
            const ok = await window.api.confirmDialog({
                message: 'Create a development copy of this effect and open it in your external editor?',
                detail: `[ ${currentName} ]\nA new 'dev_' effect will be added to your library.`
            });

            if (!ok) return;

            const result = await window.api.forkAndEditEffect(effectId);
            if (result && result.success && result.hash && result.meta && result.basePath) {
                this.effectManager.registerEffect(result.hash, result.meta, result.basePath);
                this.effectManager.effectNames = this.effectManager.effectNames || {};
                this.effectManager.effectNames[result.hash] = result.meta.name;
                this.addCard(result.hash, result.meta);
            } else if (result && result.error) {
                window.api.alertDialog({ message: 'Failed to fork effect for editing', detail: result.error });
            }
        });

        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(renameBtn);
        btnGroup.appendChild(deleteBtn);

        actionsEl.appendChild(btnGroup);
        card.appendChild(cardInfoEl);
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

    private _startInlineRename(effectId: string, meta: EffectMeta, titleEl: HTMLElement) {
        if (titleEl.querySelector('input')) return;

        const currentName = this.effectManager.effectNames?.[effectId] || meta.name || effectId;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'card-title-input';
        input.value = currentName;

        titleEl.textContent = '';
        titleEl.appendChild(input);
        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            const val = input.value.trim();
            const finalName = val || currentName;
            titleEl.textContent = finalName;
            if (!this.effectManager.effectNames) this.effectManager.effectNames = {};
            this.effectManager.effectNames[effectId] = finalName;
            meta.name = finalName;
            if (this.onEffectRenamed && finalName !== currentName) {
                this.onEffectRenamed(effectId, finalName);
            }
        };

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                commit();
            } else if (e.key === 'Escape') {
                input.value = currentName;
                commit();
            }
        });

        input.addEventListener('blur', () => {
            commit();
        });

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
    }
}
