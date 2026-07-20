import { EffectManager } from '../engine/EffectManager';

interface ParamDef {
    key: string;
    label: string;
    type: 'slider' | 'color' | 'toggle' | 'select';
    min?: number;
    max?: number;
    step?: number;
    default?: any;
    options?: string[];
}

export class ParamEditor {
    private effectManager: EffectManager;

    constructor(effectManager: EffectManager) {
        this.effectManager = effectManager;
    }

    /**
     * Generate parameter UI elements for a given effect and append them to a container.
     * Returns true if any params were rendered.
     */
    public renderParams(container: HTMLElement, effectId: string): boolean {
        const player = this.effectManager.players[effectId];
        if (!player || !player.meta.params || !Array.isArray(player.meta.params)) {
            return false;
        }

        const paramDefs: ParamDef[] = player.meta.params;
        if (paramDefs.length === 0) return false;

        // Initialize effectParams if not present
        if (!this.effectManager.effectParams[effectId]) {
            this.effectManager.effectParams[effectId] = {};
            for (const p of paramDefs) {
                this.effectManager.effectParams[effectId][p.key] = p.default ?? 0;
            }
        }

        const section = document.createElement('div');
        section.className = 'param-editor-section';

        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'param-editor-title';
        sectionTitle.textContent = '⚙ PARAMETERS';
        section.appendChild(sectionTitle);

        for (const param of paramDefs) {
            const row = document.createElement('div');
            row.className = 'param-editor-row';

            const label = document.createElement('label');
            label.className = 'param-editor-label';
            label.textContent = param.label || param.key;
            row.appendChild(label);

            const currentVal = this.effectManager.effectParams[effectId][param.key] ?? param.default;

            if (param.type === 'slider') {
                const wrapper = document.createElement('div');
                wrapper.className = 'param-slider-wrapper';

                const input = document.createElement('input');
                input.type = 'range';
                input.className = 'param-slider';
                input.min = String(param.min ?? 0);
                input.max = String(param.max ?? 100);
                input.step = String(param.step ?? 0.1);
                input.value = String(currentVal);

                const valueDisplay = document.createElement('span');
                valueDisplay.className = 'param-value';
                valueDisplay.textContent = String(currentVal);

                input.addEventListener('input', () => {
                    const val = parseFloat(input.value);
                    this.effectManager.effectParams[effectId][param.key] = val;
                    valueDisplay.textContent = val.toFixed(2);
                });

                wrapper.appendChild(input);
                wrapper.appendChild(valueDisplay);
                row.appendChild(wrapper);
            } else if (param.type === 'color') {
                const input = document.createElement('input');
                input.type = 'color';
                input.className = 'param-color';
                input.value = currentVal || '#39ff14';

                input.addEventListener('input', () => {
                    this.effectManager.effectParams[effectId][param.key] = input.value;
                });

                row.appendChild(input);
            } else if (param.type === 'toggle') {
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'param-toggle';
                input.checked = !!currentVal;

                input.addEventListener('change', () => {
                    this.effectManager.effectParams[effectId][param.key] = input.checked;
                });

                row.appendChild(input);
            } else if (param.type === 'select' && param.options) {
                const select = document.createElement('select');
                select.className = 'cyber-select param-select';
                for (const opt of param.options) {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    if (opt === currentVal) option.selected = true;
                    select.appendChild(option);
                }

                select.addEventListener('change', () => {
                    this.effectManager.effectParams[effectId][param.key] = select.value;
                });

                row.appendChild(select);
            }

            section.appendChild(row);
        }

        container.appendChild(section);
        return true;
    }
}
