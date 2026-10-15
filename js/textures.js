/*
 * textures.js — 程序化 Canvas 贴图工具（木纹棋盘、字符面牌、光晕、粒子）
 */
(function (global) {
  'use strict';
  var XQ = global.XQ;

  function makeCanvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }

  /* 木纹材质贴图：深色硬木，带年轮纹理 */
  function woodTexture(base, ring, w, h) {
    w = w || 1024; h = h || 1024;
    var cv = makeCanvas(w, h), ctx = cv.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // 年轮：同心椭圆纹
    var cx = w * 0.5, cy = h * 0.62;
    for (var i = 0; i < 46; i++) {
      ctx.beginPath();
      var rx = 30 + i * 26 + Math.sin(i * 2.3) * 14;
      var ry = 12 + i * 11 + Math.cos(i * 1.7) * 8;
      ctx.ellipse(cx, cy, rx, ry, 0.35, 0, Math.PI * 2);
      ctx.strokeStyle = i % 3 === 0 ? ring : 'rgba(0,0,0,0.10)';
      ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.1;
      ctx.stroke();
    }
    // 噪点
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (Math.random() - 0.5) * 16;
      d[p] += n; d[p + 1] += n; d[p + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /* 棋盘表面贴图：木纹底 + 刻线 + 楚河汉界 + 九宫 + 定位标记 */
  function boardTexture() {
    var W = 1600, H = 1800; // 比例 8:9（棋盘 9 纵线 × 10 横线）
    var cv = makeCanvas(W, H), ctx = cv.getContext('2d');
    // 木底
    var wood = woodTexture('#caa26b', 'rgba(120,80,40,0.55)', W, H);
    ctx.drawImage(wood.image, 0, 0, W, H);
    // 整体做旧
    var grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
    grad.addColorStop(0, 'rgba(255,240,210,0.10)');
    grad.addColorStop(1, 'rgba(40,20,8,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    var marginX = 112, marginY = 114;      // 留白与 3D 网格对齐（网格 8.0×9.0）
    var cw = (W - marginX * 2) / 8;        // 纵线间距
    var ch = (H - marginY * 2) / 9;        // 横线间距
    function X(c) { return marginX + c * cw; }      // col → px
    function Y(r) { return marginY + r * ch; }      // row → px（row 0 在顶部=黑方）

    ctx.lineCap = 'round';
    // （网格线由 3D 立体刻线呈现，贴图仅提供木纹/河界文字/定位标记）

    // 楚河汉界
    ctx.save();
    ctx.font = '600 ' + Math.round(ch * 0.66) + 'px "STKaiti","Kaiti SC","KaiTi","BiauKai",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var riverY = (Y(4) + Y(5)) / 2;
    // 河界底纹
    var rg = ctx.createLinearGradient(0, Y(4), 0, Y(5));
    rg.addColorStop(0, 'rgba(190,160,110,0.05)');
    rg.addColorStop(0.5, 'rgba(120,150,160,0.10)');
    rg.addColorStop(1, 'rgba(190,160,110,0.05)');
    ctx.fillStyle = rg;
    ctx.fillRect(X(0), Y(4), 8 * cw, ch);
    var CHARS = [['楚', 1.55], ['河', 2.75], ['漢', 5.25], ['界', 6.45]];
    // 先铺浅色晕底，再写深色字，保证任何光线下可读
    ctx.fillStyle = 'rgba(255,244,220,0.30)';
    CHARS.forEach(function (c) { ctx.fillText(c[0], X(c[1]), riverY); });
    ctx.fillStyle = 'rgba(74,42,16,0.92)';
    CHARS.forEach(function (c) { ctx.fillText(c[0], X(c[1]), riverY); });
    ctx.restore();

    // 兵/炮位定位标记（传统式样的小折角）
    ctx.strokeStyle = 'rgba(52,30,12,0.75)';
    ctx.lineWidth = 2.4;
    var marks = [];
    for (var cc = 0; cc < 9; cc += 2) { marks.push([3, cc]); marks.push([6, cc]); }
    marks.push([2, 1]); marks.push([2, 7]); marks.push([7, 1]); marks.push([7, 7]);
    var L = 16, G = 8;
    marks.forEach(function (m) {
      var x = X(m[1]), y = Y(m[0]);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        ctx.beginPath();
        ctx.moveTo(x + s[0] * G, y + s[1] * (G + L));
        ctx.lineTo(x + s[0] * G, y + s[1] * G);
        ctx.lineTo(x + s[0] * (G + L), y + s[1] * G);
        ctx.stroke();
      });
    });

    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }

  /* 棋子面牌贴图：圆形金漆字符（红方金字/黑方骨白字） */
  function faceTexture(char, side) {
    var S = 512;
    var cv = makeCanvas(S, S), ctx = cv.getContext('2d');
    var isRed = side === 0;
    // 牌底
    var g = ctx.createRadialGradient(S * 0.38, S * 0.34, S * 0.05, S * 0.5, S * 0.5, S * 0.62);
    if (isRed) {
      g.addColorStop(0, '#c8503a'); g.addColorStop(0.55, '#a03322'); g.addColorStop(1, '#7c2013');
    } else {
      g.addColorStop(0, '#4a4f57'); g.addColorStop(0.55, '#2c3037'); g.addColorStop(1, '#191d22');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2);
    ctx.fill();
    // 内圈凹槽
    ctx.strokeStyle = isRed ? 'rgba(255,210,150,0.55)' : 'rgba(200,205,215,0.45)';
    ctx.lineWidth = S * 0.012;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.435, 0, Math.PI * 2);
    ctx.stroke();
    // 字符（大字号金漆，描边增强对比）
    ctx.font = 'bold ' + Math.round(S * 0.70) + 'px "STKaiti","Kaiti SC","KaiTi","BiauKai","DFKai-SB",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var ink = isRed ? '#f7d789' : '#e9e4d2';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = S * 0.02;
    ctx.shadowOffsetY = S * 0.012;
    // 深色勾边先描一遍，再填字，任何背景下都清晰
    ctx.lineWidth = S * 0.022;
    ctx.strokeStyle = isRed ? 'rgba(60,12,4,0.9)' : 'rgba(8,10,14,0.9)';
    ctx.strokeText(char, S / 2, S * 0.53);
    ctx.fillStyle = ink;
    ctx.fillText(char, S / 2, S * 0.53);
    ctx.shadowColor = 'transparent';
    // 高光
    var hg = ctx.createLinearGradient(0, 0, 0, S);
    hg.addColorStop(0, 'rgba(255,255,255,0.16)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2);
    ctx.fill();
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }

  /* 径向光晕精灵（选择环/光点/受将红光） */
  function glowTexture(inner, outer) {
    var S = 256;
    var cv = makeCanvas(S, S), ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* 场景背景渐变 */
  function backdropTexture() {
    var W = 64, H = 512;
    var cv = makeCanvas(W, H), ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0d12');
    g.addColorStop(0.45, '#141119');
    g.addColorStop(0.75, '#1d1512');
    g.addColorStop(1, '#06070a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* 地面径向渐变（边缘融入背景） */
  function groundTexture() {
    var S = 512;
    var cv = makeCanvas(S, S), ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, '#3a2c20');
    g.addColorStop(0.55, '#241a13');
    g.addColorStop(1, '#0a0806');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(cv);
  }

  XQ.textures = {
    woodTexture: woodTexture,
    boardTexture: boardTexture,
    faceTexture: faceTexture,
    glowTexture: glowTexture,
    backdropTexture: backdropTexture,
    groundTexture: groundTexture
  };
})(typeof window !== 'undefined' ? window : globalThis);
