# ScenePlus+ 公式クリエイターズガイド

## 1. Introduction：再定義される「デスクトップ」
ScenePlus+ は、単に画像や動画をポン出しするだけのサンプラーではありません。
これは、無機質なデスクトップを「インタラクティブなキャンバス」に変え、PCに遊び心と表現力を宿らせるための魔法のツールです。

このガイドで解説する JS Module を使いこなせば、あなたのつくったエフェクトは、システム全体の時間軸と空間（マウスや画面）を認識する「インテリジェントなエフェクト」へと進化します。
己のコードをVJ的インスピレーションでキャンバスに解き放つ準備はできましたか？それでは、SDKの真髄を紐解いていきましょう。

---

## 2. 最小構成の魔法（Boilerplate）
何もないキャンバスに魔法を描くには、まず「型」を知る必要があります。
Codeエフェクトを作成するには、設計図となる `meta.json` と、本体となる `.js` ファイルが必要です。
以下は、コピペするだけで完全に動作する、最もシンプルで美しい「最小構成（Boilerplate）」です。

### `meta.json`
```json
{
  "name": "My First Magic",
  "mediatype": "code",
  "playmode": "hold",
  "path": "/index.js"
}
```

### `index.js`
```javascript
// 1. エフェクト発火時の初期化処理
export function init(env) {
    return {
        active: true,
        releasing: false,
        alpha: 1.0,
        x: env.mousePos.x,
        y: env.mousePos.y
    };
}

// 2. 毎フレーム呼ばれる描画ループ
export function render(ctx, state, env, time) {
    if (!state.active) return false; // 完全に終了した場合は false を返す

    // 状態の更新
    if (state.releasing) {
        state.alpha -= 0.05;
        if (state.alpha <= 0) {
            state.active = false;
            return false; // システムに完全終了を通知（後述）
        }
    }

    // 描画処理
    ctx.save();
    ctx.globalAlpha = state.alpha;
    ctx.beginPath();
    ctx.arc(state.x, state.y, 50, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20, 250, 200, 0.8)";
    ctx.fill();
    ctx.restore();
    
    return true; // まだ生きていることをシステムに伝える
}

// 3. ユーザーがキーを離した瞬間の処理 (playmode: "hold" の場合)
export function release(state) {
    state.releasing = true; // フェードアウトのトリガーを引く
}
```

---

## 3. エフェクトの死に様（終了処理の美学）
プロのクリエイターとアマチュアを分けるのは、派手な演出ではありません。「引き際の美学」と「リソースへの配慮」です。

ScenePlus+ では、エフェクトが描画を終え、完全に画面から消滅したタイミングで、システムに対して「完全終了」を通知する義務があります。
これを行わないと、見えないエフェクトが永遠にメモリと描画リソースを食いつぶす「メモリリーク（ゾンビ化）」を引き起こします。

**【正しい終了手順】**
1. `release(state)` が呼ばれたら、`state.releasing = true` などのフラグを立てる。
2. `render()` の中で、フラグを見て徐々にアルファ値（透明度）を下げる。
3. アルファ値が 0 に達し、フェードアウトしきったら **`render()` の戻り値として明示的に `false` を返す**。

`render()` が `false` を返した瞬間、ScenePlus+ 本体は直ちにインスタンスを破棄し、システムスロットを安全に解放します。あなたの魔法が美しく散る瞬間を、システムに確実に伝えてください。

---

## 4. VJ的活用シーン（キャンバスを支配する哲学）
ScenePlus+ は、提供されるAPIの組み合わせによって無限の可能性を秘めています。ここでは、OSCやキャプチャ機能をどう使えば「魔法」になるのか、その思想（哲学）を紹介します。

### 🍎 デスクトップそのものをサンプリングする禁断の果実
`window.api.captureScreen('low')` を使えば、現在のデスクトップ画面のキャプチャ画像を即座に取得できます。
これを利用し、取得した画面画像に対してCanvas上で `ctx.filter = 'invert(1) hue-rotate(180deg)'` をかけたり、虫眼鏡のように一部を拡大して描画（サンプル: `gravity_distortion`）してみてください。
無機質なエクセルやブラウザの画面が、一瞬にしてサイバーパンクな異空間へと歪む。これぞまさにデスクトップ環境を支配する禁断の魔法です。

