// ==============================================================================
// 🎬 NicoNico Danmaku AI Effect for ScenePlus+
// Optimized for LOOP Mode with Robust Self-Driving Engine
// ==============================================================================

// ------------------------------------------------------------------------------
// 🔑 USER CONFIGURATION (API設定)
// ------------------------------------------------------------------------------
const CONFIG = {
    // API Key (GeminiまたはOpenAIのキー。空文字の場合は内蔵コメントが流れます)
    API_KEY: "AIzaSyBvdXV0jQWfVDHGuU4JRFa8LLN0XtYOg9w",

    // プロバイダー: "gemini" または "openai"
    API_PROVIDER: "gemini",

    // デュアル・ロードバランス対象のLiteモデル群 (各15RPM/500RPD)
    DUAL_LITE_MODELS: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],

    // 画面キャプチャのインターバル (ミリ秒。10秒 = 10000。カクツキゼロの超低負荷設計)
    INTERVAL_MS: 10000,

    // 画面大幅切り替え（シーンチェンジ）検知の閾値 (0.0〜1.0。0.20 = 20%以上のピクセル変化)
    SCENE_CHANGE_THRESHOLD: 0.20,
};

// ------------------------------------------------------------------------------
// 💬 内蔵フォールバックコメント（APIキー未設定時や通信待ち・エラー時に使用）
// ------------------------------------------------------------------------------
const FALLBACK_COMMENTS = [
    "草", "ｗｗｗｗｗｗｗｗ", "神展開", "ここすき", "！？", "8888888888888888",
    "うぽつ", "音ズレ直して", "何やってんだｗｗ", "たすかる", "かわいい",
    "！？！？！", "それな", "キターーーーー！", "お前らのせいだぞ", "天才かよ",
    "これはひどいｗｗ", "画面がうるさいｗｗ", "待ってました", "ｗｗｗ",
    "知ってた", "初見", "ノシ", "おおおおおお", "神作画", "！？！？",
    "誰だ今のｗｗ", "あーもうめちゃくちゃだよ", "運営仕事しろ", "いいぞもっとやれ",
    "神曲", "鳥肌たった", "これマジ？", "完全に一致", "大草原不可避"
];

// シーン切り替え検知時に挟む自然なリアクションコメント
const SCENE_CHANGE_REACTIONS = [
    "！？",
    "おっ？",
    "画面変わったｗｗ",
    "場面転換ｷﾀ━(ﾟ∀ﾟ)━!",
    "切り替わった",
    "お？",
    "ロード中？",
    "次ここかｗｗ"
];

// 🎨 ニコ動カラーバリエーション
const PRESET_COLORS = [
    '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', // 白（8割）
    '#ff3333', // 赤 (red)
    '#ffdd00', // 黄 (yellow)
    '#00ff66', // 緑 (green)
    '#00e5ff', // 水色 (cyan)
    '#ff66cc', // ピンク (pink)
    '#ff9900'  // オレンジ (orange)
];

// スタイル別のプロンプト指示
const STYLE_PROMPTS = {
    "Standard (標準)": "ツッコミ多め、煽りや草、共感の混ざった自然なニコ生視聴者コメント",
    "Tsukkomi (ツッコミ多め)": "画面の細かい部分に対する鋭いツッコミやボケに対するリアクション中心",
    "Kansai (関西弁)": "「なんでやねん」「せやな」「草生えるわ」「知らんけど」などの関西弁混じりのコメント",
    "Praise (全肯定・絶賛)": "「神」「天才」「たすかる」「かわいすぎる」「88888888」などの全力賞賛コメント",
    "Chaos (カオス・煽り)": "「ｗｗｗｗ」「大草原」「あーもうめちゃくちゃだよ」「お前らのせいだぞ」などのカオス煽りコメント"
};

