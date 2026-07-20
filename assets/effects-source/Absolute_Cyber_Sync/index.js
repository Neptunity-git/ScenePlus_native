async function setupAudio(state) {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        // Let's just use default mic for simplicity
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        state.analyser = analyser;
        state.freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
        console.error("Audio Setup Failed", e);
    }
}

export function init(env) {
    const state = {
        active: true,
        releasing: false,
        fadeAlpha: 1.0,
        cx: env.mousePos.x,
        cy: env.mousePos.y,
        currentImg: null,
        particles: [],
        maxParticles: 300,
        analyser: null,
        freqData: null,
        audioBass: 0,
        audioMid: 0,
        frameCount: 0,
        wasLeftDown: false,
    };

    // Initialize Audio
    setupAudio(state);

    // Initialize Screen Capture
    window.api.captureScreen('mid').then(res => {
        if (res.dataUrl) {
            const img = new Image();
            img.onload = () => { state.currentImg = img; };
            img.src = res.dataUrl;
        }
    }).catch(err => console.error(err));

    return state;
}

export function render(ctx, state, env, time) {
    if (!state.active) return false;
    
    state.frameCount++;
    
    // Performance Profiling
    const fps = env.performance.fps;
    if (fps < 30) {
        state.maxParticles = 80;
    } else if (fps < 50) {
        state.maxParticles = 200;
    } else {
        state.maxParticles = 500;
    }

    // Audio Analysis
    if (state.analyser && state.freqData) {
        state.analyser.getByteFrequencyData(state.freqData);
        // Average low frequencies (0-5)
        let bassSum = 0;
        for (let i = 0; i < 5; i++) bassSum += state.freqData[i];
        state.audioBass = bassSum / 5;
        
        // Mid frequencies (10-20)
        let midSum = 0;
        for (let i = 10; i < 20; i++) midSum += state.freqData[i];
        state.audioMid = midSum / 10;
    }

    // Retrieve parameters
    const mainColor = env.params.mainColor || '#00ffcc';
    const accentColor = env.params.accentColor || '#ff00ff';
    const audioSens = env.params.audioSens || 1.2;
    const glitchEnable = env.params.glitchEnable !== false;
    const particleSpeed = env.params.particleSpeed || 1.5;

    // Smooth cursor follow
    state.cx += (env.mousePos.x - state.cx) * 0.15;
    state.cy += (env.mousePos.y - state.cy) * 0.15;

    ctx.save();
    ctx.globalAlpha = state.fadeAlpha;

    const bassLevel = (state.audioBass / 255.0) * audioSens;
    const midLevel = (state.audioMid / 255.0) * audioSens;

    // LAYER 1: Audio-Reactive Desktop Glitch Filter
    if (state.currentImg && glitchEnable) {
        ctx.save();
        
        // The base distortion radius pulses with bass
        const radius = 200 + (bassLevel * 200);
        
        // Clipping region around mouse
        ctx.beginPath();
        ctx.arc(state.cx, state.cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        const scaleX = state.currentImg.width / ctx.canvas.width;
        const scaleY = state.currentImg.height / ctx.canvas.height;
        
        if (bassLevel > 0.5) {
            // High energy: Cyber Glitch Effect (VHS / Digital Tearing)
            const slices = Math.floor(3 + bassLevel * 5);
            for (let i = 0; i < slices; i++) {
                const sliceY = state.cy - radius + (Math.random() * radius * 2);
                const sliceH = 10 + Math.random() * 40;
                // Offset slices heavily based on bass
                const offsetX = (Math.random() - 0.5) * 150 * bassLevel;
                // Add RGB split simulation by tinting
                ctx.globalCompositeOperation = Math.random() > 0.5 ? 'screen' : 'source-over';
                
                ctx.drawImage(state.currentImg,
                    (state.cx - radius) * scaleX, sliceY * scaleY, (radius * 2) * scaleX, sliceH * scaleY,
                    state.cx - radius + offsetX, sliceY, radius * 2, sliceH
                );
            }
        } else {
            // Low energy: Organic Kaleidoscope / Zoom Distortion
            const zoom = 1.05 + (bassLevel * 0.15);
            ctx.drawImage(state.currentImg, 
                (state.cx - radius/zoom) * scaleX, (state.cy - radius/zoom) * scaleY, (radius * 2 / zoom) * scaleX, (radius * 2 / zoom) * scaleY, 
                state.cx - radius, state.cy - radius, radius * 2, radius * 2 
            );
        }
        
        // Glitch Ring Border
        ctx.beginPath();
        ctx.arc(state.cx, state.cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = bassLevel > 0.7 ? accentColor : mainColor;
        ctx.lineWidth = 3 + (bassLevel * 8);
        ctx.stroke();
        
        ctx.restore();
    }

    // LAYER 2: Audio-Reactive Particle Swarm
    // Spawn particles based on mid frequencies and overall time
    const spawnRate = Math.floor(1 + midLevel * 8);
    for(let i=0; i<spawnRate; i++) {
        if(state.particles.length < state.maxParticles) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 50;
            state.particles.push({
                x: state.cx + Math.cos(angle) * dist,
                y: state.cy + Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 3 * particleSpeed,
                vy: (Math.random() - 0.5) * 3 * particleSpeed,
                life: 1.0,
                decay: 0.01 + Math.random() * 0.03,
                color: Math.random() > 0.3 ? mainColor : accentColor,
                size: 2 + Math.random() * 3 + (bassLevel * 3)
            });
        }
    }
    
    // Manual Shockwave via Mouse Click
    if (env.mouseState.left && !state.wasLeftDown) {
        for(let i = 0; i < 50; i++) {
            if(state.particles.length < state.maxParticles) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 8 + Math.random() * 15 * particleSpeed;
                state.particles.push({
                    x: env.mousePos.x,
                    y: env.mousePos.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1.2,
                    decay: 0.02,
                    color: '#ffffff',
                    size: 4 + Math.random() * 4
                });
            }
        }
    }
    state.wasLeftDown = env.mouseState.left;

    // Update and Draw Particles
    ctx.globalCompositeOperation = 'screen';
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        
        if (p.life <= 0) {
            state.particles.splice(i, 1);
            continue;
        }

        // Particle size pulses with audio
        const dynamicSize = p.size * (1 + bassLevel * 1.5);
        
        ctx.globalAlpha = p.life * state.fadeAlpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dynamicSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Velocity Trailing
        ctx.strokeStyle = p.color;
        ctx.lineWidth = dynamicSize * 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
        ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    
    ctx.restore();

    // LAYER 3: Graceful Exit (Release)
    if (state.releasing) {
        state.fadeAlpha -= 0.03;
        if (state.fadeAlpha <= 0) {
            state.active = false;
            return false;
        }
    }

    return true;
}

export function release(state) {
    state.releasing = true;
}