### 📡 OSC通信による観客とのセッション（弾幕コメント）
`window.api.onOscMessage` は、ネットワーク越しに外部からの信号を受け取るAPIです。
これとCanvasの文字描画（`ctx.fillText`）を組み合わせれば、「スマホからOSCアプリでテキストを送信し、PCのデスクトップ上にニコニコ動画のような弾幕コメントを流す（サンプル: `niconico_like`）」ことが可能になります。
DJやVJのパフォーマンス中、観客のスマホから直接あなたのデスクトップに干渉させる、かつてないインタラクティブなセッションを構築できます。

---

## 5. 魔法陣の拡張（外部ライブラリの導入）
Canvasの2D描画だけでなく、`Matter.js` を使った物理演算や、`Three.js` によるWebGL3D描画を取り入れたいと考えるのは当然の欲求です。
ScenePlus+ のCodeエフェクトは標準のES Moduleとしてロードされるため、外部ライブラリの導入作法には以下の2つがあります。

1. **CDNからの動的インポート (お手軽)**
   インターネット接続環境が前提となりますが、esm.sh などのCDNから直接モジュールを読み込むことができます。
   ```javascript
   import * as THREE from 'https://esm.sh/three';
   ```
2. **バンドルツールによるパッケージング (推奨)**
   Vite や Webpack、esbuild などのバンドラを使用し、依存ライブラリをすべて一つの `index.js` に固めて（バンドルして）からパッケージングします。これによりオフラインでも確実に動作し、読み込み速度も最速になります。

---

## 6. 音と光の同期（オーディオ・リアクティブ）
VJ的なインスピレーションを謳うのであれば、映像と音楽の融合は絶対に避けられません。
ScenePlus+ のエフェクトはChromium環境で動作するため、強力な Web Audio API に直接アクセスできます。

### 🎧 オーディオデバイスの選択とルーティング
プロフェッショナルな環境では、DAW（Studio One等）からのループバック出力や、仮想オーディオインターフェース（VB-Cable, Voicemeeter等）を入力ソースとして指定したい場合があります。
以下のコードで、システム上のすべてのオーディオ入力デバイスを列挙し、任意のデバイスを選択してFFT解析を開始できます。

```javascript
// init() 内で呼び出す
async function setupAudio(state) {
    // 1. システム上の全オーディオデバイスを列挙
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    console.log('Available audio inputs:', audioInputs.map(d => d.label));
    
    // 2. 特定のデバイスを選択（例: VB-Cable や DAW Loop-back）
    //    deviceId を指定しない場合はデフォルトのマイクが使用される
    const targetDevice = audioInputs.find(d => d.label.includes('CABLE Output'));
    const constraints = targetDevice 
        ? { audio: { deviceId: { exact: targetDevice.deviceId } } }
        : { audio: true };
    
    // 3. ストリーム取得 → FFT解析ノードの構築
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    
    state.analyser = analyser;
    state.freqData = new Uint8Array(analyser.frequencyBinCount);
}

// render() 内で毎フレーム波形データを取得
export function render(ctx, state, env, time) {
    if (state.analyser) {
        state.analyser.getByteFrequencyData(state.freqData);
        const bass = state.freqData[2]; // 低音のキック（0-255）
        // bass の値でパーティクルのサイズや発光量を制御
    }
}
```

---

## 7. カスタムパラメータ（ユーザー調整可能なUI）
エフェクトを配布した際、受け取ったユーザーがコードを一切いじらずにパラメータを調整できる仕組みです。
`meta.json` に `params` フィールドを定義するだけで、ScenePlus+ 本体がスライダーやカラーピッカーなどのUIを自動生成します。

### `meta.json` の定義例
```json
{
  "name": "Reactive Particles",
  "mediatype": "code",
  "playmode": "hold",
  "path": "/index.js",
  "params": [
    { "key": "speed", "label": "Speed", "type": "slider", "min": 0.1, "max": 5.0, "default": 1.0 },
    { "key": "color", "label": "Base Color", "type": "color", "default": "#39ff14" },
    { "key": "intensity", "label": "Intensity", "type": "slider", "min": 0, "max": 100, "default": 50 },
    { "key": "glow", "label": "Enable Glow", "type": "toggle", "default": true }
  ]
}
```