// ------------------------------------------------------------------------------
// 📸 超軽量画面キャプチャ＆超低解像度サムネイル（タイムアウト付き堅牢設計）
// ------------------------------------------------------------------------------
async function captureScreenData() {
    try {
        if (!window.api || !window.api.captureScreen) return null;

        // 3.5秒タイムアウト付きでキャプチャ実行（ハング防止）
        const capturePromise = window.api.captureScreen('low');
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3500));
        const res = await Promise.race([capturePromise, timeoutPromise]);

        if (!res || !res.dataUrl) {
            console.warn('[Danmaku AI] Capture returned empty or timed out');
            return null;
        }

        return new Promise((resolve) => {
            const img = new Image();
            let isResolved = false;

            const timer = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    resolve(null);
                }
            }, 2000);

            img.onload = () => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timer);

                // 1. AI送信用 JPEG (480x270)
                const targetW = 480;
                const targetH = Math.round(targetW * (img.height / img.width)) || 270;
                const offCanvas = document.createElement('canvas');
                offCanvas.width = targetW;
                offCanvas.height = targetH;
                const offCtx = offCanvas.getContext('2d');
                if (!offCtx) {
                    resolve(null);
                    return;
                }
                offCtx.drawImage(img, 0, 0, targetW, targetH);
                const jpegDataUrl = offCanvas.toDataURL('image/jpeg', 0.50);
                const base64Data = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '');

                // 2. 画面差分検知用 極小サムネイル (32x18 ピクセル)
                const diffCanvas = document.createElement('canvas');
                diffCanvas.width = 32;
                diffCanvas.height = 18;
                const diffCtx = diffCanvas.getContext('2d');
                let thumbnailData = null;
                if (diffCtx) {
                    diffCtx.drawImage(img, 0, 0, 32, 18);
                    const imgData = diffCtx.getImageData(0, 0, 32, 18);
                    thumbnailData = imgData.data;
                }

                resolve({ base64Data, thumbnailData });
            };

            img.onerror = () => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timer);
                    resolve(null);
                }
            };

            img.src = res.dataUrl;
        });
    } catch (e) {
        console.error('[Danmaku AI] Screen capture failed:', e);
        return null;
    }
}

// ------------------------------------------------------------------------------
// 🔍 画面差分（シーンチェンジ）判定
// ------------------------------------------------------------------------------
function calculateSceneDifference(oldThumbnail, newThumbnail) {
    if (!oldThumbnail || !newThumbnail || oldThumbnail.length !== newThumbnail.length) {
        return 1.0;
    }

    let diffSum = 0;
    const totalPixels = oldThumbnail.length / 4;

    for (let i = 0; i < oldThumbnail.length; i += 4) {
        const rDiff = Math.abs(oldThumbnail[i] - newThumbnail[i]);
        const gDiff = Math.abs(oldThumbnail[i + 1] - newThumbnail[i + 1]);
        const bDiff = Math.abs(oldThumbnail[i + 2] - newThumbnail[i + 2]);
        const pixelDiff = (rDiff + gDiff + bDiff) / (255 * 3);
        diffSum += pixelDiff;
    }

    return diffSum / totalPixels;
}

// ------------------------------------------------------------------------------
// 🤖 デュアル・モデル（3.5 + 3.1）ロードバランシング API呼び出し
// ------------------------------------------------------------------------------
async function callGeminiApiDual(apiKey, targetModel, base64Image, promptStyle, count) {
    const promptText = `あなたはニコニコ生放送・ニコニコ動画のリアルタイム視聴者コメント群です。添付されたPC画面を見て、今この画面の状況に視聴者が書き込みそうなリアルタイムコメント（画面の内容に対するツッコミ、煽り、草、驚き、共感、ネタ、88888888、神展開、状況実況など）を${count}個、JSON配列の文字列形式のみ（例: ["草","何やってんのｗｗ","ここすき","88888888","！？","神展開ｷﾀ━(ﾟ∀ﾟ)━!"]）で出力してください。Markdownのコードブロック(例: \`\`\`json)は含めず、純粋なJSON配列のみを返してください。トーン指示: ${promptStyle}`;

    const body = {
        contents: [{
            parts: [
                { text: promptText },
                {
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: base64Image
                    }
                }
            ]
        }],
        generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.9,
            maxOutputTokens: 600
        }
    };

    const fallbackModel = targetModel === "gemini-3.5-flash-lite" ? "gemini-3.1-flash-lite" : "gemini-3.5-flash-lite";
    const tryModels = [targetModel, fallbackModel];

    let lastError = null;
    for (const model of tryModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                const data = await response.json();
                const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (candidateText) {
                    return { comments: parseCommentsJson(candidateText), usedModel: model };
                }
            } else {
                const errText = await response.text();
                lastError = new Error(`Gemini API [${model}] error (${response.status}): ${errText}`);
                console.warn(`[Danmaku AI] Model ${model} returned ${response.status}. Retrying fallback...`);
            }
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('All Dual Lite models failed');
}

