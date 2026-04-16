// Mapping basic keys to uiohook KeyCodes for demonstration
const KEY_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
];

export const APP_KEYS_TO_UIOHOOK = {
    '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
    'Q': 16, 'W': 17, 'E': 18, 'R': 19, 'T': 20, 'Y': 21, 'U': 22, 'I': 23, 'O': 24, 'P': 25,
    'A': 30, 'S': 31, 'D': 32, 'F': 33, 'G': 34, 'H': 35, 'J': 36, 'K': 37, 'L': 38,
    'Z': 44, 'X': 45, 'C': 46, 'V': 47, 'B': 48, 'N': 49, 'M': 50
};

export class VirtualKeyboard {
    constructor(containerId, effectManager) {
        this.container = document.getElementById(containerId);
        this.effectManager = effectManager;
        this.keyElements = {};
        this._activePopup = null;

        this.renderKeyboard();

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (this._activePopup && !this._activePopup.contains(e.target)) {
                this.dismissPopup();
            }
        }, true);
    }

    renderKeyboard() {
        this.container.innerHTML = '';

        KEY_ROWS.forEach(rowKeys => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'key-row';

            rowKeys.forEach(char => {
                const uiohookCode = APP_KEYS_TO_UIOHOOK[char];
                if (!uiohookCode) return;

                const btn = document.createElement('div');
                btn.className = 'key-btn';
                btn.textContent = char;

                // Badge for showing number of assignments
                const badge = document.createElement('div');
                badge.className = 'key-badge hidden';
                badge.textContent = '0';
                btn.appendChild(badge);

                // Drag-and-drop: accept effect cards from the library
                btn.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (!e.dataTransfer.types.includes('Files')) {
                        btn.classList.add('drag-over');
                    }
                });
                btn.addEventListener('dragleave', () => {
                    btn.classList.remove('drag-over');
                });
                btn.addEventListener('drop', (e) => {
                    e.preventDefault();
                    btn.classList.remove('drag-over');
                    if (!e.dataTransfer.types.includes('Files')) {
                        const effectId = e.dataTransfer.getData('text/plain');
                        if (effectId) {
                            this.assignEffect(uiohookCode, effectId);
                        }
                    }
                });

                // Click: open assignment management popup
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._openPopup(uiohookCode, btn);
                });

                this.keyElements[uiohookCode] = { btn, badge };
                rowDiv.appendChild(btn);
            });

            this.container.appendChild(rowDiv);
        });
    }

    // ---- Popup: show current assignments, allow per-effect removal ----

    _openPopup(keyCode, anchorBtn) {
        // Close any existing popup first
        this.dismissPopup();

        const assignments = [...(this.effectManager.keyBindings[keyCode] || [])];

        const popup = document.createElement('div');
        popup.className = 'key-popup';

        const title = document.createElement('div');
        title.className = 'key-popup-title';
        title.textContent = `KEY ${this._codeToChar(keyCode)} ASSIGNMENTS`;
        popup.appendChild(title);

        if (assignments.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'key-popup-empty';
            empty.textContent = 'No effects assigned.';
            popup.appendChild(empty);
        } else {
            assignments.forEach(effectId => {
                const row = document.createElement('div');
                row.className = 'key-popup-row';

                const name = document.createElement('span');
                const rawName = this.effectManager.effectNames?.[effectId] || effectId.split('-')[0];
                name.textContent = rawName;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'key-popup-remove';
                removeBtn.textContent = '✕';
                removeBtn.title = 'Remove this assignment';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeEffect(keyCode, effectId);
                    // Refresh popup in place
                    this.dismissPopup();
                    this._openPopup(keyCode, anchorBtn);
                    // Notify persistence
                    this.onAssignmentChanged?.();
                });

                row.appendChild(name);
                row.appendChild(removeBtn);
                popup.appendChild(row);
            });
        }

        // Position popup above/below key button
        const rect = anchorBtn.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 6}px`;

        document.body.appendChild(popup);
        this._activePopup = popup;
    }

    dismissPopup() {
        if (this._activePopup) {
            this._activePopup.remove();
            this._activePopup = null;
        }
    }

    _codeToChar(keyCode) {
        for (const [char, code] of Object.entries(APP_KEYS_TO_UIOHOOK)) {
            if (code === keyCode) return char;
        }
        return String(keyCode);
    }

    // ---- Assignment Management ----

    assignEffect(keyCode, effectId) {
        const existing = this.effectManager.keyBindings[keyCode] || [];
        if (!existing.includes(effectId)) {
            existing.push(effectId);
            this.effectManager.bindKey(keyCode, existing);
            this.updateBadge(keyCode);
            this.onAssignmentChanged?.();
        }
    }

    removeEffect(keyCode, effectId) {
        const existing = this.effectManager.keyBindings[keyCode] || [];
        const updated = existing.filter(id => id !== effectId);
        this.effectManager.bindKey(keyCode, updated);
        this.updateBadge(keyCode);
    }

    clearAllInternal() {
        Object.keys(this.effectManager.keyBindings).forEach(keyCode => {
            this.effectManager.bindKey(keyCode, []);
            this.updateBadge(keyCode);
        });
    }

    clearAll() {
        this.clearAllInternal();
        this.onAssignmentChanged?.();
    }

    updateBadge(keyCode) {
        const el = this.keyElements[keyCode];
        if (!el) return;
        const count = (this.effectManager.keyBindings[keyCode] || []).length;
        if (count > 0) {
            el.badge.textContent = count;
            el.badge.classList.remove('hidden');
        } else {
            el.badge.classList.add('hidden');
        }
    }
}
