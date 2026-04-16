export class EffectLibrary {
    constructor(containerId, effectManager) {
        this.container = document.getElementById(containerId);
        this.effectManager = effectManager;
        this.allEffects = []; // { effectId, meta, card }

        // Filter state
        this._filterMedia = 'all';
        this._filterMode = 'all';
        this._filterSearch = '';

        this._setupFileDropZone();
        this._setupFilterControls();
    }

    _setupFileDropZone() {
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.types.includes('Files')) {
                this.container.classList.add('drag-over');
            }
        });

        this.container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.container.classList.remove('drag-over');
        });
    }

    _setupFilterControls() {
        const mediaSelect = document.getElementById('filter-media');
        const modeSelect = document.getElementById('filter-mode');
        const searchInput = document.getElementById('library-search-input');

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

    _applyFilters() {
        for (const { effectId, meta, card } of this.allEffects) {
            const matchMedia = this._filterMedia === 'all' || meta.mediatype === this._filterMedia;
            const matchMode = this._filterMode === 'all' || meta.playmode === this._filterMode;

            let displayName = this.effectManager.effectNames?.[effectId] || effectId;
            const matchSearch = !this._filterSearch || displayName.toLowerCase().includes(this._filterSearch);

            card.style.display = (matchMedia && matchMode && matchSearch) ? '' : 'none';
        }
    }

    addCard(effectId, meta) {
        const card = document.createElement('div');
        card.className = 'effect-card';
        card.draggable = true;
        card.dataset.effectId = effectId;

        // Display name
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

        // Enforced 3-second preview (Task 5: all modes stopped unconditionally at 3s)
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const player = this.effectManager.players[effectId];
            if (!player) return;

            // Temporarily disable onended so we stay in control
            const instance = player.play();
            if (!instance) return;
            if (instance.el && instance.el.onended) instance.el.onended = null;

            const stopTimer = setTimeout(() => {
                player.stopInstance(instance);
            }, 3000);

            // If it ends naturally before 3s, clear the timeout
            if (instance.el && (meta.mediatype === 'video' || meta.mediatype === 'sound')) {
                instance.el.onended = () => {
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
                // VERY IMPORTANT: Destroy the player first to release Windows file locks on the media!
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

        // Drag to assign to key
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', effectId);
            e.dataTransfer.effectAllowed = 'copyMove';
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
