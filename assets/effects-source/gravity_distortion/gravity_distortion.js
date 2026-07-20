export function init(env) {
    const state = {
        cx: env.mousePos.x,
        cy: env.mousePos.y,
        currentImg: null,
        fadeAlpha: 1.0,
        releasing: false
    };

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
    state.cx += (env.mousePos.x - state.cx) * 0.2;
    state.cy += (env.mousePos.y - state.cy) * 0.2;

    ctx.globalAlpha = state.fadeAlpha;

    if (state.currentImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(state.cx, state.cy, 150, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        const scaleX = state.currentImg.width / ctx.canvas.width;
        const scaleY = state.currentImg.height / ctx.canvas.height;
        
        ctx.drawImage(state.currentImg, 
            (state.cx - 75) * scaleX, (state.cy - 75) * scaleY, 150 * scaleX, 150 * scaleY, 
            state.cx - 150, state.cy - 150, 300, 300 
        );
        ctx.restore();

        ctx.beginPath();
        ctx.arc(state.cx, state.cy, 150, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(57, 255, 20, ${state.fadeAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    if (state.releasing) {
        state.fadeAlpha -= 0.05;
        if (state.fadeAlpha <= 0) {
            state.active = false;
            return false;
        }
    }
    
    ctx.globalAlpha = 1.0;
    return true;
}

export function release(state) {
    state.releasing = true;
}
