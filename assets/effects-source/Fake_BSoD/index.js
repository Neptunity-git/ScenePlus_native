// ==========================================
// Fake BSoD - ScenePlus+ Joke Effect
// ==========================================

export function init(env) {
    return {
        active: true,
        releasing: false,
        progress: 0,
        frameCount: 0
    };
}

export function render(ctx, state, env, time) {
    if (!state.active) return false;

    // 終了処理: 焦っているユーザーを安心させるため、フェードアウトせず即座に消す
    if (state.releasing) {
        state.active = false;
        return false;
    }

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    
    // 画面の基準スケール（フルHDをベースにレスポンシブ対応）
    const scale = Math.min(w, h) / 1080; 

    // 1. 背景の塗りつぶし（Windows 10のブルースクリーンカラー）
    ctx.fillStyle = '#0078D7';
    ctx.fillRect(0, 0, w, h);

    // テキスト設定の共通化
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';

    // 2. 巨大な「:(」マーク
    ctx.font = `${150 * scale}px "Segoe UI", sans-serif`;
    ctx.fillText(":(", w * 0.1, h * 0.15);

    // 3. メインのエラーメッセージ
    ctx.font = `${32 * scale}px "Segoe UI", sans-serif`;
    const textY = h * 0.4;
    ctx.fillText("デバイスに問題が発生したため、再起動する必要があります。", w * 0.1, textY);
    ctx.fillText("エラー情報を収集しています。自動的に再起動します。", w * 0.1, textY + 45 * scale);

    // 4. 進行度（プログレス）の偽装アップデート
    state.frameCount++;
    if (state.frameCount % 30 === 0 && state.progress < 100) {
        // ランダムなタイミングで数%ずつ進める（リアルなフリーズ感を演出）
        if (Math.random() > 0.4) state.progress += Math.floor(Math.random() * 8) + 1;
        if (state.progress > 100) state.progress = 100;
    }
    ctx.fillText(`${state.progress}% 完了`, w * 0.1, textY + 150 * scale);

    // 5. QRコードのプレースホルダーと詳細情報
    const qrSize = 130 * scale;
    const qrY = h * 0.7;
    
    // QRコードの白い背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(w * 0.1, qrY, qrSize, qrSize);
    
    // QRコードの中身（適当な四角形を配置してそれっぽく見せる）
    ctx.fillStyle = '#0078D7';
    ctx.fillRect(w * 0.1 + qrSize * 0.1, qrY + qrSize * 0.1, qrSize * 0.3, qrSize * 0.3);
    ctx.fillRect(w * 0.1 + qrSize * 0.6, qrY + qrSize * 0.1, qrSize * 0.3, qrSize * 0.3);
    ctx.fillRect(w * 0.1 + qrSize * 0.1, qrY + qrSize * 0.6, qrSize * 0.3, qrSize * 0.3);
    ctx.fillRect(w * 0.1 + qrSize * 0.5, qrY + qrSize * 0.5, qrSize * 0.4, qrSize * 0.4);

    // 6. サポート向け詳細情報
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${16 * scale}px "Segoe UI", sans-serif`;
    const detailX = w * 0.1 + qrSize + 30 * scale;
    ctx.fillText("この問題と可能な解決策の詳細については、以下を参照してください:", detailX, qrY + 15 * scale);
    ctx.fillText("https://www.windows.com/stopcode", detailX, qrY + 40 * scale);
    
    ctx.font = `${14 * scale}px "Segoe UI", sans-serif`;
    ctx.fillText("サポート担当者を呼ぶ場合は、この情報を伝えてください:", detailX, qrY + 85 * scale);
    ctx.fillText("停止コード: SCENEPLUS_CRITICAL_MAGIC_FAILURE", detailX, qrY + 105 * scale);

    return true; // まだ表示を続ける
}

export function release(state) {
    state.releasing = true; // キーを離した瞬間にフラグを立てる
}