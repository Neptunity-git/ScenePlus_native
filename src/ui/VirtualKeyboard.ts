import { EffectManager } from '../engine/EffectManager';
import { ParamEditor } from './ParamEditor';

const KEY_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
];

export const APP_KEYS_TO_UIOHOOK: Record<string, number> = {
    '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
    'Q': 16, 'W': 17, 'E': 18, 'R': 19, 'T': 20, 'Y': 21, 'U': 22, 'I': 23, 'O': 24, 'P': 25,
    'A': 30, 'S': 31, 'D': 32, 'F': 33, 'G': 34, 'H': 35, 'J': 36, 'K': 37, 'L': 38,
    'Z': 44, 'X': 45, 'C': 46, 'V': 47, 'B': 48, 'N': 49, 'M': 50
};

export class VirtualKeyboard {
    private container: HTMLElement;
    private effectManager: EffectManager;
    private paramEditor: ParamEditor;
    private keyElements: Record<number, { btn: HTMLElement; badge: HTMLElement }>;
    private _activePopup: HTMLElement | null = null;
    
    public onAssignmentChanged?: () => void;

    constructor(containerId: string, effectManager: EffectManager) {
        const c = document.getElementById(containerId);
        if (!c) throw new Error(`Container ${containerId} not found`);
        this.container = c;
        this.effectManager = effectManager;
        this.paramEditor = new ParamEditor(effectManager);
        this.keyElements = {};

        this.renderKeyboard();

        document.addEventListener('click', (e: MouseEvent) => {
            if (this._activePopup && !this._activePopup.contains(e.target as Node)) {
                this.dismissPopup();
            }
        }, true);
    }

    private renderKeyboard() {
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

                const badge = document.createElement('div');
                badge.className = 'key-badge hidden';
                badge.textContent = '0';
                btn.appendChild(badge);

                btn.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer && !e.dataTransfer.types.includes('Files')) {
                        btn.classList.add('drag-over');
                    }
                });
                btn.addEventListener('dragleave', () => {
                    btn.classList.remove('drag-over');
                });
                btn.addEventListener('drop', (e) => {
                    e.preventDefault();
                    btn.classList.remove('drag-over');
                    if (e.dataTransfer && !e.dataTransfer.types.includes('Files')) {
                        const effectId = e.dataTransfer.getData('text/plain');
                        if (effectId) {
                            this.assignEffect(uiohookCode, effectId);
                        }
                    }
                });

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

    private _openPopup(keyCode: number, anchorBtn: HTMLElement) {
        this.dismissPopup();

        const assignments = [...(this.effectManager.keyBindings[keyCode.toString()] || [])];

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
                    this.dismissPopup();
                    this._openPopup(keyCode, anchorBtn);
                    this.onAssignmentChanged?.();
                });

                row.appendChild(name);
                row.appendChild(removeBtn);
                popup.appendChild(row);
                
                // Render custom params for this effect
                this.paramEditor.renderParams(popup, effectId);
            });
        }

        const rect = anchorBtn.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 6}px`;

        document.body.appendChild(popup);
        this._activePopup = popup;
    }

    public dismissPopup() {
        if (this._activePopup) {
            this._activePopup.remove();
            this._activePopup = null;
        }
    }

    private _codeToChar(keyCode: number): string {
        for (const [char, code] of Object.entries(APP_KEYS_TO_UIOHOOK)) {
            if (code === keyCode) return char;
        }
        return String(keyCode);
    }

    public assignEffect(keyCode: number, effectId: string) {
        const keyStr = keyCode.toString();
        const existing = this.effectManager.keyBindings[keyStr] || [];
        if (!existing.includes(effectId)) {
            existing.push(effectId);
            this.effectManager.bindKey(keyCode, existing);
            this.updateBadge(keyCode);
            this.onAssignmentChanged?.();
        }
    }

    public removeEffect(keyCode: number, effectId: string) {
        const keyStr = keyCode.toString();
        const existing = this.effectManager.keyBindings[keyStr] || [];
        const updated = existing.filter(id => id !== effectId);
        this.effectManager.bindKey(keyCode, updated);
        this.updateBadge(keyCode);
    }

    public clearAllInternal() {
        Object.keys(this.effectManager.keyBindings).forEach(keyCodeStr => {
            const keyCode = parseInt(keyCodeStr, 10);
            this.effectManager.bindKey(keyCode, []);
            this.updateBadge(keyCode);
        });
    }

    public clearAll() {
        this.clearAllInternal();
        this.onAssignmentChanged?.();
    }

    public updateBadge(keyCode: number) {
        const el = this.keyElements[keyCode];
        if (!el) return;
        const keyStr = keyCode.toString();
        const count = (this.effectManager.keyBindings[keyStr] || []).length;
        if (count > 0) {
            el.badge.textContent = count.toString();
            el.badge.classList.remove('hidden');
        } else {
            el.badge.classList.add('hidden');
        }
    }
}
