/* 规则引擎单元测试：node test/rules.test.js
 * 注意：行字符串按列填充，'..仕.帅....' 表示 仕@col2、帅@col4。 */
'use strict';
const assert = require('assert');
const XQ = require('../js/rules.js');
const { Xiangqi, RED, BLACK, K, A, E, H, R, C, P, rowOf, colOf, idxOf } = XQ;

let passed = 0;
function ok(cond, msg) { assert(cond, msg); passed++; console.log('  ✓ ' + msg); }
function section(t) { console.log('\n== ' + t + ' =='); }
const at = (r, c) => idxOf(r, c);

/* ---------- perft 权威值校验 ---------- */
section('Perft（对照 Chess Programming Wiki 参考值）');
{
  const g = new Xiangqi();
  ok(g.perft(1) === 44, `perft(1) = 44（实际 ${g.perft(1)}）`);
  ok(g.perft(2) === 1920, `perft(2) = 1920（实际 ${g.perft(2)}）`);
  const p3 = g.perft(3);
  ok(p3 === 79666, `perft(3) = 79666（实际 ${p3}）`);
}

/* ---------- 炮：隔山打牛（初始局面红炮可隔黑炮吃黑马） ---------- */
section('炮的隔山打牛');
{
  const g = new Xiangqi();
  const targets = g.legalMovesFrom(at(7, 1)).map(m => m.to);
  ok(targets.includes(at(0, 1)), '红炮(7,1)可隔黑炮(2,1)吃底线黑马(0,1)');
  ok(!targets.includes(at(2, 1)), '红炮不能吃无炮架相隔的黑炮(2,1)');
  ok(!targets.includes(at(1, 1)), '红炮不能越过炮架走到空格(1,1)');
  ok(targets.length === 12, `红炮初始 12 个合法目标（实际 ${targets.length}）`);
}

/* ---------- 马：蹩马腿 ---------- */
section('马走日与蹩马腿');
{
  const g = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '...傌.....'], RED);
  ok(g.legalMovesFrom(at(9, 3)).length === 4, '空旷处马有 4 着');
  const g2 = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '...卒....', '...傌.....'], RED);
  const t2 = g2.legalMovesFrom(at(9, 3)).map(m => m.to).sort();
  ok(t2.length === 2 && t2.includes(at(8, 1)) && t2.includes(at(8, 5)), '马腿(8,3)被占 → 仅剩(8,1)(8,5)');
}

/* ---------- 象：塞象眼 + 不过河 ---------- */
section('象走田、塞象眼、不过河');
{
  const g = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '..相.....'], RED);
  const t = g.legalMovesFrom(at(9, 2)).map(m => m.to).sort();
  ok(t.length === 2 && t.includes(at(7, 0)) && t.includes(at(7, 4)), '田字中心空时象可走两角');
  const g2 = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.卒......', '..相.....'], RED);
  const t2 = g2.legalMovesFrom(at(9, 2)).map(m => m.to);
  ok(t2.length === 1 && t2[0] === at(7, 4), '塞住(8,1)象眼后仅剩(7,4)');
  const g3 = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '..相.....', '.........', '.........', '.........', '.........'], RED);
  const t3 = g3.legalMovesFrom(at(5, 2)).map(m => m.to);
  ok(t3.includes(at(7, 0)) && t3.includes(at(7, 4)) && !t3.includes(at(3, 0)) && !t3.includes(at(3, 4)),
    '河界处的象不能下河（row<5）');
}

/* ---------- 士/将：九宫约束 ---------- */
section('士与将的九宫约束');
{
  // 仕@(7,2)，帅@(7,4)
  const g = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '..仕.帅....', '.........', '.........'], RED);
  const adv = g.legalMovesFrom(at(7, 2)).map(m => m.to);
  ok(adv.length === 1 && adv[0] === at(8, 3), '边角仕只能斜进九宫中心一格');
  const king = g.legalMovesFrom(at(7, 4)).map(m => m.to).sort();
  ok(king.length === 3 && king.includes(at(8, 4)) && king.includes(at(7, 3)) && king.includes(at(7, 5)),
    '帅可走九宫内相邻格（上/左/右）');
  ok(!king.includes(at(6, 4)) && !king.includes(at(7, 2)), '帅不能出九宫、不能吃己方仕');
}

