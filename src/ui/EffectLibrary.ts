import { EffectManager } from '../engine/EffectManager';
import { EffectMeta } from '../shared/types';

export class EffectLibrary {
    public container: HTMLElement;
    private effectManager: EffectManager;
    public allEffects: { effectId: string; meta: EffectMeta; card: HTMLElement }[] = [];

    private _filterMedia: string = 'all';
    private _filterMode: string = 'all';
    private _filterSearch: string = '';

    public folderPaths: string[] = ['/'];
    public effectFolders: Record<string, string> = {}; // effectId -> folderPath
    public currentFolderPath: string = '/';
    public onFoldersUpdated?: (folderPaths: string[], effectFolders: Record<string, string>) => void;

    private breadcrumbsContainer: HTMLElement | null = null;
    private contextMenuEl: HTMLElement | null = null;

    constructor(containerId: string, effectManager: EffectManager) {
        const c = document.getElementById(containerId);
        if (!c) throw new Error(`Container ${containerId} not found`);
        this.container = c;
        this.effectManager = effectManager;

        this.breadcrumbsContainer = document.getElementById('library-breadcrumbs');
        this.contextMenuEl = document.getElementById('library-context-menu');

        this._setupFileDropZone();
        this._setupFilterControls();
        this._setupContextMenu();

        this.renderBreadcrumbs();

        window.addEventListener('effect-meta-updated', (e: any) => {
            const { effectId, meta } = e.detail;
            const item = this.allEffects.find(x => x.effectId === effectId);
            if (item) {
                item.meta = meta;

                let displayName = this.effectManager.effectNames?.[effectId];
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

    public setFolders(folderPaths?: string[], effectFolders?: Record<string, string>) {
        if (folderPaths && Array.isArray(folderPaths)) {
            this.folderPaths = [...folderPaths];
        }
        if (!this.folderPaths.includes('/')) {
            this.folderPaths.unshift('/');
        }
        if (effectFolders && typeof effectFolders === 'object') {
            this.effectFolders = { ...effectFolders };
        }
        this.renderBreadcrumbs();
        this._applyFilters();
    }

    public getDirectChildBins(parentPath: string): string[] {
        const prefix = parentPath === '/' ? '/' : parentPath + '/';
        return this.folderPaths.filter(p => {
            if (p === parentPath || !p.startsWith(prefix)) return false;
            const relative = p.substring(prefix.length);
            return relative.length > 0 && !relative.includes('/');
        });
    }

    public renderBreadcrumbs() {
        if (!this.breadcrumbsContainer) return;
        this.breadcrumbsContainer.innerHTML = '';

        const parts = this.currentFolderPath === '/' ? [] : this.currentFolderPath.split('/').filter(Boolean);

        // Root segment
        const rootSpan = document.createElement('span');
        rootSpan.className = 'breadcrumb-item';
        rootSpan.textContent = 'ROOT';
        rootSpan.addEventListener('click', () => {
            this.currentFolderPath = '/';
            this.renderBreadcrumbs();
            this._applyFilters();
        });

        // Drop target for root breadcrumb
        this._setupBreadcrumbDropTarget(rootSpan, '/');
        this.breadcrumbsContainer.appendChild(rootSpan);

        let accumulatedPath = '';
        parts.forEach((part) => {
            accumulatedPath += '/' + part;
            const targetPath = accumulatedPath;

            const sepSpan = document.createElement('span');
            sepSpan.className = 'breadcrumb-separator';
            sepSpan.textContent = ' > ';
            this.breadcrumbsContainer?.appendChild(sepSpan);

            const itemSpan = document.createElement('span');
            itemSpan.className = 'breadcrumb-item';
            itemSpan.textContent = part;
            itemSpan.addEventListener('click', () => {
                this.currentFolderPath = targetPath;
                this.renderBreadcrumbs();
                this._applyFilters();
            });

            this._setupBreadcrumbDropTarget(itemSpan, targetPath);
            this.breadcrumbsContainer?.appendChild(itemSpan);
        });
    }

    private _setupBreadcrumbDropTarget(el: HTMLElement, targetPath: string) {
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer && !e.dataTransfer.types.includes('Files')) {
                el.style.color = 'var(--neon-green)';
            }
        });
        el.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.style.color = '';
        });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.style.color = '';
            if (e.dataTransfer && !e.dataTransfer.types.includes('Files')) {
                const effectId = e.dataTransfer.getData('text/plain');
                if (effectId) {
                    this.moveEffectToFolder(effectId, targetPath);
                }
            }
        });
    }

    public moveEffectToFolder(effectId: string, folderPath: string) {
        this.effectFolders[effectId] = folderPath;
        if (this.onFoldersUpdated) {
            this.onFoldersUpdated(this.folderPaths, this.effectFolders);
        }
        this._applyFilters();
    }

    private createBinCard(binPath: string): HTMLElement {
        const card = document.createElement('div');
        card.className = 'bin-card';
        card.dataset.binPath = binPath;

        const binName = binPath.split('/').pop() || binPath;
        const itemCount = Object.values(this.effectFolders).filter(p => p === binPath || p.startsWith(binPath + '/')).length;

        const binInfoEl = document.createElement('div');
        binInfoEl.className = 'bin-info';

        const titleEl = document.createElement('div');
        titleEl.className = 'bin-title';
        titleEl.innerHTML = `<span>📁 ${binName}</span>`;

        const metaEl = document.createElement('div');
        metaEl.className = 'bin-meta';
        metaEl.textContent = `BIN (${itemCount} items)`;

        binInfoEl.appendChild(titleEl);
        binInfoEl.appendChild(metaEl);

        const actionsEl = document.createElement('div');
        actionsEl.className = 'card-actions';

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '6px';

        // Rename Bin Button
        const renameBtn = document.createElement('button');
        renameBtn.className = 'card-rename-btn';
        renameBtn.title = 'Rename Bin';
        renameBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._startInlineBinRename(binPath, titleEl);
        });

        // Delete Bin Button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.title = 'Delete Bin';
        deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._deleteFolder(binPath);
        });

        btnGroup.appendChild(renameBtn);
        btnGroup.appendChild(deleteBtn);
        actionsEl.appendChild(btnGroup);

        card.appendChild(binInfoEl);
        card.appendChild(actionsEl);

        // Double click to open folder
        card.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.currentFolderPath = binPath;
            this.renderBreadcrumbs();
            this._applyFilters();
        });

        // Dragover & Drop target for Bin Card
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer && !e.dataTransfer.types.includes('Files')) {
                card.classList.add('drag-over');
            }
        });

        card.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('drag-over');
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('drag-over');
            if (e.dataTransfer && !e.dataTransfer.types.includes('Files')) {
                const effectId = e.dataTransfer.getData('text/plain');
                if (effectId) {
                    this.moveEffectToFolder(effectId, binPath);
                }
            }
        });

        return card;
    }

    private _startInlineBinRename(binPath: string, titleEl: HTMLElement) {
        if (titleEl.querySelector('input')) return;
        const currentName = binPath.split('/').pop() || '';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cyber-input short';
        input.value = currentName;
        input.style.fontSize = '0.85rem';
        input.style.padding = '2px 4px';

        titleEl.textContent = '';
        titleEl.appendChild(input);
        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            const newName = input.value.trim().replace(/[\/\\]/g, '');
            if (newName && newName !== currentName) {
                const parentDir = binPath.substring(0, binPath.lastIndexOf('/')) || '';
                const newPath = (parentDir === '' ? '/' : parentDir + '/') + newName;

                // Update folderPaths
                this.folderPaths = this.folderPaths.map(p => {
                    if (p === binPath) return newPath;
                    if (p.startsWith(binPath + '/')) return newPath + p.substring(binPath.length);
                    return p;
                });

                // Update effectFolders
                for (const [id, path] of Object.entries(this.effectFolders)) {
                    if (path === binPath) this.effectFolders[id] = newPath;
                    else if (path.startsWith(binPath + '/')) this.effectFolders[id] = newPath + path.substring(binPath.length);
                }

                if (this.currentFolderPath === binPath) this.currentFolderPath = newPath;
                else if (this.currentFolderPath.startsWith(binPath + '/')) this.currentFolderPath = newPath + this.currentFolderPath.substring(binPath.length);

                if (this.onFoldersUpdated) {
                    this.onFoldersUpdated(this.folderPaths, this.effectFolders);
                }
            }
            this.renderBreadcrumbs();
            this._applyFilters();
        };

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
                committed = true;
                this._applyFilters();
            }
        });
        input.addEventListener('blur', commit);
    }

    public _startCreateBinInline() {
        const existingTemp = this.container.querySelector('.temp-bin-card');
        if (existingTemp) existingTemp.remove();

        const card = document.createElement('div');
        card.className = 'bin-card temp-bin-card';
        card.style.borderColor = 'var(--neon-yellow)';
        card.style.boxShadow = '0 0 12px rgba(255, 255, 0, 0.4)';

        const binInfoEl = document.createElement('div');
        binInfoEl.className = 'bin-info';

        const titleEl = document.createElement('div');
        titleEl.className = 'bin-title';
        titleEl.innerHTML = `<span>📁</span>`;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cyber-input short';
        input.placeholder = 'BIN NAME';
        input.style.width = '140px';
        input.style.fontSize = '0.85rem';
        input.style.padding = '2px 6px';

        titleEl.appendChild(input);
        binInfoEl.appendChild(titleEl);
        card.appendChild(binInfoEl);

        this.container.insertBefore(card, this.container.firstChild);
        input.focus();

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            const binName = input.value.trim().replace(/[\/\\]/g, '');
            card.remove();

            if (binName) {
                const newPath = this.currentFolderPath === '/' ? '/' + binName : this.currentFolderPath + '/' + binName;
                if (!this.folderPaths.includes(newPath)) {
                    this.folderPaths.push(newPath);
                    if (this.onFoldersUpdated) {
                        this.onFoldersUpdated(this.folderPaths, this.effectFolders);
                    }
                    this.renderBreadcrumbs();
                    this._applyFilters();
                }
            }
        };

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                commit();
            } else if (e.key === 'Escape') {
                committed = true;
                card.remove();
            }
        });

        input.addEventListener('blur', () => {
            commit();
        });
    }

    private async _deleteFolder(path: string) {
        if (path === '/') return;
        const ok = await window.api.confirmDialog({
            message: `Delete bin "${path.split('/').pop()}"?`,
            detail: 'Effects inside this bin will be moved back to the parent folder.'
        });
        if (!ok) return;

        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        this.folderPaths = this.folderPaths.filter(p => p !== path && !p.startsWith(path + '/'));

        for (const [id, fPath] of Object.entries(this.effectFolders)) {
            if (fPath === path || fPath.startsWith(path + '/')) {
                this.effectFolders[id] = parentPath;
            }
        }
        if (this.currentFolderPath === path || this.currentFolderPath.startsWith(path + '/')) {
            this.currentFolderPath = parentPath;
        }
        if (this.onFoldersUpdated) {
            this.onFoldersUpdated(this.folderPaths, this.effectFolders);
        }
        this.renderBreadcrumbs();
        this._applyFilters();
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

    private _setupContextMenu() {
        const lowerSection = document.querySelector('.cyber-lower');
        if (lowerSection) {
            lowerSection.addEventListener('contextmenu', (e: any) => {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e.clientX, e.clientY);
            });
        }

        const newBinBtn = document.getElementById('ctx-new-bin');
        if (newBinBtn) {
            newBinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dismissContextMenu();
                this._startCreateBinInline();
            });
        }

        document.addEventListener('click', () => this.dismissContextMenu());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.dismissContextMenu();
        });
    }

    public showContextMenu(x: number, y: number) {
        if (!this.contextMenuEl) return;
        this.contextMenuEl.style.left = `${x}px`;
        this.contextMenuEl.style.top = `${y}px`;
        this.contextMenuEl.classList.remove('hidden');
    }

    public dismissContextMenu() {
        if (this.contextMenuEl) {
            this.contextMenuEl.classList.add('hidden');
        }
    }

    public _applyFilters() {
        // Clear existing bin cards from container
        const existingBins = this.container.querySelectorAll('.bin-card');
        existingBins.forEach(b => b.remove());

        // Only render bin cards if not searching
        if (!this._filterSearch) {
            const childBins = this.getDirectChildBins(this.currentFolderPath);
            // Render Bin Cards FIRST (above effect cards)
            childBins.forEach(binPath => {
                const binCard = this.createBinCard(binPath);
                this.container.insertBefore(binCard, this.container.firstChild);
            });
        }

        // Render & Filter Effect Cards
        for (const { effectId, meta, card } of this.allEffects) {
            const matchMedia = this._filterMedia === 'all' || meta.mediatype === this._filterMedia;
            const matchMode = this._filterMode === 'all' || meta.playmode === this._filterMode;

            let displayName = this.effectManager.effectNames?.[effectId] || effectId;
            const matchSearch = !this._filterSearch || displayName.toLowerCase().includes(this._filterSearch);

            const cardFolder = this.effectFolders[effectId] || '/';
            const matchFolder = this._filterSearch ? true : (cardFolder === this.currentFolderPath);

            card.style.display = (matchMedia && matchMode && matchSearch && matchFolder) ? '' : 'none';
        }
    }

    public onEffectRenamed?: (effectId: string, newName: string) => void;

    public addCard(effectId: string, meta: EffectMeta) {
        if (!this.effectFolders[effectId]) {
            this.effectFolders[effectId] = '/';
        }

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
                    delete this.effectFolders[effectId];
                    if (this.onFoldersUpdated) {
                        this.onFoldersUpdated(this.folderPaths, this.effectFolders);
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
