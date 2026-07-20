// 1. エフェクト発火時の初期化処理
export function init(env) {
    return {
        active: true,
        releasing: false,
        alpha: 1.0,
        targets: [],       // 画面上の的
        particles: [],     // 撃ち抜いた時の火花
        floatingTexts: [], // スコア表示（+100 等）
        score: 0,
        combo: 0,
        frameCount: 0,
        wasLeftDown: false,
        crosshairRot: 0    // 照準の回転アニメーション用
    };
}

// 2. 毎フレーム呼ばれる描画ループ
export function render(ctx, state, env, time) {
    if (!state.active) return false;

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    // カスタムパラメータの取得
    const difficulty = env.params.difficulty || 5;
    const targetColor = env.params.targetColor || "#ff0055";
    const sparkColor = env.params.sparkColor || "#ffd700";

    state.frameCount++;
    state.crosshairRot += 0.02;

    // --- 【入力処理】クリック判定 ---
    const isClick = env.mouseState.left && !state.wasLeftDown;
    state.wasLeftDown = env.mouseState.left;

    let hitThisFrame = false;

    // --- 【更新処理】的の発生と寿命 ---
    // 難易度に応じて的が出現 (difficulty 10 なら 15フレームに1回)
    const spawnRate = Math.max(10, 65 - (difficulty * 5)); 
    if (state.frameCount % spawnRate === 0) {
        state.targets.push({
            x: Math.random() * (width - 200) + 100,
            y: Math.random() * (height - 200) + 100,
            radius: 0,
            maxRadius: Math.random() * 20 + 30, // 30〜50px
            life: 1.0, // 1.0から減っていく
            decay: 0.005 + (difficulty * 0.001)
        });
    }

    // --- 【更新処理】ヒット判定 ---
    for (let i = state.targets.length - 1; i >= 0; i--) {
        const t = state.targets[i];
        
        // 出現アニメーション
        if (t.radius < t.maxRadius) t.radius += (t.maxRadius - t.radius) * 0.2;
        // 寿命を減らす
        t.life -= t.decay;

        // クリックされた時の距離判定（当たり判定）
        if (isClick && t.life > 0) {
            const dx = env.mousePos.x - t.x;
            const dy = env.mousePos.y - t.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < t.radius) {
                // ヒット！
                hitThisFrame = true;
                state.combo++;
                const earned = 100 * state.combo;
                state.score += earned;

                // パーティクル発生
                for(let p=0; p<15; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 15 + 5;
                    state.particles.push({
                        x: t.x, y: t.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 1.0,
                        size: Math.random() * 4 + 2
                    });
                }

                // スコアテキスト発生
                state.floatingTexts.push({
                    x: t.x, y: t.y, text: `+${earned}`, life: 1.0
                });

                // 的を消去
                state.targets.splice(i, 1);
                continue;
            }
        }

        // 寿命切れで消滅
        if (t.life <= 0) {
            state.combo = 0; // コンボリセット
            state.targets.splice(i, 1);
        }
    }

    // 空振りしたらコンボリセット
    if (isClick && !hitThisFrame) {
        state.combo = 0;
    }

    // --- 【描画処理】ここからキャンバスへのレンダリング ---
    ctx.save();
    ctx.globalAlpha = state.alpha;

    // 1. 的の描画
    state.targets.forEach(t => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0, 0.5)`; // 下地
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = targetColor;
        ctx.stroke();

        // 内側の模様（ダーツの的風）
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = targetColor;
        
        // 寿命が残り少ないと点滅する
        if (t.life > 0.3 || state.frameCount % 10 < 5) {
            ctx.fill();
        }
    });

    // 2. パーティクル（火花）の更新と描画
    ctx.globalCompositeOperation = "lighter"; // 光るブレンドモード
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.9; // 摩擦
        p.vy *= 0.9;
        p.vy += 0.5; // 重力
        p.life -= 0.03;

        if (p.life <= 0) {
            state.particles.splice(i, 1);
            continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = sparkColor;
        ctx.globalAlpha = state.alpha * p.life;
        ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over"; // ブレンドモードを戻す

    // 3. フローティングテキスト（+100 等）の更新と描画
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.y -= 2; // 上へ昇る
        ft.life -= 0.02;

        if (ft.life <= 0) {
            state.floatingTexts.splice(i, 1);
            continue;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${ft.life})`;
        ctx.fillText(ft.text, ft.x, ft.y);
    }

    // 4. マウスカーソル（照準）の描画
    ctx.globalAlpha = state.alpha;
    const mx = env.mousePos.x;
    const my = env.mousePos.y;
    
    ctx.save();
    ctx.translate(mx, my);
    
    // クリックした瞬間は照準が少し小さくなる（反動表現）
    const crosshairScale = env.mouseState.left ? 0.7 : 1.0;
    ctx.scale(crosshairScale, crosshairScale);
    ctx.rotate(state.crosshairRot);

    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 照準の十字
    ctx.beginPath();
    ctx.moveTo(-30, 0); ctx.lineTo(30, 0);
    ctx.moveTo(0, -30); ctx.lineTo(0, 30);
    ctx.stroke();
    ctx.restore();

    // 5. UI（スコアとコンボ）の描画
    ctx.fillStyle = `rgba(0, 255, 255, ${state.alpha})`;
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "left";
    // 画面上部に追従するか、固定位置に描画
    ctx.fillText(`SCORE: ${state.score}`, 40, 50);
    
    if (state.combo > 1) {
        ctx.fillStyle = `rgba(255, 100, 100, ${state.alpha})`;
        ctx.font = "bold 48px sans-serif";
        ctx.fillText(`${state.combo} COMBO!`, 40, 100);
    }

    ctx.restore();

    // --- 【終了処理】フェードアウト ---
    if (state.releasing) {
        state.alpha -= 0.05;
        if (state.alpha <= 0) {
            state.active = false;
            return false; // システムに完全終了を通知
        }
    }
    
    return true; // エフェクト継続
}

// 3. キーを離した時の処理
export function release(state) {
    state.releasing = true;
}