/* ---------- 兵：方向与过河 ---------- */
section('兵的走法');
{
  const g = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '...兵.....', '.........', '.........', '.........', '....帅....'], RED);
  const before = g.legalMovesFrom(at(5, 3)).map(m => m.to);
  ok(before.length === 1 && before[0] === at(4, 3), '未过河兵只能向前');
  const g2 = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '...兵.....', '.........', '.........', '.........', '.........', '....帅....'], RED);
  const after = g2.legalMovesFrom(at(4, 3)).map(m => m.to).sort();
  ok(after.length === 3 && after.includes(at(3, 3)) && after.includes(at(4, 2)) && after.includes(at(4, 4)), '过河兵可向前及左右');
  const g3 = Xiangqi.fromAscii(['...兵.....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '....帅....'], RED);
  const bottom = g3.legalMovesFrom(at(0, 3)).map(m => m.to).sort();
  ok(bottom.length === 2 && bottom.includes(at(0, 2)) && bottom.includes(at(0, 4)), '底兵（第0排）不能向前，只能横行');
}

/* ---------- 车 ---------- */
section('车的滑行、阻挡与吃子');
{
  const g = Xiangqi.fromAscii(['..車......', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '..俥......'], RED);
  const t = g.legalMovesFrom(at(9, 2)).map(m => m.to);
  ok(t.includes(at(0, 2)), '车可吃同纵线敌子');
  ok(t.includes(at(9, 0)) && t.includes(at(9, 8)), '车可横线全行');
  const g2 = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '..俥.兵....'], RED);
  const t2 = g2.legalMovesFrom(at(9, 2)).map(m => m.to);
  ok(!t2.includes(at(9, 4)) && !t2.includes(at(9, 5)), '车被己方兵阻挡不能越过');
  const g3 = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '..俥.卒....'], RED);
  const t3 = g3.legalMovesFrom(at(9, 2)).map(m => m.to);
  ok(t3.includes(at(9, 4)), '车可吃横线敌子');
}

