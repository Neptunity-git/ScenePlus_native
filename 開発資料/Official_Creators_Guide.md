# ScenePlus+ 公式クリエイターズガイド
**(The Official Creator's Guide to ScenePlus+ SDK)**

---

## 1. イントロダクション：再定義される「デスクトップ」

ScenePlus+ は、単に画像や動画をポン出しするだけのサンプラーではありません。
これは、無機質なデスクトップを「インタラクティブなキャンバス」に変え、PCに遊び心と表現力を宿らせるための魔法のツールです。

このガイドで解説する **ScenePlus-SDK.js** を使いこなせば、あなたが書いたただのHTMLファイルは、システム全体の時間軸と空間（マウスや画面）を認識する**「インテリジェントなCodeエフェクト」**へと進化します。
己のコードをVJ的インスピレーションでキャンバスに解き放つ準備はできましたか？それでは、SDKの真髄を紐解いていきましょう。

---

## 2. SDK機能の徹底解説 (The 8 Pillars)

本SDKは大きく分けて「ライフサイクル管理」「環境情報の取得」「インタラクティブ機能」の3つの柱、合計8つのAPIから構成されています。
使用するには、HTMLの `<head>` 内に以下の魔法の詠唱（スクリプトタグ）を記述するだけです。
（※仕組みの詳細は [付録：SDKソースコード](#sdk-code) を参照）

```html
<script src="scene://_core/ScenePlus-SDK.js"></script>
```

### A. ライフサイクル管理（時間軸の支配）
エフェクトがいつ始まり、どう終わりを迎えるのか。その運命をコントロールします。

#### 1. `ScenePlus.onInit(callback)`
- **【定義】**: エフェクトのすべてはここから始まります。内部のエンジンから、`meta.json` の設定値やデスクトップの初期状態（画面サイズ、マウス座標）が注入された瞬間に発火します。
- **【VJ的活用シーン】**: 楽曲のBPMデータを読み込ませたり、最初の一撃（爆発エフェクト等）をマウスの位置に仕掛けるための「起爆装置」。
- **【サンプルコード】**:
```javascript
ScenePlus.onInit((meta, env) => {
    console.log("Effect Name:", meta.name);
    console.log("Initial Mouse Pos X:", env.mousePos.x);
    // ここからアニメーションループを開始する
    startMyAwesomeAnimation();
});
```

#### 2. `ScenePlus.onRelease(callback)`
- **【定義】**: `meta.json` で `hold`（押している間だけ再生）モードに設定されている場合、ユーザーがキーボードから指を離した瞬間に発火します。
- **【VJ的活用シーン】**: 指を離したら無慈悲にパッと消えるのではなく、パーティクルが散り散りになって消えたり、画面外へスライドアウトするなどの「余韻（アウトロ）」を演出する美学。
- **【サンプルコード】**:
```javascript
let isFading = false;
ScenePlus.onRelease(() => {
    isFading = true;
    fadeOutAudioAndVideo(); // 自作のフェードアウト関数など
});
```

#### 3. `ScenePlus.onPanic(callback)`
- **【定義】**: ユーザーが設定画面を開いた時や、アプリが終了される際など、エフェクトを「即座に」殺さなければならない緊急事態に発火します。
- **【VJ的活用シーン】**: リソース（重いCanvas処理やWebAudio API）を使っている場合、メモリリークを起こさないように確実に息の根を止めるための「セーフティネット」。
- **【サンプルコード】**:
```javascript
ScenePlus.onPanic(() => {
    cancelAnimationFrame(myRenderLoop);
    myAudioContext.close();
});
```

#### 4. `ScenePlus.finish()`
- **【定義】**: エフェクトの寿命が尽きたことを、クリエイター側（あなた）からエンジンに教え、システムスロットを解放する作法です。
- **【VJ的活用シーン】**: `once` モードでアニメーションの再生が終わった直後や、`hold` モードで `onRelease`（詳細は付録参照）の余韻（フェード）が完了した瞬間に呼び出し、「もう消していいよ」と本体に伝えます。
- **【サンプルコード】**:
```javascript
function onFadeOutComplete() {
    ScenePlus.finish(); // システムから自分自身を確実に消去
}
```

### B. 環境情報の取得（世界の認識）
エフェクトが表示される「舞台」の情報を読み取ります。

#### 5. `ScenePlus.getPreset()`
- **【定義】**: 現在ユーザーが ScenePlus+ で何番のプリセット（1〜8）を選択しているかを数値で返します。
- **【VJ的活用シーン】**: プリセットが `1` ならサイバーパンクな赤色、`2` ならクールな青色、と1つのファイルで複数のカラーバリエーションを持たせる賢い手法。
- **【サンプルコード】**:
```javascript
const currentPreset = ScenePlus.getPreset();
document.body.style.filter = currentPreset === 1 ? 'hue-rotate(0deg)' : 'hue-rotate(180deg)';
```

#### 6. `ScenePlus.getScreenSize()`
- **【定義】**: 現在エフェクトが表示されているデスクトップモニターの論理解像度 `{ width, height }` を返します。
- **【VJ的活用シーン】**: どんなに巨大な4Kモニターでも、レイアウトを崩さずに全画面へCanvasサイズをフィットさせるための必須コマンド。
- **【サンプルコード】**:
```javascript
const size = ScenePlus.getScreenSize();
myCanvas.width = size.width;
myCanvas.height = size.height;
```

### C. インタラクティブ機能（OSとの対話）
「見るだけ」のエフェクトを、「触れる」魔法へと変えます。

#### 7. `ScenePlus.getMousePosition()`
- **【定義】**: 現在のOSのグローバルマウス座標（論理ピクセル） `{ x, y }` をリアルタイムで取得します。DPIスケール補正済みのため、常に画面上の正確な位置を指します。
- **【VJ的活用シーン】**: マウスカーソルの軌跡から火花を散らしたり、視線がカーソルを追いかけるような不気味な瞳を作るなど、ユーザーの「手」をキャンバスに巻き込む究極の表現。
- **【サンプルコード】**:
```javascript
function render() {
    const mouse = ScenePlus.getMousePosition();
    drawSparkleAt(mouse.x, mouse.y);
    requestAnimationFrame(render);
}
```

#### 8. `ScenePlus.captureScreen(resolution, callback)`
- **【定義】**: デスクトップの現在表示されている画面をリアルタイムにスクリーンショットし、非同期で画像データ（DataURL）として返します。解像度は `low`(480p), `mid`(720p), `high`(1080p), `full`(等倍) から選べます。
- **【VJ的活用シーン】**: 画面全体を波打たせる水面エフェクトや、色を反転させるグリッチ表現など、「デスクトップそのものを素材としてサンプリングする」禁断の果実。
- **【サンプルコード】**:
```javascript
ScenePlus.captureScreen('mid', (dataUrl, err) => {
    if (!err) {
        myImageElement.src = dataUrl;
        applyGlitchFilter();
    }
});
```

---

## 3. 実践：3大公式エフェクト・ケーススタディ

ここからは、実際に公式で提供している3つのサンプルエフェクトのソースコードを解剖し、8つのAPIがどのように組み合わされているかを逆引きで解説します。
「1つのコードエフェクトとして最低限成り立たせるための条件」を掴んでください。

### ケース1：Mouse Particle （ONCEモード）
**「一瞬の閃きと確実な死」**を表現する基礎。

- **使用API**: `onInit`, `getMousePosition`, `finish`
- **ソースコード**: [付録：Mouse Particle](#mouse-particle-code)
- **解説**:
  `once` (1回再生) モードでは、通常 `meta.json` の `duration` (ミリ秒) が経過すると強制終了されます。しかし、この作品ではそのタイマーを待たず、`onInit` 時に取得した `getMousePosition()` の位置からパーティクルを爆発させ、アニメーションが完了する1.5秒後に `ScenePlus.finish()` を自ら呼び出しています。
- **最低要件の学び**: 
  1発モノの演出は必ず `finish()` でケリをつける。システムに無駄な不要リソースを居座らせないこと。

### ケース2：Cyber Invert （LOOPモード）
**「無限に続くサンプリング」**のパフォーマンスチューニング。

- **使用API**: `onInit`, `captureScreen`, `onPanic`
- **ソースコード**: [付録：Cyber Invert](#cyber-invert-code)
- **解説**:
  `loop` モードで画面をキャプチャし続け、色を逆転（invert）させます。`captureScreen` は強力ですが、毎秒60回呼ぶとPCが爆発します。そこで `setTimeout` を用いて約15fps (66ms間隔) にスロットリング（間引き）しています。
- **最低要件の学び**:
  ループする視覚効果は、必ず `onPanic` を監視して `active = false` のようにフラグを立て、バックグラウンドでの無駄な `captureScreen` のループ（ゾンビ化）を断ち切る設計にすること。

### ケース3：Gravity Distortion （HOLDモード）
**「余韻を残すプロの仕事」**。

- **使用API**: `onInit`, `getScreenSize`, `getMousePosition`, `captureScreen`, `onRelease`, `onPanic`, `finish`
- **ソースコード**: [付録：Gravity Distortion](#gravity-distortion-code)
- **解説**: 抽出した画面を加工するフルコース演出の例。`onInit` で `getScreenSize()` に合わせてCanvasを広げ、`captureScreen` の映像を貼り付け、`getMousePosition()` に追従して歪ませます。
  最大のポイントは `onRelease`。キーが離されても即座に消えるのではなく、アルファ値を徐々に下げ（フェードアウト）、完全に透明になった瞬間に `finish()` を呼んで美しく散ります。
- **最低要件の学び**:
  HOLDモードで魅せるVJは「引き際」が命です。`onRelease` が呼ばれたあとの終了アニメーション設計と、その後の責任ある `finish()` コールが必須条件となります。

---

## 4. 厳格な利用規約とマナー (ToS Breakdown)

ScenePlus+ は、**「あなたのコードが、ユーザーの視線そのものになる」**という強大な権限を与えます。
ゆえに、同梱されている『ScenePlus+ SDK ソフトウェア利用規約』は絶対順守です。

1. **画面の盗撮と送信の禁止 (絶対NG)**
   - `captureScreen` で手に入れた画像を、ユーザーに隠れて外部のサーバーに送信する行為は重大な規約違反（および犯罪）です。
2. **目的の明示**
   - 画面キャプチャを利用するエフェクトを配布する際は、必ずREADMEなどに「このエフェクトは画面をキャプチャして加工します」と明記してください。
3. **リソースの枯渇防止**
   - 無限ループによるメモリリークや意図的なクラッシュ（ブラウザクラッシャーのような行為）は厳禁です。必ず `onPanic` と `finish` を使って誠実にメモリを返却してください。

> **※規約に違反した悪質なエフェクトは、キルスイッチによって全ユーザーの ScenePlus+ 上で起動不可能となります。**

---

## 5. パッケージング・ガイド (配布のお作法)

完成したあなたの魔法は、他のユーザーに届けて初めて意味を持ちます。
以下の手順で、エフェクトをパッケージ化（`.scenefx`）しましょう。

### Step 1: `meta.json` の作成
フォルダのルート（一番上の階層）に、エフェクトの設計図となる `meta.json` を必ず置きます。

```json
{
  "name": "My Awesome Effect", 
  "mediatype": "code",
  "playmode": "hold",
  "path": "/index.html"
}
```
※ `once` モードの場合は、フェイルセーフとして `"duration": 5000` (ミリ秒) 等を併記してください。

### Step 2: 素材の集約とZIP化
`meta.json`、`index.html`、および必要な画像やCSSを1つのフォルダにまとめ、**中のファイル群を直接選択してZIP圧縮**します。（フォルダごと圧縮すると構造が深くなりエラーになります）。

### Step 3: 拡張子の変更
出来上がった `MyEffect.zip` の名前を `MyEffect.scenefx` に変更します。
これで完成です！あとは ScenePlus+ の画面にドラッグ＆ドロップするだけで、世界中のデスクトップであなたの魔法が発動します。

---

## 6. 【付録】 ソースコード・アーカイブ

本セクションでは、ScenePlus+ SDKの心臓部と、公式エフェクトの全ての設計図を公開しています。

### 6.1 ScenePlus-SDK.js <a id="sdk-code"></a>

本SDKは `scene://_core/ScenePlus-SDK.js` から動的に読み込まれます。

<details>
<summary>▶ ソースコードを表示</summary>

```javascript
/**
 * ScenePlus-SDK.js
 * The official creator API for ScenePlus+ Interactive Effects.
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
        onInit: (callback) => listeners.init.push(callback),
        onRelease: (callback) => listeners.release.push(callback),
        onPanic: (callback) => listeners.panic.push(callback),
        finish: () => {
            window.parent.postMessage({ source: 'sceneplus-effect', type: 'finish' }, '*');
        },
        getPreset: () => systemEnv.preset,
        getScreenSize: () => systemEnv.screenSize,
        getMousePosition: () => systemEnv.mousePos,
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
```
</details>

### 6.2 Mouse Particle (index.html) <a id="mouse-particle-code"></a>

<details>
<summary>▶ ソースコードを表示</summary>

```html
<!DOCTYPE html>
<html>
<head>
<script src="scene://_core/ScenePlus-SDK.js"></script>
<style>
  body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  .particle {
    position: absolute;
    width: 20px;
    height: 20px;
    background: radial-gradient(circle, #fff, #39ff14, transparent);
    border-radius: 50%;
    pointer-events: none;
    animation: explode 0.8s ease-out forwards;
  }
  @keyframes explode {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(5); opacity: 0; }
  }
</style>
</head>
<body>
<script>
  let autoTimer;
  ScenePlus.onInit((meta, env) => {
    const pos = ScenePlus.getMousePosition();
    for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 50;
        p.style.left = (pos.x + Math.cos(angle) * radius - 10) + 'px';
        p.style.top = (pos.y + Math.sin(angle) * radius - 10) + 'px';
        document.body.appendChild(p);
    }
    autoTimer = setTimeout(() => {
        ScenePlus.finish();
    }, 1500);
  });
</script>
</body>
</html>
```
</details>

### 6.3 Cyber Invert (index.html) <a id="cyber-invert-code"></a>

<details>
<summary>▶ ソースコードを表示</summary>

```html
<!DOCTYPE html>
<html>
<head>
<script src="scene://_core/ScenePlus-SDK.js"></script>
<style>
  body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  #screen-display {
    width: 100vw;
    height: 100vh;
    object-position: center;
    object-fit: cover;
    filter: invert(1) hue-rotate(180deg) brightness(1.2);
  }
</style>
</head>
<body>
<img id="screen-display" src="" />
<script>
  let active = false;
  function captureLoop() {
    if (!active) return;
    ScenePlus.captureScreen('low', (dataUrl, err) => {
        if (!err && dataUrl) {
            document.getElementById('screen-display').src = dataUrl;
        }
        setTimeout(captureLoop, 66);
    });
  }
  ScenePlus.onInit((meta, env) => {
    active = true;
    captureLoop();
  });
  ScenePlus.onPanic(() => {
    active = false;
  });
</script>
</body>
</html>
```
</details>

### 6.4 Gravity Distortion (index.html) <a id="gravity-distortion-code"></a>

<details>
<summary>▶ ソースコードを表示</summary>

```html
<!DOCTYPE html>
<html>
<head>
<script src="scene://_core/ScenePlus-SDK.js"></script>
<style>
  body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<script>
  let active = false;
  let releasing = false;
  let fadeAlpha = 1.0;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let cx = 0, cy = 0;
  let currentImg = null;

  ScenePlus.onInit((meta, env) => {
    active = true;
    canvas.width = env.screenSize.width;
    canvas.height = env.screenSize.height;
    captureBackground();
    requestAnimationFrame(renderLoop);
  });

  function captureBackground() {
    if (!active) return;
    ScenePlus.captureScreen('mid', (dataUrl, err) => {
        if (!err && dataUrl) {
            const img = new Image();
            img.onload = () => { currentImg = img; };
            img.src = dataUrl;
        }
    });
  }

  function renderLoop() {
    if (!active) return;
    const m = ScenePlus.getMousePosition();
    cx += (m.x - cx) * 0.2;
    cy += (m.y - cy) * 0.2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = fadeAlpha;
    if (currentImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 150, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(currentImg, 
            cx - 75, cy - 75, 150, 150,
            cx - 150, cy - 150, 300, 300
        );
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, 150, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(57, 255, 20, ${fadeAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    if (releasing) {
        fadeAlpha -= 0.05;
        if (fadeAlpha <= 0) {
            active = false;
            ScenePlus.finish();
            return;
        }
    }
    requestAnimationFrame(renderLoop);
  }
  ScenePlus.onRelease(() => { releasing = true; });
  ScenePlus.onPanic(() => { active = false; });
</script>
</body>
</html>
```
</details>
