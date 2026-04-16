const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

/**
 * Worker script for heavy file processing.
 * Note: Although utilityProcess can use parentPort from 'electron', 
 * within the fork it works similarly to worker_threads or process messaging.
 */

process.parentPort.on('message', async (e) => {
    const { action, filePath, destDir } = e.data;

    if (action === 'process-import') {
        try {
            // 1. Streaming SHA-256 Hash
            process.parentPort.postMessage({ type: 'status', message: 'Hashing file...' });
            const hash = await getFileHash(filePath);

            // 2. Extract
            process.parentPort.postMessage({ type: 'status', message: 'Extracting content...' });
            
            // For zip extraction progress, we use the entries count
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();
            const total = entries.length;
            const finalPath = path.join(destDir, hash);

            if (!fs.existsSync(finalPath)) {
                fs.mkdirSync(finalPath, { recursive: true });
            }

            let usesSDK = false;
            for (let i = 0; i < total; i++) {
                const entry = entries[i];
                zip.extractEntryTo(entry, finalPath, false, true);
                
                if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html')) {
                    const extractedFilePath = path.join(finalPath, path.basename(entry.entryName));
                    if (fs.existsSync(extractedFilePath)) {
                        const content = fs.readFileSync(extractedFilePath, 'utf8');
                        if (content.includes('scene://_core/ScenePlus-SDK.js')) {
                            usesSDK = true;
                        }
                    }
                }
                
                // Feedback: Mapping extraction to 40% - 100%
                if (i % Math.max(1, Math.floor(total / 10)) === 0 || i === total - 1) {
                    const percent = Math.round(40 + (((i + 1) / total) * 60));
                    process.parentPort.postMessage({ type: 'progress', percent });
                }
            }

            // Step 0: Save the original .scenefx file into the folder so the HTTP server can serve it
            const scenefxPath = path.join(finalPath, `${hash}.scenefx`);
            fs.copyFileSync(filePath, scenefxPath);

            // 3. Load and Validate meta.json
            const metaPath = path.join(finalPath, 'meta.json');
            let meta = null;
            let rawJson = '';

            try {
                if (!fs.existsSync(metaPath)) {
                    throw new Error("Missing 'meta.json' in the root of the archive.");
                }
                rawJson = fs.readFileSync(metaPath, 'utf8');
                meta = JSON.parse(rawJson);
                
                // Step 0: Append usesSDK flag and save back to disk
                meta.usesSDK = usesSDK;
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
            } catch (err) {
                const syntaxErr = (err instanceof SyntaxError) ? 
                    "Syntax Error in meta.json (Check for missing commas or quotes)" : 
                    err.message;
                
                // Cleanup and return diagnostic
                cleanupOnFailure(finalPath);
                process.parentPort.postMessage({ 
                    type: 'error', 
                    error: syntaxErr,
                    diagnostic: true,
                    template: generateTemplate(entries, hash) 
                });
                return;
            }

            // --- Level 2 & 3 Validation ---
            try {
                validateMeta(meta, entries);
            } catch (err) {
                cleanupOnFailure(finalPath);
                process.parentPort.postMessage({ 
                    type: 'error', 
                    error: err.message,
                    diagnostic: true,
                    template: generateTemplate(entries, hash, meta)
                });
                return;
            }

            process.parentPort.postMessage({ 
                type: 'success', 
                hash, 
                meta,
                basePath: finalPath + path.sep 
            });

        } catch (err) {
            process.parentPort.postMessage({ type: 'error', error: err.message });
        }
    }
});

function cleanupOnFailure(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function validateMeta(meta, entries) {
    const required = ['name', 'mediatype', 'playmode', 'path'];
    for (const field of required) {
        if (!meta[field]) throw new Error(`Missing required field: '${field}'`);
    }

    const validTypes = ['image', 'video', 'sound', 'code'];
    if (!validTypes.includes(meta.mediatype)) {
        throw new Error(`Invalid mediatype: '${meta.mediatype}'. Must be one of: ${validTypes.join(', ')}`);
    }

    const validModes = ['once', 'loop', 'hold'];
    if (!validModes.includes(meta.playmode)) {
        throw new Error(`Invalid playmode: '${meta.playmode}'. Must be one of: ${validModes.join(', ')}`);
    }

    // Logic: Duration requirement
    if ((meta.mediatype === 'image' || meta.mediatype === 'code') && meta.playmode === 'once') {
        const d = parseInt(meta.duration, 10);
        if (isNaN(d) || d <= 0) {
            throw new Error("Once mode for Image/Code requires a positive 'duration' (milliseconds)");
        }
    }

    // Logic: Path exists in zip
    const normPath = meta.path.startsWith('/') ? meta.path.substring(1) : meta.path;
    const exists = entries.some(e => e.entryName === normPath);
    if (!exists) {
        throw new Error(`Path defined in meta.json ('${meta.path}') not found in the archive.`);
    }
}

function generateTemplate(entries, hash, partialMeta = {}) {
    // Guess mediatype based on first "likely" file if not provided
    let mediatype = partialMeta.mediatype || 'image';
    let pathHint = partialMeta.path || '';

    if (!pathHint) {
        const asset = entries.find(e => !e.isDirectory && !e.entryName.includes('meta.json'));
        if (asset) {
            pathHint = asset.entryName;
            if (pathHint.endsWith('.mp4') || pathHint.endsWith('.webm')) mediatype = 'video';
            else if (pathHint.endsWith('.mp3') || pathHint.endsWith('.wav')) mediatype = 'sound';
            else if (pathHint.endsWith('.html')) mediatype = 'code';
        }
    }

    const template = {
        name: partialMeta.name || "Untitled Effect",
        mediatype: mediatype,
        playmode: partialMeta.playmode || "once",
        path: pathHint.startsWith('/') ? pathHint : "/" + pathHint
    };

    if (template.playmode === 'once' && (mediatype === 'image' || mediatype === 'code')) {
        template.duration = partialMeta.duration || 3000;
    }

    return JSON.stringify(template, null, 2);
}

function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        const stats = fs.statSync(filePath);
        let bytesRead = 0;

        stream.on('data', (chunk) => {
            bytesRead += chunk.length;
            hash.update(chunk);
            // Feedback: Mapping hashing to 0% - 40%
            const percent = Math.round((bytesRead / stats.size) * 40);
            process.parentPort.postMessage({ type: 'progress', percent });
        });

        stream.on('end', () => {
            resolve(hash.digest('hex'));
        });

        stream.on('error', reject);
    });
}
