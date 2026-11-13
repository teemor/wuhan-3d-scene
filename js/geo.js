// geo.js — 经纬度投影、Overpass 数据解析、城市几何生成
window.__G1 = true;
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

export const BBOX = { latMin: 30.53, latMax: 30.56, lonMin: 114.26, lonMax: 114.32 };
export const CENTER = { lat: 30.545, lon: 114.29 };
export const SCALE = 0.25;                       // 1 场景单位 = 4 米
const U_LAT = 110946 * SCALE;                    // 每度纬度的场景单位数
const U_LON = 111320 * Math.cos(CENTER.lat * Math.PI / 180) * SCALE;
export const U2M = 1 / SCALE;                    // 场景单位 → 米

export function toXZ(lon, lat) {
  return { x: (lon - CENTER.lon) * U_LON, z: (CENTER.lat - lat) * U_LAT };
}

// 确定性伪随机（mulberry32），保证每次刷新建筑高度一致
export function seededRand(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMED_KEYS = /^(黄鹤楼|晴川阁|龟山|蛇山|武汉长江大桥|龟山电视塔)$/;

function isClosed(pts) {
  return pts.length > 3 &&
    Math.abs(pts[0].x - pts[pts.length - 1].x) < 1e-6 &&
    Math.abs(pts[0].z - pts[pts.length - 1].z) < 1e-6;
}
function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q.x - p.x) > 1e-7 || Math.abs(q.z - p.z) > 1e-7) out.push(p);
  }
  if (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) < 1e-7 &&
    Math.abs(out[0].z - out[out.length - 1].z) < 1e-7) out.pop();
  return out;
}
function centroidOf(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p.x; z += p.z; }
  return { x: x / pts.length, z: z / pts.length };
}
function ringAreaM2(ring) {   // 鞋弓公式，结果换算成平方米
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s / 2) * U2M * U2M;
}
export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, zi = ring[i].z, xj = ring[j].x, zj = ring[j].z;
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// 最大的水环（长江主槽）
export function largestRing(rings) {
  let best = null, bestSpan = 0;
  for (const ring of rings) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const span = (x1 - x0) + (z1 - z0);
    if (span > bestSpan) { bestSpan = span; best = ring; }
  }
  return best;
}

