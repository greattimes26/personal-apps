/* Gym Tracker — exercise animations.
   Each animation draws a simplified machine plus a figure using it.
   Everything is plain SVG generated in code: no images, works offline. */
(function () {
  'use strict';

  // ---------- geometry helpers ----------
  const L = { torso: 48, neck: 6, head: 9, ua: 27, fa: 25, th: 36, sh: 40, ft: 12 };
  const G = 162; // ground line
  const R = Math.PI / 180;
  const V = (l, d) => [l * Math.cos(d * R), l * Math.sin(d * R)];
  const A = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const S = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const lp = (a, b, t) => a + (b - a) * t;
  const lpP = (p, q, t) => [lp(p[0], q[0], t), lp(p[1], q[1], t)];
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // Ping-pong with short holds: controlled lift, pause, slower lowering.
  function pp(ph) {
    if (ph < 0.08) return 0;
    if (ph < 0.42) return ease((ph - 0.08) / 0.34);
    if (ph < 0.52) return 1;
    if (ph < 0.95) return 1 - ease((ph - 0.52) / 0.43);
    return 0;
  }

  // Two-bone inverse kinematics: returns the middle joint.
  function ik(a, b, l1, l2, bend) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let d = Math.hypot(dx, dy);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
    const base = Math.atan2(dy, dx);
    const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, c)));
    return [a[0] + l1 * Math.cos(ang), a[1] + l1 * Math.sin(ang)];
  }

  // Point moving on a circular arc from `s` to `e` around a pivot
  // offset `off` from the chord midpoint (+/- picks the side).
  function arc(s, e, off) {
    const m = lpP(s, e, 0.5);
    const d = S(e, s);
    const n = Math.hypot(d[0], d[1]);
    const perp = [-d[1] / n, d[0] / n];
    const P = A(m, [perp[0] * off, perp[1] * off]);
    const r = Math.hypot(s[0] - P[0], s[1] - P[1]);
    const a0 = Math.atan2(s[1] - P[1], s[0] - P[0]);
    let a1 = Math.atan2(e[1] - P[1], e[0] - P[0]);
    if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    return { P, r, at: t => { const a = lp(a0, a1, t); return [P[0] + r * Math.cos(a), P[1] + r * Math.sin(a)]; } };
  }

  // ---------- SVG primitives ----------
  const f1 = n => (Math.round(n * 10) / 10).toString();
  const pts = arr => arr.map(p => f1(p[0]) + ',' + f1(p[1])).join(' ');
  const line = (arr, cls) => `<polyline class="${cls}" points="${pts(arr)}"/>`;
  const frame = (...p) => line(p, 'a-frame');
  const pad = (a, b) => line([a, b], 'a-pad');
  const mv = (...p) => line(p, 'a-move');
  const cable = (...p) => line(p, 'a-cable');
  const dot = (p, r, cls) => `<circle class="${cls}" cx="${f1(p[0])}" cy="${f1(p[1])}" r="${r}"/>`;
  const ground = () => `<line class="a-ground" x1="6" y1="${G + 1}" x2="234" y2="${G + 1}"/>`;

  // Weight stack: top plates lift with the movement.
  function stack(x, lift, topY = 30) {
    let s = frame([x, G], [x, topY], [x + 24, topY], [x + 24, G]);
    for (let i = 0; i < 8; i++) {
      const y = G - 2 - (i + 1) * 6;
      const on = i >= 5;
      s += `<rect class="${on ? 'a-plate-on' : 'a-plate'}" x="${x + 3}" y="${f1(y - (on ? lift : 0))}" width="18" height="5" rx="1"/>`;
    }
    const topPlate = G - 2 - 8 * 6 - lift;
    s += cable([x + 12, topPlate], [x + 12, topY]);
    s += dot([x + 12, topY], 3, 'a-pulley');
    return { svg: s, top: [x + 12, topY] };
  }

  function seat(hip, back) {
    let s = pad([hip[0] - 20, hip[1] + 9], [hip[0] + 14, hip[1] + 9]);
    s += frame([hip[0] - 3, hip[1] + 13], [hip[0] - 3, G]);
    s += frame([hip[0] - 20, G], [hip[0] + 16, G]);
    if (back !== undefined) {
      const b0 = A(hip, V(10, back - 90));
      s += pad(b0, A(b0, V(44, back)));
      s += frame(A(hip, [-3, 12]), A(b0, V(18, back)));
    }
    return s;
  }

  // ---------- figure ----------
  function arm(sho, a) {
    if (a.h) {
      const h = A(sho, a.h);
      return { e: ik(sho, h, L.ua, L.fa, a.bend || 1), h };
    }
    const e = A(sho, V(L.ua, a.ua));
    return { e, h: A(e, V(L.fa, a.fa)) };
  }
  function leg(hip, l) {
    let k, an;
    if (l.a) {
      an = A(hip, l.a);
      k = ik(hip, an, L.th, L.sh, l.bend || -1);
    } else {
      k = A(hip, V(L.th, l.th));
      an = A(k, V(L.sh, l.sh));
    }
    return { k, a: an, f: A(an, V(L.ft, l.ft || 0)) };
  }
  function figure(p) {
    const hip = p.hip;
    const sho = A(hip, V(L.torso, p.torso));
    const ha = p.head === undefined ? p.torso : p.head;
    const neck = A(sho, V(L.neck, ha));
    const head = A(neck, V(L.head, ha));
    const off = [-2.5, -1.5];
    return {
      hip, sho, head,
      arm: arm(sho, p.arm),
      arm2: arm(A(sho, off), p.arm2 || p.arm),
      leg: leg(hip, p.leg),
      leg2: leg(A(hip, off), p.leg2 || p.leg)
    };
  }
  function drawFigure(F, mid, gear) {
    let s = '';
    s += line([F.sho, F.arm2.e, F.arm2.h], 'a-far');
    s += line([F.hip, F.leg2.k, F.leg2.a, F.leg2.f], 'a-far');
    s += line([F.hip, F.sho], 'a-body a-torso');
    s += dot(F.head, 9, 'a-head');
    s += line([F.hip, F.leg.k, F.leg.a, F.leg.f], 'a-body');
    s += mid || '';
    s += line([F.sho, F.arm.e, F.arm.h], 'a-body');
    s += gear || '';
    return s;
  }

  // Dumbbell drawings
  const dbEnd = h => dot(h, 6, 'a-db') + dot(h, 2.5, 'a-db-in');
  function dbSide(h, fa) {
    const d = V(9, fa + 90);
    const a = A(h, d), b = S(h, d);
    return line([a, b], 'a-dbbar') + dot(a, 4.5, 'a-db') + dot(b, 4.5, 'a-db');
  }
  const rope = h => line([h, A(h, [-4, 9])], 'a-rope') + line([h, A(h, [4, 9])], 'a-rope');

  // ---------- exercises ----------
  const SEAT_HIP = [110, 118];
  const SEAT_LEG = { th: 0, sh: 90, ft: 0 };
  const STAND_HIP = [118, 84];
  const STAND_LEG = { th: 91, sh: 90, ft: 0 };

  const EX = {};

  EX.chestPress = t => {
    const hip = SEAT_HIP, torso = -96;
    const sho = A(hip, V(L.torso, torso));
    const path = arc(A(sho, [3, 13]), A(sho, [51, -2]), -95);
    const h = path.at(t);
    const st = stack(22, t * 16);
    const top = A(path.P, V(1, 0));
    const leverTop = lpP(h, top, (h[1] - 10) / (h[1] - top[1]));
    return {
      pose: { hip, torso, arm: { h: S(h, sho), bend: 1 }, leg: SEAT_LEG },
      back: st.svg + seat(hip, torso) + frame([60, G], [60, 10], [150, 10]) + cable(st.top, [60, 12]),
      gear: mv(h, leverTop) + line([A(h, [0, -6]), A(h, [0, 6])], 'a-grip')
    };
  };

  EX.inclinePress = t => {
    const hip = SEAT_HIP, torso = -128;
    const sho = A(hip, V(L.torso, torso));
    const path = arc(A(sho, [5, 12]), A(sho, V(51, -42)), 80);
    const h = path.at(t);
    const st = stack(196, t * 16);
    return {
      pose: { hip, torso, head: -110, arm: { h: S(h, sho), bend: 1 }, leg: SEAT_LEG },
      back: st.svg + seat(hip, torso) + frame(path.P, [path.P[0], G]) + cable(st.top, [st.top[0] - 30, 30], path.P),
      gear: mv(h, path.P) + dot(path.P, 3.5, 'a-pulley') + line([A(h, [-4, -5]), A(h, [4, 5])], 'a-grip')
    };
  };

  EX.pecDeck = t => {
    const cx = 120, sy = 64, hy = 116;
    const phi = lp(0, 108, t) * R;
    let s = '';
    s += frame([52, G], [52, 12], [188, 12], [188, G]);
    s += `<rect class="a-padfill" x="${cx - 19}" y="${sy - 14}" width="38" height="${hy - sy + 12}" rx="7"/>`;
    s += `<rect class="a-padfill" x="${cx - 26}" y="${hy + 2}" width="52" height="9" rx="4"/>`;
    s += frame([cx, hy + 11], [cx, G]) + frame([cx - 22, G], [cx + 22, G]);
    // legs (towards viewer)
    for (const sd of [-1, 1]) {
      s += line([[cx + sd * 8, hy], [cx + sd * 13, hy + 14], [cx + sd * 14, G - 3], [cx + sd * 19, G - 2]], 'a-body');
    }
    s += `<rect class="a-torsofill" x="${cx - 12}" y="${sy - 2}" width="24" height="${hy - sy + 4}" rx="9"/>`;
    s += line([[cx - 17, sy], [cx + 17, sy]], 'a-body');
    s += dot([cx, sy - 17], 9, 'a-head');
    for (const sd of [-1, 1]) {
      const sho = [cx + sd * 17, sy];
      const e = [sho[0] + sd * L.ua * Math.cos(phi), sy + 2];
      const h = [e[0], sy - 24];
      s += line([[e[0], sy + 6], [e[0], sy - 28]], 'a-movepad');
      s += mv([e[0], sy - 28], [cx + sd * 30, 12]);
      s += line([sho, e, h], 'a-body');
    }
    return { raw: s };
  };

  EX.latPulldown = t => {
    const hip = SEAT_HIP, torso = -100;
    const sho = A(hip, V(L.torso, torso));
    const h = lpP(A(sho, [5, -49]), A(sho, [8, 5]), t);
    const st = stack(196, t * 18, 14);
    const pul = [h[0], 12];
    return {
      pose: { hip, torso, arm: { h: S(h, sho), bend: 1 }, leg: SEAT_LEG },
      back: st.svg + seat(hip) + frame([60, G], [60, 8], [196, 8]) + cable(st.top, [196, 10], pul, h) + dot(pul, 3, 'a-pulley'),
      mid: pad([hip[0] + 26, hip[1] - 9], [hip[0] + 40, hip[1] - 9]),
      gear: line([A(h, [-10, -1]), A(h, [10, 1])], 'a-bar')
    };
  };

  EX.dbCurl = t => {
    const fa = lp(86, -72, t);
    const a = { ua: 94, fa };
    return {
      pose: { hip: STAND_HIP, torso: -92, arm: a, leg: STAND_LEG },
      gear: '', back: '',
      after: F => dbEnd(F.arm.h)
    };
  };

  EX.hammerCurl = t => {
    const fa = lp(86, -72, t);
    return {
      pose: { hip: STAND_HIP, torso: -92, arm: { ua: 94, fa }, leg: STAND_LEG },
      after: F => dbSide(F.arm.h, fa)
    };
  };

  EX.cableCurl = t => {
    const fa = lp(80, -70, t);
    const st = stack(204, t * 14);
    const pul = [196, G - 6];
    return {
      pose: { hip: [112, 84], torso: -93, arm: { ua: 96, fa }, leg: STAND_LEG },
      back: st.svg + frame([204, G - 6], pul) + dot(pul, 3, 'a-pulley'),
      after: F => cable(st.top, [216, 20], [216, G - 6], pul, F.arm.h) + line([A(F.arm.h, [-2, -8]), A(F.arm.h, [2, 8])], 'a-bar')
    };
  };

  EX.ropePushdown = t => {
    const fa = lp(-28, 86, t);
    const st = stack(204, t * 16);
    const pul = [180, 18];
    return {
      pose: { hip: [112, 84], torso: -84, head: -80, arm: { ua: 98, fa }, leg: STAND_LEG },
      back: st.svg + frame([204, 18], pul) + dot(pul, 3, 'a-pulley'),
      after: F => cable(st.top, pul, F.arm.h) + rope(F.arm.h)
    };
  };

  EX.overheadExt = t => {
    const fa = lp(112, 266, t);
    const st = stack(12, t * 14);
    const pul = [44, G - 5];
    return {
      pose: { hip: [124, 118], torso: -92, head: -80, arm: { ua: -100, fa }, leg: SEAT_LEG },
      back: st.svg + seat([124, 118]) + frame([36, G - 5], pul) + dot(pul, 3, 'a-pulley'),
      after: F => cable(st.top, [24, 20], [24, G - 5], pul, F.arm.h) + rope(F.arm.h)
    };
  };

  EX.preacherCurl = t => {
    const hip = [100, 118], torso = -72, ua = 38;
    const fa = lp(32, -98, t);
    const sho = A(hip, V(L.torso, torso));
    const el = A(sho, V(L.ua, ua));
    const o = V(7, ua + 90);
    const st = stack(200, t * 14);
    return {
      pose: { hip, torso, head: -60, arm: { ua, fa }, leg: SEAT_LEG },
      back: st.svg + seat(hip) + frame(A(el, [4, 14]), [el[0] + 4, G]) + cable(st.top, [190, 40], A(el, [6, 6])),
      gear: pad(A(A(sho, V(6, ua)), o), A(el, A(o, V(4, ua)))) + mv(A(el, V(3, fa + 90)), A(el, V(27, fa))) + line([A(el, V(26, fa)), A(el, A(V(26, fa), V(6, fa + 90)))], 'a-grip')
    };
  };

  EX.seatedDip = t => {
    const hip = SEAT_HIP, torso = -92;
    const sho = A(hip, V(L.torso, torso));
    const path = arc(A(sho, [8, 18]), A(sho, [3, 51]), 70);
    const h = path.at(t);
    const st = stack(18, t * 16);
    return {
      pose: { hip, torso, arm: { h: S(h, sho), bend: 1 }, leg: SEAT_LEG },
      back: st.svg + seat(hip, torso) + frame([54, G], [54, 30]) + cable(st.top, [54, 30]),
      gear: mv(h, path.P) + line([A(h, [0, -6]), A(h, [0, 6])], 'a-grip')
    };
  };

  EX.legPress = t => {
    const hip = [78, 120], torso = -152;
    const dir = -14;
    const a = lpP(V(40, -40), V(73, dir), t);
    const an = A(hip, a);
    const pf = A(an, V(5, dir));
    const p1 = A(pf, V(22, dir - 90)), p2 = A(pf, V(14, dir + 90));
    const railS = A(hip, A(V(44, dir), [0, 26])), railE = A(railS, V(110, dir));
    return {
      pose: { hip, torso, head: -125, arm: { ua: 70, fa: 12 }, leg: { a, bend: -1, ft: dir - 90 } },
      back: frame(railS, railE) + frame([railS[0], G], railS) + frame([railE[0], G], railE) +
        pad(A(hip, [-4, 10]), A(hip, [22, 10])) + pad(A(hip, V(10, torso - 90)), A(A(hip, V(10, torso - 90)), V(46, torso))) +
        frame([hip[0] + 6, hip[1] + 14], [hip[0] + 6, G]),
      gear: mv(p1, p2) + mv(A(p2, V(4, dir + 90)), lpP(railS, railE, 0.2 + 0.25 * t))
    };
  };

  EX.legExtension = t => {
    const hip = [104, 118], torso = -96;
    const sh = lp(88, -2, t);
    const k = A(hip, V(L.th, 0));
    const padP = A(A(k, V(34, sh)), V(7, sh - 90));
    const st = stack(196, t * 16);
    return {
      pose: { hip, torso, arm: { ua: 82, fa: 30 }, leg: { th: 0, sh, ft: sh - 90 } },
      back: st.svg + seat(hip, torso) + cable(st.top, [170, 34], k),
      gear: mv(k, padP) + dot(padP, 6, 'a-roller') + dot(k, 3, 'a-pulley')
    };
  };

  EX.legCurl = t => {
    const hip = [124, 112];
    const sh = lp(2, -102, t);
    const k = A(hip, V(L.th, 0));
    const roll = A(A(k, V(33, sh)), V(7, sh - 90));
    const st = stack(12, t * 14);
    return {
      pose: { hip, torso: 180, head: 186, arm: { ua: 128, fa: 92 }, leg: { th: 0, sh, ft: sh + 90 } },
      back: st.svg + pad([48, 121], [160, 121]) + frame([62, 125], [62, G]) + frame([148, 125], [148, G]) +
        frame([46, 125], [46, 150]) + cable(st.top, [40, 30], [40, 132], k),
      gear: mv(k, roll) + dot(roll, 6, 'a-roller') + dot(k, 3, 'a-pulley')
    };
  };

  EX.calfRaise = t => {
    const toe = [140, 157];
    const ft = lp(-22, 38, t);
    const an = S(toe, V(L.ft, ft));
    const k = A(an, [0, -L.sh]);
    const hip = A(k, [0, -L.th]);
    const sho = A(hip, V(L.torso, -90));
    const padY = sho[1] - 5;
    const st = stack(18, t * 12);
    return {
      pose: { hip, torso: -90, arm: { h: [6, -8], bend: 1 }, leg: { a: S(an, hip), bend: -1, ft } },
      back: st.svg + `<rect class="a-step" x="112" y="157" width="34" height="${G - 157}" rx="2"/>` + frame([60, G], [60, 18]) + cable(st.top, [60, 20]),
      gear: mv([60, padY + 22], [sho[0] - 6, padY]) + pad([sho[0] - 8, padY], [sho[0] + 8, padY])
    };
  };

  EX.machineCrunch = t => {
    const hip = SEAT_HIP;
    const torso = lp(-96, -52, t);
    const sho = A(hip, V(L.torso, torso));
    const piv = A(hip, [16, -4]);
    const padA = A(sho, V(10, torso + 90));
    const st = stack(196, t * 14);
    return {
      pose: { hip, torso, head: torso + 12, arm: { ua: torso + 125, fa: torso - 25 }, leg: SEAT_LEG },
      back: st.svg + seat(hip) + cable(st.top, [176, 40], piv),
      mid: mv(piv, padA) + pad(A(padA, V(8, torso + 180)), A(padA, V(8, torso))),
      gear: dot(piv, 3, 'a-pulley')
    };
  };

  EX.plank = t => {
    const breathe = Math.sin(t * Math.PI * 2) * 0.8;
    const elbowY = 154;
    const sho = [82, elbowY - L.ua];
    const hip = [sho[0] + 47.5, sho[1] + 6.7 + breathe];
    const guide = 0.35 + 0.35 * Math.sin(t * Math.PI * 2);
    return {
      pose: { hip, torso: Math.atan2(sho[1] - hip[1], sho[0] - hip[0]) / R, head: 196, arm: { ua: 90, fa: 180 }, leg: { th: 7.5, sh: 7.5, ft: 84 } },
      back: `<rect class="a-mat" x="40" y="${G - 6}" width="170" height="6" rx="3"/>`,
      after: F => `<line class="a-guide" style="opacity:${guide.toFixed(2)}" x1="${f1(F.sho[0])}" y1="${f1(F.sho[1] - 9)}" x2="${f1(F.leg.a[0])}" y2="${f1(F.leg.a[1] - 9)}"/>`,
      cyc: true
    };
  };

  function walkPose(ph, hip) {
    const s = Math.sin(ph * 2 * Math.PI);
    const legAt = v => ({ th: 90 + 24 * v, sh: 90 + 24 * v + (v < 0 ? -34 * v : 4), ft: 0 });
    const armAt = v => ({ ua: 90 - 20 * v, fa: 90 - 20 * v - 30 });
    return {
      hip: [hip[0], hip[1] - Math.abs(Math.cos(ph * 2 * Math.PI)) * 1.6],
      torso: -86, head: -84,
      leg: legAt(s), leg2: legAt(-s), arm: armAt(-s), arm2: armAt(s)
    };
  }
  EX.inclineWalk = ph => {
    const belt = [[30, 156], [200, 142]];
    return {
      pose: walkPose(ph, [118, 80]),
      back: line(belt, 'a-belt') + frame([30, 158], [30, G]) + frame([200, 145], [210, G]) + frame([200, 142], [206, 92], [190, 90]),
      cyc: true, period: 1700
    };
  };

  EX.bike = ph => {
    const hip = [100, 106];
    const C = [146, 140];
    const pa = ph * 360;
    const ped = A(C, V(13, pa));
    const ped2 = A(C, V(13, pa + 180));
    const bar = [178, 72];
    const torso = -62;
    const sho = A(hip, V(L.torso, torso));
    return {
      pose: {
        hip, torso, head: -40,
        arm: { h: S(bar, sho), bend: 1 },
        leg: { a: S(ped, hip), bend: -1, ft: 8 }, leg2: { a: S(ped2, A(hip, [-2.5, -1.5])), bend: -1, ft: 8 }
      },
      back: pad([86, 114], [110, 114]) + frame([98, 118], C, [190, 140]) + frame([174, 76], [186, 140]) +
        frame([70, G], [200, G]) + frame([100, 118], [86, G]) + `<circle class="a-wheel" cx="190" cy="140" r="17"/>` +
        line([A(C, V(13, pa + 180)), ped], 'a-crank') + dot(C, 3.5, 'a-pulley'),
      cyc: true, period: 1300
    };
  };

  EX.seatedRow = t => {
    const hip = [96, 118], torso = -92;
    const sho = A(hip, V(L.torso, torso));
    const h = lpP(A(sho, [52, 8]), A(sho, [6, 14]), t);
    const st = stack(204, t * 16);
    const pul = [200, h[1]];
    const legP = { th: -12, sh: 58, ft: -32 };
    return {
      pose: { hip, torso, arm: { h: S(h, sho), bend: 1 }, leg: legP },
      back: st.svg + seat(hip) + frame([168, 120], [174, G]) + frame([200, h[1] - 8], [204, h[1] - 8]) + dot(pul, 3, 'a-pulley'),
      mid: pad([168, 118], [158, 150]),
      gear: cable(st.top, [228, 30], [228, h[1]], pul, h) + line([A(h, [0, -6]), A(h, [0, 6])], 'a-grip')
    };
  };

  EX.cableFly = t => {
    const ua = lp(104, -38, t);
    const st = stack(40, 6 + t * 12);
    const pul = [76, G - 6];
    return {
      pose: { hip: [124, 84], torso: -86, arm: { ua, fa: ua - 10 }, leg: { th: 86, sh: 92, ft: 0 }, leg2: { th: 100, sh: 90, ft: 0 } },
      back: st.svg + frame([64, G - 6], pul) + dot(pul, 3, 'a-pulley'),
      after: F => cable(st.top, [52, 20], [52, G - 8], pul, F.arm.h) + line([A(F.arm.h, [-3, -6]), A(F.arm.h, [3, 6])], 'a-grip')
    };
  };

  // Front-view helpers for seated machines seen from the front or back.
  function seatedFront(cx, sy, hy, legs) {
    let s = '';
    s += `<rect class="a-padfill" x="${cx - 26}" y="${hy + 2}" width="52" height="9" rx="4"/>`;
    s += frame([cx, hy + 11], [cx, G]) + frame([cx - 22, G], [cx + 22, G]);
    s += legs;
    s += `<rect class="a-torsofill" x="${cx - 12}" y="${sy - 2}" width="24" height="${hy - sy + 4}" rx="9"/>`;
    s += line([[cx - 17, sy], [cx + 17, sy]], 'a-body');
    s += dot([cx, sy - 17], 9, 'a-head');
    return s;
  }

  EX.hipAbduction = t => {
    const cx = 120, sy = 64, hy = 116;
    let legs = '', pads = '';
    for (const sd of [-1, 1]) {
      const knee = [cx + sd * (13 + 24 * t), hy + 13];
      const ankle = [cx + sd * (14 + 16 * t), G - 3];
      legs += line([[cx + sd * 8, hy], knee, ankle, [ankle[0] + sd * 5, G - 2]], 'a-body');
      const p = [knee[0] + sd * 7, knee[1]];
      pads += line([[p[0], p[1] - 9], [p[0], p[1] + 9]], 'a-movepad') + mv([p[0], p[1] + 9], [cx + sd * 6, hy + 24]);
    }
    let s = `<rect class="a-padfill" x="${cx - 19}" y="${sy - 14}" width="38" height="${hy - sy + 12}" rx="7"/>`;
    s += seatedFront(cx, sy, hy, legs) + pads;
    for (const sd of [-1, 1]) {
      const sho = [cx + sd * 17, sy];
      const h = [cx + sd * 30, hy + 2];
      s += line([sho, [cx + sd * 27, sy + 26], h], 'a-body') + line([[h[0], h[1] - 4], [h[0], h[1] + 6]], 'a-grip');
    }
    return { raw: s };
  };

  EX.rearDelt = t => {
    const cx = 120, sy = 64, hy = 116;
    const phi = lp(84, 4, t) * R;
    let legs = '';
    for (const sd of [-1, 1]) legs += line([[cx + sd * 8, hy], [cx + sd * 13, hy + 14], [cx + sd * 14, G - 3], [cx + sd * 19, G - 2]], 'a-body');
    let s = frame([52, G], [52, 12], [188, 12], [188, G]);
    s += `<rect class="a-padfill" x="${cx - 15}" y="${sy - 4}" width="30" height="${hy - sy - 6}" rx="7"/>`;
    s += seatedFront(cx, sy, hy, legs);
    for (const sd of [-1, 1]) {
      const sho = [cx + sd * 17, sy];
      const h = [sho[0] + sd * 52 * Math.cos(phi), sy + 2];
      s += mv([h[0], sy - 6], [cx + sd * 30, 12]);
      s += line([sho, h], 'a-body') + line([[h[0], h[1] - 7], [h[0], h[1] + 7]], 'a-grip');
    }
    return { raw: s };
  };

  EX.gluteBridge = t => {
    const A0 = [166, 152];
    const H = [118, lp(150, 124, t)];
    const target = [70, 151];
    const tang = Math.atan2(target[1] - H[1], target[0] - H[0]) / R;
    return {
      pose: { hip: H, torso: tang, head: tang + 8, arm: { ua: tang + 186, fa: tang + 182 }, leg: { a: S(A0, H), bend: -1, ft: 8 } },
      back: `<rect class="a-mat" x="34" y="${G - 6}" width="170" height="6" rx="3"/>`
    };
  };

  EX.backExtension = t => {
    const ankle = [186, 148];
    const hip = A(ankle, V(L.th + L.sh, -135));
    const torso = lp(128, 225, t);
    const off = V(9, 135);
    return {
      pose: { hip, torso, head: torso, arm: { ua: torso + 150, fa: torso - 30 }, leg: { th: 45, sh: 45, ft: -45 } },
      back: pad(A(hip, off), A(A(hip, V(24, 45)), off)) + frame(A(A(hip, V(14, 45)), A(off, off)), [hip[0] + 6, G]) +
        frame([hip[0] + 6, G], [ankle[0] + 10, G], A(ankle, [6, 10])) + dot(A(ankle, V(7, -45)), 5, 'a-roller')
    };
  };

  // ---------- render / play ----------
  function frameSvg(id, ph) {
    const fn = EX[id];
    if (!fn) return '';
    const probe = fn(0);
    const cyc = !!probe.cyc;
    const r = fn(cyc ? ph : pp(ph));
    if (r.raw) return ground() + r.raw;
    const F = figure(r.pose);
    return ground() + (r.back || '') + drawFigure(F, r.mid, r.gear) + (r.after ? r.after(F) : '');
  }

  function periodOf(id) {
    const fn = EX[id];
    return (fn && fn(0).period) || 3200;
  }

  function play(svg, id) {
    let raf = 0, start = performance.now(), alive = true;
    const per = periodOf(id);
    svg.setAttribute('viewBox', '0 0 240 170');
    const tick = now => {
      if (!alive) return;
      svg.innerHTML = frameSvg(id, ((now - start) % per) / per);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }

  window.GymAnim = { play, frameSvg, ids: Object.keys(EX), has: id => !!EX[id] };
})();
