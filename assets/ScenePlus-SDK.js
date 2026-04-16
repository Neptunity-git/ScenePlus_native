/**
 * ScenePlus-SDK.js
 * The official creator API for ScenePlus+ Interactive Effects.
 * Include this script in your HTML file: <script src="scene://_core/ScenePlus-SDK.js"></script>
 */

window.ScenePlus = (function() {
    // Hidden state
    const listeners = {
        init: [],
        release: [],
        panic: []
    };
    
    let metaData = {};
    let systemEnv = {
        preset: 1,
        screenSize: { width: 1920, height: 1080 },
        mousePos: { x: 0, y: 0 }
    };

    let captureIdCounter = 0;
    const captureCallbacks = {};

    // Internal Message Router from Renderer Process
    window.addEventListener('message', (e) => {
        const msg = e.data;
        if (!msg || msg.source !== 'sceneplus-engine') return;

        switch (msg.type) {
            case 'init':
                metaData = msg.meta || {};
                systemEnv.preset = msg.env?.preset || 1;
                systemEnv.screenSize = msg.env?.screenSize || systemEnv.screenSize;
                systemEnv.mousePos = msg.env?.mousePos || systemEnv.mousePos;
                listeners.init.forEach(cb => cb(metaData, systemEnv));
                break;
            case 'release':
                listeners.release.forEach(cb => cb());
                break;
            case 'panic':
                listeners.panic.forEach(cb => cb());
                break;
            case 'mousemove':
                systemEnv.mousePos = msg.pos;
                break;
            case 'capture-response':
                if (captureCallbacks[msg.id]) {
                    captureCallbacks[msg.id](msg.dataUrl, msg.error);
                    delete captureCallbacks[msg.id];
                }
                break;
        }
    });

    // Let the renderer know this iframe is ready to receive the init payload
    window.addEventListener('DOMContentLoaded', () => {
        window.parent.postMessage({ source: 'sceneplus-effect', type: 'ready' }, '*');
    });

    return {
        // Lifecycle Hooks
        onInit: (callback) => listeners.init.push(callback),
        onRelease: (callback) => listeners.release.push(callback),
        onPanic: (callback) => listeners.panic.push(callback),
        
        // Tells the engine to stop this effect immediately
        finish: () => {
            window.parent.postMessage({ source: 'sceneplus-effect', type: 'finish' }, '*');
        },

        // Environmental Info
        getPreset: () => systemEnv.preset,
        getScreenSize: () => systemEnv.screenSize,
        
        // Interactive Info
        getMousePosition: () => systemEnv.mousePos,

        /**
         * Request a screenshot of the main monitor.
         * @param {string} resolution 'low' (480p), 'mid' (720p), 'high' (1080p), 'full' (native)
         * @param {function} callback Called with (dataUrl, errorMsg)
         */
        captureScreen: (resolution = 'low', callback) => {
            if (typeof callback !== 'function') return;
            const id = captureIdCounter++;
            captureCallbacks[id] = callback;
            window.parent.postMessage({ 
                source: 'sceneplus-effect', 
                type: 'capture', 
                resolution, 
                id 
            }, '*');
        }
    };
})();
