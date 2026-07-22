let currentMeta: any = null;
let currentAssetData: any = null;

const step1 = document.getElementById('step-1') as HTMLDivElement;
const step2 = document.getElementById('step-2') as HTMLDivElement;
const step1Indicator = document.getElementById('step1-indicator') as HTMLSpanElement;
const step2Indicator = document.getElementById('step2-indicator') as HTMLSpanElement;

const metaTextarea = document.getElementById('meta-textarea') as HTMLTextAreaElement;
const metaError = document.getElementById('meta-error') as HTMLDivElement;
const btnValidateMeta = document.getElementById('btn-validate-meta') as HTMLButtonElement;

const assetUiCode = document.getElementById('asset-ui-code') as HTMLDivElement;
const assetUiFile = document.getElementById('asset-ui-file') as HTMLDivElement;
const codeTextarea = document.getElementById('code-textarea') as HTMLTextAreaElement;
const btnSelectFile = document.getElementById('btn-select-file') as HTMLButtonElement;
const selectedFileDisplay = document.getElementById('selected-file-display') as HTMLDivElement;
const assetError = document.getElementById('asset-error') as HTMLDivElement;

const btnBackStep1 = document.getElementById('btn-back-step1') as HTMLButtonElement;
const btnSaveInstall = document.getElementById('btn-save-install') as HTMLButtonElement;

const successModal = document.getElementById('success-modal') as HTMLDivElement;
const btnCloseSuccess = document.getElementById('btn-close-success') as HTMLButtonElement;

btnValidateMeta.addEventListener('click', () => {
    metaError.classList.add('hidden');
    const raw = metaTextarea.value.trim();
    if (!raw) {
        showError(metaError, 'meta.json cannot be empty.');
        return;
    }

    try {
        const meta = JSON.parse(raw);
        
        // Validation
        if (!meta.name) throw new Error("Missing 'name' property.");
        if (!meta.mediatype) throw new Error("Missing 'mediatype' property. Must be 'code', 'image', 'video', or 'sound'.");
        if (!['code', 'image', 'video', 'sound'].includes(meta.mediatype)) {
            throw new Error(`Invalid 'mediatype': ${meta.mediatype}`);
        }
        if (!meta.playmode) throw new Error("Missing 'playmode' property. Must be 'once', 'loop', or 'hold'.");
        if (!['once', 'loop', 'hold'].includes(meta.playmode)) {
            throw new Error(`Invalid 'playmode': ${meta.playmode}`);
        }
        
        if (meta.playmode === 'once' && (meta.mediatype === 'code' || meta.mediatype === 'image')) {
            if (typeof meta.duration !== 'number' || meta.duration <= 0) {
                throw new Error("Missing or invalid 'duration'. 'once' mode requires a duration (in milliseconds).");
            }
        }
        
        currentMeta = meta;
        
        // Transition to step 2
        step1.classList.add('hidden');
        step2.classList.remove('hidden');
        step1Indicator.classList.remove('active');
        step2Indicator.classList.add('active');
        
        setupAssetUi();
        
    } catch (e: any) {
        showError(metaError, `Validation Error: ${e.message}`);
    }
});

function setupAssetUi() {
    assetError.classList.add('hidden');
    currentAssetData = null;
    
    if (currentMeta.mediatype === 'code') {
        assetUiCode.classList.remove('hidden');
        assetUiFile.classList.add('hidden');
    } else {
        assetUiCode.classList.add('hidden');
        assetUiFile.classList.remove('hidden');
        selectedFileDisplay.textContent = 'NO FILE SELECTED';
    }
}

btnSelectFile.addEventListener('click', async () => {
    let filters: any[] = [];
    if (currentMeta.mediatype === 'image') filters = [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }];
    else if (currentMeta.mediatype === 'video') filters = [{ name: 'Videos', extensions: ['mp4', 'webm'] }];
    else if (currentMeta.mediatype === 'sound') filters = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }];
    else filters = [{ name: 'All Files', extensions: ['*'] }];
    
    const result = await window.api.selectAssetFile(filters);
    if (!result.canceled && result.file) {
        currentAssetData = { type: 'file', path: result.file };
        selectedFileDisplay.textContent = result.file;
        assetError.classList.add('hidden');
    }
});

btnBackStep1.addEventListener('click', () => {
    step2.classList.add('hidden');
    step1.classList.remove('hidden');
    step2Indicator.classList.remove('active');
    step1Indicator.classList.add('active');
});

btnSaveInstall.addEventListener('click', async () => {
    assetError.classList.add('hidden');
    
    if (currentMeta.mediatype === 'code') {
        const code = codeTextarea.value.trim();
        if (!code) {
            showError(assetError, 'Script code cannot be empty.');
            return;
        }
        currentAssetData = { type: 'text', content: code };
    } else {
        if (!currentAssetData || currentAssetData.type !== 'file') {
            showError(assetError, 'Please select a file.');
            return;
        }
    }
    
    try {
        btnSaveInstall.textContent = 'INSTALLING...';
        btnSaveInstall.disabled = true;
        
        const result = await window.api.saveComposedEffect(JSON.stringify(currentMeta, null, 2), currentAssetData);
        if (result.success) {
            successModal.classList.remove('hidden');
            // Notify main window to rescan (the main window handles it when focused, or user clicks close)
        } else {
            showError(assetError, result.error || 'Unknown error occurred.');
        }
    } catch (e: any) {
        showError(assetError, e.message);
    } finally {
        btnSaveInstall.textContent = 'SAVE & INSTALL';
        btnSaveInstall.disabled = false;
    }
});

btnCloseSuccess.addEventListener('click', () => {
    window.close();
});

function showError(el: HTMLDivElement, msg: string) {
    el.textContent = msg;
    el.classList.remove('hidden');
}
