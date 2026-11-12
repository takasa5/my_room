// 夕暮れの部屋を小さなレイトレーサで描き、輝度を文字の密度に置き換える（点描 AA）。
// 出力: cols×rows のセルごとに { 文字, 色, 家具ID }。
(function () {
  "use strict";

  // ---- 乱数・ハッシュ ---------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const hash2 = (a, b) => hash(a * 57.0 + b * 113.0);
  const frac = (x) => x - Math.floor(x);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  // ---- 部屋の寸法（デスクに寄ったカメラ。奥の壁 z=RZ1 に机が付いている） ----
  const RX0 = -1.6, RX1 = 1.6, RY = 2.6, RZ0 = -2.5, RZ1 = 0.75;
  const WIN = { x0: -0.9, x1: -0.1, y0: 1.02, y1: 1.62 };
  const TOP = 0.75; // 天板の高さ
  const TRI_COLOR = [0.12, 0.12, 0.13];   // 写真立ての正三角形の色
  // 壁のポスター（縦長）。柄は tex.poster* として増やし、ここで選ぶ
  const POSTER = "happy";
  const POSTER_TALL = { x0: 0.34, x1: 0.55, y0: 1.34, y1: 1.64 };   // モニター上端（1.27）から少し離す

  // ---- マテリアル --------------------------------------------------------
  const M = (c, extra) => Object.assign({ c }, extra || {});
  const plaster = [0.80, 0.74, 0.66];

  const tex = {
    floor(p) {
      const w = 0.2, plank = Math.floor((p[0] + 10) / w);
      const k = 0.72 + 0.4 * hash(plank);
      return frac((p[0] + 10) / w) < 0.04 ? [0.25, 0.17, 0.11] : [0.56 * k, 0.38 * k, 0.24 * k];
    },
    wall(p) {
      const k = 0.96 + 0.04 * hash2(Math.floor(p[0] * 60 + p[2] * 60), Math.floor(p[1] * 60));
      return [plaster[0] * k, plaster[1] * k, plaster[2] * k];
    },
    desk(p) {
      const g = Math.sin(p[0] * 9 + Math.sin(p[2] * 23) * 0.8) * 0.5 + 0.5;
      const k = 0.85 + 0.18 * g + 0.05 * Math.sin(p[0] * 140);
      return [0.55 * k, 0.37 * k, 0.22 * k];
    },
    // 縦長ポスター: 白地に黄色の手書きタイトル、中央に電車の車内の写真帯（赤い座席・4人）
    posterHappy(p) {
      const P = POSTER_TALL, u = (p[0] - P.x0) / (P.x1 - P.x0), v = (p[1] - P.y0) / (P.y1 - P.y0);
      const asp = (P.x1 - P.x0) / (P.y1 - P.y0);
      const seg = (ax, ay, bx, by, w) => {
        const vx = bx - ax, vy = by - ay, t = clamp(((u - ax) * vx * asp * asp + (v - ay) * vy) / (vx * vx * asp * asp + vy * vy), 0, 1);
        return Math.hypot((u - ax - vx * t) * asp, v - ay - vy * t) < w;
      };
      const circ = (cx, cy, r) => Math.hypot((u - cx) * asp, v - cy) < r;
      const paper = [0.96, 0.95, 0.91], ink = [0.12, 0.11, 0.1], yellow = [0.98, 0.78, 0.08];
      if (u < 0.03 || u > 0.97 || v < 0.02 || v > 0.98) return paper;
      // 上の小さな黒い2行（監督名）
      if ((v > 0.895 && v < 0.905 && u > 0.42 && u < 0.58) || (v > 0.865 && v < 0.882 && u > 0.26 && u < 0.74)) return ink;
      // 黄色の手書きタイトル（筆記体の勢いだけを線で）
      const title = [
        [0.08, 0.66, 0.13, 0.82, 0.016], [0.17, 0.7, 0.2, 0.84, 0.016], [0.07, 0.74, 0.24, 0.76, 0.014],
        [0.24, 0.7, 0.3, 0.75, 0.014], [0.3, 0.75, 0.32, 0.69, 0.014], [0.34, 0.63, 0.37, 0.76, 0.014],
        [0.37, 0.76, 0.42, 0.72, 0.014], [0.44, 0.63, 0.47, 0.76, 0.014], [0.47, 0.76, 0.52, 0.72, 0.014],
        [0.53, 0.75, 0.56, 0.7, 0.014], [0.58, 0.75, 0.55, 0.62, 0.014],
        [0.62, 0.7, 0.66, 0.85, 0.016], [0.71, 0.72, 0.73, 0.86, 0.016], [0.6, 0.77, 0.78, 0.79, 0.014],
        [0.76, 0.71, 0.8, 0.75, 0.014], [0.8, 0.75, 0.84, 0.71, 0.014], [0.85, 0.75, 0.87, 0.71, 0.014],
        [0.88, 0.75, 0.9, 0.7, 0.014], [0.9, 0.73, 0.94, 0.75, 0.012]
      ];
      for (const [ax, ay, bx, by, w] of title) if (seg(ax, ay, bx, by, w)) return yellow;
      if (v > 0.64 && v < 0.655 && u > 0.6 && u < 0.92) return ink;                   // カタカナの副題
      // 中央の写真帯（電車の車内）
      if (v > 0.36 && v < 0.62) {
        const red = [0.72, 0.14, 0.12], wall = [0.86, 0.8, 0.62], green = [0.45, 0.62, 0.32], light = [0.9, 0.93, 0.85];
        if (v < 0.44 && (u < 0.33 || u > 0.68)) return red;                           // 手前の座席の背
        if (v > 0.44 && v < 0.58 && u > 0.6 && u < 0.79 && v > 0.5) return red;          // 奥の座席
        const heads = [[0.13, 0.505, [0.85, 0.3, 0.2]], [0.29, 0.5, [0.92, 0.75, 0.68]], [0.71, 0.5, [0.2, 0.2, 0.22]], [0.85, 0.495, [0.95, 0.9, 0.55]]];
        for (const [hx, hy, shirt] of heads) {
          if (circ(hx, hy, 0.032)) return v > hy - 0.005 && Math.abs(u - hx) < 0.03 && v < hy + 0.02 ? [0.12, 0.09, 0.08] : [0.84, 0.66, 0.54];
          if (v < hy - 0.025 && v > 0.42 && Math.abs(u - hx) < 0.07) return shirt;
        }
        if (u > 0.38 && u < 0.6 && v > 0.42) return v > 0.5 ? light : [0.8, 0.82, 0.75];   // 正面の窓と線路
        if ((u < 0.1 || (u > 0.18 && u < 0.24) || u > 0.9) && v > 0.48) return green;      // 横の窓の緑
        return wall;
      }
      if (v > 0.315 && v < 0.325 && u > 0.3 && u < 0.7) return ink;                    // キャッチコピー
      // 下のクレジット
      if (v > 0.12 && v < 0.135 && ((u > 0.05 && u < 0.3) || (u > 0.5 && u < 0.95))) return ink;
      if (v > 0.08 && v < 0.09 && u > 0.05 && u < 0.95 && frac(u * 14) < 0.75) return [0.35, 0.34, 0.32];
      return paper;
    },
    calendar(p) {
      const u = (p[0] - 0.86) / 0.28, v = (p[1] - 1.04) / 0.38;
      if (v > 0.82) return [0.78, 0.2, 0.17];
      if (v > 0.74) return [0.95, 0.94, 0.9];
      const gu = u * 7, gv = v / 0.74 * 5;
      if (frac(gu) < 0.1 || frac(gv) < 0.1) return [0.72, 0.7, 0.67];
      const cu = Math.floor(gu), cv = Math.floor(gv);
      if (cu === 4 && cv === 2) return [0.85, 0.3, 0.25];
      if (cu < 3 && cv > 2 || cv > 3) return [0.6, 0.6, 0.58]; // 過ぎた日
      return [0.96, 0.95, 0.91];
    },
    // 文字の行が並んだ紙（回転した板のローカル座標 uv で描く）
    paper(p, n, uv) {
      if (!uv || n[1] < 0.5) return [0.93, 0.92, 0.88];
      const [u, v] = uv, row = Math.floor(v * 22);
      if (v > 0.08 && v < 0.9 && u > 0.1 && frac(v * 22) < 0.3 && u < 0.2 + 0.7 * hash(row * 3.7 + p[1] * 900)) return [0.38, 0.38, 0.44];
      return [0.95, 0.94, 0.9];
    },
    notebook(p) {
      const x = p[0], z = p[2];
      if (Math.abs(x + 0.11) < 0.006) return [0.55, 0.52, 0.48]; // のど
      const v = (z - 0.06) * 55;
      if (frac(v) < 0.1) return [0.62, 0.72, 0.85];
      const row = Math.floor(v), left = x < -0.11;
      const endX = left ? -0.3 + 0.17 * hash(row) : -0.09 + 0.14 * hash(row + 17);
      if (z > 0.1 && frac(v) > 0.35 && frac(v) < 0.75 && x < endX && x > (left ? -0.3 : -0.09) && frac(x * 70) < 0.7 && (left || row > 4)) return [0.18, 0.2, 0.35];
      return [0.96, 0.94, 0.88];
    },
    keyboard(p, n) {
      if (n[1] < 0.5) return [0.2, 0.2, 0.22];
      const u = (p[0] - 0.18) * 64, v = (p[2] - 0.2) * 32;
      return frac(u) < 0.18 || frac(v) < 0.2 ? [0.12, 0.12, 0.14] : [0.82, 0.81, 0.78];
    },
    speaker(p, n) {
      if (n[2] > -0.5) return [0.16, 0.13, 0.11];
      const dx = p[0] - 0.03, d1 = dx * dx + (p[1] - 0.92) ** 2, d2 = dx * dx + (p[1] - 0.82) ** 2;
      if (d1 < 0.0006) return [0.55, 0.5, 0.42];
      if (d2 < 0.0022) return frac(Math.sqrt(d2) * 120) < 0.3 ? [0.2, 0.2, 0.2] : [0.05, 0.05, 0.05];
      return [0.14, 0.11, 0.09];
    },
    mug(p, n) {
      if (n[1] > 0.5) {
        const r = Math.hypot(p[0] + 0.45, p[2] - 0.2);
        return r < 0.037 ? [0.18, 0.09, 0.04] : [0.92, 0.9, 0.86];
      }
      return Math.abs(p[1] - 0.82) < 0.012 ? [0.75, 0.22, 0.2] : [0.92, 0.9, 0.86];
    },
    // 写真立て: 中には平面の正三角形だけ（アイコン）
    photo(p, n) {
      if (n[2] > -0.5) return [0.3, 0.2, 0.12];                      // 側面・裏
      const u = (p[0] + 0.56) / 0.18, v = (p[1] - 0.75) / 0.22;
      if (u < 0.12 || u > 0.88 || v < 0.1 || v > 0.9) return [0.32, 0.21, 0.13];   // 木の枠
      // 実寸で正三角形を判定（一辺 0.09、上向き、内側の中心に置く）
      const wx = p[0] + 0.47, wy = p[1] - (0.75 + 0.11);
      const side = 0.09, h = side * Math.sqrt(3) / 2, top = h * 2 / 3, base = -h / 3;
      if (wy >= base && wy <= top && Math.abs(wx) <= (top - wy) / Math.sqrt(3)) return TRI_COLOR;
      return [0.93, 0.92, 0.88];                                      // 地（無地）
    },
    woodbox(p, n) {
      if (n[1] > 0.5) return Math.abs(p[2] - 0.62) < 0.004 ? [0.2, 0.12, 0.07] : [0.6, 0.42, 0.26];
      return Math.abs(p[1] - 0.86) < 0.003 ? [0.2, 0.12, 0.07] : [0.5, 0.34, 0.2];
    }
  };

  const emitTex = {
    // 携帯ゲーム機の画面: 空と地面と小さなキャラクター
    handheld(p) {
      const u = (p[0] - 0.846) / 0.148, v = (p[1] - 0.765) / 0.09;    // v: 上ほど 1
      if (v < 0.28) return frac(u * 10) < 0.5 ? [0.3, 0.65, 0.2] : [0.24, 0.55, 0.16];
      if (Math.abs(u - 0.35) < 0.04 && v < 0.48) return [0.95, 0.3, 0.2];
      if ((u - 0.78) ** 2 + ((v - 0.78) * 0.6) ** 2 < 0.006) return [1.0, 0.92, 0.45];
      if (v > 0.55 && v < 0.68 && u > 0.1 && u < 0.3) return [0.95, 0.95, 0.95];
      return [0.3, 0.55 + 0.25 * v, 0.95];
    },
    // ガラス越しに中の灯りが透けて見える筒。中心ほど・灯りの高さほど明るい
    lantern(p) {
      const s2 = Math.min(1, ((p[0] - 0.03) / 0.056) ** 2);
      const dy = (p[1] - (0.75 + 0.115)) / 0.04;
      const glow = Math.exp(-dy * dy) * Math.pow(1 - s2, 1.5);
      const rim = Math.abs(Math.sqrt(s2) - 0.7) < 0.06 ? 0.12 : 0;     // ガラスの映り込み
      return [0.05 + 2.4 * glow + rim, 0.05 + 1.35 * glow + rim, 0.06 + 0.5 * glow + rim];
    },
    monitor(p) {
      const u = (p[0] - 0.18) / 0.56, v = (p[1] - 0.9) / 0.32;
      if (v > 0.9) return [0.25, 0.25, 0.3];
      const row = Math.floor((0.9 - v) * 14);
      const on = frac((0.9 - v) * 14) < 0.55 && u > 0.04 && u < 0.08 + 0.75 * hash(row + 3);
      if (on) return hash(row) < 0.3 ? [0.95, 0.75, 0.35] : [0.35, 0.95, 0.65];
      return [0.03, 0.07, 0.07];
    }
  };

  // ---- オブジェクト ------------------------------------------------------
  const objs = [];
  const B = (x0, y0, z0, x1, y1, z1, mat, id) => objs.push({ k: 0, b: [x0, y0, z0, x1, y1, z1], m: mat, id });
  const S = (cx, cy, cz, r, mat, id) => objs.push({ k: 1, c: [cx, cy, cz], r, m: mat, id });
  const C = (cx, cz, r, y0, y1, mat, id) => objs.push({ k: 2, cx, cz, r, y0, y1, m: mat, id });
  // 水平に角度 a（ラジアン）だけ回した箱。中心 (cx, cy, cz)、半分の大きさ (hx, hy, hz)
  const R = (cx, cy, cz, hx, hy, hz, a, mat, id) =>
    objs.push({ k: 3, c: [cx, cy, cz], h: [hx, hy, hz], cos: Math.cos(a), sin: Math.sin(a), m: mat, id });

  const white = M([0.9, 0.9, 0.88]), black = M([0.04, 0.04, 0.05]), metal = M([0.62, 0.62, 0.64]);
  const darkMetal = M([0.12, 0.12, 0.13]);
  const rnd = mulberry32(7);

  // 机
  const deskMat = M(null, { tex: tex.desk });
  B(-1.18, TOP - 0.04, -0.08, 1.2, TOP, RZ1, deskMat, null);
  B(-1.16, 0, -0.04, -1.1, TOP - 0.04, 0.02, deskMat, null);
  B(0.65, 0.2, -0.06, 1.18, TOP - 0.04, 0.7, M([0.48, 0.32, 0.19]), null);
  B(0.66, 0.42, -0.065, 1.17, 0.43, -0.06, M([0.25, 0.16, 0.1]), null);
  C(0.915, -0.07, 0.012, 0.55, 0.58, metal, null);
  // 幅木
  B(RX0, 0, RZ1 - 0.02, RX1, 0.08, RZ1, white, null);

  // 窓
  const frame = M([0.92, 0.9, 0.86]);
  B(-0.98, 0.98, 0.64, -0.02, 1.02, RZ1, frame, "window");
  B(-0.95, 1.62, 0.7, -0.05, 1.66, RZ1, frame, "window");
  B(-0.95, 1.02, 0.7, -0.9, 1.62, RZ1, frame, "window");
  B(-0.1, 1.02, 0.7, -0.05, 1.62, RZ1, frame, "window");
  B(-0.515, 1.02, 0.71, -0.485, 1.62, RZ1, frame, "window");
  const curtain = M([0.62, 0.42, 0.34]);
  for (let i = 0; i < 4; i++) {
    const z = 0.62 + (i % 2) * 0.03;
    B(-1.3 + i * 0.07, 0.9, z, -1.23 + i * 0.07, RY, z + 0.04, curtain, "window");
  }

  // 窓辺の芽（Pre-favorites）
  C(-0.25, 0.7, 0.04, 1.02, 1.09, M([0.72, 0.38, 0.22]), "plant");
  C(-0.25, 0.7, 0.036, 1.09, 1.092, M([0.25, 0.16, 0.1]), "plant");
  C(-0.25, 0.7, 0.004, 1.09, 1.16, M([0.3, 0.55, 0.22]), "plant");
  S(-0.27, 1.16, 0.7, 0.018, M([0.38, 0.66, 0.26]), "plant");
  S(-0.23, 1.15, 0.7, 0.016, M([0.32, 0.6, 0.24]), "plant");

  // ポスター（Movie）とカレンダー（History）
  const POSTER_TEX = { happy: tex.posterHappy };
  B(POSTER_TALL.x0, POSTER_TALL.y0, 0.73, POSTER_TALL.x1, POSTER_TALL.y1, RZ1,
    M(null, { tex: POSTER_TEX[POSTER], selfLit: 0.3 }), "poster");
  B(0.86, 1.04, 0.735, 1.14, 1.42, RZ1, M(null, { tex: tex.calendar }), "calendar");
  C(1.0, 0.745, 0.008, 1.42, 1.44, M([0.6, 0.1, 0.1]), "calendar");

  // 本（read）—立てた本とブックエンド
  const bookCols = [[0.55, 0.2, 0.18], [0.2, 0.3, 0.45], [0.78, 0.68, 0.48], [0.25, 0.4, 0.3], [0.86, 0.83, 0.76], [0.35, 0.25, 0.42], [0.62, 0.46, 0.2], [0.15, 0.15, 0.17]];
  B(-0.95, TOP, 0.5, -0.94, TOP + 0.16, 0.7, darkMetal, "books");
  for (let x = -0.94; x < -0.64;) {
    const w = 0.018 + rnd() * 0.022;
    const h = 0.15 + rnd() * 0.09;
    const base = bookCols[Math.floor(rnd() * bookCols.length)], k = 0.75 + rnd() * 0.3;
    B(x, TOP, 0.5 + rnd() * 0.03, x + w, TOP + h, 0.7, M([base[0] * k, base[1] * k, base[2] * k]), "books");
    x += w + 0.002;
  }
  B(-0.64, TOP, 0.5, -0.63, TOP + 0.16, 0.7, darkMetal, "books");
  // 平積み
  [[0.06, [0.2, 0.3, 0.45]], [0.05, [0.78, 0.68, 0.48]], [0.04, [0.55, 0.2, 0.18]]].reduce((y, [h, c], i) => {
    B(-0.95 + i * 0.01, y, 0.28 - i * 0.012, -0.72 - i * 0.01, y + h * 0.5, 0.46 - i * 0.008, M(c), "books");
    return y + h * 0.5;
  }, TOP);

  // デスクライト（装飾）
  const lampMat = M([0.15, 0.25, 0.2]);
  C(-1.03, 0.62, 0.07, TOP, TOP + 0.02, lampMat, "lamp");
  C(-1.03, 0.62, 0.012, TOP + 0.02, 1.18, lampMat, "lamp");
  B(-1.04, 1.165, 0.61, -0.71, 1.185, 0.63, lampMat, "lamp");
  B(-0.73, 1.165, 0.3, -0.71, 1.185, 0.63, lampMat, "lamp");
  C(-0.72, 0.3, 0.07, 1.09, 1.17, lampMat, "lamp");
  S(-0.72, 1.09, 0.3, 0.032, M([0, 0, 0], { emit: [3.5, 2.6, 1.5] }), "lamp");

  // 写真立て（自己大紹介）
  B(-0.56, TOP, 0.6, -0.38, TOP + 0.22, 0.62, M(null, { tex: tex.photo }), "photo");
  B(-0.49, TOP, 0.62, -0.45, TOP + 0.12, 0.68, M([0.3, 0.2, 0.12]), "photo");

  // 紙の束（Posts）: 角度もずれもばらばらに重なった書類。付箋・封筒・クリップ、はみ出した 1 枚
  const prnd = mulberry32(31);
  let py = TOP + 0.001;
  for (let i = 0; i < 14; i++) {
    const a = (prnd() - 0.5) * (i < 10 ? 0.5 : 1.1);              // 上の数枚ほど大きく崩す
    const cx = -0.8 + (prnd() - 0.5) * (i < 10 ? 0.05 : 0.14), cz = 0.13 + (prnd() - 0.5) * (i < 10 ? 0.04 : 0.1);
    const tone = 0.95 - prnd() * 0.08, warm = prnd() < 0.2 ? 0.04 : 0;  // ところどころ少し黄ばんだ紙
    const mat = prnd() < 0.55 || i > 9 ? M(null, { tex: tex.paper }) : M([tone, tone - 0.01, tone - 0.05 - warm]);
    R(cx, py, cz, 0.1, 0.0012, 0.135, a, mat, "papers");
    py += 0.0026;
  }
  R(-0.86, py + 0.002, 0.07, 0.075, 0.0015, 0.045, 0.35, M([0.86, 0.76, 0.56]), "papers");     // 封筒
  R(-0.72, py + 0.003, 0.18, 0.025, 0.0012, 0.025, -0.25, M([0.98, 0.86, 0.3]), "papers");     // 付箋
  R(-0.76, py + 0.004, 0.035, 0.008, 0.002, 0.022, 0.6, metal, "papers");                       // クリップ
  // 束の下から右手前へはみ出した 1 枚（束より下の高さに置き、端だけが見える）
  R(-0.66, TOP + 0.0004, 0.08, 0.1, 0.0004, 0.135, 0.6, M(null, { tex: tex.paper }), "papers");

  // マグカップ（Likes / Dislikes）
  C(-0.45, 0.2, 0.045, TOP, TOP + 0.11, M(null, { tex: tex.mug }), "mug");
  B(-0.405, TOP + 0.03, 0.195, -0.385, TOP + 0.08, 0.205, M([0.92, 0.9, 0.86]), "mug");

  // 日記帳（Paper Diary）
  B(-0.33, TOP, 0.04, 0.11, TOP + 0.008, 0.33, M([0.35, 0.16, 0.11]), "diary");
  B(-0.32, TOP + 0.008, 0.05, 0.1, TOP + 0.016, 0.32, M(null, { tex: tex.notebook }), "diary");
  B(-0.02, TOP + 0.016, 0.335, 0.13, TOP + 0.026, 0.345, M([0.1, 0.12, 0.35]), "diary");
  B(0.13, TOP + 0.017, 0.337, 0.15, TOP + 0.024, 0.343, metal, "diary");

  // 携帯ゲーム機（Games）: スタンドで立てて画面をこちらに向けたテーブルモード。
  // 画面の左に青、右に赤のコントローラー
  const GX0 = 0.8, GZ = 0.36, GY0 = TOP + 0.008, GY1 = TOP + 0.112;
  // コントローラーは後ろからの光しか当たらないので、色が沈まないようほんのり自発光を足す
  const red = M([0.92, 0.24, 0.2], { glow: [0.22, 0.05, 0.04] }), blue = M([0.1, 0.5, 0.95], { glow: [0.03, 0.1, 0.24] });
  B(GX0 + 0.04, GY0, GZ, GX0 + 0.2, GY1, GZ + 0.014, M([0.06, 0.06, 0.07]), "console");      // 本体
  B(GX0 + 0.046, GY0 + 0.007, GZ - 0.0006, GX0 + 0.194, GY1 - 0.007, GZ,
    M([0, 0, 0], { emitTex: emitTex.handheld, gain: 0.9 }), "console");                       // 画面
  B(GX0, GY0 + 0.004, GZ, GX0 + 0.04, GY1 - 0.004, GZ + 0.016, blue, "console");              // 左コントローラー（青）
  B(GX0 + 0.2, GY0 + 0.004, GZ, GX0 + 0.24, GY1 - 0.004, GZ + 0.016, red, "console");         // 右コントローラー（赤）
  S(GX0 + 0.02, GY1 - 0.03, GZ - 0.004, 0.009, black, "console");                             // スティック
  S(GX0 + 0.22, GY0 + 0.035, GZ - 0.004, 0.009, black, "console");
  for (const [dx, dy] of [[0, 0.011], [0, -0.011], [0.011, 0], [-0.011, 0]]) {          // ボタン
    S(GX0 + 0.02 + dx, GY0 + 0.035 + dy, GZ - 0.002, 0.004, black, "console");
    S(GX0 + 0.22 + dx, GY1 - 0.03 + dy, GZ - 0.002, 0.004, black, "console");
  }
  B(GX0 + 0.1, TOP, GZ + 0.014, GX0 + 0.14, GY0 + 0.05, GZ + 0.05, M([0.08, 0.08, 0.09]), "console"); // スタンド
  B(GX0 + 0.03, TOP, GZ - 0.01, GX0 + 0.21, GY0, GZ + 0.03, M([0.08, 0.08, 0.09]), "console");

  // モニターライト（装飾）: 画面上端に掛けるバー
  const barMat = M([0.1, 0.1, 0.11]);
  B(0.2, 1.245, 0.5, 0.76, 1.272, 0.56, barMat, "lightbar");
  B(0.22, 1.241, 0.51, 0.74, 1.245, 0.55, M([0, 0, 0], { emit: [2.2, 2.1, 1.9] }), "lightbar");
  B(0.45, 1.2, 0.56, 0.51, 1.272, 0.66, barMat, "lightbar");
  B(0.45, 1.13, 0.63, 0.51, 1.2, 0.66, barMat, "lightbar");

  // パソコン（Developments）
  B(0.16, 0.88, 0.6, 0.76, 1.24, 0.63, black, "computer");
  B(0.18, 0.9, 0.598, 0.74, 1.22, 0.6, M([0, 0, 0], { emitTex: emitTex.monitor, gain: 1.0 }), "computer");
  B(0.43, TOP, 0.63, 0.49, 0.88, 0.66, darkMetal, "computer");
  B(0.34, TOP, 0.55, 0.58, TOP + 0.01, 0.7, darkMetal, "computer");
  B(0.18, TOP, 0.2, 0.68, TOP + 0.022, 0.36, M(null, { tex: tex.keyboard }), "computer");
  S(0.76, TOP - 0.012, 0.29, 0.032, M([0.8, 0.8, 0.78]), "computer");

  // スピーカーとヘッドホン（listen to）
  // 円筒形のスピーカー（透明な筒の中に暖色の灯り）。黒い台座＋光る筒＋天面の縁
  const SPK = { x: 0.03, z: 0.55, r: 0.056 };
  C(SPK.x, SPK.z, SPK.r, TOP, TOP + 0.055, M([0.07, 0.07, 0.075]), "audio");
  C(SPK.x, SPK.z, SPK.r * 0.98, TOP + 0.055, TOP + 0.185,
    M([0, 0, 0], { emitTex: emitTex.lantern, gain: 1, clear: true }), "audio");
  C(SPK.x, SPK.z, SPK.r, TOP + 0.185, TOP + 0.192, M([0.1, 0.1, 0.11]), "audio");
  // ヘッドホンスタンド（スピーカーの左隣）
  const HX = -0.16, HZ = 0.52;
  C(HX, HZ, 0.06, TOP, TOP + 0.012, darkMetal, "audio");
  C(HX, HZ, 0.01, TOP + 0.012, 1.02, darkMetal, "audio");
  const cup = M([0.12, 0.12, 0.13]), pad = M([0.35, 0.25, 0.2]);
  S(HX - 0.065, 0.93, HZ, 0.05, cup, "audio");
  S(HX + 0.065, 0.93, HZ, 0.05, cup, "audio");
  S(HX - 0.045, 0.93, HZ, 0.04, pad, "audio");
  S(HX + 0.045, 0.93, HZ, 0.04, pad, "audio");
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * i / 10;
    S(HX + 0.068 * Math.cos(a), 0.97 + 0.07 * Math.sin(a), HZ, 0.014, i === 5 ? pad : cup, "audio");
  }

  // ポーカーチップとカード（Poker）
  const chipCols = [[0.8, 0.15, 0.12], [0.15, 0.25, 0.7], [0.92, 0.92, 0.88], [0.1, 0.1, 0.1]];
  [[0.83, 0.1, 7], [0.92, 0.07, 4], [0.88, 0.17, 10], [0.78, 0.2, 3]].forEach(([x, z, n], i) => {
    for (let j = 0; j < n; j++) C(x, z, 0.03, TOP + j * 0.008, TOP + 0.007 + j * 0.008, M(chipCols[(i + j) % chipCols.length]), "poker");
  });
  B(0.96, TOP, 0.12, 1.04, TOP + 0.003, 0.24, M([0.95, 0.95, 0.92]), "poker");
  B(0.99, TOP + 0.003, 0.1, 1.07, TOP + 0.006, 0.22, M([0.95, 0.95, 0.92]), "poker");
  B(1.0, TOP + 0.006, 0.19, 1.02, TOP + 0.0065, 0.21, M([0.8, 0.15, 0.12]), "poker");

  // 木箱（しまってあるもの）
  B(0.82, TOP, 0.52, 1.14, 0.92, 0.73, M(null, { tex: tex.woodbox }), "box");
  B(0.95, 0.92, 0.6, 1.01, 0.935, 0.64, metal, "box");

  // ---- ID ごとにグループ化（AABB で枝刈り） ---------------------------
  function bounds(o) {
    if (o.k === 0) return o.b.slice();
    if (o.k === 1) return [o.c[0] - o.r, o.c[1] - o.r, o.c[2] - o.r, o.c[0] + o.r, o.c[1] + o.r, o.c[2] + o.r];
    if (o.k === 3) {
      const ex = Math.abs(o.h[0] * o.cos) + Math.abs(o.h[2] * o.sin), ez = Math.abs(o.h[0] * o.sin) + Math.abs(o.h[2] * o.cos);
      return [o.c[0] - ex, o.c[1] - o.h[1], o.c[2] - ez, o.c[0] + ex, o.c[1] + o.h[1], o.c[2] + ez];
    }
    return [o.cx - o.r, o.y0, o.cz - o.r, o.cx + o.r, o.y1, o.cz + o.r];
  }
  const groupMap = new Map();
  for (const o of objs) {
    const key = o.id || "_";
    if (!groupMap.has(key)) groupMap.set(key, { b: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], items: [] });
    const g = groupMap.get(key), b = bounds(o);
    for (let i = 0; i < 3; i++) { g.b[i] = Math.min(g.b[i], b[i]); g.b[i + 3] = Math.max(g.b[i + 3], b[i + 3]); }
    g.items.push(o);
  }
  const groups = [...groupMap.values()];

  // ---- 交差判定 -----------------------------------------------------------
  const EPS = 1e-4;
  const H = { t: 0, n: [0, 0, 0], o: null, wall: null };

  function slab(ox, oy, oz, ix, iy, iz, b, tmax) {
    let t1 = (b[0] - ox) * ix, t2 = (b[3] - ox) * ix;
    let tn = Math.min(t1, t2), tf = Math.max(t1, t2), ax = 0;
    t1 = (b[1] - oy) * iy; t2 = (b[4] - oy) * iy;
    let a = Math.min(t1, t2), c = Math.max(t1, t2);
    if (a > tn) { tn = a; ax = 1; }
    if (c < tf) tf = c;
    t1 = (b[2] - oz) * iz; t2 = (b[5] - oz) * iz;
    a = Math.min(t1, t2); c = Math.max(t1, t2);
    if (a > tn) { tn = a; ax = 2; }
    if (c < tf) tf = c;
    if (tn > tf || tf < EPS || tn > tmax) return -1;
    slab.ax = ax;
    return tn > EPS ? tn : tf;
  }

  function hitObj(o, ox, oy, oz, dx, dy, dz, ix, iy, iz, tmax, out) {
    if (o.k === 0) {
      const t = slab(ox, oy, oz, ix, iy, iz, o.b, tmax);
      if (t < 0 || t >= tmax) return false;
      if (out) {
        out.t = t; out.o = o;
        const ax = slab.ax, d = ax === 0 ? dx : ax === 1 ? dy : dz;
        out.n[0] = out.n[1] = out.n[2] = 0; out.n[ax] = d > 0 ? -1 : 1;
      }
      return t;
    }
    if (o.k === 1) {
      const lx = ox - o.c[0], ly = oy - o.c[1], lz = oz - o.c[2];
      const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - o.r * o.r;
      const disc = b * b - c;
      if (disc < 0) return false;
      const s = Math.sqrt(disc);
      let t = -b - s;
      if (t < EPS) t = -b + s;
      if (t < EPS || t >= tmax) return false;
      if (out) {
        out.t = t; out.o = o;
        out.n[0] = (lx + dx * t) / o.r; out.n[1] = (ly + dy * t) / o.r; out.n[2] = (lz + dz * t) / o.r;
      }
      return t;
    }
    if (o.k === 3) {
      // ローカル座標に回して、軸に沿った箱として判定する
      const tx = ox - o.c[0], tz = oz - o.c[2];
      const lox = tx * o.cos + tz * o.sin, loz = -tx * o.sin + tz * o.cos;
      const ldx = dx * o.cos + dz * o.sin, ldz = -dx * o.sin + dz * o.cos;
      const hb = o.hb || (o.hb = [-o.h[0], -o.h[1], -o.h[2], o.h[0], o.h[1], o.h[2]]);
      const t = slab(lox, oy - o.c[1], loz, 1 / ldx, 1 / dy, 1 / ldz, hb, tmax);
      if (t < 0 || t >= tmax) return false;
      if (out) {
        out.t = t; out.o = o;
        const ax = slab.ax, ln = [0, 0, 0];
        ln[ax] = (ax === 0 ? ldx : ax === 1 ? dy : ldz) > 0 ? -1 : 1;
        out.n[0] = ln[0] * o.cos - ln[2] * o.sin; out.n[1] = ln[1]; out.n[2] = ln[0] * o.sin + ln[2] * o.cos;
      }
      return t;
    }
    // y 軸方向の円柱
    let best = tmax, nx = 0, ny = 0, nz = 0;
    const lx = ox - o.cx, lz = oz - o.cz;
    const A = dx * dx + dz * dz;
    if (A > 1e-12) {
      const Bq = lx * dx + lz * dz, Cq = lx * lx + lz * lz - o.r * o.r;
      const disc = Bq * Bq - A * Cq;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        for (const t of [(-Bq - s) / A, (-Bq + s) / A]) {
          if (t > EPS && t < best) {
            const y = oy + dy * t;
            if (y >= o.y0 && y <= o.y1) { best = t; nx = (lx + dx * t) / o.r; ny = 0; nz = (lz + dz * t) / o.r; break; }
          }
        }
      }
    }
    if (Math.abs(dy) > 1e-12) {
      for (const [y, s] of [[o.y1, 1], [o.y0, -1]]) {
        const t = (y - oy) / dy;
        if (t > EPS && t < best) {
          const px = lx + dx * t, pz = lz + dz * t;
          if (px * px + pz * pz <= o.r * o.r) { best = t; nx = 0; ny = s; nz = 0; }
        }
      }
    }
    if (best >= tmax) return false;
    if (out) { out.t = best; out.o = o; out.n[0] = nx; out.n[1] = ny; out.n[2] = nz; }
    return best;
  }

  // 壁・床・天井。窓の穴を抜けたら null（空）
  function wallHit(ox, oy, oz, dx, dy, dz) {
    let t = Infinity, ax = -1, side = 0;
    if (dx > 0) { const s = (RX1 - ox) / dx; if (s < t) { t = s; ax = 0; side = 1; } }
    else if (dx < 0) { const s = (RX0 - ox) / dx; if (s < t) { t = s; ax = 0; side = -1; } }
    if (dy > 0) { const s = (RY - oy) / dy; if (s < t) { t = s; ax = 1; side = 1; } }
    else if (dy < 0) { const s = (0 - oy) / dy; if (s < t) { t = s; ax = 1; side = -1; } }
    if (dz > 0) { const s = (RZ1 - oz) / dz; if (s < t) { t = s; ax = 2; side = 1; } }
    else if (dz < 0) { const s = (RZ0 - oz) / dz; if (s < t) { t = s; ax = 2; side = -1; } }
    if (ax === 2 && side === 1) {
      const x = ox + dx * t, y = oy + dy * t;
      if (x > WIN.x0 && x < WIN.x1 && y > WIN.y0 && y < WIN.y1) return null;
    }
    return { t, ax, side };
  }

  const wallMat = M(null, { tex: tex.wall }), floorMat = M(null, { tex: tex.floor }), ceilMat = M([0.86, 0.84, 0.8]);

  function trace(ox, oy, oz, dx, dy, dz, out) {
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    const w = wallHit(ox, oy, oz, dx, dy, dz);
    let best = w ? w.t : Infinity;
    out.o = null; out.wall = null;
    const tmp = { t: 0, n: [0, 0, 0], o: null };
    for (const g of groups) {
      if (slab(ox, oy, oz, ix, iy, iz, g.b, best) < 0) continue;
      for (const o of g.items) {
        if (hitObj(o, ox, oy, oz, dx, dy, dz, ix, iy, iz, best, tmp)) {
          best = tmp.t; out.o = o; out.n[0] = tmp.n[0]; out.n[1] = tmp.n[1]; out.n[2] = tmp.n[2];
        }
      }
    }
    out.t = best;
    if (!out.o && w) {
      out.wall = w;
      out.n[0] = out.n[1] = out.n[2] = 0; out.n[w.ax] = -w.side;
    }
    return out.o || out.wall ? true : false;
  }

  function occluded(ox, oy, oz, dx, dy, dz, tmax, skipId) {
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    if (tmax === Infinity) {
      const w = wallHit(ox, oy, oz, dx, dy, dz);
      if (w) return true;
    }
    for (const g of groups) {
      if (slab(ox, oy, oz, ix, iy, iz, g.b, tmax) < 0) continue;
      for (const o of g.items) {
        if (o.id === skipId || o.m.clear) continue;
        if (hitObj(o, ox, oy, oz, dx, dy, dz, ix, iy, iz, tmax, null)) return true;
      }
    }
    return false;
  }

  // ---- 空（窓の外） -----------------------------------------------------
  function sky(dx, dy, dz) {
    const a = dx / dz, e = dy / Math.sqrt(dx * dx + dz * dz);
    const col = Math.floor((a + 2) * 22);
    const h = -0.1 + hash(col) * 0.08 + (hash(col + 99) < 0.2 ? 0.04 : 0);
    if (e < h) {
      const wx = Math.floor(a * 260), wy = Math.floor(e * 260);
      if (hash2(wx, wy) > 0.86 && frac(a * 260) < 0.6 && frac(e * 260) < 0.55) return [1.4, 0.95, 0.45];
      return [0.05, 0.045, 0.08];
    }
    const t = clamp((e + 0.04) / 0.18, 0, 1);
    const r = 1.9 * (1 - t) + 0.35 * t, g = 0.85 * (1 - t) + 0.3 * t, b = 0.45 * (1 - t) + 0.6 * t;
    const sx = a + 0.3, sy = e - 0.02, sd = sx * sx + sy * sy;
    const glow = Math.exp(-sd * 600) * 2.5 + (sd < 0.00012 ? 4 : 0);
    return [r + glow, g + glow * 0.7, b + glow * 0.3];
  }

  // ---- ライティング -----------------------------------------------------
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const SUN = norm([-0.25, 0.5, 1]);
  const SUN_C = [2.3, 1.25, 0.6];
  const LAMP = [-0.72, 1.05, 0.3], LAMP_C = [0.5, 0.36, 0.2];
  const FILL = [-0.5, 1.3, 0.5], FILL_C = [0.3, 0.24, 0.28];
  const AMB = [0.07, 0.065, 0.09];
  const MON_LIGHT = false;
  // モニターライト（バー型）。バーの下面に沿って点光源を並べて帯状の光にする
  const BAR = [0.24, 0.38, 0.52, 0.66, 0.78].map((x) => [x, 1.232, 0.53]);
  const SPK_L = [0.03, 0.75 + 0.115, 0.55], SPK_C = [0.45, 0.24, 0.08];   // スピーカーの灯り
  const BAR_C = [0.17, 0.16, 0.14];
  const MON = [0.46, 1.05, 0.35], MON_C = [0.12, 0.26, 0.22];
  const aoRnd = mulberry32(42);

  function pointLight(px, py, pz, n, L, C, skip, acc, falloff) {
    let lx = L[0] - px, ly = L[1] - py, lz = L[2] - pz;
    const d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2);
    lx /= d; ly /= d; lz /= d;
    const ndl = n[0] * lx + n[1] * ly + n[2] * lz;
    if (ndl <= 0) return;
    if (occluded(px, py, pz, lx, ly, lz, d - 0.02, skip)) return;
    let k = ndl * falloff / (d2 + 0.4);
    if (skip === "lamp") k *= clamp((L[1] - py) / d * 1.6 + 0.08, 0, 1);
    // モニターライト: 真下〜手前に向けた非対称の配光（奥の壁や画面には当てない）
    if (skip === "lightbar") k *= clamp((L[1] - py) / d * 1.4, 0, 1) * (pz < 0.58 ? 1 : 0.15);
    acc[0] += C[0] * k; acc[1] += C[1] * k; acc[2] += C[2] * k;
  }

  function shade(ox, oy, oz, dx, dy, dz) {
    const h = { t: 0, n: [0, 0, 0], o: null, wall: null };
    if (!trace(ox, oy, oz, dx, dy, dz, h)) return { c: sky(dx, dy, dz), id: "window" };
    const px = ox + dx * h.t, py = oy + dy * h.t, pz = oz + dz * h.t, n = h.n;
    let mat, id = null;
    if (h.o) { mat = h.o.m; id = h.o.id; }
    else mat = h.wall.ax === 1 ? (h.wall.side < 0 ? floorMat : ceilMat) : wallMat;
    const p = [px, py, pz];

    if (mat.emit) return { c: mat.emit.slice(), id };
    if (mat.emitTex) { const e = mat.emitTex(p); const g = mat.gain || 1; return { c: [e[0] * g, e[1] * g, e[2] * g], id }; }

    let uv = null;
    if (h.o && h.o.k === 3) {
      const o = h.o, tx = px - o.c[0], tz = pz - o.c[2];
      uv = [((tx * o.cos + tz * o.sin) / o.h[0] + 1) / 2, ((-tx * o.sin + tz * o.cos) / o.h[2] + 1) / 2];
    }
    const alb = mat.tex ? mat.tex(p, n, uv) : mat.c;
    const qx = px + n[0] * 1e-3, qy = py + n[1] * 1e-3, qz = pz + n[2] * 1e-3;

    // AO
    let occ = 0;
    const AO_N = 4;
    for (let i = 0; i < AO_N; i++) {
      let rx = aoRnd() * 2 - 1, ry = aoRnd() * 2 - 1, rz = aoRnd() * 2 - 1;
      if (rx * n[0] + ry * n[1] + rz * n[2] < 0) { rx = -rx; ry = -ry; rz = -rz; }
      rx += n[0]; ry += n[1]; rz += n[2];
      const l = Math.hypot(rx, ry, rz);
      if (occluded(qx, qy, qz, rx / l, ry / l, rz / l, 0.12, "lamp")) occ++;
    }
    const ao = 1 - 0.8 * (occ / AO_N);

    const acc = [AMB[0] * ao, AMB[1] * ao, AMB[2] * ao];
    const ndl = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
    if (ndl > 0 && !occluded(qx, qy, qz, SUN[0], SUN[1], SUN[2], Infinity, "lamp")) {
      acc[0] += SUN_C[0] * ndl; acc[1] += SUN_C[1] * ndl; acc[2] += SUN_C[2] * ndl;
    }
    pointLight(qx, qy, qz, n, LAMP, LAMP_C, "lamp", acc, 2.6);
    pointLight(qx, qy, qz, n, FILL, FILL_C, "window", acc, 1.6 * (0.5 + 0.5 * ao));
    if (MON_LIGHT) pointLight(qx, qy, qz, n, MON, MON_C, "computer", acc, 1.0);
    for (const B of BAR) pointLight(qx, qy, qz, n, B, BAR_C, "lightbar", acc, 2.6);
    pointLight(qx, qy, qz, n, SPK_L, SPK_C, "audio", acc, 1.6);
    const gl = mat.glow || [0, 0, 0], sl = mat.selfLit || 0;   // selfLit: 色に比例した底上げ
    return { c: [alb[0] * (acc[0] + sl) + gl[0], alb[1] * (acc[1] + sl) + gl[1], alb[2] * (acc[2] + sl) + gl[2]], id };
  }

  // ---- カメラ ------------------------------------------------------------
  const CAM = [0.02, 1.32, -1.2];
  const TARGET = [0.02, 0.98, 0.6];
  const HFOV = 70 * Math.PI / 180;

  // ---- 点描変換 -----------------------------------------------------------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function tonemap(c) {
    const f = (x) => Math.pow((x * 1.1) / (1 + x * 1.1), 1 / 2.0);
    return [f(c[0]), f(c[1]), f(c[2])];
  }

  // 文字への変換スタイル。A が基準（いちばん好評だった版）。
  const STYLES = {
    A: { name: "原版", note: "F の輪郭なし版", cols: 230,
         ramp: " .,:;-=+*#%@", black: 0.06, range: 0.78, gamma: 1.15, sat: 1.35, gain: 1.25, gainDark: 0.6, lift: 0.04 },
    B: { name: "細密", note: "A と同じ変換で文字をさらに細かく", cols: 320,
         ramp: " .,:;-=+*#%@", black: 0.06, range: 0.78, gamma: 1.15, sat: 1.35, gain: 1.25, gainDark: 0.6, lift: 0.04 },
    C: { name: "点描", note: "点だけの文字で濃淡を出し、色を一粒ずつ揺らす", cols: 230,
         ramp: " .·:∙•●", black: 0.05, range: 0.8, gamma: 1.0, sat: 1.5, gain: 1.35, gainDark: 0.6, lift: 0.05, jitter: 0.09 },
    D: { name: "淡彩", note: "コントラストと彩度を抑えたやわらかい版", cols: 230,
         ramp: " .·:;-=+*", black: 0.03, range: 0.9, gamma: 0.9, sat: 1.05, gain: 1.35, gainDark: 0.5, lift: 0.07 },
    E: { name: "粗め", note: "A の文字を大きく。一文字ずつ読める", cols: 150,
         ramp: " .,:;-=+*#%@", black: 0.06, range: 0.78, gamma: 1.15, sat: 1.35, gain: 1.25, gainDark: 0.6, lift: 0.04 },
    F: { name: "ほんのり輪郭", note: "採用中。A の物の境目だけ少し明るくして、形を拾いやすく", cols: 230,
         ramp: " .,:;-=+*#%@", black: 0.06, range: 0.78, gamma: 1.15, sat: 1.35, gain: 0.95, gainDark: 0.4, lift: 0.02, rim: 0.22 }
  };

  /** 陰影 (base) を文字と色に変換する。upto 行目まで。 */
  function stylize(base, st, upto) {
    const { cols, raw, L, ids } = base;
    const rows = upto == null ? base.rows : upto;
    const n = cols * base.rows;
    const ch = new Array(n).fill(" "), col = new Array(n);
    const jx = new Float32Array(n), jy = new Float32Array(n);
    const R = st.ramp;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x, tm = raw[i], lum = L[i];
        const tone = Math.pow(clamp((lum - st.black) / st.range, 0, 1), st.gamma);
        const dither = (BAYER[(x & 3) + (y & 3) * 4] / 16 - 0.5) / R.length;
        ch[i] = R[Math.floor(clamp(tone + dither, 0, 0.9999) * R.length)];
        if (st.scatter) { jx[i] = (hash(i * 7.1) - 0.5) * st.scatter; jy[i] = (hash(i * 3.3 + 1) - 0.5) * st.scatter; }
        let gain = st.gain + st.gainDark * (1 - tone);
        if (st.rim) {
          const id = ids[i];
          if ((x > 0 && ids[i - 1] !== id) || (x < cols - 1 && ids[i + 1] !== id) ||
              (y > 0 && ids[i - cols] !== id) || (y < base.rows - 1 && ids[i + cols] !== id)) gain *= 1 + st.rim;
        }
        col[i] = tm.map((v, c) => {
          let o = (lum + (v - lum) * st.sat) * gain + st.lift;
          if (st.jitter) o += (hash(i * 3 + c) - 0.5) * 2 * st.jitter;
          return clamp(o, 0, 1);
        });
      }
    }
    return { cols, rows: base.rows, ch, col, ids, jx, jy };
  }

  /**
   * 陰影を計算する。返り値 base = { cols, rows, raw(色), L(輝度), ids }。
   * onRow(y, base) は 4 行ごとに呼ばれる（逐次描画用）。cellAspect = セルの高さ / 幅。
   * win = [x0, y0, x1, y1] を渡すと、cols×rows の仮想グリッドのうちその範囲だけを描く
   * （小物の寄りのカット用。cols/rows を大きくすると拡大になる）。
   */
  async function render(cols, rows, cellAspect, onRow, win) {
    const fw = norm([TARGET[0] - CAM[0], TARGET[1] - CAM[1], TARGET[2] - CAM[2]]);
    const rt = norm([fw[2], 0, -fw[0]]);
    const up = [fw[1] * rt[2] - fw[2] * rt[1], fw[2] * rt[0] - fw[0] * rt[2], fw[0] * rt[1] - fw[1] * rt[0]];
    const th = Math.tan(HFOV / 2);
    const aspect = cols / (rows * cellAspect);
    const [x0, y0, x1, y1] = win || [0, 0, cols, rows];
    const W = x1 - x0, Hh = y1 - y0, n = W * Hh;
    const base = { cols: W, rows: Hh, raw: new Array(n), L: new Float32Array(n), ids: new Array(n) };
    const SS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];

    for (let y = 0; y < Hh; y++) {
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0;
        const votes = {};
        for (const [sx, sy] of SS) {
          const u = ((x + x0 + sx) / cols * 2 - 1) * th;
          const v = (1 - (y + y0 + sy) / rows * 2) * th / aspect;
          const d = norm([fw[0] + rt[0] * u + up[0] * v, fw[1] + rt[1] * u + up[1] * v, fw[2] + rt[2] * u + up[2] * v]);
          const s = shade(CAM[0], CAM[1], CAM[2], d[0], d[1], d[2]);
          r += s.c[0]; g += s.c[1]; b += s.c[2];
          const k = s.id || "_";
          votes[k] = (votes[k] || 0) + 1;
        }
        const tm = tonemap([r / 4, g / 4, b / 4]);
        const i = y * W + x;
        base.raw[i] = tm;
        base.L[i] = 0.2126 * tm[0] + 0.7152 * tm[1] + 0.0722 * tm[2];
        let best = "_", bv = 0;
        for (const k in votes) if (votes[k] > bv) { bv = votes[k]; best = k; }
        base.ids[i] = best === "_" ? null : best;
      }
      if (onRow && (y % 4 === 3 || y === Hh - 1)) await onRow(y, base);
    }
    return base;
  }

  const api = { render, stylize, STYLES };
  if (typeof module !== "undefined") module.exports = api; else window.Scene = api;
})();
