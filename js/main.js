/* main.js — 启动入口 */
(function (global) {
  'use strict';
  function start() {
    var canvas = document.getElementById('gl');
    global.XQ.game.boot(canvas);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
