export function init(env) {
    const state = {
        active: true,
        releasing: false,
        fadeAlpha: 1.0,
        bufferCanvas: null,
        bufferCtx: null,
        width: 0,
        height: 0
    };

    // 画面キャプチャの取得（処理負荷を考慮し 'mid' を使用）
    window.api.captureScreen('mid').then(res => {
        if (res.dataUrl) {
            const img = new Image();
            img.onload = () => {
                state.width = img.width;
                state.height = img.height;
                
                // オフスクリーンキャンバス（裏画面）を生成し、初期のデスクトップ状態を焼き付ける
                state.bufferCanvas = document.createElement('canvas');
                state.bufferCanvas.width = state.width;
                state.bufferCanvas.height = state.height;
                state.bufferCtx = state.bufferCanvas.getContext('2d');
                state.bufferCtx.drawImage(img, 0, 0);
            };
            img.src = res.dataUrl;
        }
    }).catch(err => console.error(err));

    return state;
}

export function render(ctx, state, env, time) {
    if (!state.active) return false;

    // キー/ボタンが離されたらフェードアウトして安全に終了（システムの美学）
    if (state.releasing) {
        state.fadeAlpha -= 0.05;
        if (state.fadeAlpha <= 0) {
            state.active = false;
            return false;
        }
    }

    // キャプチャ画像がロードされるまでは何も描画せずに待機
    if (!state.bufferCanvas) return true;

    const bCtx = state.bufferCtx;
    const w = state.width;
    const h = state.height;

    // ==========================================
    // 破壊エフェクトの適用（裏画面に上書きしていく）
    // ==========================================

    // 1. メルトダウン（高頻度）: ブロックを少し下にズラしてコピペし、溶け落ちる表現
    if (Math.random() < 0.6) {
        const sw = Math.random() * 200 + 50;
        const sh = Math.random() * 50 + 10;
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const dx = sx + (Math.random() - 0.5) * 10; // 横はわずかにブレる
        const dy = sy + (Math.random() * 30 + 10);  // 確実に下に落ちる
        bCtx.drawImage(state.bufferCanvas, sx, sy, sw, sh, dx, dy, sw, sh);
    }

    // 2. ティアリング（中頻度）: 横方向のグリッチノイズ
    if (Math.random() < 0.3) {
        const sy = Math.random() * h;
        const sh = Math.random() * 30 + 5;
        const shiftX = (Math.random() - 0.5) * 100;
        bCtx.drawImage(state.bufferCanvas, 0, sy, w, sh, shiftX, sy, w, sh);
    }

    // 3. インバート（低頻度）: 局所的な色反転
    if (Math.random() < 0.1) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const sw = Math.random() * 300 + 100;
        const sh = Math.random() * 100 + 50;
        
        bCtx.save();
        bCtx.filter = 'invert(1)';
        bCtx.drawImage(state.bufferCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
        bCtx.restore();
    }

    // 4. サイケデリック（稀）: 一部の色調を狂わせる
    if (Math.random() < 0.05) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const sw = Math.random() * 400 + 100;
        const sh = Math.random() * 400 + 100;

        bCtx.save();
        bCtx.filter = `hue-rotate(${Math.random() * 360}deg) contrast(150%)`;
        bCtx.drawImage(state.bufferCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
        bCtx.restore();
    }

    // 5. ズームフィードバック（超稀）: 画面全体をわずかに拡大して薄く上書き（焦燥感を煽る）
    if (Math.random() < 0.02) {
        bCtx.save();
        bCtx.translate(w / 2, h / 2);
        bCtx.scale(1.02, 1.02);
        bCtx.translate(-w / 2, -h / 2);
        bCtx.globalAlpha = 0.3;
        bCtx.drawImage(state.bufferCanvas, 0, 0);
        bCtx.restore();
    }

    // ==========================================
    // メインキャンバスへの描画
    // ==========================================
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.globalAlpha = state.fadeAlpha;
    
    // 破壊され続ける裏画面を、現在のウィンドウサイズに合わせて描画
    ctx.drawImage(state.bufferCanvas, 0, 0, canvasW, canvasH);
    
    // 仕上げ: チカチカする黒いスキャンライン（ノイズ）をオーバーレイ
    if (Math.random() < 0.4) {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.15})`;
        const lineY = Math.random() * canvasH;
        ctx.fillRect(0, lineY, canvasW, Math.random() * 8 + 2);
    }
    
    ctx.restore();

    return true;
}

export function release(state) {
    // ボタンを離すと、崩壊した画面がスーッと消えて平和なデスクトップに戻る
    state.releasing = true;
}