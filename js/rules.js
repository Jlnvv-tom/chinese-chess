/*
 * rules.js — 中国象棋完整规则引擎（纯逻辑，无渲染依赖）
 * 同时兼容浏览器（挂载 window.XQ）与 Node（require 后取 globalThis.XQ）。
 *
 * 棋盘坐标：row 0..9（0 = 黑方底线，9 = 红方底线），col 0..8（0 = 红方左手边）。
 * 红方先行，红方向 row 减小的方向走，黑方向 row 增大方向走。
 * 棋子编码：0 空；红方 1..7；黑方 9..15。kind = piece & 7，side = piece < 8 ? 0 : 1。
 */
(function (global) {
  'use strict';

  var EMPTY = 0, RED = 0, BLACK = 1;
  var K = 1, A = 2, E = 3, H = 4, R = 5, C = 6, P = 7; // kind
  var OFF = 8;

  var NAMES = {
    0: { 1: '帅', 2: '仕', 3: '相', 4: '马', 5: '车', 6: '炮', 7: '兵' },
    1: { 1: '将', 2: '士', 3: '象', 4: '马', 5: '车', 6: '炮', 7: '卒' }
  };
  var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function kindOf(p) { return p & 7; }
  function sideOf(p) { return p < OFF ? RED : BLACK; }
  function makePiece(side, kind) { return side === RED ? kind : kind + OFF; }
  function rowOf(i) { return (i / 9) | 0; }
  function colOf(i) { return i % 9; }
  function idxOf(r, c) { return r * 9 + c; }
  function inBoard(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }
  function inPalace(r, c, side) { return c >= 3 && c <= 5 && (side === RED ? r >= 7 : r <= 2); }
  function ownHalf(r, c, side) { return side === RED ? r >= 5 : r <= 4; }
  // 红方纵线号（自红方右手边起：col 8 = 一）；黑方纵线号（自黑方右手边起：col 0 = 1）
  function fileStr(side, col) { return side === RED ? CN_NUM[8 - col] : String(col + 1); }
  // 记谱数字：红方用汉字（一~九），黑方用阿拉伯数字
  function numStr(side, n) { return side === RED ? (CN_NUM[n - 1] || String(n)) : String(n); }

  var HORSE = [ // [dr, dc, 马腿dr, 马腿dc]
    [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
    [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]
  ];
  var ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var ELEPH = [[-2, -2], [-2, 2], [2, -2], [2, 2]];

  function Xiangqi() { this.reset(); }

  Xiangqi.prototype.reset = function () {
    this.board = new Array(90).fill(EMPTY);
    var back = [R, H, E, A, K, A, E, H, R];
    for (var c = 0; c < 9; c++) {
      this.board[idxOf(0, c)] = makePiece(BLACK, back[c]);
      this.board[idxOf(9, c)] = makePiece(RED, back[c]);
    }
    this.board[idxOf(2, 1)] = makePiece(BLACK, C);
    this.board[idxOf(2, 7)] = makePiece(BLACK, C);
    this.board[idxOf(7, 1)] = makePiece(RED, C);
    this.board[idxOf(7, 7)] = makePiece(RED, C);
    for (var i = 0; i < 9; i += 2) {
      this.board[idxOf(3, i)] = makePiece(BLACK, P);
      this.board[idxOf(6, i)] = makePiece(RED, P);
    }
    this.side = RED;
    this.history = [];
    this.repetition = new Map();
    this.halfmove = 0;   // 距上次吃子的 Ply 数（60 回合自然限着 = 120 ply）
    this.moveNo = 1;
    this.result = null;  // {winner: 0|1|'draw', reason: string}
    this.kingIdx = [idxOf(9, 4), idxOf(0, 4)];
    this._notePosition();
  };

  Xiangqi.prototype.clone = function () {
    var g = Object.create(Xiangqi.prototype);
    g.board = this.board.slice();
    g.side = this.side;
    g.history = this.history.slice();
    g.repetition = new Map(this.repetition);
    g.halfmove = this.halfmove;
    g.moveNo = this.moveNo;
    g.result = this.result;
    g.kingIdx = this.kingIdx.slice();
    return g;
  };

  Xiangqi.prototype.at = function (idx) { return this.board[idx]; };
  Xiangqi.prototype.sideToMove = function () { return this.side; };
  Xiangqi.prototype.kingOf = function (side) { return this.kingIdx[side]; };

  Xiangqi.prototype._key = function () { return this.board.join('') + '|' + this.side; };
  Xiangqi.prototype._notePosition = function () {
    var k = this._key(), n = (this.repetition.get(k) || 0) + 1;
    this.repetition.set(k, n);
  };

  /* ---------------- 攻击判定 ---------------- */

  Xiangqi.prototype.isAttacked = function (r, c, by) {
    var b = this.board, i, p, rr, r2, c2;
    // 1) 将/帅：相邻四格 + 飞将（同纵线无阻隔即视为受将控制）
    var ek = this.kingIdx[by];
    if (ek >= 0) {
      var er = rowOf(ek), ec = colOf(ek);
      if (Math.abs(er - r) + Math.abs(ec - c) === 1) return true;
      if (ec === c) {
        var clear = true, lo = Math.min(er, r) + 1, hi = Math.max(er, r) - 1;
        for (rr = lo; rr <= hi; rr++) if (b[idxOf(rr, c)] !== EMPTY) { clear = false; break; }
        if (clear) return true;
      }
    }
    // 2) 士：相邻四斜角
    for (i = 0; i < 4; i++) {
      r2 = r + DIAG[i][0]; c2 = c + DIAG[i][1];
      if (inBoard(r2, c2)) {
        p = b[idxOf(r2, c2)];
        if (p !== EMPTY && kindOf(p) === A && sideOf(p) === by) return true;
      }
    }
    // 3) 相/象：斜二格，象眼须空
    for (i = 0; i < 4; i++) {
      r2 = r + ELEPH[i][0]; c2 = c + ELEPH[i][1];
      if (inBoard(r2, c2)) {
        p = b[idxOf(r2, c2)];
        if (p !== EMPTY && kindOf(p) === E && sideOf(p) === by &&
            b[idxOf(r + ELEPH[i][0] / 2, c + ELEPH[i][1] / 2)] === EMPTY) return true;
      }
    }
    // 4) 马：八个“日字”落点，且对应马腿为空。
    //    注意：HORSE 表项为 [目标相对偏移, 着法生成时马腿相对马的偏移]；
    //    此处马位于目标的镜像侧，马腿须取反向偏移。
    for (i = 0; i < 8; i++) {
      r2 = r + HORSE[i][0]; c2 = c + HORSE[i][1];
      if (inBoard(r2, c2)) {
        p = b[idxOf(r2, c2)];
        if (p !== EMPTY && kindOf(p) === H && sideOf(p) === by &&
            b[idxOf(r2 - HORSE[i][2], c2 - HORSE[i][3])] === EMPTY) return true;
      }
    }
    // 5) 车 / 炮：四直线扫描
    //    车：距目标最近的敌子沿直线无阻 → 攻击；
    //    炮：与目标之间恰隔一子（炮架）且目标处有子 → 隔山打牛攻击。
    for (i = 0; i < 4; i++) {
      var dr = ORTHO[i][0], dc = ORTHO[i][1];
      r2 = r + dr; c2 = c + dc;
      var first = EMPTY, second = EMPTY;
      while (inBoard(r2, c2)) {
        p = b[idxOf(r2, c2)];
        if (p !== EMPTY) { if (first === EMPTY) first = p; else { second = p; break; } }
        r2 += dr; c2 += dc;
      }
      if (first !== EMPTY && sideOf(first) === by && kindOf(first) === R) return true;
      if (second !== EMPTY && sideOf(second) === by && kindOf(second) === C && b[idxOf(r, c)] !== EMPTY) return true;
    }
    // 6) 兵/卒：永远向前攻一格；过河后可横攻一格
    if (inBoard(r + 1, c)) {
      p = b[idxOf(r + 1, c)];
      if (p !== EMPTY && kindOf(p) === P && sideOf(p) === RED) return true;
    }
    if (inBoard(r - 1, c)) {
      p = b[idxOf(r - 1, c)];
      if (p !== EMPTY && kindOf(p) === P && sideOf(p) === BLACK) return true;
    }
    for (i = -1; i <= 1; i += 2) {
      if (inBoard(r, c + i)) {
        p = b[idxOf(r, c + i)];
        if (p !== EMPTY && kindOf(p) === P && sideOf(p) === by && !ownHalf(r, c + i, by)) return true;
      }
    }
    return false;
  };

  Xiangqi.prototype.inCheck = function (side) {
    var k = this.kingIdx[side];
    if (k < 0) return false; // 测试局面可能缺将
    return this.isAttacked(rowOf(k), colOf(k), side ^ 1);
  };

  /* ---------------- 着法生成 ---------------- */

  function pushMove(out, from, to, piece, captured) {
    out.push({ from: from, to: to, piece: piece, captured: captured });
  }

  Xiangqi.prototype._pseudoFrom = function (idx, out) {
    var b = this.board, p = b[idx];
    if (p === EMPTY) return;
    var side = sideOf(p), kind = kindOf(p), r = rowOf(idx), c = colOf(idx), i, r2, c2, t;
    if (kind === R || kind === C) {
      for (i = 0; i < 4; i++) {
        r2 = r + ORTHO[i][0]; c2 = c + ORTHO[i][1];
        var screen = false;
        while (inBoard(r2, c2)) {
          t = b[idxOf(r2, c2)];
          if (t === EMPTY) {
            if (!screen) pushMove(out, idx, idxOf(r2, c2), p, EMPTY);
          } else if (!screen) {
            if (kind === R) {
              if (sideOf(t) !== side) pushMove(out, idx, idxOf(r2, c2), p, t); // 车吃遇子
              break;
            }
            screen = true;              // 炮：第一枚子为炮架，继续探路
          } else {
            if (sideOf(t) !== side) pushMove(out, idx, idxOf(r2, c2), p, t);
            break;
          }
          r2 += ORTHO[i][0]; c2 += ORTHO[i][1];
        }
      }
    } else if (kind === H) {
      for (i = 0; i < 8; i++) {
        r2 = r + HORSE[i][0]; c2 = c + HORSE[i][1];
        if (!inBoard(r2, c2)) continue;
        if (b[idxOf(r + HORSE[i][2], c + HORSE[i][3])] !== EMPTY) continue; // 蹩马腿
        t = b[idxOf(r2, c2)];
        if (t === EMPTY || sideOf(t) !== side) pushMove(out, idx, idxOf(r2, c2), p, t);
      }
    } else if (kind === E) {
      for (i = 0; i < 4; i++) {
        r2 = r + ELEPH[i][0]; c2 = c + ELEPH[i][1];
        if (!inBoard(r2, c2) || !ownHalf(r2, c2, side)) continue; // 象不过河
        if (b[idxOf(r + ELEPH[i][0] / 2, c + ELEPH[i][1] / 2)] !== EMPTY) continue; // 塞象眼
        t = b[idxOf(r2, c2)];
        if (t === EMPTY || sideOf(t) !== side) pushMove(out, idx, idxOf(r2, c2), p, t);
      }
    } else if (kind === A) {
      for (i = 0; i < 4; i++) {
        r2 = r + DIAG[i][0]; c2 = c + DIAG[i][1];
        if (!inBoard(r2, c2) || !inPalace(r2, c2, side)) continue; // 士不出九宫
        t = b[idxOf(r2, c2)];
        if (t === EMPTY || sideOf(t) !== side) pushMove(out, idx, idxOf(r2, c2), p, t);
      }
    } else if (kind === K) {
      for (i = 0; i < 4; i++) {
        r2 = r + ORTHO[i][0]; c2 = c + ORTHO[i][1];
        if (!inBoard(r2, c2) || !inPalace(r2, c2, side)) continue; // 将不出九宫
        t = b[idxOf(r2, c2)];
        if (t === EMPTY || sideOf(t) !== side) pushMove(out, idx, idxOf(r2, c2), p, t);
      }
    } else if (kind === P) {
      var fr = side === RED ? r - 1 : r + 1;
      if (inBoard(fr, c)) {
        t = b[idxOf(fr, c)];
        if (t === EMPTY || sideOf(t) !== side) pushMove(out, idx, idxOf(fr, c), p, t);
      }
      if (!ownHalf(r, c, side)) { // 过河后可横行，永不后退
        for (i = -1; i <= 1; i += 2) {
          if (inBoard(r, c + i)) {
            t = b[idxOf(r, c + i)];
            if (t === EMPTY || sideOf(t) !== side) pushMove(out, idx, idxOf(r, c + i), p, t);
          }
        }
      }
    }
  };

  Xiangqi.prototype.pseudoMoves = function (side) {
    var out = [], b = this.board;
    for (var i = 0; i < 90; i++) {
      var p = b[i];
      if (p !== EMPTY && sideOf(p) === side) this._pseudoFrom(i, out);
    }
    return out;
  };

  Xiangqi.prototype.legalMoves = function () {
    var side = this.side, pseudo = this.pseudoMoves(side), out = [];
    for (var i = 0; i < pseudo.length; i++) {
      var undo = this._apply(pseudo[i]);
      if (!this.inCheck(side)) out.push(pseudo[i]);
      this._revert(undo);
    }
    return out;
  };

  Xiangqi.prototype.legalMovesFrom = function (idx) {
    var side = this.side, pseudo = [], out = [];
    var p = this.board[idx];
    if (p === EMPTY || sideOf(p) !== side) return out; // 仅行棋方棋子
    this._pseudoFrom(idx, pseudo);
    for (var i = 0; i < pseudo.length; i++) {
      var undo = this._apply(pseudo[i]);
      if (!this.inCheck(side)) out.push(pseudo[i]);
      this._revert(undo);
    }
    return out;
  };

  /* ---------------- make / unmake ---------------- */

  Xiangqi.prototype._apply = function (m) {
    var undo = {
      from: m.from, to: m.to, piece: m.piece, captured: this.board[m.to],
      side: this.side, halfmove: this.halfmove, kingIdx: this.kingIdx.slice(),
      repKey: this._key(), repCount: this.repetition.get(this._key()) || 0
    };
    this.board[m.to] = m.piece;
    this.board[m.from] = EMPTY;
    if (kindOf(m.piece) === K) this.kingIdx[sideOf(m.piece)] = m.to;
    this.halfmove = (undo.captured !== EMPTY) ? 0 : this.halfmove + 1;
    this.side = this.side ^ 1;
    return undo;
  };

  Xiangqi.prototype._revert = function (u) {
    this.board[u.from] = u.piece;
    this.board[u.to] = u.captured;
    this.side = u.side;
    this.halfmove = u.halfmove;
    this.kingIdx = u.kingIdx;
    var k = u.repKey;
    if (u.repCount === 0) this.repetition.delete(k); else this.repetition.set(k, u.repCount);
  };

  /* 正式走子：记录历史 / 重复局面 / 终局判定，返回着法记录 */
  Xiangqi.prototype.makeMove = function (m) {
    var undo = this._apply(m);
    var rec = {
      move: m, notation: this.moveToChinese(m), captured: undo.captured,
      side: undo.side, check: false, mate: false
    };
    this.history.push(rec);
    this._notePosition();
    this.result = this._judge();
    if (this.result && this.result.reason === 'checkmate') rec.mate = true;
    else if (this.result && this.result.reason === 'perpetual-check') rec.check = true;
    else if (this.result && this.result.reason === 'check') rec.check = true;
    return rec;
  };

  Xiangqi.prototype.undoMove = function () {
    var rec = this.history.pop();
    if (!rec) return null;
    var k = this._key(), cnt = this.repetition.get(k) || 0;
    if (cnt <= 1) this.repetition.delete(k); else this.repetition.set(k, cnt - 1);
    this.board[rec.move.from] = rec.move.piece;
    this.board[rec.move.to] = rec.captured;
    this.side = rec.side;
    if (kindOf(rec.move.piece) === K) this.kingIdx[rec.side] = rec.move.from;
    this.halfmove = rec.captured !== EMPTY ? 0 : Math.max(0, this.halfmove - 1);
    this.result = null;
    return rec;
  };

  Xiangqi.prototype._hasAttacker = function (side) {
    for (var i = 0; i < 90; i++) {
      var p = this.board[i];
      if (p !== EMPTY && sideOf(p) === side) {
        var k = kindOf(p);
        if (k === R || k === H || k === C || k === P) return true;
      }
    }
    return false;
  };

  Xiangqi.prototype._judge = function () {
    var side = this.side;
    var moves = this.legalMoves();
    if (moves.length === 0) {
      if (this.inCheck(side)) return { winner: side ^ 1, reason: 'checkmate' };
      return { winner: side ^ 1, reason: 'stalemate' }; // 困毙亦判负
    }
    if (!this._hasAttacker(RED) && !this._hasAttacker(BLACK)) return { winner: 'draw', reason: 'insufficient' };
    if (this.halfmove >= 120) return { winner: 'draw', reason: 'fifty' };
    var cnt = this.repetition.get(this._key()) || 0;
    if (cnt >= 3) {
      if (this.inCheck(side)) return { winner: side, reason: 'perpetual-check' }; // 长将作负
      return { winner: 'draw', reason: 'repetition' };
    }
    return null;
  };

  Xiangqi.prototype.statusText = function () {
    if (!this.result) return this.inCheck(this.side) ? 'check' : 'playing';
    return this.result.reason;
  };

  /* ---------------- 中文记谱 ---------------- */

  Xiangqi.prototype.moveToChinese = function (m) {
    var r1 = rowOf(m.from), c1 = colOf(m.from), r2 = rowOf(m.to), c2 = colOf(m.to);
    var side = sideOf(m.piece), kind = kindOf(m.piece);
    var name = NAMES[side][kind];
    var sameCol = [];
    for (var r = 0; r < 10; r++) {
      var p = this.board[idxOf(r, c1)];
      if (p !== EMPTY && kindOf(p) === kind && sideOf(p) === side) sameCol.push(r);
    }
    sameCol.sort(function (a, b) { return side === RED ? a - b : b - a; }); // 前 → 后
    var myPos = sameCol.indexOf(r1);
    var prefix = '';
    if (sameCol.length === 2) prefix = myPos === 0 ? '前' : '后';
    else if (sameCol.length === 3) prefix = ['前', '中', '后'][myPos];
    else if (sameCol.length > 3) prefix = CN_NUM[myPos] || '';
    var action, param;
    if (r1 === r2) {
      action = '平';
      param = fileStr(side, c2);
    } else {
      var forward = side === RED ? r2 < r1 : r2 > r1;
      action = forward ? '进' : '退';
      if (kind === H || kind === E || kind === A) param = fileStr(side, c2); // 马象士记落点纵线
      else param = numStr(side, Math.abs(r2 - r1));                          // 车炮兵将记步数
    }
    return prefix + name + fileStr(side, c1) + action + param;
  };

  /* ---------------- 测试辅助 ---------------- */

  Xiangqi.prototype.perft = function (depth) {
    if (depth === 0) return 1;
    var moves = this.legalMoves(), n = 0;
    for (var i = 0; i < moves.length; i++) {
      var u = this._apply(moves[i]);
      n += this.perft(depth - 1);
      this._revert(u);
    }
    return n;
  };

  Xiangqi.prototype.divide = function (depth) {
    var moves = this.legalMoves(), lines = [];
    for (var i = 0; i < moves.length; i++) {
      var u = this._apply(moves[i]);
      var n = depth <= 1 ? 1 : this.perft(depth - 1);
      this._revert(u);
      lines.push(this.moveToChinese(moves[i]) + ': ' + n);
    }
    return lines.join('\n');
  };

  // 测试用：从 ASCII 棋盘加载。'.' 空；
  // 红方传统字形：帥 仕 相 傌 俥 炮 兵；黑方：將 士 象 馬 車 砲 卒
  Xiangqi.fromAscii = function (rows, side) {
    var g = new Xiangqi();
    g.board = new Array(90).fill(EMPTY);
    var charMap = {
      '帥': [RED, K], '帅': [RED, K], '仕': [RED, A], '相': [RED, E], '傌': [RED, H], '马': [RED, H], '俥': [RED, R], '车': [RED, R], '炮': [RED, C], '兵': [RED, P],
      '將': [BLACK, K], '将': [BLACK, K], '士': [BLACK, A], '象': [BLACK, E], '馬': [BLACK, H], '車': [BLACK, R], '砲': [BLACK, C], '卒': [BLACK, P]
    };
    for (var r = 0; r < 10; r++) {
      var line = (rows[r] || '').padEnd(9, '.');
      for (var c = 0; c < 9; c++) {
        var ch = line[c];
        if (ch && charMap[ch]) g.board[idxOf(r, c)] = makePiece(charMap[ch][0], charMap[ch][1]);
      }
    }
    g.side = side || RED;
    g.history = []; g.repetition = new Map(); g.halfmove = 0; g.moveNo = 1; g.result = null;
    g.kingIdx = [-1, -1];
    for (var i = 0; i < 90; i++) {
      var p = g.board[i];
      if (p !== EMPTY && kindOf(p) === K) g.kingIdx[sideOf(p)] = i;
    }
    g._notePosition();
    return g;
  };

  var api = {
    Xiangqi: Xiangqi, EMPTY: EMPTY, RED: RED, BLACK: BLACK,
    K: K, A: A, E: E, H: H, R: R, C: C, P: P,
    kindOf: kindOf, sideOf: sideOf, rowOf: rowOf, colOf: colOf, idxOf: idxOf,
    makePiece: makePiece, NAMES: NAMES
  };
  global.XQ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