### エフェクト側での受け取り
パラメータの値は `env.params` オブジェクトを通じて毎フレームリアルタイムに受け取れます。
```javascript
export function render(ctx, state, env, time) {
    const speed = env.params.speed || 1.0;
    const color = env.params.color || '#39ff14';
    const glow = env.params.glow !== false;
    // これらの値でエフェクトの挙動を動的に変更
}
```

利用可能な `type`:
- `slider`: 数値スライダー（`min`, `max`, `step` を指定）
- `color`: カラーピッカー（hex値を返す）
- `toggle`: ON/OFFスイッチ（boolean を返す）
- `select`: ドロップダウン（`options` 配列を指定）

---

## 8. パフォーマンス・プロファイリング（動的最適化）
すべてのユーザーがハイエンドPCを持っているわけではありません。ラップトップ環境で重いWebGLやパーティクルを走らせた場合、フレームドロップは確実に発生します。
ScenePlus+ は `env.performance` を通じてリアルタイムのパフォーマンスメトリクスを提供します。

```javascript
export function render(ctx, state, env, time) {
    const fps = env.performance.fps;       // 現在のFPS（EMAで平滑化済み）
    const dt = env.performance.deltaTime;  // 前フレームからの経過ミリ秒

    // Graceful Degradation: FPSに応じてパーティクル数を動的に調整
    if (fps < 30) {
        state.maxParticles = 50;   // 処理落ち時は軽量モード
    } else if (fps < 50) {
        state.maxParticles = 100;
    } else {
        state.maxParticles = 300;  // 快適なら全力描画
    }
}
```

---

## 9. ローカルネットワーク通信の深淵（高度な連携モード）
`window.api.startHttpServer()` や `window.api.scanSubnet()` などのネットワークAPIは、単一のPCに留まらない空間の支配を可能にします。

- **マルチPC・アセット同期**: 1台をホスト（HTTPサーバー起動）、他のPCから `downloadAsset()` で動的にアセットを取得。
- **VJチーム連携**: `scanSubnet()` で発見し、`sendOsc()` でエフェクトの発火タイミングを完全同期。

---

## 10. OSCペイロードの型定義と実例
`window.api.onOscMessage(callback)` で受け取るメッセージの厳密な型定義は以下の通りです。

```typescript
interface OscMessage {
    address: string;                          // OSCアドレスパターン (例: "/gyro/xyz")
    args: Array<number | string | Buffer>;    // OSCプロトコル準拠の引数配列
    rinfo: {
        address: string;  // 送信元のIPアドレス
        port: number;     // 送信元のポート番号
    };
}
```

### 実例: Androidジャイロセンサーの値を受け取る
```javascript
// init() 内で受信リスナーを登録
export function init(env) {
    const state = { gyroX: 0, gyroY: 0, gyroZ: 0, active: true };
    
    window.api.onOscMessage((msg) => {
        if (msg.address === '/sensors/gyro') {
            // args[0]=X, args[1]=Y, args[2]=Z (float値)
            state.gyroX = msg.args[0] || 0;
            state.gyroY = msg.args[1] || 0;
            state.gyroZ = msg.args[2] || 0;
        }
    });
    
    return state;
}

export function render(ctx, state, env, time) {
    // ジャイロの傾きでパーティクルの移動方向を制御
    const offsetX = state.gyroX * 10;
    const offsetY = state.gyroY * 10;
    // ... 描画処理
}
```

---

## 11. 魔法の開発実験場（デバッグ手法）
魔法（コード）にミスがあった場合、クリエイターはどこでそれに気づけばいいのでしょうか？

- **コンソールの確認**:
  アプリ内の「SYSTEM LOG」パネルにはシステムの重大なエラーが表示されますが、エフェクト内からあなたが呼び出した `console.log()` や `console.error()` の完全な出力は **開発者ツール（DevTools）** に表示されます。
  開発中はElectronの標準ショートカット（通常は `Ctrl + Shift + I`）を利用してDevToolsを開き、Consoleタブでエラーを確認しながら開発を進めてください。

---

## 12. クリエイターが必ず陥る「パッケージングの罠」
完成したエフェクトを配布可能な形式（`.zip` または `.scenefx`）にする際、**99%の初心者が陥る罠**があります。

> [!CAUTION]
> **フォルダごと圧縮してはいけません！**

`meta.json` や `index.js` が入ったフォルダを右クリックして「フォルダごと圧縮」すると、ZIPの中に余計な親フォルダが1階層作られてしまい、ScenePlus+ がファイルを読み込めずエラーになります。