// ------------------------------------------------------------------------------
// 🤖 OpenAI API 呼び出し (フォールバック互換)
// ------------------------------------------------------------------------------
async function callOpenAiApi(apiKey, model, base64Image, promptStyle, count) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const promptText = `あなたはニコニコ動画・生放送のリアルタイム視聴者コメント群です。添付されたPC画面を見て、今この画面の状況に視聴者が書き込みそうなリアルタイムコメント（ツッコミ、煽り、草、驚き、共感、ネタ、88888888など）を${count}個、純粋なJSON配列 [\"...\", \"...\"] 形式で出力してください。Markdown不要。トーン: ${promptStyle}`;

    const body = {
        model: model || 'gpt-4o-mini',
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: promptText },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`,
                        detail: 'low'
                    }
                }
            ]
        }],
        max_tokens: 600
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    return { comments: parseCommentsJson(content), usedModel: model };
}

// JSONパース補助
function parseCommentsJson(text) {
    let clean = text.trim();
    clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    
    const startIdx = clean.indexOf('[');
    const endIdx = clean.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        clean = clean.substring(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
        return parsed.map(c => String(c).trim()).filter(c => c.length > 0);
    }
    return [];
}

// ------------------------------------------------------------------------------
// 🔄 画面認識・シーンチェンジ検知・AIコメント取得 (自律実行)
// ------------------------------------------------------------------------------
async function triggerFetchCycle(state, env) {
    if (state.releasing || !state.active || state.isFetching) return;

    state.isFetching = true;
    state.fetchCount = (state.fetchCount || 0) + 1;
    const currentCycle = state.fetchCount;

    const apiKey = (CONFIG.API_KEY || '').trim();
    const apiProvider = (CONFIG.API_PROVIDER || 'gemini').toLowerCase().trim();
    
    const selectedStyle = env.params.commentStyle || "Standard (標準)";
    const promptStyle = STYLE_PROMPTS[selectedStyle] || STYLE_PROMPTS["Standard (標準)"];
    const density = parseInt(env.params.commentDensity, 10) || 12;

    console.log(`[Danmaku AI] 🔄 Cycle #${currentCycle} starting screen capture...`);

    try {
        const capture = await captureScreenData();
        if (!capture || !capture.base64Data) {
            console.warn(`[Danmaku AI] Cycle #${currentCycle} capture failed, using fallback`);
            const fallbackCount = Math.min(density, 6);
            for (let i = 0; i < fallbackCount; i++) {
                state.commentQueue.push(FALLBACK_COMMENTS[Math.floor(Math.random() * FALLBACK_COMMENTS.length)]);
            }
            return;
        }

        // 差分判定
        const diff = calculateSceneDifference(state.lastThumbnail, capture.thumbnailData);
        state.lastThumbnail = capture.thumbnailData;
        const isMajorChange = diff >= CONFIG.SCENE_CHANGE_THRESHOLD;

        if (isMajorChange && state.hasReceivedInitial) {
            console.log(`[Danmaku AI] 🎬 Scene change detected (Diff: ${(diff * 100).toFixed(1)}%) -> Clearing old queue`);
            state.commentQueue = [];
            const reaction = SCENE_CHANGE_REACTIONS[Math.floor(Math.random() * SCENE_CHANGE_REACTIONS.length)];
            state.commentQueue.push(reaction);
            state.nextSpawnTime = performance.now() + 100;
        }

        if (!apiKey) {
            const samples = [];
            for (let i = 0; i < density; i++) {
                samples.push(FALLBACK_COMMENTS[Math.floor(Math.random() * FALLBACK_COMMENTS.length)]);
            }
            if (state.commentQueue.length > 25) {
                state.commentQueue = state.commentQueue.slice(-10);
            }
            state.commentQueue.push(...samples);
            state.hasReceivedInitial = true;
            return;
        }

        const targetModel = CONFIG.DUAL_LITE_MODELS[state.modelTurnIndex % CONFIG.DUAL_LITE_MODELS.length];
        state.modelTurnIndex++;

        console.log(`[Danmaku AI] 🚀 Cycle #${currentCycle} requesting AI from [${targetModel}]...`);
        let resData = null;
        if (apiProvider === 'openai') {
            resData = await callOpenAiApi(apiKey, 'gpt-4o-mini', capture.base64Data, promptStyle, density);
        } else {
            resData = await callGeminiApiDual(apiKey, targetModel, capture.base64Data, promptStyle, density);
        }

        if (resData && resData.comments && resData.comments.length > 0) {
            if (state.commentQueue.length > 25) {
                state.commentQueue = state.commentQueue.slice(-10);
            }
            state.commentQueue.push(...resData.comments);
            state.hasReceivedInitial = true;
            console.log(`[Danmaku AI] ✅ Cycle #${currentCycle} success from [${resData.usedModel}]: got ${resData.comments.length} comments`);
        } else {
            throw new Error('Received empty comments');
        }
    } catch (err) {
        console.warn(`[Danmaku AI] ⚠️ Cycle #${currentCycle} error:`, err);
        const fallbackCount = Math.min(density, 6);
        for (let i = 0; i < fallbackCount; i++) {
            state.commentQueue.push(FALLBACK_COMMENTS[Math.floor(Math.random() * FALLBACK_COMMENTS.length)]);
        }
    } finally {
        state.isFetching = false;
        // 次回のフェッチ時間を確実に10秒後にセット
        state.nextFetchTime = performance.now() + CONFIG.INTERVAL_MS;
    }
}