/* ---------- 飞将 ---------- */
section('飞将（将帅照面）');
{
  const g = Xiangqi.fromAscii(['....将....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '....帅....'], RED);
  ok(g.inCheck(BLACK) && g.inCheck(RED), '双方主将同线无阻隔 → 互相视为受攻击');
  const gb = Xiangqi.fromAscii(['....将....', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '....帅....'], BLACK);
  ok(gb.legalMovesFrom(at(0, 4)).some(m => m.to === at(0, 3)), '黑将横移可解除照面');
  const g2 = Xiangqi.fromAscii(['....将....', '.........', '....卒....', '.........', '.........', '.........', '.........', '.........', '.........', '....帅....'], RED);
  ok(!g2.inCheck(BLACK) && !g2.inCheck(RED), '中间有子阻隔则照面不成立');
}

/* ---------- 将军 / 将死 / 困毙 ---------- */
section('将军、将死与困毙');
{
  // 将死：黑将(0,4) 孤立；红帅(9,3)，红俥(0,0) 横线照将，红俥(1,0) 封住第 1 排
  const mate = Xiangqi.fromAscii(['俥...将....', '俥........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '...帅.....'], BLACK);
  ok(mate.inCheck(BLACK), '黑方被车将军');
  ok(mate.legalMoves().length === 0, '黑方无合法着法');
  const rec = mate._judge();
  ok(rec.reason === 'checkmate' && rec.winner === RED, '判定为红方将死胜');
  // 困毙：黑将(0,4) 双士(0,3)(0,5) 被红车(0,0)(0,8) 沿底线牵制；
  // 红车(1,0) 控制第 1 排封死三出路；无将军
  const stale = Xiangqi.fromAscii([
    '...士将士...', // 将(0,4) 士(0,3) 士(0,5)
    '俥........',   // 红俥(1,0) 控制第 1 排
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '...帅.....'    // 红帅(9,3)
  ], BLACK);
  stale.board[at(0, 0)] = XQ.makePiece(RED, R); // 牵制士(0,3)
  stale.board[at(0, 8)] = XQ.makePiece(RED, R); // 牵制士(0,5)
  ok(!stale.inCheck(BLACK), '困毙局面黑方未被将军');
  ok(stale.legalMoves().length === 0, '黑方无合法着法（双士被牵、三出路被封）');
  const rec2 = stale._judge();
  ok(rec2.reason === 'stalemate' && rec2.winner === RED, '困毙判黑方负');
}

/* ---------- 和棋条件 ---------- */
section('和棋判定');
{
  const gK = Xiangqi.fromAscii([
    '..象.将....', // 象(0,2) 将(0,4)
    '...士.....',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '...仕.....',
    '..相帅.....'  // 相(9,2) 帅(9,3)
  ], RED);
  ok(!gK._hasAttacker(RED) && !gK._hasAttacker(BLACK), '双方均无车马炮兵');
  ok(gK._judge().reason === 'insufficient', '双方无攻击子力 → 例和');
  const g2 = new Xiangqi();
  g2.halfmove = 120;
  ok(g2._judge().reason === 'fifty', '120ply 无吃子 → 自然限着作和');
  g2.halfmove = 119;
  ok(g2._judge() === null, '119ply 未触限');
  const g3 = new Xiangqi();
  // 双方原样往返：相三进五/相五退三、士6进5/士5退6，两轮后回到初始局面
  const seq = [[at(9, 6), at(7, 4)], [at(0, 5), at(1, 4)], [at(7, 4), at(9, 6)], [at(1, 4), at(0, 5)]];
  let applied = 0;
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const [f, t] of seq) {
      const ms = g3.legalMoves().filter(m => m.from === f && m.to === t);
      if (ms.length) { g3.makeMove(ms[0]); applied++; }
    }
  }
  ok(applied === 8, `往返序列 8 着全部成立（实际 ${applied}）`);
  ok((g3.repetition.get(g3._key()) || 0) >= 3, '局面重复出现 3 次');
  ok(g3.result && g3.result.reason === 'repetition' && g3.result.winner === 'draw', '三次重复（非长将）→ 判和');
}

/* ---------- 长将判负 ---------- */
section('长将判负');
{
  const g3 = Xiangqi.fromAscii([
    '....将....',
    '俥........',  // 车(1,0) 横线照将
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '....帅....'
  ], BLACK);
  ok(g3.inCheck(BLACK), '黑方被红车将军');
  g3.repetition.set(g3._key(), 3);
  const rec = g3._judge();
  ok(rec.reason === 'perpetual-check' && rec.winner === BLACK, '三次重复且黑方被将军 → 长将方（红）判负');
}

/* ---------- 中文记谱 ---------- */
section('中文记谱');
{
  const g = new Xiangqi();
  const find = (f, t) => g.legalMoves().find(m => m.from === f && m.to === t);
  ok(g.moveToChinese(find(at(7, 7), at(7, 4))) === '炮二平五', '红 炮二平五');
  ok(g.moveToChinese(find(at(9, 7), at(7, 6))) === '马二进三', '红 马二进三');
  ok(g.moveToChinese(find(at(6, 2), at(5, 2))) === '兵七进一', '红 兵七进一');
  ok(g.moveToChinese(find(at(7, 1), at(0, 1))) === '炮八进七', '红 炮八进七（隔炮吃马，7 步）');
  g.makeMove(find(at(7, 7), at(7, 4)));  // 红 炮二平五
  ok(g.moveToChinese(g.legalMoves().find(m => m.from === at(0, 7) && m.to === at(2, 6))) === '马8进7', '黑 马8进7');
  ok(g.moveToChinese(g.legalMoves().find(m => m.from === at(2, 7) && m.to === at(2, 4))) === '炮8平5', '黑 炮8平5（顺炮）');
  const g2 = Xiangqi.fromAscii(['.........', '.........', '.........', '.........', '...兵.....', '.........', '.........', '.........', '.........', '....帅....'], RED);
  ok(g2.moveToChinese(g2.legalMovesFrom(at(4, 3)).find(m => m.to === at(4, 4))) === '兵六平五', '红 兵六平五（过河横吃）');
  // 车进退记步数（新开局，红方行棋）
  const g3 = new Xiangqi();
  ok(g3.moveToChinese(g3.legalMoves().find(m => m.from === at(9, 0) && m.to === at(8, 0))) === '车九进一', '红 车九进一');
}

/* ---------- 同线同兵种 前/后 前缀 ---------- */
section('同线同兵种的 前/后 前缀');
{
  // 双车同在九纵线（col 0）：(5,0) 前、(7,0) 后
  const g = Xiangqi.fromAscii([
    '.........', '.........', '.........', '.........', '.........',
    '俥........', '.........', '俥........', '.........', '....帅....'
  ], RED);
  ok(g.moveToChinese(g.legalMovesFrom(at(5, 0)).find(m => m.to === at(4, 0))) === '前车九进一', '前车九进一');
  ok(g.moveToChinese(g.legalMovesFrom(at(7, 0)).find(m => m.to === at(8, 0))) === '后车九退一', '后车九退一');
}

/* ---------- makeMove/undoMove 一致性 ---------- */
section('走子/撤销一致性');
{
  const g = new Xiangqi();
  const snap = g.board.join('') + g.side;
  const ms = g.legalMoves();
  for (const m of ms) { const u = g._apply(m); g._revert(u); }
  ok(g.board.join('') + g.side === snap, '全部着法 apply/revert 后局面还原');
  const m = ms[0];
  g.makeMove(m);
  const h = g.history.length;
  g.undoMove();
  ok(g.board.join('') + g.side === snap && g.history.length === h - 1, 'makeMove/undoMove 还原');
}

console.log(`\n全部通过：${passed} 项断言 ✔`);