**【正しいパッケージングの手順】**
1. フォルダを**開く**。
2. 中にある `meta.json` や `.js`、メディアファイルなどを**すべて選択（全選択）**する。
3. 選択されたファイル群を右クリックして直接ZIP圧縮する。
4. 出来上がった `.zip` ファイルの拡張子を `.scenefx` にリネームする（ZIPのままでもインポート可能です）。

---

## 13. 利用可能な OS/システムAPI (`window.api`)
エフェクト内（Code）からは、レンダラープロセスのグローバルオブジェクトとして `window.api` にアクセス可能です。

### 🔘 State & Input Listeners (Global)
- `window.api.onStateChanged(callback)`: アプリ全体のステート変更を監視。
- `window.api.onPanic(callback)`: パニック（緊急停止）信号を受信。
- `window.api.onKeyDown`, `onKeyUp`, `onMouseMove`, `onMouseDown`, `onMouseUp`, `onMouseWheel`: グローバルな入力イベントを監視。

### 📦 Effect Management
- `window.api.captureScreen(resolution)`: 画面キャプチャを取得（`'low'`, `'mid'`, `'high'`, `'full'`）。戻り値: `Promise<{success: boolean, dataUrl?: string}>`

### 📁 File & Dialogs
- `window.api.confirmDialog(options)` / `window.api.alertDialog(options)`: OSネイティブの確認ダイアログや警告ダイアログを表示。

### 🌐 Network & OSC
- `window.api.getLocalIp()` / `window.api.getAllLocalIps()`: ローカルIPを取得。
- `window.api.sendOsc(targetIp, address, args)`: OSCメッセージを送信。
- `window.api.onOscMessage(callback)`: 受信したOSCメッセージをハンドリング。

※ `EffectManager`, `importEffectBackground` などのシステム管理用APIも理論上呼び出し可能ですが、エフェクト自身の内部処理に留め、システムの根幹を破壊しないよう注意してください。

---

## 付録：ソースコード・アーカイブ
以下のソースコードは、新環境向けにアップデートされた公式サンプルの完全な実装です。これらのコードはあなたの魔法を生み出すための最高の土台となります。

### 付録 A: `gravity_distortion.js`
画面キャプチャを取得し、マウス周辺を虫眼鏡のように歪ませるエフェクト。
```javascript
export function init(env) {
    const state = {
        cx: env.mousePos.x,
        cy: env.mousePos.y,
        currentImg: null,
        fadeAlpha: 1.0,
        releasing: false,
        active: true
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
```

### 付録 B: `neon_ripple.js` (抜粋版)
左クリックでパーティクルを放つ、オーソドックスな描画ループのサンプル。
```javascript
export function init(env) {
    return {
        active: true,
        releasing: false,
        fadeAlpha: 1.0,
        sx: env.mousePos.x,
        sy: env.mousePos.y,
        ripples: [],
        particles: [],
        shockwaves: [],
        baseHue: 180,
        frameCount: 0,
        lastTrailTime: 0,
        wasLeftDown: false
    };
}

export function render(ctx, state, env, time) {
    if (!state.active) return false;

    state.frameCount++;
    state.baseHue = (state.baseHue + 0.3) % 360;

    state.sx += (env.mousePos.x - state.sx) * 0.15;
    state.sy += (env.mousePos.y - state.sy) * 0.15;

    if (env.mouseState.left && !state.wasLeftDown) {
        // ショックウェーブ発生ロジック（省略）
    }
    state.wasLeftDown = env.mouseState.left;

    // パーティクルの更新・描画（省略）
    
    // カーソルグロー描画
    const glowGrad = ctx.createRadialGradient(state.sx, state.sy, 0, state.sx, state.sy, 60);
    glowGrad.addColorStop(0, `hsla(${state.baseHue}, 100%, 80%, 0.3)`);
    glowGrad.addColorStop(0.5, `hsla(${state.baseHue}, 100%, 60%, 0.08)`);
    glowGrad.addColorStop(1, `hsla(${state.baseHue}, 100%, 50%, 0)`);
    ctx.fillStyle = glowGrad;
    ctx.fillRect(state.sx - 60, state.sy - 60, 120, 120);

    if (state.releasing) {
        state.fadeAlpha -= 0.03;
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
```