// ------------------------------------------------------------------------------
// 🚀 エフェクトの初期化
// ------------------------------------------------------------------------------
export function init(env) {
    const now = performance.now();
    const state = {
        active: true,
        releasing: false,
        fadeAlpha: 1.0,
        commentQueue: [],
        activeComments: [],
        laneOccupancy: [],
        lastThumbnail: null,
        modelTurnIndex: 0,
        nextSpawnTime: now + 200,
        nextFetchTime: now + CONFIG.INTERVAL_MS, // 自律タイマー（10秒後）
        isFetching: false,
        hasReceivedInitial: false,
        fetchCount: 0,
        startTime: now,
        badgeText: "🔴 NicoNico AI Live [ON]",
        badgeAlpha: 1.0,
        badgeTimer: 240
    };

    const apiKey = (CONFIG.API_KEY || '').trim();
    if (!apiKey) {
        state.commentQueue.push(
            "【ScenePlus NicoNico Danmaku】",
            "ｷﾀ━━━━(ﾟ∀ﾟ)━━━━!!",
            "はじまるよー",
            "うぽつ",
            "わくわく",
            "88888888"
        );
    } else {
        state.commentQueue.push(
            "【AI画面認識開始 (Dual Flash-Lite)】",
            "ｷﾀ━━━━(ﾟ∀ﾟ)━━━━!!",
            "うぽつ",
            "わくわく"
        );
    }

    // 初回フェッチを即時起動
    triggerFetchCycle(state, env);

    return state;
}