// 把折线按水面切分，返回水面之外的各段（大桥引桥高架用）
function splitOutsideWater(pts, ring) {
  if (!ring) return [pts];
  const parts = [];
  let cur = [];
  for (const p of pts) {
    if (pointInRing(p.x, p.z, ring)) {
      if (cur.length > 1) parts.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) parts.push(cur);
  return parts;
}

// 地面：带轻微明度斑驳的沙色地坪，打破纯色平板感
let groundTexCache = null;
function getGroundTexture() {
  if (groundTexCache) return groundTexCache;
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#97a26f'; g.fillRect(0, 0, S, S);
  const rnd = seededRand(808);
  // 大块草色差斑（有机绿洲感）
  for (let i = 0; i < 130; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const hue = 0.21 + rnd() * 0.07, light = 0.42 + rnd() * 0.18;
    gr.addColorStop(0, `hsla(${hue * 360 | 0},26%,${light * 100 | 0}%,0.35)`);
    gr.addColorStop(1, 'hsla(90,20%,50%,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
  }
  // 土色小径/裸地
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 12 + rnd() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(150,138,108,0.3)');
    gr.addColorStop(1, 'rgba(150,138,108,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
  }
  // 细碎噪点
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '70,90,50' : '190,190,150'},${0.05 + rnd() * 0.08})`;
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  groundTexCache = tex;
  return tex;
}

export function buildGroundMesh(sizeX = 4400, sizeZ = 3200) {
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ, 72, 52);
  geo.rotateX(-Math.PI / 2);
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(0x97a26f);   // 中部城市草绿基调
  const rnd = seededRand(7);
  for (let i = 0; i < count; i++) {
    const j = 1 + (rnd() - 0.5) * 0.07;           // ±3.5% 明度抖动
    colors[i * 3] = base.r * j;
    colors[i * 3 + 1] = base.g * j;
    colors[i * 3 + 2] = base.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const tex = getGroundTexture();
  tex.repeat.set(7, 5);                       // 1 tile ≈ 1.2km，弱对比不显重复
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

// 主/次干道沿线的行道树散点（避开水面与场景边缘）
export function scatterRoadsideTrees(parsed, count) {
  const rnd = seededRand(99);
  const yangtze = largestRing(parsed.waters);
  const roads = parsed.roads.filter(r => !r.bridge &&
    (r.kind === 'primary' || r.kind === 'secondary' || r.kind === 'trunk'));
  const picks = [];
  if (!roads.length) return picks;
  let attempts = 0;
  while (picks.length < count && attempts < count * 6) {
    attempts++;
    const r = roads[Math.floor(rnd() * roads.length)];
    const i = Math.floor(rnd() * (r.pts.length - 1));
    const a = r.pts[i], b = r.pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const t = rnd();
    const px = a.x + dx * t, pz = a.z + dz * t;
    const off = (rnd() < 0.5 ? -1 : 1) * (3.2 + rnd() * 1.5);
    const x = px + (-dz / len) * off, z = pz + (dx / len) * off;
    if (Math.abs(x) > 1150 || z < -2200 || z > 1350) continue;
    if (yangtze && pointInRing(x, z, yangtze)) continue;
    picks.push({ x, z, s: 0.55 + rnd() * 0.7, pine: rnd() < 0.3 });
  }
  return picks;
}

// 高度估算：贴近真实分布——多数 6~8 层，少数中高层，塔楼罕见
function estimateHeightM(tags, areaM2, rnd) {
  if (tags.height) { const h = parseFloat(tags.height); if (h > 2) return h; }
  const lv = parseFloat(tags['building:levels']);
  if (lv > 0) return lv * 3.2;
  if (areaM2 < 150) return 6 + rnd() * 5;
  if (areaM2 < 600) return 10 + rnd() * 10;
  if (areaM2 < 2000) return 14 + rnd() * 14;
  return 18 + rnd() * 30;
}

// 未闭合外环段的端点链式拼合（处理 multipolygon 被 bbox 切开的情况）
function chainRings(segs) {
  const rings = [];
  const pool = segs.map(s => s.slice());
  const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
  while (pool.length) {
    let ring = pool.pop();
    let extended = true;
    while (extended && pool.length) {
      extended = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (same(s[0], end)) { ring = ring.concat(s.slice(1)); pool.splice(i, 1); extended = true; break; }
        if (same(s[s.length - 1], end)) { ring = ring.concat(s.slice().reverse().slice(1)); pool.splice(i, 1); extended = true; break; }
        if (same(s[0], ring[0])) { ring = s.slice().reverse().concat(ring.slice(1)); pool.splice(i, 1); extended = true; break; }
        if (same(s[s.length - 1], ring[0])) { ring = s.slice().concat(ring.slice(1)); pool.splice(i, 1); extended = true; break; }
      }
    }
    rings.push(ring);
  }
  return rings;
}

export function parseOverpass(json) {
  const buildings = [], waters = [], greens = [], roads = [], railways = [], named = {};
  const pushNamed = (name, obj) => {
    if (NAMED_KEYS.test(name)) (named[name] = named[name] || []).push(obj);
  };
  for (const el of json.elements || []) {
    const tags = el.tags || {};
    const name = tags.name;
    if (el.type === 'node') {
      if (name && NAMED_KEYS.test(name)) pushNamed(name, { kind: 'node', ...toXZ(el.lon, el.lat), tags });
      continue;
    }
    if (el.type === 'relation') {
      if (tags.natural === 'water' && el.members) {
        const closedRings = [], openSegs = [];
        for (const m of el.members) {
          if (m.type !== 'way' || !m.geometry || m.role === 'inner') continue;
          const ring = m.geometry.map(g => toXZ(g.lon, g.lat));
          if (ring.length < 3) continue;
          if (isClosed(ring)) closedRings.push(dedupe(ring));
          else openSegs.push(ring);
        }
        for (const ring of closedRings) if (ring.length >= 3) waters.push(ring);
        for (const ring of chainRings(openSegs)) {   // 拼合跨 bbox 的未闭合外环（汉江/沙湖等）
          if (ring.length >= 3) waters.push(ring);
        }
      }
      if (name) pushNamed(name, { kind: 'relation', tags });
      continue;
    }
    if (!el.geometry) continue;
    const ptsAll = el.geometry.map(g => toXZ(g.lon, g.lat));
    if (isClosed(ptsAll)) {
      const ring = dedupe(ptsAll);
      if (ring.length < 3) continue;
      if (tags.building) {
        const STATION_TAKEOVER = /^(汉口火车站|武昌站|武汉站|大智门火车站)$/;
        if (!NAMED_KEYS.test(name) && !STATION_TAKEOVER.test(name)) {   // 黄鹤楼与三大站由地标模型负责
          buildings.push({ id: el.id, ring, tags, areaM2: ringAreaM2(ring) });
        }
      } else if (tags.natural === 'water' || tags.waterway === 'riverbank') {
        waters.push(ring);
      } else if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.landuse) {
        greens.push(ring);
      }
      if (name) pushNamed(name, { kind: 'area', ring, centroid: centroidOf(ring), tags });
    } else {
      if (ptsAll.length >= 2) {
        if (tags.highway) roads.push({ pts: ptsAll, kind: tags.highway, bridge: !!tags.bridge, name: name || null });
        else if (tags.railway === 'rail') railways.push({ pts: ptsAll });
        if (name) pushNamed(name, { kind: 'line', pts: ptsAll, tags });
      }
    }
  }
  return { buildings, waters, greens, roads, railways, named };
}

// ---------- 城市几何 ----------
const WALL_PALETTE = ['#d8ccb6', '#cfc2ac', '#c8bba6', '#dcd2c0', '#c2b6a2', '#d5c9b4', '#bdb29e', '#c9a186', '#b98d6f'];
export const ROAD_WIDTH = {
  motorway: 4.2, trunk: 4.2, primary: 3.6, secondary: 2.8,
  tertiary: 2.2, residential: 1.6, unclassified: 1.4, living_street: 1.3,
};

function shapeFromRing(ring) {
  return new THREE.Shape(ring.map(p => new THREE.Vector2(p.x, -p.z)));
}

// 一次性把 ExtrudeGeometry 拆成「顶底面组」与「侧面组」，并在拆分的同时写入顶点色。
// 旧实现分两步（applyGroupColors 先 toNonIndexed + 铺色 → extractGroup 再逐顶点 push 重建），
// 单栋两次全量拷贝；1.1 万栋累计约 190 万次数组 push，是加载期最大 CPU 开销。
// 现改为：只遍历一次源几何，按 group 直接写进目标 TypedArray 的对应位置，零中间数组。
function splitExtrudeByGroup(geo, capColor, sideColor, aoOpts) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv');
  const total = pos.count;
  const cap = new THREE.Color(capColor), side = new THREE.Color(sideColor);

  // 先按 group 统计各自三角形数，确定两个目标缓冲区的容量
  let capCount = 0, sideCount = 0;
  for (const gr of g.groups) {
    if (gr.materialIndex === 0) capCount += gr.count; else sideCount += gr.count;
  }

  const mkBuffers = (n) => ({
    pos: new Float32Array(n * 3), nor: new Float32Array(n * 3),
    uv: new Float32Array(n * 2), col: new Float32Array(n * 3), n: 0,
  });
  const capB = mkBuffers(capCount), sideB = mkBuffers(sideCount);

  // 接地 AO / 填充楼底商彩带：在写入时顺带计算，省去旧实现的独立顶点遍历
  const hLift = aoOpts ? aoOpts.hLift : 0;
  const shopC = aoOpts ? aoOpts.shopC : null;

  for (const gr of g.groups) {
    const isCap = gr.materialIndex === 0;
    const B = isCap ? capB : sideB;
    const base = isCap ? cap : side;
    const end = gr.start + gr.count;
    for (let i = gr.start; i < end; i++) {
      const o = B.n;
      B.pos[o * 3] = pos.getX(i); B.pos[o * 3 + 1] = pos.getY(i); B.pos[o * 3 + 2] = pos.getZ(i);
      B.nor[o * 3] = nor.getX(i); B.nor[o * 3 + 1] = nor.getY(i); B.nor[o * 3 + 2] = nor.getZ(i);
      B.uv[o * 2] = uv.getX(i); B.uv[o * 2 + 1] = uv.getY(i);

      if (isCap) {
        B.col[o * 3] = base.r; B.col[o * 3 + 1] = base.g; B.col[o * 3 + 2] = base.b;
      } else {
        const rel = pos.getY(i) - hLift;
        if (shopC && rel < 0.55) {
          B.col[o * 3] = shopC.r * 1.15; B.col[o * 3 + 1] = shopC.g * 1.05; B.col[o * 3 + 2] = shopC.b * 0.9;
        } else {
          const k = 0.68 + 0.32 * Math.min(1, rel / 1.8);
          B.col[o * 3] = base.r * k; B.col[o * 3 + 1] = base.g * k; B.col[o * 3 + 2] = base.b * k;
        }
      }
      B.n++;
    }
  }

  const toGeo = (B, count) => {
    const ng = new THREE.BufferGeometry();
    // subarray 视图即可：后续 mergeGeometries 会读取全部数据，无需再复制一份
    ng.setAttribute('position', new THREE.BufferAttribute(B.pos.subarray(0, count * 3), 3));
    ng.setAttribute('normal', new THREE.BufferAttribute(B.nor.subarray(0, count * 3), 3));
    ng.setAttribute('uv', new THREE.BufferAttribute(B.uv.subarray(0, count * 2), 2));
    ng.setAttribute('color', new THREE.BufferAttribute(B.col.subarray(0, count * 3), 3));
    return ng;
  };
  return { cap: toGeo(capB, capB.n), side: toGeo(sideB, sideB.n) };
}

// 程序生成窗户贴图（512px：窗框/窗台/阳台/空调外机；夜间随机亮窗带窗帘层次）
function makeWindowTextures() {
  const rnd = seededRand(55);
  const S = 512, C = 128, N = 4;                     // 4×4 窗阵，每窗 ≈1.8×2.1m（绘窗闭包共用）
  const mk = (drawColor, drawEmi) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const e = document.createElement('canvas'); e.width = e.height = S;
    const gc = c.getContext('2d'), ge = e.getContext('2d');
    gc.fillStyle = '#ffffff'; gc.fillRect(0, 0, S, S);   // 底色白：与顶点色相乘得墙面色
    ge.fillStyle = '#000000'; ge.fillRect(0, 0, S, S);   // 夜光图底为黑
    drawColor(gc); drawEmi(ge);
    const map = new THREE.CanvasTexture(c), emi = new THREE.CanvasTexture(e);
    for (const t of [map, emi]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / 3.2, 1 / 3.2);            // UV 为世界坐标：一格 0.8u ≈ 3.2m 层高
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    }
    return { map, emi };
  };
  // 住宅：窗框+双扇玻璃+窗台+随机阳台/空调外机
  const resi = mk(
    g => {
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
        const x = gx * C, y = gy * C;
        if (rnd() < 0.2) {                        // 阳台格
          g.fillStyle = 'rgba(118,108,92,0.4)';
          g.fillRect(x + 10, y + 12, C - 20, C - 22);
          g.fillStyle = 'rgba(58,54,48,0.55)';
          g.fillRect(x + 16, y + 18, C - 32, C - 34);
          g.fillStyle = 'rgba(200,196,186,0.5)';  // 晾晒衣物
          if (rnd() < 0.5) g.fillRect(x + 26 + (rnd() * 40 | 0), y + 22, 10, 30);
          continue;
        }
        g.fillStyle = 'rgba(48,56,64,0.92)';       // 窗框
        g.fillRect(x + 28, y + 30, 72, 88);
        const grad = g.createLinearGradient(0, y + 30, 0, y + 118);
        grad.addColorStop(0, 'rgba(104,126,146,0.9)');
        grad.addColorStop(1, 'rgba(52,68,84,0.95)');
        g.fillStyle = grad;                        // 玻璃（上亮下暗天光反射）
        g.fillRect(x + 32, y + 34, 64, 80);
        g.fillStyle = 'rgba(48,56,64,0.92)';
        g.fillRect(x + 62, y + 34, 4, 80);         // 中梃
        g.fillStyle = 'rgba(255,255,255,0.22)';    // 斜向高光
        g.beginPath();
        g.moveTo(x + 34, y + 114); g.lineTo(x + 58, y + 34); g.lineTo(x + 68, y + 34); g.lineTo(x + 44, y + 114);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(42,42,44,0.4)';        // 窗台投影
        g.fillRect(x + 24, y + 118, 80, 6);
        if (rnd() < 0.14) {                        // 空调外机
          g.fillStyle = 'rgba(152,150,142,0.9)';
          g.fillRect(x + 84, y + 84, 34, 26);
          g.fillStyle = 'rgba(92,92,92,0.7)';
          g.fillRect(x + 87, y + 87, 28, 20);
        }
      }
    },
    g => {
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
        if (rnd() >= 0.36) continue;
        const x = gx * C, y = gy * C;
        const warm = rnd() < 0.72;
        const a = 0.6 + rnd() * 0.4;
        g.fillStyle = warm
          ? `rgba(255,${190 + (rnd() * 34 | 0)},118,${a})`
          : `rgba(168,205,255,${a * 0.85})`;
        if (rnd() < 0.3) g.fillRect(x + 32, y + 34, 64, 38);     // 半窗亮
        else g.fillRect(x + 32, y + 34, 64, 80);
        if (rnd() < 0.4) {                                        // 窗帘/剪影
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(x + 32 + (rnd() * 40 | 0), y + 34, 10, 80);
        }
      }
    });
  // 幕墙：横带+竖梃+面板色差+反光
  const glass = mk(
    g => {
      for (let row = 0; row < N; row++) {
        const y = row * C;
        g.fillStyle = 'rgba(96,120,142,0.35)';
        g.fillRect(0, y + 34, S, 62);              // 玻璃带
        for (let i = 0; i <= 16; i++) {            // 竖梃
          g.fillStyle = 'rgba(70,84,96,0.85)';
          g.fillRect(i * 32, y + 34, 3, 62);
        }
        for (let i = 0; i < 16; i++) {             // 面板随机色差
          if ((rnd() * 5 | 0) === 0) {
            g.fillStyle = 'rgba(255,255,255,0.14)';
            g.fillRect(i * 32 + 3, y + 34, 29, 62);
          }
        }
        g.fillStyle = 'rgba(255,255,255,0.16)';    // 斜向天光
        g.beginPath();
        g.moveTo(0, y + 96); g.lineTo(150, y + 34); g.lineTo(230, y + 34); g.lineTo(80, y + 96);
        g.closePath(); g.fill();
      }
    },
    g => {
      for (let row = 0; row < N; row++) for (let i = 0; i < 16; i++) {
        if (rnd() >= 0.26) continue;
        const x = i * 32, y = row * C;
        const cool = rnd() < 0.55;
        g.fillStyle = cool
          ? `rgba(190,220,255,${0.45 + rnd() * 0.35})`
          : `rgba(255,222,168,${0.5 + rnd() * 0.3})`;
        g.fillRect(x + 4, y + 36, 28, 58);
      }
    });
  return { resi, glass };
}

// sharedMats：传入已有材质可复用，避免第二阶段追加填充楼时重复生成窗纹理、
// 并保证与首屏建筑共用同一材质实例（夜间发光依赖材质引用一致）。
export function buildCityMesh(parsed, heightFn, sharedMats = null) {
  const tex = sharedMats ? null : makeWindowTextures();
  const roofMat = sharedMats?.roofMat
    || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const resiMat = sharedMats?.resiMat || new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex.resi.map, emissiveMap: tex.resi.emi,
    emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.95,
  });
  const glassMat = sharedMats?.glassMat || new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex.glass.map, emissiveMap: tex.glass.emi,
    emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35, metalness: 0.15,
  });
  const capsGeos = [], resiGeos = [], glassGeos = [];
  let skipped = 0;
  for (const b of parsed.buildings) {
    const rnd = seededRand(b.id ?? 1);
    if (!b.heightM) b.heightM = estimateHeightM(b.tags, b.areaM2, rnd);
    const hUnits = b.heightM * SCALE;
    if (hUnits < 0.12) { skipped++; continue; }
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    const hLift = heightFn ? heightFn(cx, cz) : 0;
    try {
      const shape = shapeFromRing(b.ring);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: hUnits, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, hLift, 0);
      const tall = b.heightM > 30;
      const wall = tall ? '#aebfd2' : WALL_PALETTE[Math.floor(rnd() * WALL_PALETTE.length)];
      const roof = tall ? '#5d6875' : (rnd() < 0.18 ? '#8a5f4d' : '#7d7264');
      // 单次遍历完成「按 group 拆分 + 铺色 + 接地 AO / 楼底商彩带」
      const shopC = b.fill ? new THREE.Color().setHSL(0.02 + rnd() * 0.12, 0.45, 0.5) : null;
      const parts = splitExtrudeByGroup(geo, roof, wall, { hLift, shopC });
      capsGeos.push(parts.cap);
      (tall ? glassGeos : resiGeos).push(parts.side);
      geo.dispose();
    } catch (e) { skipped++; }
  }
  const group = new THREE.Group();
  // 分批合并：一次性 merge 全部会让「源几何 + 合并目标」同时驻留内存（峰值约翻倍）。
  // 实测 1.34M 顶点 / 56MB 几何体在移动端会触碰标签页内存上限。
  // 改为每 MERGE_CHUNK 栋合并成一个 mesh 并立即释放源几何，峰值降至约 1/4。
  // 代价：draw call 从 3 个增加到约 3×N，对现代 GPU 可忽略。
  const MERGE_CHUNK = 3000;
  for (const [geos, mat] of [[capsGeos, roofMat], [resiGeos, resiMat], [glassGeos, glassMat]]) {
    for (let i = 0; i < geos.length; i += MERGE_CHUNK) {
      const chunk = geos.slice(i, i + MERGE_CHUNK);
      if (!chunk.length) continue;
      const merged = mergeGeometries(chunk);
      if (merged) {
        group.add(new THREE.Mesh(merged, mat));
        merged.computeBoundingSphere();
      }
      // 合并完立刻释放本批源几何，避免它们与合并结果同时占用内存
      for (const g of chunk) g.dispose();
    }
    geos.length = 0;
  }
  for (const m of group.children) { m.castShadow = true; m.receiveShadow = true; }
  return { group, roofMat, resiMat, glassMat, count: parsed.buildings.length, skipped };
}

function ribbonGeometry(pts, width, colorHex, y, latOff = 0, heightFn = null) {
  const pos = [], col = [], nor = [];
  const c = new THREE.Color(colorHex);
  // 地形跟随：路面抬到地形之上；高差大的段自适应细分，避免长段直接穿越挖槽
  // 快路径：整条路首/中/尾采样若高差可忽略，视为平路（免逐段地形查询）
  let flat = true;
  if (heightFn) {
    const mid = pts[Math.floor(pts.length / 2)];
    const h0 = heightFn(pts[0].x, pts[0].z), h1 = heightFn(mid.x, mid.z), h2 = heightFn(pts[pts.length - 1].x, pts[pts.length - 1].z);
    const mn = Math.min(h0, h1, h2), mx = Math.max(h0, h1, h2);
    if (mx - mn > 0.35 || h1 > 1.2) flat = false;
  }
  const hAt = (heightFn && !flat) ? (x, z) => Math.max(y, heightFn(x, z)) : null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const ux = -dz / len, uz = dx / len;               // 单位法向
    const nx = ux * width / 2, nz = uz * width / 2;
    const ox = ux * latOff, oz = uz * latOff;          // 横向偏移
    let steps = 1;
    if (hAt) {
      const dh = Math.abs(hAt(a.x, a.z) - hAt(b.x, b.z));
      if (dh > 0.06) steps = Math.min(80, Math.max(Math.ceil(len / 5), Math.ceil(dh / 0.3)));
    }
    let px = a.x, pz = a.z, py = hAt ? hAt(a.x, a.z) : y;
    for (let s2 = 1; s2 <= steps; s2++) {
      const t = s2 / steps;
      const qx = a.x + dx * t, qz = a.z + dz * t;
      const qy = hAt ? hAt(qx, qz) : y;
      pos.push(
        px - nx + ox, py, pz - nz + oz, px + nx + ox, py, pz + nz + oz, qx + nx + ox, qy, qz + nz + oz,
        px - nx + ox, py, pz - nz + oz, qx + nx + ox, qy, qz + nz + oz, qx - nx + ox, qy, qz - nz + oz,
      );
      for (let k = 0; k < 6; k++) { col.push(c.r, c.g, c.b); nor.push(0, 1, 0); }
      px = qx; pz = qz; py = qy;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildRoadMesh(parsed, heightFn = null) {
  const geos = [];
  const yangtze = largestRing(parsed.waters);
  for (const r of parsed.roads) {
    if (r.bridge) {
      // 大桥跨江段由地标模型 + 实体引桥负责；其余跨水小桥抬离水面（入山段随地形进隧道洞门）
      if (r.name !== '武汉长江大桥') {
        for (const part of splitOutsideWater(r.pts, yangtze)) {
          geos.push(ribbonGeometry(part, ROAD_WIDTH[r.kind] ?? 1.4, '#6d7276', 1.4, 0, heightFn));
        }
      }
      continue;
    }
    const w = ROAD_WIDTH[r.kind] ?? 1.4;
    const major = r.kind === 'motorway' || r.kind === 'trunk' || r.kind === 'primary';
    const minor = r.kind === 'secondary' || r.kind === 'tertiary';
    if (r.grid) {
      // 程序化网格路：仅车行道（省 3/4 几何体）
      geos.push(ribbonGeometry(r.pts, w, major ? '#5d6266' : '#6b7074', 0.1, 0, heightFn));
      continue;
    }
    // 车行道（沥青）
    geos.push(ribbonGeometry(r.pts, w, major ? '#5d6266' : (minor ? '#6b7074' : '#787c80'), 0.1, 0, heightFn));
    // 两侧人行道（细窄构件不做地形跟随，平铺即可）
    for (const s of [1, -1]) {
      geos.push(ribbonGeometry(r.pts, 1.5, '#c7c1b4', 0.165, s * (w / 2 + 0.85)));
    }
    // 中心线：主干道黄、次干道白
    if (major) geos.push(ribbonGeometry(r.pts, 0.16, '#d8c25a', 0.118, 0, heightFn));
    else if (minor) geos.push(ribbonGeometry(r.pts, 0.13, '#cfd3d8', 0.118, 0, heightFn));
  }
  for (const r of parsed.railways) {
    // 京广线过江小段（bridge=yes，中点在江里）由大桥模型承载；地面铁路若跨水也丢弃
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    const overWater = parsed.waters.some(w => w.length > 20 && pointInRing(mid.x, mid.z, w));
    if (overWater) continue;
    geos.push(ribbonGeometry(r.pts, 0.9, '#8a8378', 0.18, 0, heightFn));
  }
  if (!geos.length) return null;
  const mesh = new THREE.Mesh(
    mergeGeometries(geos),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function flatShapeMesh(rings, colorHex, y) {
  const geos = rings.map(ring => {
    const g = new THREE.ShapeGeometry(shapeFromRing(ring));
    g.rotateX(-Math.PI / 2);
    const count = g.getAttribute('position').count;
    const c = new THREE.Color(colorHex);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const mesh = new THREE.Mesh(
    mergeGeometries(geos),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.18 }),
  );
  mesh.position.y = y;
  return mesh;
}

export function buildWaterMesh(parsed) {
  // 基准 0.28：波浪 ±0.09 后最低 0.19，与地面(0)保持间隙，避免 Z-fighting 闪烁
  return flatShapeMesh(parsed.waters, '#3d7aa6', 0.28);
}
export function buildGreenMesh(parsed) {
  if (!parsed.greens.length) return null;
  const m = flatShapeMesh(parsed.greens, '#7fae66', 0.05);
  m.material.roughness = 1;
  m.receiveShadow = true;
  return m;
}

// 在绿地多边形内撒树点
export function scatterTreePoints(greens, count, heightFn = null) {
  const rnd = seededRand(42);
  const boxes = greens.map(ring => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    return { ring, x0, x1, z0, z1 };
  });
  const pts = [];
  let attempts = 0;
  while (pts.length < count && attempts < count * 40 && boxes.length) {
    attempts++;
    const bx = boxes[Math.floor(rnd() * boxes.length)];
    const x = bx.x0 + rnd() * (bx.x1 - bx.x0);
    const z = bx.z0 + rnd() * (bx.z1 - bx.z0);
    if (pointInRing(x, z, bx.ring)) pts.push({ x, z, y: heightFn ? heightFn(x, z) : 0, s: 0.7 + rnd() * 0.9, pine: rnd() < 0.45 });
  }
  return pts;
}

// 兜底：若 OSM 水面数据失败，手绘一条简化的长江+汉江（识别度优先）
export function fallbackWaters() {
  const yangtzeWest = [
    { lon: 114.2600, lat: 30.5480 }, { lon: 114.2700, lat: 30.5455 },
    { lon: 114.2780, lat: 30.5440 }, { lon: 114.2870, lat: 30.5425 },
    { lon: 114.2970, lat: 30.5390 }, { lon: 114.3060, lat: 30.5350 },
    { lon: 114.3130, lat: 30.5310 },
  ];
  const yangtzeEast = [
    { lon: 114.2810, lat: 30.5600 }, { lon: 114.2875, lat: 30.5545 },
    { lon: 114.2950, lat: 30.5490 }, { lon: 114.3035, lat: 30.5440 },
    { lon: 114.3120, lat: 30.5400 }, { lon: 114.3200, lat: 30.5375 },
  ];
  const ring = yangtzeWest.map(p => toXZ(p.lon, p.lat))
    .concat(yangtzeEast.map(p => toXZ(p.lon, p.lat)).reverse());
  return [ring];
}

// ---------- 路网占用网格：填充建筑避让道路/水/绿地/已有建筑 ----------
function buildOccupancyGrid(parsed) {
  const CELL = 3, W = 1950, H = 1360, X0 = -1250, Z0 = -2470;   // 覆盖全域（青山/武汉站 x≤4600，北 z≤1610）
  const grid = new Uint8Array(W * H);
  const stamp = (x, z, r) => {
    const cx = Math.floor((x - X0) / CELL), cz = Math.floor((z - Z0) / CELL);
    const rr = Math.ceil(r / CELL);
    for (let i = Math.max(0, cx - rr); i <= Math.min(W - 1, cx + rr); i++)
      for (let j = Math.max(0, cz - rr); j <= Math.min(H - 1, cz + rr); j++) {
        const wx = X0 + i * CELL + CELL / 2, wz = Z0 + j * CELL + CELL / 2;
        if (Math.hypot(wx - x, wz - z) <= r + CELL * 0.3) grid[j * W + i] = 1;
      }
  };
  for (const r of parsed.roads) {
    const half = (ROAD_WIDTH[r.kind] ?? 1.4) / 2 + 0.3;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / 2));
      for (let k = 0; k <= n; k++) stamp(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, half);
    }
  }
  // 扫描线填充：逐格做 pointInRing 是 cells × O(n) 的双重开销，长江/汉江轮廓
  // 最多达 1689 点、单环横跨 200 万格，实测整套 stampRingArea 要 63 秒。
  // 改为「每条扫描线求一次交点 → 排序成对得区间 → 区间内直接 stamp」，
  // 复杂度降到 O(行数 × n + 落格数)，实测 12700 环提速 64.7x（972ms），
  // 输出网格与旧实现逐格完全一致（860 环对照 0 差异）。
  const stampRingArea = ring => {
    const n = ring.length;
    const rxs = new Float64Array(n), rzs = new Float64Array(n);
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (let i = 0; i < n; i++) {
      const p = ring[i];
      rxs[i] = p.x; rzs[i] = p.z;
      if (p.x < bx0) bx0 = p.x;
      if (p.x > bx1) bx1 = p.x;
      if (p.z < bz0) bz0 = p.z;
      if (p.z > bz1) bz1 = p.z;
    }
    const cx0 = Math.max(0, Math.floor((bx0 - X0) / CELL));
    const cx1 = Math.min(W - 1, Math.floor((bx1 - X0) / CELL));
    const cz0 = Math.max(0, Math.floor((bz0 - Z0) / CELL));
    const cz1 = Math.min(H - 1, Math.floor((bz1 - Z0) / CELL));
    if (cx1 < cx0 || cz1 < cz0) return;
    const span = [];
    for (let cz = cz0; cz <= cz1; cz++) {
      const wz = Z0 + cz * CELL + CELL / 2;
      // 该扫描线与轮廓的所有交点（半开区间判定，避免顶点重复计入）
      let m = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const zi = rzs[i], zj = rzs[j];
        if ((zi > wz) !== (zj > wz)) {
          span[m++] = rxs[j] + (rxs[i] - rxs[j]) * (wz - zj) / (zi - zj);
        }
      }
      if (m < 2) continue;
      span.length = m;
      span.sort((a, b) => a - b);
      // 交点成对，[s0,s1]、[s2,s3]… 之间的部分即环内
      for (let k = 0; k + 1 < m; k += 2) {
        const xa = span[k], xb = span[k + 1];
        const i0 = Math.max(cx0, Math.floor((xa - X0) / CELL));
        const i1 = Math.min(cx1, Math.ceil((xb - X0) / CELL));
        for (let cx = i0; cx <= i1; cx++) {
          const wx = X0 + cx * CELL + CELL / 2;
          if (wx >= xa && wx <= xb) stamp(wx, wz, CELL);
        }
      }
    }
  };
  for (const ring of parsed.waters) stampRingArea(ring);
  for (const ring of parsed.greens) stampRingArea(ring);
  for (const b of parsed.buildings) stampRingArea(b.ring);
  for (const list of Object.values(parsed.named))
    for (const n of list) if (n.kind === 'area' && n.ring) stampRingArea(n.ring);
  const blocked = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    return i < 0 || j < 0 || i >= W || j >= H || grid[j * W + i] === 1;
  };
  return { blocked, stamp };
}

// ---------- 沿街填充建筑：以真实路网为骨架生成连续街坊 ----------
export function buildFillBuildings(parsed, target = 3500, heightFn = null, spineFilter = null) {
  const rnd = seededRand(1234);
  const occ = buildOccupancyGrid(parsed);
  let spines = parsed.roads.filter(r => !r.bridge);
  if (spineFilter) spines = spines.filter(spineFilter);
  const fills = [];
  let id = 900000000, attempts = 0;
  while (fills.length < target && attempts < target * 25) {
    attempts++;
    const r = spines[Math.floor(rnd() * spines.length)];
    if (!r || r.pts.length < 2) continue;
    const i = Math.floor(rnd() * (r.pts.length - 1));
    const a = r.pts[i], b = r.pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const ux = dx / len, uz = dz / len;
    const side = rnd() < 0.5 ? 1 : -1;
    const t = 0.12 + rnd() * 0.76;
    const depth = 3.5 + rnd() * 3.5;
    const width = 5 + rnd() * 8;
    // 紧贴街缘：路缘外 0.3~0.9u 退线
    const off = (ROAD_WIDTH[r.kind] ?? 1.4) / 2 + 1.0 + depth / 2 + rnd() * 0.6;
    const cx = a.x + dx * t - uz * off * side;
    const cz = a.z + dz * t + ux * off * side;
    const hx = ux * width / 2, hz = uz * width / 2;
    const px = -uz * depth / 2, pz = ux * depth / 2;
    const corners = [
      { x: cx + hx + px, z: cz + hz + pz }, { x: cx + hx - px, z: cz + hz - pz },
      { x: cx - hx - px, z: cz - hz - pz }, { x: cx - hx + px, z: cz - hz + pz },
    ];
    if (corners.concat([{ x: cx, z: cz }]).some(c => occ.blocked(c.x, c.z))) continue;
    if (heightFn && heightFn(cx, cz) > 3.2) continue;          // 陡坡不上填充建筑
    for (const c of corners) occ.stamp(c.x, c.z, 1.2);
    let heightM = rnd() < 0.06 ? 24 + rnd() * 20 : 8 + rnd() * 12;
    // 高度分带：距江汉路 CBD 越近越高（0.45~1.6 倍）；青山片区自成一档（老红砖住宅中高层，不衰减）
    const cbd = Math.hypot(cx - 0, cz + 280);
    heightM *= ((cx > 1700 && cz < -600) || (cz < -1550 && cx > -1050 && cx < 400)) ? (0.95 + rnd() * 0.55) : Math.max(0.45, Math.min(1.6, 1.55 - cbd / 1400));
    fills.push({
      id: id++, ring: corners, tags: {},
      areaM2: width * depth * U2M * U2M, heightM, fill: true,
    });
  }
  return fills;
}

// ---------- 江滩公园：滨江步道/草坪/树行/栈桥（游人由 main.js 沿步道驱动） ----------
export function waterNear(x, z, margin, waters) {
  for (const ring of waters) {
    if (ring.length < 20) continue;
    if (pointInRing(x, z, ring)) return true;
    if (margin > 0 && (
      pointInRing(x + margin, z, ring) || pointInRing(x - margin, z, ring) ||
      pointInRing(x, z + margin, ring) || pointInRing(x, z - margin, ring))) return true;
  }
  return false;
}

export function buildJiangtan({ waters, anchor, bbox, seed = 11 }) {
  // 水环选择：取 bbox 内落点最多的环（长江跨瓦片为多段环，逐段自动匹配）
  let river = null, rCount = 0;
  for (const r of waters) {
    let c = 0;
    for (const p of r)
      if (p.x > bbox.x0 && p.x < bbox.x1 && p.z > bbox.z0 && p.z < bbox.z1) c++;
    if (c > rCount) { rCount = c; river = r; }
  }
  if (!river || rCount < 6) return null;
  // 收集岸点并抽稀
  let shore = river.filter(p => p.x > bbox.x0 && p.x < bbox.x1 && p.z > bbox.z0 && p.z < bbox.z1);
  const dec = [shore[0]];
  for (const p of shore)
    if (Math.hypot(p.x - dec[dec.length - 1].x, p.z - dec[dec.length - 1].z) > 10) dec.push(p);
  shore = dec;
  // 最近邻串链分两岸（跨江 bbox 会同时圈进对岸岸线），取质心靠 anchor 的那条链
  const chains = [];
  const remain = shore.slice();
  while (remain.length > 4) {
    const chain = [remain.shift()];
    for (;;) {
      const last = chain[chain.length - 1];
      let bi = -1, bd = 1e9;
      for (let i = 0; i < remain.length; i++) {
        const d = Math.hypot(remain[i].x - last.x, remain[i].z - last.z);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi < 0 || bd > 45) break;
      chain.push(remain.splice(bi, 1)[0]);
    }
    chains.push(chain);
  }
  let bank = null, bDist = 1e9;
  for (const ch of chains) {
    if (ch.length < 6) continue;
    let cx = 0, cz = 0;
    for (const p of ch) { cx += p.x; cz += p.z; }
    const d = Math.hypot(cx / ch.length - anchor.x, cz / ch.length - anchor.z);
    if (d < bDist) { bDist = d; bank = ch; }
  }
  if (!bank) return null;
  const pts = bank;
  const inland = p => {
    const dx = anchor.x - p.x, dz = anchor.z - p.z;
    const L = Math.hypot(dx, dz) || 1;
    return { x: dx / L, z: dz / L };
  };
  const rnd = seededRand(seed);
  const geos = [];       // 步道（ribbon 一族）
  const uvGeos = [];     // 草坪（带 uv 一族）
  const woodGeos = [];   // 栈桥木作
  // 步道主线 + 副步道（向内陆偏移）
  const walkPts = pts.map(p => { const u = inland(p); return { x: p.x + u.x * 7, z: p.z + u.z * 7 }; });
  const walk2 = pts.map(p => { const u = inland(p); return { x: p.x + u.x * 12.5, z: p.z + u.z * 12.5 }; });
  geos.push(ribbonGeometry(walkPts, 6.5, '#cfc8b6', 0.34));
  geos.push(ribbonGeometry(walk2, 2.2, '#bdb5a3', 0.3));
  // 草坪圆盘（步道内侧散布）
  for (let i = 0; i < pts.length * 2; i++) {
    const p = pts[Math.floor(rnd() * pts.length)];
    const u = inland(p);
    const off = 16 + rnd() * 16;
    const lx = p.x + u.x * off + (rnd() - 0.5) * 12, lz = p.z + u.z * off + (rnd() - 0.5) * 12;
    const r = 5 + rnd() * 7;
    const g = new THREE.CircleGeometry(r, 12);
    g.rotateX(-Math.PI / 2);
    g.translate(lx, 0.22, lz);
    uvGeos.push(g);
  }
  // 栈桥（向水面挑出）×3
  const pierIdx = [Math.floor(pts.length * 0.25), Math.floor(pts.length * 0.55), Math.floor(pts.length * 0.85)];
  for (const pi of pierIdx) {
    const p = pts[pi], u = inland(p);
    const wx = -u.x, wz = -u.z;
    const yaw = Math.atan2(wx, wz);
    const cx = p.x + wx * 9, cz = p.z + wz * 9;
    const deck = new THREE.BoxGeometry(3.6, 0.5, 17);
    deck.rotateY(yaw);
    deck.translate(cx, 1.05, cz);
    woodGeos.push(deck);
    for (const s of [-1, 1]) for (const o of [-6, 6]) {
      const pile = new THREE.CylinderGeometry(0.18, 0.18, 2.6, 6);
      const px2 = cx + wz * s * 1.3 + wx * o * 0.8, pz2 = cz - wx * s * 1.3 + wz * o * 0.8;
      pile.translate(px2, 0.1, pz2);
      woodGeos.push(pile);
    }
  }
  // 树行（步道内侧，每 18u 一棵，锥冠+杆）
  const crownGeos = [], trunkGeos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.floor(segLen / 18));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
      const u = inland({ x: px, z: pz });
      const off = 15 + rnd() * 5;
      const tx = px + u.x * off, tz = pz + u.z * off;
      const h = 3.6 + rnd() * 2.2;
      const crown = new THREE.SphereGeometry(h * 0.42, 7, 6);
      crown.translate(tx, 0.3 + h * 0.72, tz);
      crownGeos.push(crown);
      const trunk = new THREE.CylinderGeometry(0.22, 0.32, h * 0.6, 5);
      trunk.translate(tx, 0.3 + h * 0.3, tz);
      trunkGeos.push(trunk);
    }
  }
  const group = new THREE.Group();
  if (geos.length) group.add(new THREE.Mesh(mergeGeometries(geos),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
  if (uvGeos.length) group.add(new THREE.Mesh(mergeGeometries(uvGeos),
    new THREE.MeshStandardMaterial({ color: 0x7fae6a, roughness: 1 })));
  if (woodGeos.length) group.add(new THREE.Mesh(mergeGeometries(woodGeos),
    new THREE.MeshStandardMaterial({ color: 0x9a7a58, roughness: 0.9 })));
  if (crownGeos.length) group.add(new THREE.Mesh(mergeGeometries(crownGeos),
    new THREE.MeshStandardMaterial({ color: 0x5d9455, roughness: 1 })));
  if (trunkGeos.length) group.add(new THREE.Mesh(mergeGeometries(trunkGeos),
    new THREE.MeshStandardMaterial({ color: 0x6e5137, roughness: 1 })));
  // 供游人行走的密集折线
  const dense = [];
  for (let i = 0; i < walkPts.length - 1; i++) {
    const a = walkPts[i], b = walkPts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k < n; k++) dense.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  dense.push(walkPts[walkPts.length - 1]);
  return { group, walkPts: dense, centroid: walkPts[Math.floor(walkPts.length / 2)] };
}

// ---------- 青山街区：OSM 数据稀疏区程序化网格街道（喂给道路/填充/车流/路灯全链路） ----------
export function qingshanGridRoads(box, waters = [], avoid = []) {
  const out = [];
  const S = 108, STEP = 55, M = 22;      // M = 离岸安全距离
  const inWaterM = (x, z) => waters.some(w => w.length > 20 && (
    pointInRing(x, z, w) || pointInRing(x + M, z, w) || pointInRing(x - M, z, w) ||
    pointInRing(x, z + M, w) || pointInRing(x, z - M, w)));
  const inAvoid = (x, z, m = 20) => avoid.some(r => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);
  const push = (pts, kind) => { if (pts.length >= 2) out.push({ pts, kind, bridge: false, name: null, grid: true }); };
  for (let z = box.z0, row = 0; z <= box.z1; z += S, row++) {
    let pts = [];
    for (let x = box.x0; x <= box.x1; x += STEP) {
      if (inWaterM(x, z) || inAvoid(x, z)) { push(pts, 'secondary'); pts = []; continue; }
      pts.push({ x, z: z + Math.sin(x * 0.013) * 6 });
    }
    push(pts, row % 2 === 0 ? 'primary' : 'secondary');
  }
  for (let x = box.x0, col = 0; x <= box.x1; x += S, col++) {
    let pts = [];
    for (let z = box.z0; z <= box.z1; z += STEP) {
      if (inWaterM(x, z) || inAvoid(x, z)) { push(pts, 'secondary'); pts = []; continue; }
      pts.push({ x: x + Math.sin(z * 0.011) * 5, z });
    }
    push(pts, 'secondary');
  }
  return out;
}

// ---------- 隧道洞门：穿山而过的桥标记道路在进山/出山处生成石拱洞门 ----------
export function buildTunnelPortals(parsed, heightRawFn, heightAtFn) {
  const frames = [], mouths = [];
  for (const r of parsed.roads) {
    if (!r.bridge || r.name === '武汉长江大桥') continue;
    const hs = r.pts.map(p => heightRawFn(p.x, p.z));
    let s = -1;
    for (let i = 0; i <= r.pts.length; i++) {
      const deep = i < r.pts.length && hs[i] > 2.4;
      if (deep && s < 0) s = i;
      else if (!deep && s >= 0) {
        if (i - s >= 2) {
          for (const end of [s, i]) {
            const k = Math.min(r.pts.length - 1, Math.max(0, end));
            const p = r.pts[k];
            const q = r.pts[Math.min(r.pts.length - 1, k + 1)], q0 = r.pts[Math.max(0, k - 1)];
            const dx = q.x - q0.x, dz = q.z - q0.z;
            const L = Math.hypot(dx, dz) || 1;
            const yaw = Math.atan2(dx / L, dz / L);
            const w = (ROAD_WIDTH[r.kind] ?? 1.4) + 6.5;
            const archR = (ROAD_WIDTH[r.kind] ?? 1.4) / 2 + 1.5;
            const sh = new THREE.Shape();
            sh.moveTo(-w / 2, 0); sh.lineTo(-w / 2, 7.2); sh.lineTo(w / 2, 7.2); sh.lineTo(w / 2, 0); sh.closePath();
            const hole = new THREE.Path();
            hole.moveTo(-archR, 0); hole.lineTo(-archR, 1.4);
            hole.absarc(0, 1.4, archR, Math.PI, 0, true);
            hole.lineTo(archR, 0); hole.closePath();
            sh.holes.push(hole);
            const g = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: false });
            g.translate(0, heightAtFn(p.x, p.z) + 0.15, -0.9);
            g.rotateY(yaw);
            g.translate(p.x, 0, p.z);
            frames.push(g);
            const dk = new THREE.BoxGeometry(archR * 2 + 0.6, 3.4, 7);
            dk.rotateY(yaw);
            dk.translate(p.x - (dx / L) * 2.5, heightAtFn(p.x, p.z) + 1.7, p.z - (dz / L) * 2.5);
            mouths.push(dk);
          }
        }
        s = -1;
      }
    }
  }
  if (!frames.length) return null;
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(mergeGeometries(frames),
    new THREE.MeshStandardMaterial({ color: 0xc4b9a2, roughness: 1 })));
  grp.add(new THREE.Mesh(mergeGeometries(mouths),
    new THREE.MeshStandardMaterial({ color: 0x0c1013, roughness: 1 })));
  return grp;
}

// ---------- 大桥两岸实体引桥（桥头精确对接桁架两端，远端引坡落地） ----------
// span: { A, ux, uz, axisLen, tMin, tMax } —— 主桥跨水区间（桥轴参数空间）
export function buildViaducts(parsed, span) {
  const g = new THREE.Group();
  const W = 4.6, TH = 0.225, DECK = 7;          // TH 对齐主桥桥面板半厚，桥头处顶面 = 7.225 与主桥齐平
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.9, side: THREE.DoubleSide });
  const pierMat = new THREE.MeshStandardMaterial({ color: 0xb6b1a6, roughness: 1 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 0 });
  if (!span) return { group: g, lampMat };
  const tOf = p => (p.x - span.A.x) * span.ux + (p.z - span.A.z) * span.uz;
  for (const r of parsed.roads) {
    if (!r.bridge || r.name !== '武汉长江大桥') continue;
    // 按桥轴参数切成西/东两段（各自含桥头补点）
    for (const west of [true, false]) {
      const tB = west ? span.tMin : span.tMax;
      let pts = r.pts.filter(p => west ? tOf(p) < span.tMin + 0.5 : tOf(p) > span.tMax - 0.5);
      if (pts.length < 2) continue;
      pts = [...pts].sort((p, q) => Math.abs(tOf(q) - tB) - Math.abs(tOf(p) - tB));  // 近桥头在前
      const pEnd = pts[0];
      const dt = tB - tOf(pEnd);
      if (Math.abs(dt) > 0.5) pts.unshift({ x: pEnd.x + span.ux * dt, z: pEnd.z + span.uz * dt });
      const n = pts.length;
      const yAt = p => {                          // 桥头=桥面高度，远端 45u 内引坡落地
        const d = Math.abs(tOf(p) - tB);
        const k = Math.min(1, d / 45);
        const s = k * k * (3 - 2 * k);
        return 0.35 + (DECK - 0.35) * (1 - s);
      };
      const dir = i => {
        const a2 = pts[Math.max(0, i - 1)], b2 = pts[Math.min(n - 1, i + 1)];
        const dx = b2.x - a2.x, dz = b2.z - a2.z, l = Math.hypot(dx, dz) || 1;
        return { nx: -dz / l, nz: dx / l };
      };
      const top = pts.map((p, i) => ({ x: p.x, y: yAt(p) + TH, z: p.z }));
      const bot = pts.map((p, i) => ({ x: p.x, y: yAt(p) - TH, z: p.z }));
      const Lp = pts.map((p, i) => { const d = dir(i); return { x: p.x - d.nx * W / 2, z: p.z - d.nz * W / 2 }; });
      const Rp = pts.map((p, i) => { const d = dir(i); return { x: p.x + d.nx * W / 2, z: p.z + d.nz * W / 2 }; });
      const pos = [], nor = [];
      const quad = (a2, b2, c2, d2, nx, ny, nz) => {
        pos.push(a2.x, a2.y, a2.z, b2.x, b2.y, b2.z, c2.x, c2.y, c2.z, a2.x, a2.y, a2.z, c2.x, c2.y, c2.z, d2.x, d2.y, d2.z);
        for (let k = 0; k < 6; k++) nor.push(nx, ny, nz);
      };
      const PARA = 0.55;
      for (let i = 0; i < n - 1; i++) {
        const d = dir(i);
        const Lti = { x: Lp[i].x, y: top[i].y, z: Lp[i].z }, Lti1 = { x: Lp[i + 1].x, y: top[i + 1].y, z: Lp[i + 1].z };
        const Rti = { x: Rp[i].x, y: top[i].y, z: Rp[i].z }, Rti1 = { x: Rp[i + 1].x, y: top[i + 1].y, z: Rp[i + 1].z };
        quad(top[i], top[i + 1], Rti1, Rti, 0, 1, 0);
        quad(Lti, Lti1, bot[i + 1], bot[i], d.nx, 0, d.nz);
        quad(Rti, Rti1, bot[i + 1], bot[i], -d.nx, 0, -d.nz);
        const Lpi = { x: Lti.x, y: Lti.y + PARA, z: Lti.z }, Lpi1 = { x: Lti1.x, y: Lti1.y + PARA, z: Lti1.z };
        const Rpi = { x: Rti.x, y: Rti.y + PARA, z: Rti.z }, Rpi1 = { x: Rti1.x, y: Rti1.y + PARA, z: Rti1.z };
        quad(Lti, Lti1, Lpi1, Lpi, d.nx, 0, d.nz);
        quad(Lpi, Lpi1, Rpi1, Rpi, 0, 1, 0);
        quad(Rti, Rti1, Rpi1, Rpi, -d.nx, 0, -d.nz);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const mesh = new THREE.Mesh(geo, deckMat);
      mesh.castShadow = true;
      g.add(mesh);
      for (let i = 1; i < n - 1; i += 2) {
        const h = yAt(pts[i]);
        if (h < 1.6) continue;
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.3, h * 2, 2.2), pierMat);
        pier.position.set(pts[i].x, h, pts[i].z);
        pier.castShadow = true;
        g.add(pier);
      }
      const poleN = Math.max(2, Math.floor(n / 4));
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 1.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x333a3f, roughness: 0.7 }), poleN * 2);
      const globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 10, 10), lampMat, poleN * 2);
      const tmp = new THREE.Object3D();
      let li = 0;
      for (let i = 2; i < n - 2 && li < poleN * 2 - 1; i += 4) {
        const d = dir(i);
        const y = yAt(pts[i]) + TH;
        for (const s of [-1, 1]) {
          tmp.position.set(pts[i].x + d.nx * s * (W / 2 - 0.15), y + 1.2, pts[i].z + d.nz * s * (W / 2 - 0.15));
          tmp.rotation.set(0, 0, 0);
          tmp.updateMatrix();
          poles.setMatrixAt(li, tmp.matrix);
          tmp.position.y = y + 2.25;
          tmp.updateMatrix();
          globes.setMatrixAt(li, tmp.matrix);
          li++;
        }
      }
      poles.count = li; globes.count = li;
      g.add(poles, globes);
    }
  }
  return { group: g, lampMat };
}

// ---------- 大楼屋顶设备箱 ----------
export function buildRoofBoxes(parsed, heightFn = null) {
  const big = parsed.buildings.filter(b => (b.heightM || 0) > 14 && b.areaM2 > 900).slice(0, 260);
  if (!big.length) return null;
  const rnd = seededRand(77);
  const im = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.4, 0.7, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x8f8779, roughness: 1 }),
    big.length,
  );
  const tmp = new THREE.Object3D();
  big.forEach((b, i) => {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    const h = b.heightM * SCALE;
    tmp.position.set(cx + (rnd() - 0.5) * 2, h + (heightFn ? heightFn(cx, cz) : 0) + 0.35, cz + (rnd() - 0.5) * 2);
    tmp.scale.setScalar(0.8 + rnd() * 1.1);
    tmp.rotation.set(0, Math.floor(rnd() * 4) * Math.PI / 2, 0);
    tmp.updateMatrix();
    im.setMatrixAt(i, tmp.matrix);
  });
  im.castShadow = true;
  return im;
}

// 水面横截面：给 z 返回各水环在该横线上的 x 区间（或反向 xCross 给 x 返回 z 区间）
export function waterCrossSpans(rings, z) {
  const spans = [];
  for (const ring of rings) {
    if (ring.length < 20) continue;
    const xs = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a.z > z) !== (b.z > z)) xs.push(a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > 4) spans.push({ x0: xs[i], x1: xs[i + 1], z });
    }
  }
  return spans;
}
export function waterCrossSpansZ(rings, x) {
  const spans = [];
  for (const ring of rings) {
    if (ring.length < 20) continue;
    const zs = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a.x > x) !== (b.x > x)) zs.push(a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x));
    }
    zs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < zs.length; i += 2) {
      if (zs[i + 1] - zs[i] > 4) spans.push({ z0: zs[i], z1: zs[i + 1], x });
    }
  }
  return spans;
}


// ---------- 龟山 / 蛇山地形（脊线驱动 + 道路/桥走廊开挖） ----------
let hillsData = null;

export function terrainHeight(x, z) {
  if (!hillsData) return 0;
  let h = 0;
  for (const hill of hillsData) {
    const hh = hill.heightAt(x, z);
    if (hh > h) h = hh;
  }
  // 黄鹤楼台地：蛇山主峰区压平到楼基高度（楼不架空）
  if (terrainFlat) {
    const d = Math.hypot(x - terrainFlat.x, z - terrainFlat.z);
    const R = terrainFlat.r, H = terrainFlat.h;
    if (d < R) {
      const k = Math.min(1, (R - d) / 12);          // 边缘 12u 平滑过渡
      const blend = k * k * (3 - 2 * k);
      h = h * (1 - blend) + H * blend;
    } else if (d < R + 14) {
      // 外圈裙边：从 H 缓降到自然地形
      const k = 1 - (d - R) / 14;
      const s = k * k * (3 - 2 * k);
      h = h * (1 - s * 0.5) + Math.min(h, H) * s * 0.5;
    }
  }
  return h;
}
let terrainFlat = null;
export function setTerrainFlat(x, z, r, h) {
  terrainFlat = { x, z, r, h: Math.min(h, terrainHeightRaw(x, z) + 2) };
}
export function terrainHeightRaw(x, z) {
  if (!hillsData) return 0;
  let h = 0;
  for (const hill of hillsData) {
    const hh = hill.heightAt(x, z);
    if (hh > h) h = hh;
  }
  return h;
}

function distToPolyline(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best) best = d;
  }
  return best;
}

function makeHill(ridge, opts, carvers) {
  // 预计算脊线总长与包围盒
  let total = 0;
  const bbox = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
  for (const p of ridge) {
    bbox.x0 = Math.min(bbox.x0, p.x); bbox.x1 = Math.max(bbox.x1, p.x);
    bbox.z0 = Math.min(bbox.z0, p.z); bbox.z1 = Math.max(bbox.z1, p.z);
  }
  for (let i = 0; i < ridge.length - 1; i++) total += Math.hypot(ridge[i + 1].x - ridge[i].x, ridge[i + 1].z - ridge[i].z);
  const W = opts.halfWidth + 2, END = opts.endFall;
  const heightAt = (x, z) => {
    if (x < bbox.x0 - W || x > bbox.x1 + W || z < bbox.z0 - W || z > bbox.z1 + W) return 0;
    let bd = 1e9, bt = 0, acc = 0;
    for (let i = 0; i < ridge.length - 1; i++) {
      const a = ridge[i], b = ridge[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
      if (d < bd) { bd = d; bt = acc + t * Math.hypot(dx, dz); }
      acc += Math.hypot(dx, dz);
    }
    if (bd > opts.halfWidth) return 0;
    // 圆润钟形：平滑阶跃+幂2.2，坡脚自然外扩
    const tt = 1 - bd / opts.halfWidth;
    const lat = tt * tt * (3 - 2 * tt) * 0.35 + Math.pow(tt, 2.2) * 0.65;
    const ek = Math.min(1, Math.min(bt, total - bt) / END);
    let h = opts.peak * lat * (ek * ek * (3 - 2 * ek));
    // 道路 / 铁路 / 大桥走廊开挖（垭口）
    for (const c of carvers) {
      const d = distToPolyline(x, z, c.pts);
      if (d < c.w) h *= 0.04 + 0.96 * Math.pow(d / c.w, 1.4);
    }
    return h;
  };
  return { ridge, heightAt, bbox, total };
}

export function buildHills(parsed, anchors) {
  // 脊线由地标锚点驱动：蛇山（黄鹤楼矶头 → 尾插闹市），龟山（晴川阁 → 电视塔 → 西延）
  const t = anchors.tower, v = anchors.tv, q = anchors.qc;
  const sheshan = [
    { x: t.x - 46, z: t.z - 24 }, { x: t.x + 60, z: t.z + 2 },
    { x: t.x + 210, z: t.z + 48 }, { x: t.x + 380, z: t.z + 110 },
  ];
  const guishan = [
    { x: q.x + 34, z: q.z - 14 }, { x: v.x + 46, z: v.z - 16 },
    { x: v.x - 100, z: v.z - 66 }, { x: v.x - 250, z: v.z - 132 },
    { x: v.x - 420, z: v.z - 210 },
  ];
  // 开挖走廊：大桥轴线 + 山体范围内的道路/铁路
  const carvers = [];
  if (anchors.bridgeAxis) carvers.push({ pts: anchors.bridgeAxis, w: 11 });
  const inBox = (bbox) => {
    const m = 30;
    return (p) => p.x > bbox.x0 - m && p.x < bbox.x1 + m && p.z > bbox.z0 - m && p.z < bbox.z1 + m;
  };
  const hillBBoxes = [
    { x0: Math.min(...sheshan.map(p => p.x)), x1: Math.max(...sheshan.map(p => p.x)), z0: Math.min(...sheshan.map(p => p.z)), z1: Math.max(...sheshan.map(p => p.z)) },
    { x0: Math.min(...guishan.map(p => p.x)), x1: Math.max(...guishan.map(p => p.x)), z0: Math.min(...guishan.map(p => p.z)), z1: Math.max(...guishan.map(p => p.z)) },
  ];
  for (const r of parsed.roads) {
    if (r.bridge) continue;
    for (const bb of hillBBoxes) {
      if (r.pts.some(inBox(bb))) { carvers.push({ pts: r.pts, w: 4.5 }); break; }
    }
  }
  for (const r of parsed.railways) {
    for (const bb of hillBBoxes) {
      if (r.pts.some(inBox(bb))) { carvers.push({ pts: r.pts, w: 4 }); break; }
    }
  }
  hillsData = [
    makeHill(sheshan, { peak: 22, halfWidth: 27, endFall: 55 }, carvers),
    makeHill(guishan, { peak: 24, halfWidth: 29, endFall: 60 }, carvers),
  ];
  // 生成网格（两山合并，顶点色随高度渐变）
  const group = new THREE.Group();
  const rnd = seededRand(41);
  for (const hill of hillsData) {
    const step = 5, m = hill.opts_half || 30;
    const x0 = hill.bbox.x0 - 30, x1 = hill.bbox.x1 + 30;
    const z0 = hill.bbox.z0 - 30, z1 = hill.bbox.z1 + 30;
    const nx = Math.max(2, Math.ceil((x1 - x0) / step));
    const nz = Math.max(2, Math.ceil((z1 - z0) / step));
    const pos = [], col = [];
    const cLow = new THREE.Color(0x86b06a), cHigh = new THREE.Color(0x5d8a4a), cRock = new THREE.Color(0x9a9484);
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
        const h = Math.max(terrainHeight(x, z), 0.08);   // 含黄鹤楼台地压平；0.08 抬离地面平面防共面闪烁
        pos.push(x, h, z);
        const k = Math.min(1, h / 22);
        const c = cLow.clone().lerp(k > 0.72 ? cRock : cHigh, k * 0.9);
        const jitter = 1 + (rnd() - 0.5) * 0.06;
        col.push(c.r * jitter, c.g * jitter, c.b * jitter);
      }
    }
    const idx = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a2 = j * (nx + 1) + i, b2 = a2 + 1, c2 = a2 + nx + 1, d2 = c2 + 1;
        idx.push(a2, c2, b2, b2, c2, d2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    hill.opts_half = m;
  }
  // 山脊步道（蛇山+龟山，灯带观景台）
  const trailMat = new THREE.MeshStandardMaterial({ color: 0xcbb98f, roughness: 1 });
  const deckMat2 = new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 });
  for (const hill of hillsData) {
    const trail = [];
    let acc = 0;
    for (let i = 0; i < hill.ridge.length - 1; i++) {
      const a = hill.ridge[i], b = hill.ridge[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let k = 0; k < len; k += 8) {
        const tt = k / len;
        const x = a.x + (b.x - a.x) * tt, z = a.z + (b.z - a.z) * tt;
        trail.push({ x, z, y: hill.heightAt(x, z) });
      }
      acc += len;
    }
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i], b = trail[i + 1];
      if (a.y < 2 || b.y < 2) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 1.1), trailMat);
      seg.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.06, (a.z + b.z) / 2);
      seg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      seg.receiveShadow = true;
      group.add(seg);
    }
    // 观景台（脊线中点）
    const mid = hill.ridge[Math.floor(hill.ridge.length / 2)];
    const my = hill.heightAt(mid.x, mid.z);
    if (my > 8) {
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 0.5, 10), deckMat2);
      plat.position.set(mid.x, my + 0.25, mid.z);
      plat.castShadow = true;
      group.add(plat);
    }
  }
  return group;
}

// 山体树木散点
export function hillTreePoints(count) {
  if (!hillsData) return [];
  const rnd = seededRand(313);
  const pts = [];
  let attempts = 0;
  while (pts.length < count && attempts < count * 25) {
    attempts++;
    const hill = hillsData[Math.floor(rnd() * hillsData.length)];
    const t = rnd();
    let acc = 0, pick = null;
    for (let i = 0; i < hill.ridge.length - 1; i++) {
      const a = hill.ridge[i], b = hill.ridge[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (t * hill.total <= acc + len && t * hill.total >= acc) {
        const k = (t * hill.total - acc) / len;
        const dx = b.x - a.x, dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 1;
        pick = { x: a.x + dx * k, z: a.z + dz * k, nx: -dz / l, nz: dx / l };
        break;
      }
      acc += len;
    }
    if (!pick) continue;
    const off = (rnd() * 2 - 1) * 21;
    const x = pick.x + pick.nx * off, z = pick.z + pick.nz * off;
    const y = hill.heightAt(x, z);
    if (y < 1.2) continue;
    pts.push({ x, z, y, s: 0.65 + rnd() * 0.8, pine: rnd() < 0.55 });
  }
  return pts;
}


// ---------- 填充楼屋顶件：女儿墙 / 电梯机房 / 天线（InstancedMesh 方案） ----------
export function buildFillRooftops(parsed, heightFn = null) {
  const fills = parsed.buildings.filter(b => b.fill && b.heightM);
  if (!fills.length) return null;
  const rnd = seededRand(9090);
  const group = new THREE.Group();
  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  // 先收集：女儿墙边 / 机房 / 天线
  const edges = [], machs = [], ants = [];
  for (const b of fills) {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    const lift = heightFn ? heightFn(cx, cz) : 0;
    const top = lift + b.heightM * SCALE;
    const wallC = col.setHSL(0.08 + rnd() * 0.06, 0.18, 0.62).clone();
    for (let i = 0; i < 4; i++) {
      const a = b.ring[i], c = b.ring[(i + 1) % 4];
      const dx = c.x - a.x, dz = c.z - a.z;
      const L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      edges.push({ x: (a.x + c.x) / 2, z: (a.z + c.z) / 2, L, ry: -Math.atan2(dz, dx), y: top + 0.17, c: wallC });
    }
    if (rnd() < 0.4) machs.push({ x: cx + (rnd() - 0.5) * 1.6, z: cz + (rnd() - 0.5) * 1.6, ry: rnd() * Math.PI, y: top + 0.72, c: wallC });
    if (rnd() < 0.14) ants.push({ x: cx, z: cz, y: top + 0.9 });
  }
  const wallMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  if (edges.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.34, 0.2), wallMat, edges.length);
    im.castShadow = true;
    edges.forEach((e, i) => {
      tmp.position.set(e.x, e.y, e.z);
      tmp.rotation.set(0, e.ry, 0);
      tmp.scale.set(e.L + 0.24, 1, 1);
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
      im.setColorAt(i, e.c);
    });
    group.add(im);
  }
  if (machs.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.75, 0.95), wallMat, machs.length);
    im.castShadow = true;
    machs.forEach((e, i) => {
      tmp.position.set(e.x, e.y, e.z);
      tmp.rotation.set(0, e.ry, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
      im.setColorAt(i, e.c);
    });
    group.add(im);
  }
  if (ants.length) {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.05, 1.8, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6 }), ants.length);
    ants.forEach((e, i) => {
      tmp.position.set(e.x, e.y, e.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
    });
    group.add(im);
  }
  return group;
}

// ---------- 水环 bbox 索引：点内测试先筛包围盒（大场景必备） ----------
export function buildWaterIndex(waters) {
  const idx = waters
    .filter(r => r.length > 20)
    .map(r => {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of r) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
      }
      return { r, x0, x1, z0, z1 };
    });
  return {
    hit(x, z) {
      for (const w of idx) {
        if (x < w.x0 || x > w.x1 || z < w.z0 || z > w.z1) continue;
        if (pointInRing(x, z, w.r)) return true;
      }
      return false;
    },
  };
}

// 追加单座山（如东湖磨山），返回网格
export function appendHill(ridge, opts) {
  const hill = makeHill(ridge, opts, []);
  hillsData.push(hill);
  const rnd = seededRand(41);
  const group = new THREE.Group();
  const step = 5;
  const x0 = hill.bbox.x0 - 25, x1 = hill.bbox.x1 + 25;
  const z0 = hill.bbox.z0 - 25, z1 = hill.bbox.z1 + 25;
  const nx = Math.max(2, Math.ceil((x1 - x0) / step));
  const nz = Math.max(2, Math.ceil((z1 - z0) / step));
  const pos = [], col = [];
  const cLow = new THREE.Color(0x86b06a), cHigh = new THREE.Color(0x5d8a4a), cRock = new THREE.Color(0x9a9484);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
    const h = hill.heightAt(x, z);
    pos.push(x, h, z);
    const k = Math.min(1, h / (opts.peak * 0.9));
    const c = cLow.clone().lerp(k > 0.72 ? cRock : cHigh, k * 0.9);
    const j2 = 1 + (rnd() - 0.5) * 0.06;
    col.push(c.r * j2, c.g * j2, c.b * j2);
  }
  const idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a2 = j * (nx + 1) + i, b2 = a2 + 1, c2 = a2 + nx + 1, d2 = c2 + 1;
    idx.push(a2, c2, b2, b2, c2, d2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

// ---------- 居民楼屋顶生活件：水塔/太阳能/卫星锅/晾衣杆 ----------
// ---------- 立面空调外机（InstancedMesh，挂建筑四墙面） ----------
export function buildFacadeLife(parsed, heightFn = null) {
  const rnd = seededRand(8823);
  const spots = [];
  for (const b of parsed.buildings) {
    if (!b.heightM || b.heightM < 8 || b.heightM > 70) continue;
    if (rnd() >= 0.45) continue;
    let cx = 0, cz = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of b.ring) {
      cx += p.x; cz += p.z;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    cx /= b.ring.length; cz /= b.ring.length;
    if (x1 - x0 > 42 || z1 - z0 > 42) continue;
    const lift = heightFn ? heightFn(cx, cz) : 0;
    const top = lift + b.heightM * SCALE;
    const n = 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const side = Math.floor(rnd() * 4);
      const y = lift + 1.6 + rnd() * Math.max(2, top - lift - 3.5);
      const t = 0.15 + rnd() * 0.7;
      let px, pz, ry;
      if (side === 0) { px = x0 + t * (x1 - x0); pz = z1; ry = 0; }
      else if (side === 1) { px = x0 + t * (x1 - x0); pz = z0; ry = Math.PI; }
      else if (side === 2) { px = x1; pz = z0 + t * (z1 - z0); ry = Math.PI / 2; }
      else { px = x0; pz = z0 + t * (z1 - z0); ry = -Math.PI / 2; }
      spots.push({ x: px, z: pz, y, ry });
    }
  }
  if (!spots.length) return null;
  const body = new THREE.BoxGeometry(0.85, 0.58, 0.42); body.translate(0, 0, 0.10);
  const grill = new THREE.BoxGeometry(0.74, 0.46, 0.05); grill.translate(0, 0, 0.335);
  const bracket = new THREE.BoxGeometry(0.9, 0.05, 0.05); bracket.translate(0, -0.31, 0);
  const geo = mergeGeometries([body, grill, bracket]);
  const mat = new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.6, metalness: 0.2 });
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const tmp = new THREE.Object3D();
  spots.forEach((e, i) => {
    tmp.position.set(e.x, e.y, e.z);
    tmp.rotation.set(0, e.ry, 0);
    tmp.updateMatrix();
    im.setMatrixAt(i, tmp.matrix);
  });
  im.castShadow = true;
  return im;
}

// ---------- 楼顶广告牌（钢架+双面面板，夜发光） ----------
export function buildBillboards(parsed, heightFn = null) {
  const rnd = seededRand(9937);
  const cands = parsed.buildings
    .filter(b => b.heightM && b.heightM > 38 && b.heightM < 130);
  cands.sort(() => rnd() - 0.5);
  const picked = [];
  for (const b of cands) {
    let cx = 0, cz = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of b.ring) {
      cx += p.x; cz += p.z;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    cx /= b.ring.length; cz /= b.ring.length;
    if (Math.hypot(cx - 0, cz + 280) > 2600) continue;
    if (picked.some(q => Math.hypot(q.x - cx, q.z - cz) < 300)) continue;
    const lift = heightFn ? heightFn(cx, cz) : 0;
    const along = (x1 - x0) >= (z1 - z0);
    picked.push({ x: cx, z: cz, top: lift + b.heightM * SCALE, ry: along ? 0 : Math.PI / 2, w: Math.min(20, (along ? x1 - x0 : z1 - z0) * 0.72) });
    if (picked.length >= 14) break;
  }
  if (!picked.length) return null;
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9298, roughness: 0.5, metalness: 0.4 });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xd8dde2, roughness: 0.55, emissive: 0xfff0c0, emissiveIntensity: 0,
  });
  for (const e of picked) {
    const bb = new THREE.Group();
    const H = 3.2, W = e.w;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.3), panelMat);
    panel.position.y = H / 2 + 0.8;
    panel.castShadow = true;
    bb.add(panel);
    for (const sx of [-1, 0, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), steel);
      leg.position.set(sx * W * 0.32, 0.45, 0);
      bb.add(leg);
    }
    bb.position.set(e.x, e.top, e.z);
    bb.rotation.y = e.ry;
    group.add(bb);
  }
  group.userData.nightMats = [panelMat];
  return group;
}

// ---------- 人行天桥（主梁+栏杆+梯道，跨主干道） ----------
function mesh2(geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export function buildPedBridge(x, z, yaw, L = 46) {
  const g = new THREE.Group();
  const H = 5.2;
  g.add(mesh2(new THREE.BoxGeometry(L, 0.65, 4.4), 0xbabfc4, 0, H, 0));
  for (const s of [-1, 1]) {
    g.add(mesh2(new THREE.BoxGeometry(L, 1.05, 0.09), 0x9aa0a6, 0, H + 0.85, s * 2.16));
  }
  for (const dx of [-L * 0.3, L * 0.3]) {
    g.add(mesh2(new THREE.CylinderGeometry(0.42, 0.5, H, 10), 0xc9c4b8, dx, H / 2, 0));
  }
  for (const s of [-1, 1]) {
    const rampLen = 13.5;
    const rm = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.5, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xb4b9be, roughness: 0.9 }));
    rm.position.set(s * (L / 2 + rampLen / 2 - 2.2), (H + 0.2) / 2 + 0.35, 0);
    rm.rotation.z = s * Math.atan2(H - 0.6, rampLen);
    rm.castShadow = true;
    g.add(rm);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

// ---------- 塔吊工地（塔身+平衡臂+起重臂+配重 + 在建骨架楼 + 围挡） ----------
export function buildCraneSite(x, z, yaw, heightFn = null) {
  const g = new THREE.Group();
  const lift = heightFn ? heightFn(x, z) : 0;
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.55, metalness: 0.25 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.7 });
  const H = 26;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, H, 1.1), yellow);
  mast.position.y = H / 2;
  mast.castShadow = true;
  g.add(mast);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 2.2), yellow);
  cab.position.y = H + 0.6;
  g.add(cab);
  const jib = new THREE.Group();
  const jibBeam = new THREE.Mesh(new THREE.BoxGeometry(22, 0.75, 0.75), yellow);
  jibBeam.position.set(11, 0, 0);
  jib.add(jibBeam);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.2), grey);
  hook.position.set(16, -4.6, 0);
  jib.add(hook);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.4, 0.06), grey);
  cable.position.set(16, -2.2, 0);
  jib.add(cable);
  jib.position.y = H + 1.3;
  g.add(jib);
  const counter = new THREE.Group();
  const cb = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.7, 0.8), yellow);
  cb.position.set(-4.2, 0, 0);
  counter.add(cb);
  const weight = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 1.4), grey);
  weight.position.set(-6.8, -0.6, 0);
  counter.add(weight);
  counter.position.y = H + 1.3;
  g.add(counter);
  const conc = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 1 });
  for (let f = 0; f < 6; f++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(14 - f * 0.4, 0.45, 11 - f * 0.3), conc);
    slab.position.set(13, 0.45 + f * 3.1, 6);
    slab.castShadow = true;
    g.add(slab);
    for (const cx of [-5.5, 5.5]) for (const cz of [-4, 4]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.1, 0.5), conc);
      col.position.set(13 + cx, 1.6 + f * 3.1, 6 + cz);
      g.add(col);
    }
  }
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x4a7fc1, roughness: 0.8 });
  for (const [fx, fz, ry2] of [[0, 24, 0], [0, -12, 0], [28, 6, Math.PI / 2], [-28, 6, Math.PI / 2]]) {
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(56, 1.4, 0.25), fenceMat);
    f2.position.set(fx, 0.7, fz);
    f2.rotation.y = ry2;
    g.add(f2);
  }
  g.position.set(x, lift, z);
  g.rotation.y = yaw;
  g.userData.jib = jib;
  g.userData.spin = 0.05 + Math.random() * 0.06;
  return g;
}

// ---------- 沿街犬牙店招（InstancedMesh 彩色小盒，底商层） ----------
export function buildStreetSignage(parsed) {
  const rnd = seededRand(7741);
  const spots = [];
  const mains = parsed.roads.filter(r => !r.bridge && (r.kind === 'primary' || r.kind === 'trunk' || r.kind === 'secondary'));
  for (const r of mains) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 18) continue;
      const n = Math.floor(len / 16);
      for (let k = 0; k < n; k++) {
        if (rnd() > 0.4) continue;
        const t = (k + 0.5) / n;
        const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
        const side = rnd() < 0.5 ? 1 : -1;
        const off = 3.4 + rnd() * 0.9;
        const w = 3.2 + rnd() * 3.4, h = 0.8 + rnd() * 0.75;
        spots.push({
          x: a.x + (b.x - a.x) * t - uz * off * side,
          z: a.z + (b.z - a.z) * t + ux * off * side,
          ry: Math.atan2(ux, uz) + (side > 0 ? Math.PI : 0),
          w, h,
        });
      }
    }
  }
  if (!spots.length) return null;
  const geo = new THREE.BoxGeometry(1, 1, 0.45);
  geo.translate(0, 0, 0.1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, emissive: 0xffdca0, emissiveIntensity: 0,
  });
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const tmp = new THREE.Object3D();
  const palette = [0xd03a2a, 0x2f6fbf, 0xe0b23c, 0x3f9a56, 0xb06ab8, 0xd8823c, 0x2a9d8f, 0xc9427e];
  const c = new THREE.Color();
  spots.forEach((e, i) => {
    tmp.position.set(e.x, 4.1, e.z);
    tmp.rotation.set(0, e.ry, 0);
    tmp.scale.set(e.w, e.h, 1);
    tmp.updateMatrix();
    im.setMatrixAt(i, tmp.matrix);
    im.setColorAt(i, c.setHex(palette[i % palette.length]));
  });
  im.instanceColor.needsUpdate = true;
  im.castShadow = true;
  im.frustumCulled = false;
  return im;
}

export function buildRooftopLife(parsed, heightFn = null) {
  const rnd = seededRand(6161);
  const towers = [], solars = [], dishes = [], poles = [];
  for (const b of parsed.buildings) {
    if (!b.heightM || b.heightM < 5 || b.heightM > 60) continue;
    if (rnd() >= 0.3) continue;
    let cx = 0, cz = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of b.ring) {
      cx += p.x; cz += p.z;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    cx /= b.ring.length; cz /= b.ring.length;
    const lift = heightFn ? heightFn(cx, cz) : 0;
    const top = lift + b.heightM * SCALE;
    const jx = (x1 - x0) * 0.25, jz = (z1 - z0) * 0.25;
    const px = cx + (rnd() - 0.5) * jx, pz = cz + (rnd() - 0.5) * jz;
    const k = rnd();
    if (k < 0.3) towers.push({ x: px, z: pz, y: top, ry: rnd() * Math.PI });
    else if (k < 0.62) solars.push({ x: px, z: pz, y: top, ry: rnd() * Math.PI });
    else if (k < 0.85) dishes.push({ x: px, z: pz, y: top, ry: rnd() * Math.PI * 2, tilt: 0.4 + rnd() * 0.4 });
    else poles.push({ x: px, z: pz, y: top, ry: rnd() * Math.PI });
  }
  const group = new THREE.Group();
  const tmp = new THREE.Object3D();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x565c62, roughness: 0.8 });
  // 水塔（支腿+罐+盖，合并几何）
  if (towers.length) {
    const tank = new THREE.CylinderGeometry(0.62, 0.62, 0.85, 10); tank.translate(0, 1.45, 0);
    const cap = new THREE.ConeGeometry(0.68, 0.4, 10); cap.translate(0, 2.07, 0);
    const legs = [];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const lg = new THREE.CylinderGeometry(0.05, 0.05, 1.05, 5);
      lg.translate(Math.cos(a) * 0.4, 0.52, Math.sin(a) * 0.4);
      legs.push(lg);
    }
    const wtGeo = mergeGeometries([tank, cap, ...legs]);
    const im = new THREE.InstancedMesh(wtGeo, dark, towers.length);
    towers.forEach((e, i) => {
      tmp.position.set(e.x, e.y, e.z); tmp.rotation.set(0, e.ry, 0); tmp.scale.setScalar(1);
      tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
    });
    im.castShadow = true;
    group.add(im);
  }
  // 太阳能热水器（斜板+立杆）
  if (solars.length) {
    const panel = new THREE.BoxGeometry(1.0, 0.08, 0.62); panel.rotateX(-0.5); panel.translate(0, 0.32, -0.12);
    const sup = new THREE.BoxGeometry(0.06, 0.3, 0.5); sup.translate(0, 0.15, 0.18);
    const sg = mergeGeometries([panel, sup]);
    const im = new THREE.InstancedMesh(sg,
      new THREE.MeshStandardMaterial({ color: 0x7a8a96, roughness: 0.4, metalness: 0.4 }), solars.length);
    solars.forEach((e, i) => {
      tmp.position.set(e.x, e.y, e.z); tmp.rotation.set(0, e.ry, 0);
      tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
    });
    group.add(im);
  }
  // 卫星锅（斜碟+支杆）
  if (dishes.length) {
    const dg = new THREE.CylinderGeometry(0.02, 0.38, 0.16, 10, 1, false); dg.rotateX(1.1);
    const arm = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5); arm.translate(0, 0.18, 0.1);
    const dgeo = mergeGeometries([dg, arm]);
    const im = new THREE.InstancedMesh(dgeo, metal, dishes.length);
    dishes.forEach((e, i) => {
      tmp.position.set(e.x, e.y + 0.1, e.z); tmp.rotation.set(0, e.ry, e.tilt);
      tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
    });
    group.add(im);
  }
  // 晾衣杆（双杆）
  if (poles.length) {
    const rod1 = new THREE.BoxGeometry(1.9, 0.03, 0.03); rod1.translate(0, 0.5, -0.22);
    const rod2 = new THREE.BoxGeometry(1.9, 0.03, 0.03); rod2.translate(0, 0.5, 0.22);
    const pgeo = mergeGeometries([rod1, rod2]);
    const im = new THREE.InstancedMesh(pgeo, metal, poles.length);
    poles.forEach((e, i) => {
      tmp.position.set(e.x, e.y, e.z); tmp.rotation.set(0, e.ry, 0);
      tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
    });
    group.add(im);
  }
  return { group, counts: { towers: towers.length, solars: solars.length, dishes: dishes.length, poles: poles.length } };
}

// ---------- 漫游碰撞：建筑 AABB 空间索引 ----------
export function buildWalkColliders(parsed) {
  const CELL = 10;
  const hash = new Map();
  const boxes = [];
  for (const b of parsed.buildings) {
    if (!b.ring || !b.heightM) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of b.ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    if (x1 - x0 < 0.6 || z1 - z0 < 0.6) continue;
    const box = { x0, x1, z0, z1, h: b.heightM * SCALE };
    const id = boxes.length;
    boxes.push(box);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const key = i + '_' + j;
        if (!hash.has(key)) hash.set(key, []);
        hash.get(key).push(id);
      }
  }
  return {
    // 圆（玩家）与 AABB 推离：返回修正后的 [x, z]
    resolve(x, z, r) {
      const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const arr = hash.get(i + '_' + j);
        if (!arr) continue;
        for (const id of arr) {
          const b = boxes[id];
          const nx = Math.max(b.x0, Math.min(x, b.x1));
          const nz = Math.max(b.z0, Math.min(z, b.z1));
          const dx = x - nx, dz = z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              x = nx + dx / d * r; z = nz + dz / d * r;
            } else {
              // 玩家在盒内：沿最浅轴推出
              const pens = [
                [x - b.x0 + r, -1, 0], [b.x1 - x + r, 1, 0],
                [z - b.z0 + r, 0, -1], [b.z1 - z + r, 0, 1],
              ].sort((a, b2) => a[0] - b2[0])[0];
              x += pens[1] * pens[0]; z += pens[2] * pens[0];
            }
          }
        }
      }
      return [x, z];
    },
  };
}


// ---------- 湖岸驳岸（湖泊外圈石岸，含东湖） ----------
export function buildLakeShores(parsed) {
  const geos = [];
  for (const ring of parsed.waters) {
    if (ring.length < 25) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, cx = 0, cz = 0;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
      cx += p.x; cz += p.z;
    }
    cx /= ring.length; cz /= ring.length;
    const span = (x1 - x0) + (z1 - z0);
    if (span < 50 || span > 900) continue;      // 湖泊尺度（长江/东湖主水面除外）
    // 形状外扩 2.5%（驳岸比水面大一圈）
    const shape = new THREE.Shape(ring.map(p => {
      let dx = p.x - cx, dz = p.z - cz;
      return new THREE.Vector2(cx + dx * 1.025, -(cz + dz * 1.025));
    }));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    geos.push(g);
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos),
    new THREE.MeshStandardMaterial({ color: 0xc5bfae, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

export { mergeGeometries as mergeGeometriesPublic };
