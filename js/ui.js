/*
 * ui.js — HUD 更新与弹窗控制
 */
(function (global) {
  'use strict';
  var XQ = global.XQ;
  var RED = XQ.RED, BLACK = XQ.BLACK;
  var NAMES = XQ.NAMES;

  function $(id) { return document.getElementById(id); }

  var ui = {
    els: {
      turnChip: $('turn-chip'), turnText: $('turn-text'),
      statMove: $('stat-move'), statIdle: $('stat-idle'),
      moves: $('moves'), capRed: $('cap-red'), capBlack: $('cap-black'),
      hint: $('hint'), thinking: $('thinking'),
      modalResult: $('modal-result'), resultIcon: $('result-icon'),
      resultTitle: $('result-title'), resultDetail: $('result-detail'),
      modalRules: $('modal-rules'),
      selMode: $('sel-mode'), selLevel: $('sel-level'), selSide: $('sel-side'),
      rowLevel: $('row-level'), rowSide: $('row-side'),
      btnSound: $('btn-sound')
    },

    setTurn: function (side, alert) {
      var e = ui.els;
      e.turnChip.classList.toggle('black', side === BLACK);
      e.turnChip.classList.toggle('red', side === RED);
      e.turnChip.classList.toggle('alert', !!alert);
      e.turnText.textContent = (side === RED ? '红方行棋' : '黑方行棋') + (alert ? ' · 被将军！' : '');
    },
    setThinking: function (v) { ui.els.thinking.classList.toggle('hidden', !v); },
    setStats: function (moveNo, idle) {
      ui.els.statMove.textContent = moveNo;
      ui.els.statIdle.textContent = Math.min(idle, 120) / 2 + '/60';
    },
    setHint: function (t) { ui.els.hint.textContent = t; },

    /* 着法记录：整表重绘 */
    renderMoves: function (history) {
      var box = ui.els.moves;
      if (!history.length) { box.innerHTML = '<p class="empty">尚未行棋</p>'; return; }
      var html = '';
      for (var i = 0; i < history.length; i += 2) {
        var no = (i / 2 + 1);
        html += '<div class="ply"><span class="no">' + no + '.</span>';
        var r = history[i], b = history[i + 1];
        html += '<span class="mv red">' + r.notation + (r.mate ? '<span class="chk">将杀</span>' : r.check ? '<span class="chk">将</span>' : '') + '</span>';
        html += b ? '<span class="mv black">' + b.notation + (b.mate ? '<span class="chk">将杀</span>' : b.check ? '<span class="chk">将</span>' : '') + '</span>' : '<span class="mv"></span>';
        html += '</div>';
      }
      box.innerHTML = html;
      box.scrollTop = box.scrollHeight;
    },

    /* 被吃棋子 */
    renderCaptured: function (history) {
      var red = [], black = []; // 各方吃掉的子（即对方的损失）
      for (var i = 0; i < history.length; i++) {
        var cap = history[i].captured;
        if (!cap) continue;
        var kind = cap & 7, side = cap < 8 ? RED : BLACK;
        var ch = NAMES[side][kind];
        if (history[i].side === RED) red.push(ch); else black.push(ch);
      }
      ui.els.capRed.innerHTML = red.map(function (c) { return '<span class="piece black">' + c + '</span>'; }).join('') || '<span class="cap-list" style="color:var(--ink-dim);font-size:11px">暂无</span>';
      ui.els.capBlack.innerHTML = black.map(function (c) { return '<span class="piece red">' + c + '</span>'; }).join('') || '<span class="cap-list" style="color:var(--ink-dim);font-size:11px">暂无</span>';
    },

    /* 结算 */
    showResult: function (result, humanSide, mode) {
      var e = ui.els;
      var title, detail, icon;
      if (result.winner === 'draw') {
        title = '和 棋'; icon = '和';
        detail = { insufficient: '双方均无攻击子力，例和', fifty: '六十回合无吃子，自然限着', repetition: '局面三次重复，判和', 'perpetual-check': '长将作负' }[result.reason] || '和棋';
      } else {
        var w = result.winner === RED ? '红方' : '黑方';
        title = w + '胜';
        icon = result.winner === RED ? '帥' : '將';
        detail = { checkmate: (result.winner === RED ? '黑方' : '红方') + '被将死', stalemate: (result.winner === RED ? '黑方' : '红方') + '困毙无子可走', 'perpetual-check': '对方长将判负' }[result.reason] || '';
      }
      e.resultTitle.textContent = title;
      e.resultDetail.textContent = detail;
      e.resultIcon.textContent = icon;
      e.modalResult.classList.remove('hidden');
    },
    hideResult: function () { ui.els.modalResult.classList.add('hidden'); },
    showRules: function () { ui.els.modalRules.classList.remove('hidden'); },
    hideRules: function () { ui.els.modalRules.classList.add('hidden'); },
    setModeVisible: function (mode) {
      ui.els.rowLevel.style.display = mode === 'ai' ? '' : 'none';
      ui.els.rowSide.style.display = mode === 'ai' ? '' : 'none';
    },
    setSoundBtn: function (on) {
      ui.els.btnSound.classList.toggle('on', on);
      ui.els.btnSound.classList.toggle('off', !on);
      ui.els.btnSound.textContent = on ? '音效 ♪' : '音效 ✕';
    }
  };

  XQ.ui = ui;
})(typeof window !== 'undefined' ? window : globalThis);