// ------------------------------------------------------------------------------
// 🎯 コメントのスポーン（1つずつ画面に投入）
// ------------------------------------------------------------------------------
function spawnComment(text, state, env, screenWidth, screenHeight) {
    const fontScale = parseFloat(env.params.fontScale) || 1.0;
    const speedScale = parseFloat(env.params.speedScale) || 1.0;
    const enableColors = env.params.enableColors !== false;

    const sizeRoll = Math.random();
    let baseFontSize = 32;
    if (sizeRoll < 0.08) baseFontSize = 44;
    else if (sizeRoll < 0.20) baseFontSize = 24;
    const fontSize = Math.round(baseFontSize * fontScale);

    let color = '#ffffff';
    if (enableColors && Math.random() < 0.20) {
        color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
    }

    const typeRoll = Math.random();
    let type = 'flow';
    if (typeRoll < 0.04 && text.length < 20) type = 'ue';
    else if (typeRoll < 0.08 && text.length < 20) type = 'shita';

    const laneHeight = Math.max(28, Math.round(38 * fontScale));
    const maxLanes = Math.max(3, Math.floor((screenHeight - 80) / laneHeight));

    while (state.laneOccupancy.length < maxLanes) {
        state.laneOccupancy.push({ rightX: 0, speed: 0 });
    }

    if (type === 'flow') {
        const durationSec = (4.5 + Math.random() * 1.2) / Math.max(0.2, speedScale);
        const estimatedWidth = text.length * fontSize * 1.05;
        const totalDistance = screenWidth + estimatedWidth;
        const speed = (totalDistance / (durationSec * 60));

        let chosenLane = -1;
        for (let l = 0; l < maxLanes; l++) {
            const laneInfo = state.laneOccupancy[l];
            if (laneInfo.rightX < screenWidth - 50) {
                if (laneInfo.speed === 0 || speed <= laneInfo.speed + 1.0) {
                    chosenLane = l;
                    break;
                }
            }
        }

        if (chosenLane === -1) {
            chosenLane = Math.floor(Math.random() * maxLanes);
        }

        const y = 30 + chosenLane * laneHeight;
        const commentObj = {
            text,
            type: 'flow',
            x: screenWidth + 10,
            y,
            speed,
            fontSize,
            color,
            lane: chosenLane,
            measuredWidth: 0
        };

        state.activeComments.push(commentObj);
        state.laneOccupancy[chosenLane] = {
            rightX: screenWidth + 10 + estimatedWidth,
            speed
        };
    } else {
        let fixedLane = 0;
        if (type === 'ue') {
            fixedLane = Math.floor(Math.random() * Math.min(3, maxLanes));
        } else {
            fixedLane = maxLanes - 1 - Math.floor(Math.random() * Math.min(3, maxLanes));
        }
        const y = 30 + fixedLane * laneHeight;

        state.activeComments.push({
            text,
            type,
            x: 0,
            y,
            speed: 0,
            fontSize,
            color,
            life: 0,
            maxLife: 200 + Math.floor(Math.random() * 50),
            measuredWidth: 0
        });
    }
}

