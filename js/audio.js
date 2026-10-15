/*
 * audio.js — WebAudio 合成音效（无外部音频文件）
 */
(function (global) {
  'use strict';
  var ctx = null, enabled = true, master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function knock(freq, decay, gain, type) {
    if (!ensure() || !enabled) return;
    var t = ctx.currentTime;
    // 噪声敲击
    var len = Math.max(1, Math.floor(ctx.sampleRate * decay));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var bp = ctx.createBiquadFilter();
    bp.type = type || 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.1;
    var g = ctx.createGain(); g.gain.value = gain;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t);
    // 木质基频
    var osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq * 0.42;
    var og = ctx.createGain();
    og.gain.setValueAtTime(gain * 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + decay * 1.4);
    osc.connect(og); og.connect(master);
    osc.start(t); osc.stop(t + decay * 1.6);
  }

  function tone(freq, dur, gain, type, delay) {
    if (!ensure() || !enabled) return;
    var t = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator(); osc.type = type || 'sine'; osc.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  var api = {
    unlock: function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setEnabled: function (v) { enabled = v; },
    isEnabled: function () { return enabled; },
    select: function () { knock(900, 0.09, 0.5); },
    move: function () { knock(520, 0.11, 0.55); },
    capture: function () { knock(240, 0.2, 0.85, 'lowpass'); knock(1400, 0.07, 0.3); },
    check: function () {
      if (!ensure() || !enabled) return;
      tone(196, 1.1, 0.28, 'sine', 0);
      tone(294, 0.9, 0.2, 'sine', 0.04);
      tone(392, 0.7, 0.14, 'triangle', 0.08);
      knock(3000, 0.25, 0.12, 'highpass');
    },
    win: function () { tone(523, 0.5, 0.2, 'triangle', 0); tone(659, 0.5, 0.2, 'triangle', 0.12); tone(784, 0.7, 0.22, 'triangle', 0.24); },
    lose: function () { tone(330, 0.5, 0.2, 'sine', 0); tone(247, 0.6, 0.2, 'sine', 0.15); tone(196, 0.9, 0.22, 'sine', 0.3); },
    draw: function () { tone(392, 0.6, 0.16, 'sine', 0); tone(392, 0.6, 0.14, 'sine', 0.25); }
  };
  global.XQ.audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
