/* build.js — 打包单文件 HTML（内联 three.js + 全部脚本 + 样式，双击即可离线运行） */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');

// 按 index.html 中的顺序收集脚本
const jsFiles = [
  'vendor/three.min.js',
  'js/rules.js',
  'js/textures.js',
  'js/pieces3d.js',
  'js/scene3d.js',
  'js/controls.js',
  'js/audio.js',
  'js/ai.js',
  'js/interaction.js',
  'js/ui.js',
  'js/game.js',
  'js/main.js'
];

// 校验 index.html 中的 script 顺序与打包顺序一致
const scriptRe = /<script src="([^"]+)"><\/script>/g;
let m, ordered = [];
while ((m = scriptRe.exec(html)) !== null) ordered.push(m[1]);
const expected = jsFiles.join(',');
if (ordered.join(',') !== expected) {
  console.error('index.html 脚本顺序与 build.js 不一致:\n  html: ' + ordered.join(',') + '\n  build: ' + expected);
  process.exit(1);
}

// 打包前语法校验所有脚本
for (const f of jsFiles) {
  try { new Function(read(f)); } catch (e) {
    console.error('语法错误 ' + f + ': ' + e.message);
    process.exit(1);
  }
}

let out = html
  .replace(/<link rel="stylesheet" href="css\/style.css">/, () => '<style>\n' + read('css/style.css') + '\n</style>');

// 逐个内联脚本（用函数 replacer 避免 $ 特殊序列问题）
for (const f of jsFiles) {
  const tag = `<script src="${f}"><\/script>`;
  if (!out.includes(tag)) { console.error('未找到脚本标签: ' + tag); process.exit(1); }
  out = out.replace(tag, () => '<script>\n' + read(f) + '\n</script>');
}

if (out.includes('<script src=') || out.includes('href="css/')) {
  console.error('存在未内联的外部引用');
  process.exit(1);
}

const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, 'chinese-chess-3d.html');
fs.writeFileSync(outPath, out);
console.log('已生成:', outPath, (fs.statSync(outPath).size / 1024).toFixed(0) + 'KB');