// ------------------------------------------------------------------------------
// 🎨 描画ループ (毎フレーム実行)
// ------------------------------------------------------------------------------
export function render(ctx, state, env, time) {
    if (!state.active) return false;

    const screenWidth = ctx.canvas.width;
    const screenHeight = ctx.canvas.height;
    const now = performance.now();

    // --------------------------------------------------------------------------
    // ⏰ 自律AIフェッチトリガー (setIntervalに依存せず確実に10秒ごとに実行！)
    // --------------------------------------------------------------------------
    if (!state.releasing && !state.isFetching && now >= state.nextFetchTime) {
        state.nextFetchTime = now + CONFIG.INTERVAL_MS; // 先に次回時刻を更新して二重起動防止
        triggerFetchCycle(state, env);
    }

    // --------------------------------------------------------------------------
    // ⏳ タイムライン等間隔スポーン制御 (1つずつ途切れず滑らかに投入)
    // --------------------------------------------------------------------------
    if (!state.releasing) {
        if (now >= state.nextSpawnTime) {
            if (state.commentQueue.length > 0) {
                const text = state.commentQueue.shift();
                spawnComment(text, state, env, screenWidth, screenHeight);

                const remaining = state.commentQueue.length;
                let targetDelay = 850;
                if (remaining > 0) {
                    targetDelay = Math.max(500, Math.min(1200, Math.round(CONFIG.INTERVAL_MS / (remaining + 1))));
                }
                const jitter = targetDelay * (0.85 + Math.random() * 0.3);
                state.nextSpawnTime = now + jitter;
            } else {
                // キューが空の時はフォールバックをゆったり補完
                if (Math.random() < 0.35) {
                    const fallback = FALLBACK_COMMENTS[Math.floor(Math.random() * FALLBACK_COMMENTS.length)];
                    spawnComment(fallback, state, env, screenWidth, screenHeight);
                }
                state.nextSpawnTime = now + (1500 + Math.random() * 800);
            }
        }
    }

    // レーン占有情報の更新
    for (let l = 0; l < state.laneOccupancy.length; l++) {
        if (state.laneOccupancy[l].rightX > -500) {
            state.laneOccupancy[l].rightX -= state.laneOccupancy[l].speed || 2.5;
        }
    }

    // --------------------------------------------------------------------------
    // 🖌️ コメント描画処理
    // --------------------------------------------------------------------------
    ctx.save();
    ctx.globalAlpha = state.fadeAlpha;
    ctx.textBaseline = 'top';

    for (let i = state.activeComments.length - 1; i >= 0; i--) {
        const c = state.activeComments[i];

        if (!c.measuredWidth) {
            ctx.font = `bold ${c.fontSize}px "Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Meiryo", "Arial Black", "MS PGothic", sans-serif`;
            c.measuredWidth = ctx.measureText(c.text).width;
            if (c.type === 'ue' || c.type === 'shita') {
                c.x = Math.max(10, Math.round((screenWidth - c.measuredWidth) / 2));
            }
        }

        ctx.font = `bold ${c.fontSize}px "Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Meiryo", "Arial Black", "MS PGothic", sans-serif`;

        let isDead = false;
        let commentAlpha = state.fadeAlpha;

        if (c.type === 'flow') {
            c.x -= c.speed;
            if (c.x + c.measuredWidth < -20) {
                isDead = true;
            }
        } else {
            c.life++;
            if (c.life > c.maxLife) {
                isDead = true;
            } else if (c.life > c.maxLife - 20) {
                commentAlpha *= (c.maxLife - c.life) / 20;
            }
        }

        if (isDead) {
            state.activeComments.splice(i, 1);
            continue;
        }

        // 黒縁取り
        ctx.save();
        ctx.globalAlpha = commentAlpha;
        ctx.lineWidth = Math.max(3.5, c.fontSize * 0.14);
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 2;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(c.text, c.x, c.y);

        // 文字本体
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, c.x, c.y);
        ctx.restore();
    }

    // --------------------------------------------------------------------------
    // 🔴 Loopモード開始時/終了時のステータスバッジ
    // --------------------------------------------------------------------------
    if (state.badgeTimer > 0) {
        state.badgeTimer--;
        if (state.badgeTimer < 30) {
            state.badgeAlpha = state.badgeTimer / 30;
        }
        ctx.save();
        ctx.globalAlpha = state.badgeAlpha * state.fadeAlpha;
        ctx.font = 'bold 16px "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const badgeW = 260;
        const badgeH = 34;
        const badgeX = screenWidth - badgeW - 20;
        const badgeY = 20;
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(state.badgeText, badgeX + 16, badgeY + 8);
        ctx.restore();
    }

    ctx.restore();

    // --------------------------------------------------------------------------
    // 🛑 終了処理 (Release)
    // --------------------------------------------------------------------------
    if (state.releasing) {
        state.fadeAlpha -= 0.025;
        if (state.fadeAlpha <= 0 || state.activeComments.length === 0) {
            state.active = false;
            return false;
        }
    }

    return true;
}

// ------------------------------------------------------------------------------
// 🛑 リリース処理
// ------------------------------------------------------------------------------
export function release(state) {
    state.releasing = true;
    state.commentQueue = [];
    state.badgeText = "⚪ NicoNico AI Live [OFF]";
    state.badgeAlpha = 1.0;
    state.badgeTimer = 40;
}
