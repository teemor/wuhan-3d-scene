// landmarks.js — 武汉地标的程序化建模（低多边形风格，1 场景单位 = 4 米）
window.__L1 = true;
import * as THREE from 'three';

const M = {
  stone: new THREE.MeshStandardMaterial({ color: 0xb9b0a2, roughness: 1 }),
  red: new THREE.MeshStandardMaterial({ color: 0x8a3324, roughness: 0.85 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xe8dcc3, roughness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd9a43c, roughness: 0.6, flatShading: true, emissive: 0xd9a43c, emissiveIntensity: 0 }),
  goldBall: new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.5, roughness: 0.35, emissive: 0xffd060, emissiveIntensity: 0 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x87919c, roughness: 0.6, metalness: 0.35 }),
  deck: new THREE.MeshStandardMaterial({ color: 0xb0b6bb, roughness: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xb6b1a6, roughness: 1 }),
  tower: new THREE.MeshStandardMaterial({ color: 0xcfc9bd, roughness: 0.8 }),
  pod: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7, emissive: 0xffe0a0, emissiveIntensity: 0 }),
  train: new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.8 }),
  trainRoof: new THREE.MeshStandardMaterial({ color: 0x315c39, roughness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x333a3f, roughness: 0.7 }),
  blockhouse: new THREE.MeshStandardMaterial({ color: 0xd9d3c5, roughness: 0.85 }),
};

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 通用中国楼阁：台基 + N 层（红柱平座 + 金琉璃四坡攒尖檐 + 飞角）
export function buildPavilion({ floors = 5, baseW = 9.5, taper = 0.9, bodyH = 1.55, roofH = 1.0, terrace = true }) {
  const g = new THREE.Group();
  let y = 0;
  if (terrace) {
    g.add(mesh(new THREE.BoxGeometry(baseW * 2.4, 1.1, baseW * 2.4), M.stone, 0, 0.55, 0));
    g.add(mesh(new THREE.BoxGeometry(baseW * 2.0, 1.1, baseW * 2.0), M.stone, 0, 1.65, 0));
    y = 2.2;
  }
  let w = baseW;
  for (let i = 0; i < floors; i++) {
    // 楼身（红柱）+ 平座栏杆（米白）
    g.add(mesh(new THREE.BoxGeometry(w, bodyH, w), M.red, 0, y + bodyH / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 0.3, bodyH * 0.55, w + 0.3), M.cream, 0, y + bodyH / 2, 0));
    const eaveY = y + bodyH;
    g.add(mesh(new THREE.BoxGeometry(w + 1.15, 0.2, w + 1.15), M.cream, 0, eaveY + 0.1, 0));
    // 檐下金色斗拱带
    g.add(mesh(new THREE.BoxGeometry(w + 0.75, 0.16, w + 0.75), M.gold, 0, eaveY + 0.26, 0));
    // 四坡攒尖顶（金琉璃），顶层加高收束轮廓
    const rh = i === floors - 1 ? roofH * 1.35 : roofH;
    const roof = mesh(new THREE.ConeGeometry((w + 1.15) * 0.74, rh, 4), M.gold, 0, eaveY + 0.2 + rh / 2, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    // 飞檐翘角：四角上挑的小金脊
    const half = (w + 1.15) / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tip = mesh(new THREE.BoxGeometry(0.8, 0.1, 0.3), M.gold,
        sx * half * 0.82, eaveY + 0.34, sz * half * 0.82);
      tip.rotation.y = Math.atan2(sz, sx);      // 沿对角方向外挑
      tip.rotation.x = sz * 0.45;               // 翘角
      tip.rotation.z = -sx * 0.45;
      g.add(tip);
    }
    y = eaveY + 0.2 + roofH * 0.72;
    w *= taper;
  }
  // 宝顶（金葫芦）
  const topY = y + 0.3;
  g.add(mesh(new THREE.SphereGeometry(0.42, 12, 10), M.goldBall, 0, topY, 0));
  g.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), M.goldBall, 0, topY + 0.5, 0));
  g.add(mesh(new THREE.ConeGeometry(0.18, 0.7, 8), M.goldBall, 0, topY + 1.0, 0));
  g.userData.nightMats = [M.gold, M.goldBall];      // 夜间泛光提亮
  return g;
}

// 黄鹤楼（按资料重建）：四边套八边形平面、外观五层、攒尖金顶、
// 60 翘角 + 惊雀铃、各层平座回廊、顶层竖匾、入口抱厦
export function buildHuanghelou() {
  const g = new THREE.Group();
  // 台基（两层）
  g.add(mesh(new THREE.BoxGeometry(22, 1.1, 22), M.stone, 0, 0.55, 0));
  g.add(mesh(new THREE.BoxGeometry(18.5, 1.1, 18.5), M.stone, 0, 1.65, 0));
  let y = 2.2;
  const FLOORS = 5, BODY_H = 1.6, ROOF_H = 1.05;
  const w0 = 7.5, wTop = 4.5;                       // 底层 30m → 顶层 18m
  const taper = Math.pow(wTop / w0, 1 / (FLOORS - 1));
  const bells = [];                                  // 惊雀铃实例位
  const bellTmp = new THREE.Object3D();

  const makePlaqueTexture = () => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 192;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5e1f1a'; ctx.fillRect(0, 0, 64, 192);
    ctx.strokeStyle = '#d9a43c'; ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 56, 184);
    ctx.fillStyle = '#e8b84a';
    ctx.font = 'bold 44px "KaiTi", "STKaiti", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('黄', 32, 34);
    ctx.fillText('鹤', 32, 96);
    ctx.fillText('楼', 32, 158);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const plaqueMat = new THREE.MeshStandardMaterial({
    map: makePlaqueTexture(), emissiveMap: makePlaqueTexture(),
    emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7,
  });

  let w = w0;
  for (let f = 0; f < FLOORS; f++) {
    const r = w / 2;
    const isTop = f === FLOORS - 1;
    // 八棱楼身（红）+ 平座回廊环带（米白）
    const body = mesh(new THREE.CylinderGeometry(r * 0.94, r, BODY_H, 8), M.red, 0, y + BODY_H / 2, 0);
    body.rotation.y = Math.PI / 8;
    g.add(body);
    const deck = mesh(new THREE.CylinderGeometry(r * 1.16, r * 1.16, BODY_H * 0.42, 8), M.cream, 0, y + BODY_H / 2, 0);
    deck.rotation.y = Math.PI / 8;
    g.add(deck);
    // 腰檐（半层高披檐，真假檐层次——真楼"各层大小屋顶交错重叠"）
    const waist = mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.0, 0.2, 8), M.gold, 0, y + BODY_H * 0.58, 0);
    waist.rotation.y = Math.PI / 8;
    g.add(waist);
    // 环柱阵列（72 根圆柱意象）
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2 + Math.PI / 8;
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, BODY_H * 0.94, 6), M.red,
        Math.cos(a) * r * 1.03, y + BODY_H / 2, Math.sin(a) * r * 1.03));
    }
    // 檐口枋
    const eaveY = y + BODY_H;
    const er = (w + 1.3) / 2;
    const fascia = mesh(new THREE.CylinderGeometry(er * 1.02, er * 1.02, 0.22, 8), M.cream, 0, eaveY + 0.06, 0);
    fascia.rotation.y = Math.PI / 8;
    g.add(fascia);
    // 攒尖顶（八面收束，顶视如鹤翼）
    const rh = isTop ? ROOF_H * 1.35 : ROOF_H;
    const roof = mesh(new THREE.CylinderGeometry(er * 0.16, er * 0.98, rh, 8), M.gold, 0, eaveY + 0.18 + rh / 2, 0);
    roof.rotation.y = Math.PI / 8;
    g.add(roof);
    // 八隅翘角 + 惊雀铃
    for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4 + Math.PI / 8;
      const tip = mesh(new THREE.BoxGeometry(0.85, 0.1, 0.32), M.gold,
        Math.cos(ang) * er * 0.86, eaveY + 0.34, Math.sin(ang) * er * 0.86);
      tip.rotation.y = -ang;
      tip.rotation.x = 0.5; tip.rotation.z = 0;
      const tilt = new THREE.Euler(0, -ang, 0);
      tip.rotation.copy(tilt);
      tip.rotateX(0.55);
      g.add(tip);
      bells.push([Math.cos(ang) * er * 0.99, eaveY + 0.52, Math.sin(ang) * er * 0.99]);
    }
    // 顶层正面竖匾（朝 +Z，由调用方旋转朝江）
    if (isTop) {
      const plaque = mesh(new THREE.BoxGeometry(0.95, 2.3, 0.14), plaqueMat, 0, y + BODY_H / 2 + 0.1, r * 1.12);
      g.add(plaque);
      // 四层正面横匾"气吞云梦"
      const hz = makeHorizontalPlaque('气吞云梦');
      hz.position.set(0, y + BODY_H * 0.58, r * 1.13);
      g.add(hz);
    }
    y = eaveY + 0.18 + rh * 0.74;
    w *= taper;
  }
  // 葫芦宝顶
  const topY = y + 0.25;
  g.add(mesh(new THREE.SphereGeometry(0.4, 12, 10), M.goldBall, 0, topY, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.4, 8), M.goldBall, 0, topY + 0.5, 0));
  g.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), M.goldBall, 0, topY + 0.85, 0));
  g.add(mesh(new THREE.ConeGeometry(0.14, 0.6, 8), M.goldBall, 0, topY + 1.3, 0));
  // 惊雀铃（八隅×五层，实例化）
  const bellIM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.09, 0),
    new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.5 }), bells.length);
  bells.forEach((b, i) => {
    bellTmp.position.set(b[0], b[1], b[2]);
    bellTmp.updateMatrix();
    bellIM.setMatrixAt(i, bellTmp.matrix);
  });
  g.add(bellIM);
  // 入口抱厦（一层正面向 +Z）
  const porch = mesh(new THREE.BoxGeometry(3.4, 0.9, 2.0), M.gold, 0, 1.15 + 1.1, 5.4);
  porch.rotation.z = 0;
  g.add(porch);
  g.add(mesh(new THREE.BoxGeometry(0.22, 1.15, 0.22), M.red, -1.4, 2.2 + 0.575, 5.9));
  g.add(mesh(new THREE.BoxGeometry(0.22, 1.15, 0.22), M.red, 1.4, 2.2 + 0.575, 5.9));
  // 门前大台阶
  g.add(mesh(new THREE.BoxGeometry(6, 0.8, 2.2), M.stone, 0, 0.4, 11.4));
  g.add(mesh(new THREE.BoxGeometry(5, 0.5, 1.4), M.stone, 0, 0.25, 13.1));

  g.userData.height = 16;
  g.userData.nightMats = [M.gold, M.goldBall, plaqueMat];
  return g;
}

export function buildQingchuanPavilion() {
  const g = buildPavilion({ floors: 2, baseW: 4.6, taper: 0.88, bodyH: 1.3, roofH: 1.0, terrace: true });
  g.userData.height = 7.5;
  return g;
}

// 武汉长江大桥：双层公铁两用 + 米字钢桁架 + 桥墩 + 玉兰灯
// 在局部坐标系沿 +X 建桥，长度 L，由调用方摆放朝向
export function buildBridge(L) {
  const g = new THREE.Group();
  const DECK_Y = 7;
  const midY = DECK_Y - 2.8;

  // 上层公路桥面 + 下层铁路纵梁 + 中央分道线
  g.add(mesh(new THREE.BoxGeometry(L, 0.45, 4.8), M.deck, L / 2, DECK_Y, 0));
  g.add(mesh(new THREE.BoxGeometry(L, 0.35, 3.2), M.deck, L / 2, midY, 0));
  g.add(mesh(new THREE.BoxGeometry(L, 0.03, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xd9b23c, roughness: 0.8 }), L / 2, DECK_Y + 0.25, 0));

  // 桥墩（8 墩 9 孔）
  const pierCount = 8;
  for (let i = 1; i <= pierCount; i++) {
    const x = (L / (pierCount + 1)) * i;
    g.add(mesh(new THREE.BoxGeometry(2.2, midY, 3.8), M.concrete, x, midY / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(2.7, 0.6, 4.3), M.concrete, x, 0.3, 0));
  }

  // 两侧米字桁架：从下层铁路面一直包到公路面上方，车辆穿行其中
  const TOP = DECK_Y + 1.3;
  const cageY = (midY + TOP) / 2;
  const cageH = TOP - midY;
  const bayCount = Math.max(8, Math.floor(L / 3.2));
  const bay = L / bayCount;
  const tilt = Math.atan2(cageH, bay);
  const diagCount = bayCount * 2;
  const diagGeo = new THREE.BoxGeometry(Math.hypot(bay, cageH), 0.34, 0.34);
  const diags = new THREE.InstancedMesh(diagGeo, M.steel, diagCount);
  diags.castShadow = true;
  const vertGeo = new THREE.BoxGeometry(0.3, cageH, 0.3);
  const verts = new THREE.InstancedMesh(vertGeo, M.steel, (bayCount + 1) * 2);
  verts.castShadow = true;
  const tmp = new THREE.Object3D();
  let di = 0, vi = 0;
  for (let s = -1; s <= 1; s += 2) {                    // 两侧
    for (let i = 0; i < bayCount; i++) {
      tmp.position.set(bay * (i + 0.5), cageY, s * 2.2);
      tmp.rotation.set(0, 0, i % 2 ? tilt : -tilt);     // 交替斜杆
      tmp.updateMatrix();
      diags.setMatrixAt(di++, tmp.matrix);
    }
    for (let i = 0; i <= bayCount; i++) {
      tmp.position.set(bay * i, cageY, s * 2.2);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      verts.setMatrixAt(vi++, tmp.matrix);
    }
  }
  g.add(diags, verts);

  // 上弦杆（桁架顶）+ 弦上栏杆立柱
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(L, 0.34, 0.34), M.steel, L / 2, TOP, s * 2.2));
    const postGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
    const posts = new THREE.InstancedMesh(postGeo, M.steel, Math.floor(L / 3) * 2);
    let pi = 0;
    for (let d = 0; d <= L; d += 3) for (const s2 of [-1, 1]) {
      tmp.position.set(d, TOP + 0.3, s2 * 2.2);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      posts.setMatrixAt(pi++, tmp.matrix);
    }
    g.add(posts);
  }

  // 玉兰灯：立在上弦杆上
  const lampN = Math.max(6, Math.round(L / 24));
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 1.9, 8), M.dark, lampN * 2);
  const globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 0 }), lampN * 2);
  let li = 0;
  for (let i = 0; i < lampN; i++) {
    const x = (i + 0.5) * (L / lampN);
    for (const s of [-1, 1]) {
      tmp.position.set(x, TOP + 1.25, s * 2.2);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      poles.setMatrixAt(li, tmp.matrix);
      tmp.position.y = TOP + 2.3;
      tmp.updateMatrix();
      globes.setMatrixAt(li, tmp.matrix);
      li++;
    }
  }
  g.add(poles, globes);

  // 桥头堡（两端各一）：民族风格塔楼 —— 基座 + 双层塔身 + 攒尖顶 + 夜间窗灯
  const towerWinMat = new THREE.MeshStandardMaterial({ color: 0x39424c, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const towerRoofMat = new THREE.MeshStandardMaterial({ color: 0x4e6169, roughness: 0.7 });
  for (const x of [7, L - 7]) {
    // 基座层（公路面起）
    g.add(mesh(new THREE.BoxGeometry(3.4, 3.6, 5.8), M.blockhouse, x, DECK_Y + 1.8, 0));
    g.add(mesh(new THREE.BoxGeometry(3.9, 0.45, 6.3), M.stone, x, DECK_Y + 3.85, 0));
    // 上层塔身
    g.add(mesh(new THREE.BoxGeometry(2.8, 2.6, 5.0), M.blockhouse, x, DECK_Y + 5.4, 0));
    g.add(mesh(new THREE.BoxGeometry(3.2, 0.4, 5.4), M.stone, x, DECK_Y + 6.9, 0));
    // 攒尖顶 + 宝顶
    const roof = mesh(new THREE.ConeGeometry(3.3, 2.0, 4), towerRoofMat, x, DECK_Y + 8.1, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(mesh(new THREE.SphereGeometry(0.26, 10, 10), M.goldBall, x, DECK_Y + 9.35, 0));
    // 竖条窗（四面，夜间亮灯）
    for (const s of [-1, 1]) {
      for (const yy of [DECK_Y + 1.5, DECK_Y + 2.6]) {
        g.add(mesh(new THREE.BoxGeometry(0.16, 0.85, 3.4), towerWinMat, x + s * 1.74, yy, 0));
        g.add(mesh(new THREE.BoxGeometry(2.3, 0.85, 0.16), towerWinMat, x, yy, s * 2.92));
      }
      for (const yy of [DECK_Y + 4.9, DECK_Y + 5.9]) {
        g.add(mesh(new THREE.BoxGeometry(0.14, 0.8, 3.0), towerWinMat, x + s * 1.44, yy, 0));
        g.add(mesh(new THREE.BoxGeometry(2.0, 0.8, 0.14), towerWinMat, x, yy, s * 2.52));
      }
    }
  }

  g.userData = {
    towerWinMat,
    length: L,
    deckY: DECK_Y,
    midY,
    lampMat: globes.material,
    // 火车/汽车路径用：局部 x → 世界坐标
    toWorld: (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld),
  };
  return g;
}

// 龟山电视塔：塔座 + 锥形塔身 + 观景舱 + 天线（总高约 300m → ~75 单位）
export function buildTvTower() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(6, 1.6, 6), M.stone, 0, 0.8, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.0, 2.2, 44, 12), M.tower, 0, 23.6, 0));
  g.add(mesh(new THREE.CylinderGeometry(3.4, 2.6, 3.2, 12), M.pod, 0, 47.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(2.5, 3.1, 2.6, 12), M.pod, 0, 50.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.9, 3.0, 10), M.tower, 0, 53.0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.34, 22, 8), M.steel, 0, 65.5, 0));
  const beacon = mesh(new THREE.SphereGeometry(0.35, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 1.5 }), 0, 76.8, 0, false, false);
  g.add(beacon);
  g.userData.height = 77;
  g.userData.podMat = M.pod;
  return g;
}

// 晴川桥式彩虹拱桥：桥面 + 两道红色拱肋（抛物线管）+ 吊杆 + 桥墩
// 沿局部 +X 建桥，跨度 L
export function buildArchBridge(L) {
  const g = new THREE.Group();
  const DECK = 3.2;
  const red = new THREE.MeshStandardMaterial({ color: 0xc2493d, roughness: 0.6, emissive: 0xc2493d, emissiveIntensity: 0 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xb0b6bb, roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(L, 0.35, 3.4), deckMat, L / 2, DECK, 0));
  g.add(mesh(new THREE.BoxGeometry(L, 0.3, 2.4), deckMat, L / 2, DECK - 0.7, 0));
  // 拱肋：用分段 box 沿抛物线摆放，两道并列
  const archH = Math.min(9, L * 0.28);
  const segs = 14;
  for (const s of [-1, 1]) {
    let prev = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = t * L;
      const y = DECK + Math.sin(Math.PI * t) * archH;
      if (prev) {
        const mx = (x + prev.x) / 2, my = (y + prev.y) / 2;
        const seg = mesh(new THREE.BoxGeometry(Math.hypot(x - prev.x, y - prev.y) + 0.25, 0.55, 0.55), red, mx, my, s * 1.35);
        seg.rotation.z = Math.atan2(y - prev.y, x - prev.x);
        g.add(seg);
      }
      prev = { x, y };
    }
  }
  // 吊杆
  const hangN = segs - 1;
  const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), M.steel, hangN * 2);
  const tmp = new THREE.Object3D();
  let hi = 0;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const x = t * L;
    const yTop = DECK + Math.sin(Math.PI * t) * archH;
    const h = yTop - DECK;
    tmp.scale.set(1, h, 1);
    for (const s of [-1, 1]) {
      tmp.position.set(x, DECK + h / 2, s * 1.35);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      hangers.setMatrixAt(hi++, tmp.matrix);
    }
  }
  g.add(hangers);
  // 桥墩
  for (const x of [1.2, L - 1.2]) {
    g.add(mesh(new THREE.BoxGeometry(1.4, DECK, 3.0), M.concrete, x, DECK / 2, 0));
  }
  g.userData.deckY = DECK;
  g.userData.nightMats = [red];
  return g;
}

// 鹦鹉洲大桥式悬索桥：橘红桥塔 + 悬索主缆 + 吊杆 + 双层桥面
export function buildSuspensionBridge(L) {
  const g = new THREE.Group();
  const DECK = 5.5;
  const orange = new THREE.MeshStandardMaterial({ color: 0xd06a2c, roughness: 0.65 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.5, metalness: 0.3 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xb0b6bb, roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(L, 0.4, 4.2), deckMat, L / 2, DECK, 0));
  g.add(mesh(new THREE.BoxGeometry(L, 0.3, 2.6), deckMat, L / 2, DECK - 0.7, 0));
  // 两座门式桥塔
  const towerXs = [L * 0.22, L * 0.78];
  const towerH = DECK + Math.min(11, L * 0.16);
  for (const tx of towerXs) {
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(1.1, towerH, 0.9), orange, tx, towerH / 2, s * 1.9));
    }
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.8, 4.6), orange, tx, towerH * 0.45, 0));
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.8, 4.6), orange, tx, towerH * 0.8, 0));
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.6, 4.8), M.concrete, tx, 0.3, 0));
  }
  // 主缆：抛物线，从桥两端锚碇经两塔顶垂下
  const cablePts = [];
  const sag = DECK + 0.6;
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * L;
    let y;
    if (x < towerXs[0]) {
      const t = x / towerXs[0];
      y = towerH - (towerH - sag) * (1 - t) * (1 - t) * 0.0 + (sag - towerH) * (1 - t) * (1 - t);
      y = towerH + (sag - towerH) * Math.pow(1 - t, 2);
    } else if (x <= towerXs[1]) {
      const t = (x - towerXs[0]) / (towerXs[1] - towerXs[0]);
      const top = towerH;
      y = sag + (top - sag) * (4 * t * (1 - t));
      y = Math.max(sag, sag + (top - sag) * (4 * t * (1 - t)) * 0.5 + (top - sag) * 0);
      y = sag + (towerH - sag) * Math.sin(Math.PI * t) * 0.92;
    } else {
      const t = (x - towerXs[1]) / (L - towerXs[1]);
      y = towerH + (sag - towerH) * Math.pow(t, 2);
    }
    cablePts.push(new THREE.Vector3(x, y, 0));
  }
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3(cablePts.map(p => new THREE.Vector3(p.x, p.y, s * 1.9)));
    const tube = new THREE.TubeGeometry(curve, 40, 0.14, 6, false);
    g.add(mesh(tube, cableMat, 0, 0, 0));
    // 吊杆
    const hangN = 18;
    const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 5), cableMat, hangN);
    const tmp = new THREE.Object3D();
    let hi = 0;
    for (let i = 1; i < hangN; i++) {
      const x = (i / hangN) * L;
      if (Math.abs(x - towerXs[0]) < 1.4 || Math.abs(x - towerXs[1]) < 1.4) continue;
      const pt = curve.getPointAt(Math.min(0.999, i / hangN));
      const h = pt.y - DECK;
      if (h < 0.3) continue;
      tmp.scale.set(1, h, 1);
      tmp.position.set(x, DECK + h / 2, s * 1.9);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      hangers.setMatrixAt(hi++, tmp.matrix);
    }
    hangers.count = hi;
    g.add(hangers);
  }
  g.userData.deckY = DECK;
  g.userData.nightMats = [orange];
  return g;
}

// 牌坊（黄鹤楼公园入口式）：双柱+横枋+小青瓦顶
export function buildArchway(w = 7) {
  const g = new THREE.Group();
  const darkGreen = new THREE.MeshStandardMaterial({ color: 0x3f5a52, roughness: 0.8 });
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), M.stone, s * w / 2, 0.17, 0));
    g.add(mesh(new THREE.BoxGeometry(0.55, 4.6, 0.55), M.red, s * w / 2, 2.3 + 0.3, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(w + 1.8, 0.5, 0.75), M.red, 0, 5.35, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 2.6, 0.32, 1.15), darkGreen, 0, 5.76, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 1.2, 0.28, 0.95), darkGreen, 0, 6.12, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 1.6, 0.14, 0.5), M.gold, 0, 5.12, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.42, 0.6), M.red, 0, 4.4, 0));
  return g;
}

// 二七桥式双塔斜拉桥：H型主塔 + 扇形索面 + 桥面（沿局部 +X 建模，置于起点）
export function buildCableStayBridge(L) {
  const g = new THREE.Group();
  const DECK = 8;
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xd4d7db, roughness: 0.7 });
  g.add(mesh(new THREE.BoxGeometry(L, 0.45, 4.4), M.deck, L / 2, DECK, 0));
  // 桥面中央标线
  g.add(mesh(new THREE.BoxGeometry(L, 0.03, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xd9b23c }), L / 2, DECK + 0.25, 0));
  const H = 15;
  const pylonXs = [L * 0.32, L * 0.68];
  const cableMat = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.4, metalness: 0.3 });
  const cables = [];
  for (const px of pylonXs) {
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(1.0, H, 0.8), pylonMat, px, H / 2 + DECK, s * 2.1));
    }
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 5.2), pylonMat, px, DECK + H * 0.98, 0));
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.6, 5.0), pylonMat, px, DECK + H * 0.62, 0));
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 4.8), M.concrete, px, 0.3, 0));
    // 扇形拉索（两侧各 9 根，向前后展开）
    for (let k = 0; k < 9; k++) {
      const dx = (k - 4) * 7.5;
      const ax = px + dx;
      if (ax < 4 || ax > L - 4) continue;
      const len = Math.hypot(dx, DECK + H * 0.95 - DECK - 0.2);
      for (const s of [-1, 1]) {
        cables.push({ ax, px, len, dx, s });
      }
    }
  }
  const cIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 5), cableMat, cables.length * 1);
  const tmp = new THREE.Object3D();
  cables.forEach((c, i) => {
    tmp.position.set((c.ax + c.px) / 2, DECK + (H * 0.95 + 0.2) / 2, c.s * 2.1);
    tmp.scale.set(1, c.len, 1);
    tmp.rotation.set(0, 0, Math.atan2(c.dx, H * 0.95 - 0.2));
    tmp.updateMatrix();
    cIM.setMatrixAt(i, tmp.matrix);
  });
  cIM.castShadow = true;
  g.add(cIM);
  // 桥墩与栏杆灯
  for (const x of [L * 0.16, L * 0.5, L * 0.84]) {
    g.add(mesh(new THREE.BoxGeometry(1.6, DECK, 3.2), M.concrete, x, DECK / 2, 0));
  }
  const lampN = Math.max(6, Math.round(L / 30));
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 1.7, 6), M.dark, lampN * 2);
  const globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 0 }), lampN * 2);
  let li = 0;
  for (let i = 0; i < lampN; i++) {
    const x = (i + 0.5) * (L / lampN);
    for (const s of [-1, 1]) {
      tmp.position.set(x, DECK + 1.1, s * 1.95);
      tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      poles.setMatrixAt(li, tmp.matrix);
      tmp.position.y = DECK + 2.05;
      tmp.updateMatrix();
      globes.setMatrixAt(li, tmp.matrix);
      li++;
    }
  }
  g.add(poles, globes);
  g.userData.lampMat = globes.material;
  return g;
}

// 绿地中心式超高层主塔：扭转身段玻璃塔 + 冠顶天线 + 边缘灯带
export function buildSupertall(h) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x9cc0dd, roughness: 0.28, metalness: 0.32 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const segs = 6;
  const w0 = h * 0.16;
  let y = 0;
  for (let i = 0; i < segs; i++) {
    const segH = h / segs;
    const w = w0 * (1 - i / (segs + 1));
    const b = mesh(new THREE.BoxGeometry(w, segH, w * 0.86), glass, 0, y + segH / 2, 0);
    b.rotation.y = i * 0.12;
    g.add(b);
    // 两条竖向灯带（对角）
    const ang = i * 0.12;
    for (const s of [-1, 1]) {
      const strip = mesh(new THREE.BoxGeometry(0.3, segH * 0.94, 0.3), glow,
        Math.cos(ang + s * Math.PI / 4) * w * 0.72, y + segH / 2, Math.sin(ang + s * Math.PI / 4) * w * 0.62);
      g.add(strip);
    }
    y += segH;
  }
  const crown = mesh(new THREE.BoxGeometry(w0 * 0.3, h * 0.12, w0 * 0.26), glass, 0, y + h * 0.06, 0);
  crown.rotation.y = 0.3;
  g.add(crown);
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.22, h * 0.14, 6), M.steel, 0, y + h * 0.12 + h * 0.07, 0));
  const beacon = mesh(new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1.2 }),
    0, y + h * 0.12 + h * 0.14, 0);
  g.add(beacon);
  g.userData.glowMats = [glow];
  g.userData.beacon = beacon.material;
  g.userData.height = h;
  return g;
}

// 小型梁桥（跨河汊/小江）：桥面 + 护栏 + 桥墩（沿局部 +X，置于起点）
export function buildBeamBridge(L) {
  const g = new THREE.Group();
  const DECK = 2.6;
  g.add(mesh(new THREE.BoxGeometry(L, 0.4, 3.6), M.deck, L / 2, DECK, 0));
  g.add(mesh(new THREE.BoxGeometry(L, 0.03, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xd9b23c }), L / 2, DECK + 0.22, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(L, 0.3, 0.16), M.steel, L / 2, DECK + 0.32, s * 1.7));
  }
  const piers = Math.max(2, Math.floor(L / 22));
  for (let i = 1; i < piers; i++) {
    g.add(mesh(new THREE.BoxGeometry(1.0, DECK, 2.2), M.concrete, L * i / piers, DECK / 2, 0));
  }
  return g;
}

// ---------- 江汉关钟楼（含走针时钟，钟面显示场景时间） ----------
export function buildJianghanGu() {
  const g = new THREE.Group();
  const granite = new THREE.MeshStandardMaterial({ color: 0xb6ada0, roughness: 0.85 });
  const cream2 = new THREE.MeshStandardMaterial({ color: 0xe6ddc8, roughness: 0.85 });
  // 台基 + 主楼（折中主义三段式）
  g.add(mesh(new THREE.BoxGeometry(5.6, 1.5, 3.6), granite, 0, 0.75, 0));
  g.add(mesh(new THREE.BoxGeometry(4.9, 3.0, 3.0), cream2, 0, 3.0, 0));
  g.add(mesh(new THREE.BoxGeometry(5.3, 0.4, 3.4), granite, 0, 4.7, 0));   // 中段腰线
  g.add(mesh(new THREE.BoxGeometry(3.9, 2.6, 2.5), cream2, 0, 6.2, 0));
  g.add(mesh(new THREE.BoxGeometry(4.3, 0.35, 2.9), granite, 0, 7.65, 0));
  // 钟楼段（四面时钟）
  const clockCv = document.createElement('canvas');
  clockCv.width = clockCv.height = 256;
  const clockTex = new THREE.CanvasTexture(clockCv);
  clockTex.colorSpace = THREE.SRGBColorSpace;
  const clockMat = new THREE.MeshStandardMaterial({
    map: clockTex, emissiveMap: clockTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6,
  });
  g.add(mesh(new THREE.BoxGeometry(2.9, 2.9, 2.9), cream2, 0, 9.25, 0));
  const cFaces = mesh(new THREE.BoxGeometry(3.05, 3.05, 3.05),
    [clockMat, clockMat, cream2, cream2, clockMat, clockMat], 0, 9.25, 0);
  g.add(cFaces);
  // 塔顶：方锥台 + 小穹顶
  const roof = mesh(new THREE.CylinderGeometry(0.55, 1.9, 1.5, 4), M.gold, 0, 11.45, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(mesh(new THREE.SphereGeometry(0.42, 12, 10), M.goldBall, 0, 12.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 6), M.steel, 0, 13.3, 0));
  // 柱廊细节（正面 6 柱）
  for (let k = 0; k < 6; k++) {
    g.add(mesh(new THREE.BoxGeometry(0.28, 2.6, 0.28), cream2, -1.9 + k * 0.76, 3.0, 1.58));
  }
  g.userData.clock = { cv: clockCv, tex: clockTex, mat: clockMat, ctx: clockCv.getContext('2d') };
  g.userData.nightMats = [clockMat];
  g.userData.height = 13.5;
  return g;
}

// 走针绘制（tod: 0..1 场景时间）
export function drawJianghanClock(cv, tod) {
  const ctx = cv.getContext('2d');
  const S = cv.width;
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2, R = S * 0.44;
  // 罗马刻度
  ctx.strokeStyle = '#2c2c30';
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    ctx.lineWidth = k % 3 === 0 ? 7 : 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * (R - 4), cy - Math.cos(a) * (R - 4));
    ctx.lineTo(cx + Math.sin(a) * (R - (k % 3 === 0 ? 20 : 13)), cy - Math.cos(a) * (R - (k % 3 === 0 ? 20 : 13)));
    ctx.stroke();
  }
  // 罗马数字 XII/III/VI/IX
  ctx.fillStyle = '#2c2c30';
  ctx.font = `bold ${S * 0.09}px Georgia`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('XII', cx, cy - R * 0.62);
  ctx.fillText('III', cx + R * 0.62, cy);
  ctx.fillText('VI', cx, cy + R * 0.62);
  ctx.fillText('IX', cx - R * 0.62, cy);
  const mins = tod * 24 * 60;
  const hAng = ((mins / 60) % 12) / 12 * Math.PI * 2;
  const mAng = (mins % 60) / 60 * Math.PI * 2;
  ctx.strokeStyle = '#1a1a1e';
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.035;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hAng) * R * 0.5, cy - Math.cos(hAng) * R * 0.5); ctx.stroke();
  ctx.lineWidth = S * 0.024;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(mAng) * R * 0.76, cy - Math.cos(mAng) * R * 0.76); ctx.stroke();
  ctx.fillStyle = '#8a4a3a';
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.028, 0, 6.29); ctx.fill();
}

// ---------- 汉口租界老建筑（红砖拱窗生成器） ----------
// 横匾（Canvas 字匾）
function makeHorizontalPlaque(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#5e1f1a'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#d9a43c'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 56);
  g.fillStyle = '#e8b84a';
  g.font = 'bold 40px "KaiTi", "STKaiti", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return mesh(new THREE.BoxGeometry(2.6, 0.62, 0.12),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7 }), 0, 0, 0);
}

let oldBankWinTex = null;
function getOldBankTexture() {
  if (oldBankWinTex) return oldBankWinTex;
  const S = 512, C = 128, N = 4;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#9e5140';                                   // 红砖底
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < S; y += 8) g.fillRect(0, y, S, 1);     // 砖缝
  for (let row = 0; row < N; row++) for (let i = 0; i < 4; i++) {
    const x = i * C, y = row * C;
    g.fillStyle = 'rgba(232,224,205,0.95)';                  // 拱窗套
    g.beginPath();
    g.moveTo(x + 30, y + 116);
    g.lineTo(x + 30, y + 52);
    g.arc(x + 52, y + 52, 22, Math.PI, 0);
    g.lineTo(x + 74, y + 116);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(42,44,52,0.9)';                      // 窗洞
    g.beginPath();
    g.moveTo(x + 38, y + 110);
    g.lineTo(x + 38, y + 54);
    g.arc(x + 52, y + 54, 14, Math.PI, 0);
    g.lineTo(x + 66, y + 110);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';                  // 玻璃反光
    g.fillRect(x + 40, y + 62, 8, 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 3.2, 1 / 3.2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  oldBankWinTex = tex;
  return tex;
}

// w/d/h 单位：场景单位（1u=4m）。rotateY 由调用方设置。
export function buildOldBank(w = 5, d = 3, h = 2.6, cornerDome = false) {
  const g = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({
    map: getOldBankTexture(), roughness: 0.9,
    emissiveMap: getOldBankTexture(), emissive: 0xffc890, emissiveIntensity: 0,
  });
  const cream3 = new THREE.MeshStandardMaterial({ color: 0xe6ddc8, roughness: 0.85 });
  const body = mesh(new THREE.BoxGeometry(w, h, d), brick, 0, h / 2, 0);
  g.add(body);
  // 底层石砌基座 + 拱廊
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.8, d + 0.3), cream3, 0, 0.4, 0));
  // 檐口两道
  g.add(mesh(new THREE.BoxGeometry(w + 0.5, 0.3, d + 0.5), cream3, 0, h * 0.52, 0));
  g.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.42, d + 0.6), cream3, 0, h + 0.2, 0));
  // 坡顶
  const roof = mesh(new THREE.CylinderGeometry(0.01, Math.max(w, d) * 0.62, 0.9, 4), M.roof, 0, h + 0.85, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = d / w;
  g.add(roof);
  // 老虎窗
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.4), cream3, w * 0.18, h + 0.85, 0));
  // 转角穹顶塔楼
  if (cornerDome) {
    const th = h + 1.6;
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.7, th, 10), brick, w / 2, th / 2, d / 2));
    const dome = mesh(new THREE.SphereGeometry(0.72, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x4e6169, roughness: 0.6 }), w / 2, th, d / 2);
    g.add(dome);
    g.add(mesh(new THREE.ConeGeometry(0.12, 0.8, 6), M.goldBall, w / 2, th + 1.0, d / 2));
  }
  g.userData.nightMats = [brick];
  return g;
}

// ---------- 白云阁（蛇山东段，三层层楼） ----------
export function buildWhiteCloudPavilion() {
  const g = buildPavilion({ floors: 3, baseW: 5.8, taper: 0.88, bodyH: 1.5, roofH: 1.0, terrace: true });
  g.userData.height = 12;
  return g;
}

// ---------- 火车站 ----------
export function makeStationSignTex(text, bg = '#15427a') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 100, 512, 28);
  g.fillStyle = '#ffffff';
  g.font = 'bold 88px "Microsoft YaHei", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 站房通用件：主楼+玻璃入口+站名匾+站前广场
function stationBase(w, h, d, name, signBg, bodyColor, glassBand) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
  g.add(mesh(new THREE.BoxGeometry(w, h, d), body, 0, h / 2, 0));
  // 玻璃入口横带
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fb6d4, roughness: 0.25, metalness: 0.3, emissive: 0x9fd0ff, emissiveIntensity: 0 });
  g.add(mesh(new THREE.BoxGeometry(w * 0.86, h * 0.3, d + 0.12), glass, 0, h * 0.34, 0));
  g.userData.glass = glass;
  // 站名匾
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.7, 10), Math.min(w * 0.7, 10) * 0.25),
    new THREE.MeshBasicMaterial({ map: makeStationSignTex(name, signBg), transparent: false }));
  sign.position.set(0, h * 0.86, d / 2 + 0.06);
  g.add(sign);
  // 屋面
  g.add(mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5),
    new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.8 }), 0, h + 0.17, 0));
  // 站前广场（浅色铺装）
  const sq = mesh(new THREE.CylinderGeometry(w * 0.75, w * 0.78, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0xb9b4a6, roughness: 1 }), 0, 0.05, d * 0.5 + w * 0.42);
  sq.receiveShadow = true;
  g.add(sq);
  return g;
}

// 汉口站（欧式拱廊风）
export function buildHankouRailStation() {
  const g = stationBase(19, 5.2, 6.2, '汉口站', '#1a4f8a', 0xe6ddc8, true);
  // 欧式拱廊（三层拱洞装饰带）
  for (let k = 0; k < 9; k++) {
    const x = -6.4 + k * 1.6;
    const arch = mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.9, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.85, side: THREE.DoubleSide }), x, 2.5, 2.56);
    g.add(arch);
  }
  // 中央钟亭
  g.add(mesh(new THREE.BoxGeometry(2.2, 1.4, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.85 }), 0, 5.4, 0));
  const dome = mesh(new THREE.SphereGeometry(0.8, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f5a52, roughness: 0.6 }), 0, 6.1, 0);
  g.add(dome);
  // 绿皮车 ×3 停靠
  for (let k = 0; k < 3; k++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.8 }));
    body.position.y = 0.62;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xd8e4da, roughness: 0.9 }));
    roof.position.y = 1.18;
    car.add(body, roof);
    car.position.set(9 + k * 6.0, 0.55, -4.5);
    g.add(car);
  }
  // 站台雨棚
  g.add(mesh(new THREE.BoxGeometry(22, 0.16, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.8 }), 12, 2.0, -4.5));
  return g;
}

// 武昌站（现代横长风）
export function buildWuchangRailStation() {
  const g = stationBase(18, 5.0, 6.0, '武昌站', '#15427a', 0xd7d9dc, true);
  // 横向格栅雨棚
  for (let k = 0; k < 7; k++) {
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 6.6),
      new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.7 }), -5.4 + k * 1.8, 5.1, 1.6));
  }
  // 绿皮车 ×2
  for (let k = 0; k < 2; k++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.8 }));
    body.position.y = 0.62;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xd8e4da, roughness: 0.9 }));
    roof.position.y = 1.18;
    car.add(body, roof);
    car.position.set(9 + k * 6.0, 0.55, -5.0);
    g.add(car);
  }
  g.add(mesh(new THREE.BoxGeometry(24, 0.16, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.8 }), 12, 2.0, -5.0));
  return g;
}

// 武汉站（"千年鹤归"大拱顶）——玻璃端墙+拱壳+站台雨棚+CRH 动车
export function buildWuhanRailStation() {
  const g = new THREE.Group();
  const R = 11, LEN = 34;
  // 拱壳（半圆筒，白面板）
  const shell = mesh(new THREE.CylinderGeometry(R, R, LEN, 26, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }),
    0, 0, 0);
  shell.rotation.z = Math.PI / 2;
  shell.rotation.y = 0;
  shell.position.set(0, 0.4, 0);
  g.add(shell);
  // 拱肋（深色框）
  for (let k = 0; k <= 8; k++) {
    const x = -LEN / 2 + k * (LEN / 8);
    const rib = mesh(new THREE.TorusGeometry(R, 0.14, 6, 24, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.6 }), x, 0.4, 0);
    rib.rotation.y = Math.PI / 2;
    g.add(rib);
  }
  // 两端玻璃幕墙
  const glassEnd = new THREE.MeshStandardMaterial({ color: 0x8fb6d4, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.75 });
  for (const s of [-1, 1]) {
    const wall = mesh(new THREE.CircleGeometry(R * 0.96, 20, 0, Math.PI), glassEnd, s * LEN / 2, 0.4, 0);
    wall.rotation.y = s * Math.PI / 2;
    g.add(wall);
  }
  // 站台 + 雨棚柱
  for (const z of [-3.5, 3.5]) {
    g.add(mesh(new THREE.BoxGeometry(LEN - 6, 0.5, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xb9b4a6, roughness: 1 }), 0, 0.85, z));
  }
  // CRH 白色动车 ×2（车头流线）
  for (let k = 0; k < 2; k++) {
    const train = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 1.05, 1.25),
      new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.15 }));
    body.position.y = 0.75;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 1.27),
      new THREE.MeshStandardMaterial({ color: 0x2e6ba8, roughness: 0.6 }));
    stripe.position.y = 0.62;
    const winBand = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.3, 1.27),
      new THREE.MeshStandardMaterial({ color: 0x242a30, roughness: 0.4 }));
    winBand.position.y = 1.05;
    train.add(body, stripe, winBand);
    for (const s of [-1, 1]) {
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.15 }));
      nose.scale.set(2.4, 0.85, 1);
      nose.position.set(s * 5.1, 0.78, 0);
      train.add(nose);
    }
    train.position.set(-7 + k * 1.2, 0.42, k ? 3.5 : -3.5);
    train.rotation.y = k ? Math.PI : 0;
    train.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(train);
  }
  // 站名匾（红底，悬于拱下正面）
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2),
    new THREE.MeshBasicMaterial({ map: makeStationSignTex('武汉站', '#a4262c'), transparent: false }));
  sign.position.set(0, 4.6, R * 0.72);
  sign.rotation.x = -0.18;
  g.add(sign);
  return g;
}

// 大智门火车站（1903 京汉铁路终点，法式老站，现铁路博物馆）
export function buildDazhimenStation() {
  const g = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({
    map: getOldBankTexture(), roughness: 0.9,
    emissiveMap: getOldBankTexture(), emissive: 0xffc890, emissiveIntensity: 0,
  });
  const cream3 = new THREE.MeshStandardMaterial({ color: 0xe6ddc8, roughness: 0.85 });
  // 主楼（对称三段，中央钟塔）
  g.add(mesh(new THREE.BoxGeometry(3.4, 2.0, 2.2), brick, -1.9, 1.0, 0));
  g.add(mesh(new THREE.BoxGeometry(3.4, 2.0, 2.2), brick, 1.9, 1.0, 0));
  g.add(mesh(new THREE.BoxGeometry(2.2, 2.9, 2.4), brick, 0, 1.45, 0));
  // 中央钟塔（四面钟）
  g.add(mesh(new THREE.BoxGeometry(1.4, 1.5, 1.4), cream3, 0, 3.65, 0));
  const mansard = mesh(new THREE.ConeGeometry(1.15, 1.1, 4), M.roof, 0, 4.95, 0);
  mansard.rotation.y = Math.PI / 4;
  g.add(mansard);
  g.add(mesh(new THREE.SphereGeometry(0.18, 8, 8), M.goldBall, 0, 5.6, 0));
  // 法式孟莎顶（两翼）
  for (const s of [-1, 1]) {
    const roof = mesh(new THREE.CylinderGeometry(0.01, 1.95, 0.8, 4), M.roof, s * 1.9, 2.4, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
  }
  // 站名匾
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshBasicMaterial({ map: makeStationSignTex('大智门火车站', '#6d3328') }));
  sign.position.set(0, 2.15, 1.21);
  g.add(sign);
  g.userData.nightMats = [brick];
  g.userData.height = 5.5;
  return g;
}

// ---------- 欢乐谷（武汉站旁主题乐园：摩天轮 + 过山车 + 旋转木马 + 大门） ----------
export function buildHappyValley() {
  const g = new THREE.Group();
  const nightMats = [];

  // 园区广场
  g.add(mesh(new THREE.CylinderGeometry(62, 66, 0.35, 28), M.concrete, 0, 0.17, 0));

  // —— 摩天轮：半径22，轮毂高31，绕自身 z 轴转 ——
  const wheel = new THREE.Group();
  const R = 22;
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd8dbe0, metalness: 0.4, roughness: 0.5, emissive: 0xff6a9a, emissiveIntensity: 0,
  });
  nightMats.push(rimMat);
  wheel.add(mesh(new THREE.TorusGeometry(R, 0.55, 8, 36), rimMat));
  const holders = [];
  const spokeGeo = new THREE.CylinderGeometry(0.28, 0.28, R * 2, 6);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0xff8c42, roughness: 0.6, emissive: 0xffa050, emissiveIntensity: 0,
  });
  nightMats.push(cabinMat);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const sp = mesh(spokeGeo, M.steel, Math.sin(a) * R / 2, Math.cos(a) * R / 2);
    sp.rotation.z = -a;
    wheel.add(sp);
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
    holder.add(mesh(new THREE.BoxGeometry(2.2, 2.4, 1.8), cabinMat, 0, -1.9, 0));
    wheel.add(holder);
    holders.push(holder);
  }
  wheel.position.set(-18, 31, -8);
  g.add(wheel);
  const legGeo = new THREE.CylinderGeometry(0.7, 1.2, 34, 8);
  for (const s of [1, -1]) {
    const leg = mesh(legGeo, M.steel, -18 + s * 6.5, 16, -3.4);
    leg.rotation.z = s * 0.32;
    g.add(leg);
  }
  const hub = mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.4, 10), M.dark, -18, 31, -8);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);

  // —— 过山车：闭合起伏环线 + 支柱 + 3 节列车（animate 沿曲线跑） ——
  const cpts = [
    [38, 2.4, 12], [58, 9, -6], [44, 14, -28], [16, 7, -38],
    [-6, 12.5, -22], [-16, 5.5, 2], [4, 10.5, 20], [26, 4.5, 26],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(cpts, true, 'catmullrom', 0.6);
  const trackMat = new THREE.MeshStandardMaterial({
    color: 0xc23b3b, roughness: 0.6, emissive: 0xff4040, emissiveIntensity: 0,
  });
  nightMats.push(trackMat);
  g.add(mesh(new THREE.TubeGeometry(curve, 150, 0.42, 6, true), trackMat));
  for (let i = 0; i < 150; i += 4) {
    const p = curve.getPointAt(i / 150);
    if (p.y < 3.6) continue;
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, p.y - 0.3, 6), M.steel, p.x, (p.y - 0.3) / 2, p.z));
  }
  const carMat = new THREE.MeshStandardMaterial({
    color: 0x2f6fbf, roughness: 0.5, emissive: 0x4488ff, emissiveIntensity: 0,
  });
  nightMats.push(carMat);
  const cars = [];
  for (let i = 0; i < 3; i++) {
    const car = mesh(new THREE.BoxGeometry(2.6, 1.1, 1.5), carMat);
    g.add(car);
    cars.push(car);
  }

  // —— 旋转木马 ——
  const carou = new THREE.Group();
  carou.add(mesh(new THREE.CylinderGeometry(7, 7.4, 1.1, 16), M.red, 0, 0.9, 0));
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xd9536b, roughness: 0.6, emissive: 0xff8098, emissiveIntensity: 0,
  });
  nightMats.push(roofMat);
  carou.add(mesh(new THREE.CylinderGeometry(0.3, 8, 2.6, 16), roofMat, 0, 7.6, 0));
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    carou.add(mesh(poleGeo, M.gold, Math.sin(a) * 5.6, 3.6, Math.cos(a) * 5.6));
    carou.add(mesh(new THREE.BoxGeometry(1.5, 0.8, 0.6), M.cream, Math.sin(a) * 5.6, 2.6, Math.cos(a) * 5.6));
  }
  carou.position.set(34, 0, 46);
  g.add(carou);

  // —— 大门（双柱 + 横梁 + 招牌） ——
  const gateMat = new THREE.MeshStandardMaterial({
    color: 0xe0b23c, roughness: 0.7, emissive: 0xffc040, emissiveIntensity: 0,
  });
  nightMats.push(gateMat);
  const gate = new THREE.Group();
  gate.add(mesh(new THREE.BoxGeometry(2.2, 12, 2.2), M.red, -13, 6, 0));
  gate.add(mesh(new THREE.BoxGeometry(2.2, 12, 2.2), M.red, 13, 6, 0));
  gate.add(mesh(new THREE.BoxGeometry(30, 2.6, 1.6), gateMat, 0, 13, 0));
  const signCv = document.createElement('canvas');
  signCv.width = 256; signCv.height = 48;
  const sctx = signCv.getContext('2d');
  sctx.fillStyle = '#c8371f'; sctx.fillRect(0, 0, 256, 48);
  sctx.fillStyle = '#ffd75e';
  sctx.font = 'bold 36px "KaiTi", "STKaiti", serif';
  sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
  sctx.fillText('欢 乐 谷', 128, 26);
  const signTex = new THREE.CanvasTexture(signCv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const hvSign = new THREE.Mesh(new THREE.PlaneGeometry(22, 4),
    new THREE.MeshBasicMaterial({ map: signTex }));
  hvSign.position.set(0, 13, 0.9);
  gate.add(hvSign);
  gate.position.set(0, 0, 62);
  g.add(gate);

  // —— 园区树（环广场一圈） ——
  const treeTrunk = new THREE.CylinderGeometry(0.35, 0.5, 2.2, 6);
  const treeCrown = new THREE.ConeGeometry(2.6, 5.5, 7);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x4d8a4f, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + 0.2;
    const tx = Math.sin(a) * 58, tz = Math.cos(a) * 58;
    g.add(mesh(treeTrunk, M.dark, tx, 1.1, tz));
    g.add(mesh(treeCrown, crownMat, tx, 4.6, tz));
  }

  g.userData = { wheel, holders, carousel: carou, coaster: { curve, cars }, nightMats };
  return g;
}

// ---------- 武汉大学（珞珈山：老图书馆 + 樱花大道 + 牌坊校门） ----------
export function buildWuhanUniversity() {
  const g = new THREE.Group();
  const nightMats = [];
  // 老图书馆：高台 + 主楼 + 中央八角塔（墨绿歇山顶）
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8d2be, roughness: 0.9 });
  const greenRoof = new THREE.MeshStandardMaterial({
    color: 0x3e6b52, roughness: 0.75, flatShading: true, emissive: 0x2f5a42, emissiveIntensity: 0,
  });
  nightMats.push(greenRoof);
  const lib = new THREE.Group();
  lib.add(mesh(new THREE.BoxGeometry(26, 1.6, 13), M.stone, 0, 0.8, 0));
  lib.add(mesh(new THREE.BoxGeometry(22, 4.2, 9), wallMat, 0, 3.6, 0));
  lib.add(mesh(new THREE.BoxGeometry(6.5, 3.4, 6.5), wallMat, 0, 7.4, 0));
  lib.add(mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.5, 8), greenRoof, 0, 9.8, 0));
  lib.add(mesh(new THREE.BoxGeometry(4.4, 2.2, 4.4), wallMat, 0, 11.4, 0));
  lib.add(mesh(new THREE.ConeGeometry(4.9, 3.4, 8), greenRoof, 0, 14.2, 0));
  lib.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5), M.dark, 0, 16.8, 0));
  for (const s of [-1, 1]) {
    lib.add(mesh(new THREE.BoxGeometry(8, 3.4, 8), wallMat, s * 15.5, 3.4, 0));
    const wingRoof = mesh(new THREE.ConeGeometry(6.2, 2.6, 4), greenRoof, s * 15.5, 6.4, 0);
    wingRoof.rotation.y = Math.PI / 4;
    lib.add(wingRoof);
  }
  lib.position.set(0, 0, -14);
  g.add(lib);
  // 校门牌坊
  const gate = buildArchway(9);
  gate.position.set(0, 0, 40);
  g.add(gate);
  // 樱花大道：校门 → 图书馆 两侧粉樱
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 2.4, 5);
  const crownGeo = new THREE.SphereGeometry(2.1, 8, 6);
  const sakuraMat = new THREE.MeshStandardMaterial({
    color: 0xf2b4cc, roughness: 1, emissive: 0xe89ab8, emissiveIntensity: 0,
  });
  nightMats.push(sakuraMat);
  for (let i = 0; i < 14; i++) {
    const t = 0.1 + i / 14 * 0.72;
    for (const s2 of [-1, 1]) {
      const x = s2 * 7.5, z = 36 - t * 46;
      g.add(mesh(trunkGeo, M.dark, x, 1.2, z));
      g.add(mesh(crownGeo, sakuraMat, x, 3.3, z));
    }
  }
  // 草坪与广场
  g.add(mesh(new THREE.CylinderGeometry(36, 39, 0.3, 24), M.concrete, 0, 0.15, 14));
  g.add(mesh(new THREE.CylinderGeometry(15, 15, 0.36, 18),
    new THREE.MeshStandardMaterial({ color: 0x7fae6a, roughness: 1 }), 0, 0.18, 6));
  g.userData = { nightMats };
  return g;
}

// ---------- 武汉理工大学（马房山：教学楼群 + 图书馆 + 操场 + 校门） ----------
export function buildWUT() {
  const g = new THREE.Group();
  const nightMats = [];
  const wall = new THREE.MeshStandardMaterial({ color: 0xe3ded2, roughness: 0.9 });
  const glassB = new THREE.MeshStandardMaterial({
    color: 0x8fb2c9, roughness: 0.35, metalness: 0.4, emissive: 0x9fc8e8, emissiveIntensity: 0,
  });
  nightMats.push(glassB);
  // 图书馆主楼
  g.add(mesh(new THREE.BoxGeometry(20, 8.5, 10), wall, 0, 4.55, -22));
  g.add(mesh(new THREE.BoxGeometry(21.4, 1.1, 11.2), M.stone, 0, 9.4, -22));
  g.add(mesh(new THREE.BoxGeometry(16, 1.6, 6), glassB, 0, 5.6, -16.6));
  // 教学楼×3
  for (const [ox, oz, ry] of [[-24, 2, 0.5], [24, 2, -0.5], [0, 12, 0]]) {
    const tb = mesh(new THREE.BoxGeometry(15, 6, 8), wall, ox, 3.3, oz);
    tb.rotation.y = ry;
    g.add(tb);
    const roof = mesh(new THREE.BoxGeometry(15.6, 0.8, 8.6), M.stone, ox, 6.8, oz);
    roof.rotation.y = ry;
    g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(10, 2.4, 0.4), glassB, ox, 4.6, oz + 4.1));
  }
  // 操场：红色环道 + 绿茵场
  g.add(mesh(new THREE.CylinderGeometry(15, 15, 0.32, 26),
    new THREE.MeshStandardMaterial({ color: 0xc4574a, roughness: 1 }), 27, 0.16, 16));
  g.add(mesh(new THREE.CylinderGeometry(10.5, 10.5, 0.36, 22),
    new THREE.MeshStandardMaterial({ color: 0x6ba05f, roughness: 1 }), 27, 0.2, 16));
  // 校门 + 行道树环
  const gate = buildArchway(8);
  gate.position.set(0, 0, 30);
  g.add(gate);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 5);
  const crownGeo = new THREE.SphereGeometry(1.9, 7, 6);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x5d9455, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const tx = Math.cos(a) * 42, tz = Math.sin(a) * 42;
    g.add(mesh(trunkGeo, M.dark, tx, 1.1, tz));
    g.add(mesh(crownGeo, crownMat, tx, 3.1, tz));
  }
  g.userData = { nightMats };
  return g;
}

// ---------- 武商梦时代（全球最大纯商业体：巨盒 + 玻璃带 + 屋顶花园 + LED） ----------
export function buildMengshidai() {
  const g = new THREE.Group();
  const nightMats = [];
  const body = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.55, metalness: 0.12 });
  const band = new THREE.MeshStandardMaterial({
    color: 0x9fc4dc, roughness: 0.3, metalness: 0.5, emissive: 0x7fb8e8, emissiveIntensity: 0,
  });
  nightMats.push(band);
  const W = 132, D = 48, H = 13;
  g.add(mesh(new THREE.BoxGeometry(W, H, D), body, 0, H / 2 + 0.5, 0));
  for (const y of [4, 8, 11.6]) g.add(mesh(new THREE.BoxGeometry(W + 0.3, 1.5, D + 0.3), band, 0, y, 0));
  for (const s of [-1, 1]) {
    const cap = mesh(new THREE.CylinderGeometry(H / 2 + 0.5, H / 2 + 0.5, D + 0.6, 14), body, s * W / 2, H / 2 + 0.5, 0);
    cap.rotation.x = Math.PI / 2;
    g.add(cap);
  }
  // 屋顶花园条带 + 圆厅
  g.add(mesh(new THREE.BoxGeometry(W * 0.7, 1.2, D * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x6ba05f, roughness: 1 }), -8, H + 1.1, 0));
  g.add(mesh(new THREE.SphereGeometry(7, 12, 8, 0, Math.PI * 2, 0, 1.65), band, W / 2 - 18, H + 1.4, 0));
  // 入口雨棚
  g.add(mesh(new THREE.BoxGeometry(26, 1.1, 8), band, 0, 6.4, D / 2 + 4));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), M.steel, s * 11, 3, D / 2 + 6.5));
  // LED 招牌「梦时代」
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, '#1a2440'); grad.addColorStop(1, '#2c3e6e');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 64px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('武 商 梦 时 代', 256, 52);
  ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 84);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({
    color: 0x1a2440, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.6,
  });
  nightMats.push(signMat);
  const sign = mesh(new THREE.PlaneGeometry(56, 10.5), signMat, -20, H + 6.4, 0);
  g.add(sign);
  const back = mesh(new THREE.BoxGeometry(58, 12, 1.2), M.steel, -20, H + 6.2, -0.7);
  g.add(back);
  // 前广场
  g.add(mesh(new THREE.BoxGeometry(W + 30, 0.28, 26), M.concrete, 0, 0.14, D / 2 + 14));
  g.userData = { nightMats };
  return g;
}

// ---------- 通用商场套件（玻璃幕墙塔楼 + 裙楼 + 大字招牌，按名字定制） ----------
export function buildMall(name, opts = {}) {
  const g = new THREE.Group();
  const nightMats = [];
  const { towerH = 26, tw = 22, podium = true, color = 0xdfe3e8 } = opts;
  const wall = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9cc0dd, roughness: 0.26, metalness: 0.4, emissive: 0x8fb8e0, emissiveIntensity: 0,
  });
  nightMats.push(glass);
  if (podium) {
    g.add(mesh(new THREE.BoxGeometry(52, 8, 34), wall, 0, 4, 0));
    g.add(mesh(new THREE.BoxGeometry(53, 1.0, 35), M.stone, 0, 8.6, 0));
    g.add(mesh(new THREE.BoxGeometry(44, 5.4, 0.6), glass, 0, 4.6, 17.2));
  }
  // 主塔（退台两层）
  g.add(mesh(new THREE.BoxGeometry(tw, towerH, tw * 0.82), glass, -6, podium ? 8 + towerH / 2 : towerH / 2, -2));
  g.add(mesh(new THREE.BoxGeometry(tw * 0.7, 6, tw * 0.6), wall, -6, podium ? 8 + towerH + 3 : towerH + 3, -2));
  // 招牌
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 88;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#8a1f1f'; ctx.fillRect(0, 0, 512, 88);
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 56px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 46);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.MeshStandardMaterial({
    color: 0x8a1f1f, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.6,
  });
  nightMats.push(signM);
  const signY = podium ? 10.5 : 6;
  g.add(mesh(new THREE.PlaneGeometry(40, 6.8), signM, 0, signY, 17.6));
  g.add(mesh(new THREE.BoxGeometry(42, 8, 1.0), M.steel, 0, signY, 17.0));
  g.userData = { nightMats };
  return g;
}

// ---------- 中国地质大学（鲁磨路：主楼 + 隧道口标志石） ----------
export function buildCug() {
  const g = new THREE.Group();
  const nightMats = [];
  const wall = new THREE.MeshStandardMaterial({ color: 0xdfd8c6, roughness: 0.9 });
  const glassB = new THREE.MeshStandardMaterial({
    color: 0x8fb2c9, roughness: 0.35, metalness: 0.4, emissive: 0x9fc8e8, emissiveIntensity: 0,
  });
  nightMats.push(glassB);
  // 主楼（图书档次）
  g.add(mesh(new THREE.BoxGeometry(24, 10, 10), wall, 0, 5, -14));
  g.add(mesh(new THREE.BoxGeometry(25.4, 1.2, 11), M.stone, 0, 10.8, -14));
  g.add(mesh(new THREE.BoxGeometry(18, 2.2, 0.5), glassB, 0, 6.4, -8.6));
  // 东西翼
  for (const s2 of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(12, 6, 8), wall, s2 * 20, 3.2, -4));
    g.add(mesh(new THREE.BoxGeometry(12.6, 0.8, 8.6), M.stone, s2 * 20, 6.5, -4));
  }
  // 操场
  g.add(mesh(new THREE.CylinderGeometry(10.5, 10.5, 0.3, 22),
    new THREE.MeshStandardMaterial({ color: 0xc4574a, roughness: 1 }), 0, 0.15, 20));
  g.add(mesh(new THREE.CylinderGeometry(7, 7, 0.34, 18),
    new THREE.MeshStandardMaterial({ color: 0x6ba05f, roughness: 1 }), 0, 0.18, 20));
  // 校门 + 化石石碑（地质大学特色）
  const gate = buildArchway(8);
  gate.position.set(0, 0, 34);
  g.add(gate);
  const rock = mesh(new THREE.DodecahedronGeometry(2.6, 0),
    new THREE.MeshStandardMaterial({ color: 0x8a8074, roughness: 1, flatShading: true }), 8, 1.6, 30);
  g.add(rock);
  g.userData = { nightMats };
  return g;
}

// ---------- 中南财经政法大学（南湖大道旁：主楼 + 双翼 + 校门） ----------
export function buildZuel() {
  const g = new THREE.Group();
  const nightMats = [];
  const wall = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.9 });
  const glassB = new THREE.MeshStandardMaterial({
    color: 0x8fb2c9, roughness: 0.35, metalness: 0.4, emissive: 0x9fc8e8, emissiveIntensity: 0,
  });
  nightMats.push(glassB);
  g.add(mesh(new THREE.BoxGeometry(20, 11, 9), wall, 0, 5.5, -12));
  g.add(mesh(new THREE.BoxGeometry(21.2, 1.1, 10), M.stone, 0, 11.6, -12));
  g.add(mesh(new THREE.BoxGeometry(14, 2.4, 0.5), glassB, 0, 7, -7.2));
  for (const s2 of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(13, 6.5, 7), wall, s2 * 18, 3.5, 0));
    g.add(mesh(new THREE.BoxGeometry(13.6, 0.8, 7.6), M.stone, s2 * 18, 7.1, 0));
  }
  g.add(mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.3, 20),
    new THREE.MeshStandardMaterial({ color: 0xc4574a, roughness: 1 }), 0, 0.15, 21));
  g.add(mesh(new THREE.CylinderGeometry(6.3, 6.3, 0.34, 18),
    new THREE.MeshStandardMaterial({ color: 0x6ba05f, roughness: 1 }), 0, 0.18, 21));
  const gate = buildArchway(7.5);
  gate.position.set(0, 0, 34);
  g.add(gate);
  g.userData = { nightMats };
  return g;
}

// ---------- 通用医院套件（白主楼红十字 + 门诊裙楼 + 急诊棚 + 救护车位） ----------
export function buildHospital(name, opts = {}) {
  const g = new THREE.Group();
  const nightMats = [];
  const { towerH = 22, tw = 16 } = opts;
  const wall = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.85 });
  const winM = new THREE.MeshStandardMaterial({
    color: 0x8fb2c9, roughness: 0.35, metalness: 0.35, emissive: 0xcfe8ff, emissiveIntensity: 0,
  });
  nightMats.push(winM);
  // 主楼（住院部）
  g.add(mesh(new THREE.BoxGeometry(tw, towerH, tw * 0.72), wall, 0, towerH / 2 + 1.2, -6));
  g.add(mesh(new THREE.BoxGeometry(tw + 1.4, 1.0, tw * 0.72 + 1), M.stone, 0, towerH + 1.8, -6));
  // 竖窗带
  for (let f = 2; f < towerH - 1; f += 2.6) {
    g.add(mesh(new THREE.BoxGeometry(tw * 0.86, 1.1, 0.3), winM, 0, f + 1, -6 + tw * 0.36 + 0.1));
  }
  // 门诊裙楼
  g.add(mesh(new THREE.BoxGeometry(34, 5.5, 14), wall, 0, 2.95, 8));
  g.add(mesh(new THREE.BoxGeometry(35, 0.8, 15), M.stone, 0, 6.1, 8));
  g.add(mesh(new THREE.BoxGeometry(28, 2.0, 0.35), winM, 0, 3.4, 15.2));
  // 急诊棚（绿色雨棚 + 柱）
  const emerg = new THREE.MeshStandardMaterial({ color: 0x3f9a56, roughness: 0.7 });
  g.add(mesh(new THREE.BoxGeometry(12, 0.5, 7), emerg, -21, 4.4, 10));
  for (const dx of [-26, -16]) g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 6), M.steel, dx, 2.1, 12.5));
  // 红十字招牌
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f5f3ee'; ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#c8371f';
  ctx.fillRect(112, 14, 32, 68); ctx.fillRect(94, 32, 68, 32);
  ctx.fillStyle = '#333';
  ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 178, 80);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.MeshStandardMaterial({
    color: 0xf5f3ee, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.6,
  });
  nightMats.push(signM);
  g.add(mesh(new THREE.PlaneGeometry(13, 4.9), signM, 6, 9.4, 15.6));
  // 前广场 + 救护车（白盒+红条）
  g.add(mesh(new THREE.BoxGeometry(46, 0.26, 24), M.concrete, 0, 0.13, 22));
  const amb = new THREE.Group();
  amb.add(mesh(new THREE.BoxGeometry(4.6, 2.2, 2.0),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }), 0, 1.35, 0));
  amb.add(mesh(new THREE.BoxGeometry(4.7, 0.5, 2.1),
    new THREE.MeshStandardMaterial({ color: 0xd03a2a, roughness: 0.6, emissive: 0xff4040, emissiveIntensity: 0 }), 0, 1.0, 0));
  amb.position.set(-21, 0, 24);
  amb.rotation.y = 0.5;
  g.add(amb);
  g.userData = { nightMats };
  return g;
}

// ---------- 武汉天地（石库门红砖里弄 + 旗杆广场） ----------
export function buildWuhanTiandi() {
  const g = new THREE.Group();
  const nightMats = [];
  const brick = new THREE.MeshStandardMaterial({ color: 0x9a4a38, roughness: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.85 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x3d3833, roughness: 0.9 });
  const lampM = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a, roughness: 0.7, emissive: 0xffc060, emissiveIntensity: 0,
  });
  nightMats.push(lampM);
  // 两排石库门联排（中间窄巷）
  for (const row of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = -50 + i * 18;
      const h = 5.2 + (i % 2) * 0.9;
      g.add(mesh(new THREE.BoxGeometry(14, h, 10), brick, x, h / 2, row * 9));
      g.add(mesh(new THREE.BoxGeometry(15, 0.5, 11), trim, x, h + 0.25, row * 9));
      const roof = mesh(new THREE.ConeGeometry(9.2, 1.8, 4), roofM, x, h + 1.2, row * 9);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      // 门楣山花（石库门标志）
      g.add(mesh(new THREE.BoxGeometry(3.2, 1.6, 0.5), trim, x + 3, h - 1.2, row * 9 + row * 5.1));
    }
  }
  // 巷道铺装 + 灯杆
  g.add(mesh(new THREE.BoxGeometry(104, 0.28, 7), M.concrete, 0, 0.14, 0));
  for (let i = 0; i < 7; i++) {
    const x = -48 + i * 16;
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 6), M.dark, x, 1.8, 0));
    g.add(mesh(new THREE.SphereGeometry(0.32, 8, 6), lampM, x, 3.7, 0));
  }
  // 入口旗杆阵
  for (const dx of [-6, 0, 6]) {
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 8.5, 6), M.steel, dx, 4.25, 22));
  }
  g.userData = { nightMats };
  return g;
}

// ---------- 万达御湖世家（三栋弧排超高层住宅 + 园林水景） ----------
export function buildWandaTower() {
  const g = new THREE.Group();
  const nightMats = [];
  const wall = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.85 });
  const winM = new THREE.MeshStandardMaterial({
    color: 0x7f9db3, roughness: 0.3, metalness: 0.35, emissive: 0xffe9c0, emissiveIntensity: 0,
  });
  nightMats.push(winM);
  const balc = new THREE.MeshStandardMaterial({ color: 0xc4beb0, roughness: 0.9 });
  for (const [ox, oz, h] of [[-14, 0, 40], [2, -10, 44], [18, 2, 38]]) {
    g.add(mesh(new THREE.BoxGeometry(8.5, h, 8.5), wall, ox, h / 2 + 1, oz));
    for (let y = 4; y < h + 1; y += 3.6) {
      g.add(mesh(new THREE.BoxGeometry(9.3, 0.5, 9.3), balc, ox, y, oz));
    }
    g.add(mesh(new THREE.BoxGeometry(5.6, 1.2, 5.6), wall, ox, h + 1.8, oz));
  }
  // 园林水景池 + 棕榈环
  g.add(mesh(new THREE.CylinderGeometry(10, 10.6, 0.4, 18),
    new THREE.MeshStandardMaterial({
      color: 0x69a8d8, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85,
      emissive: 0x9fd0f0, emissiveIntensity: 0,
    }), 0, 0.2, 20));
  nightMats.push(g.children[g.children.length - 1].material);
  g.userData = { nightMats };
  return g;
}

// ---------- 极地海洋公园（白鲸穹顶馆 + 海豚池 + 企鹅堡） ----------
export function buildOceanPark() {
  const g = new THREE.Group();
  const nightMats = [];
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({
    color: 0x5aa8d8, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.88,
    emissive: 0x8fd0f0, emissiveIntensity: 0,
  });
  nightMats.push(blue);
  // 主穹顶馆（白鲸馆）
  g.add(mesh(new THREE.SphereGeometry(17, 16, 10, 0, Math.PI * 2, 0, 1.62), white, -16, 0.4, -6));
  g.add(mesh(new THREE.CylinderGeometry(17, 17, 3.2, 16), white, -16, 1.6, -6));
  // 海豚表演池（圆池+跳台）
  g.add(mesh(new THREE.CylinderGeometry(11, 11.6, 1.0, 18), M.stone, 18, 0.5, 6));
  g.add(mesh(new THREE.CylinderGeometry(9.4, 9.4, 0.5, 18), blue, 18, 1.05, 6));
  // 企鹅堡（冰淇淋塔意象：三层渐缩圆台）
  g.add(mesh(new THREE.CylinderGeometry(6.5, 7.5, 2.2, 12), white, 16, 1.1, -16));
  g.add(mesh(new THREE.CylinderGeometry(5, 6.5, 2.2, 12), white, 16, 3.3, -16));
  g.add(mesh(new THREE.ConeGeometry(4.2, 3.4, 12),
    new THREE.MeshStandardMaterial({
      color: 0x9fd4ea, roughness: 0.4, emissive: 0x9fd4ea, emissiveIntensity: 0,
    }), 16, 6.1, -16));
  nightMats.push(g.children[g.children.length - 1].material);
  // 入口大门（拱门+海豚雕）
  g.add(mesh(new THREE.BoxGeometry(2.0, 9, 2.0), white, -8, 4.5, 26));
  g.add(mesh(new THREE.BoxGeometry(2.0, 9, 2.0), white, 8, 4.5, 26));
  g.add(mesh(new THREE.BoxGeometry(19, 2.2, 1.6),
    new THREE.MeshStandardMaterial({
      color: 0x2f8fc8, roughness: 0.6, emissive: 0x6fc0f0, emissiveIntensity: 0,
    }), 0, 10.2, 26));
  nightMats.push(g.children[g.children.length - 1].material);
  // 前广场
  g.add(mesh(new THREE.CylinderGeometry(40, 43, 0.3, 26), M.concrete, 0, 0.15, 14));
  g.userData = { nightMats };
  return g;
}

// ---------- 园博园（双温室玻璃穹顶 + 花田色块 + 长江文明馆圆台） ----------
export function buildGardenExpo() {
  const g = new THREE.Group();
  const nightMats = [];
  const glass = new THREE.MeshStandardMaterial({
    color: 0xaad4e8, roughness: 0.18, metalness: 0.3, transparent: true, opacity: 0.75,
    emissive: 0xbfe0f0, emissiveIntensity: 0,
  });
  nightMats.push(glass);
  const frame = new THREE.MeshStandardMaterial({ color: 0x8b9298, roughness: 0.5, metalness: 0.4 });
  // 主温室（半椭球）
  const dome1 = mesh(new THREE.SphereGeometry(16, 14, 9, 0, Math.PI * 2, 0, 1.55), glass, -20, 0.3, 0);
  dome1.scale.y = 0.82;
  g.add(dome1);
  g.add(mesh(new THREE.TorusGeometry(15.6, 0.28, 6, 20), frame, -20, 0.4, 0));
  // 副温室
  const dome2 = mesh(new THREE.SphereGeometry(10.5, 12, 8, 0, Math.PI * 2, 0, 1.55), glass, 12, 0.3, -14);
  dome2.scale.y = 0.8;
  g.add(dome2);
  // 长江文明馆（圆台+环廊）
  g.add(mesh(new THREE.CylinderGeometry(9, 11, 5.5, 14), M.cream, 10, 3.05, 16));
  g.add(mesh(new THREE.CylinderGeometry(11.5, 11.5, 0.8, 14), M.stone, 10, 6.1, 16));
  g.add(mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, 8), M.stone, 10, 7.6, 16));
  // 花田色块（四种花色圆盘散布）
  const petals = [0xe86a8a, 0xf2c14e, 0xc97ae8, 0xf0f0f0];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.3;
    const r = 30 + (i % 3) * 9;
    g.add(mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.3, 10),
      new THREE.MeshStandardMaterial({ color: petals[i % 4], roughness: 1 }),
      Math.cos(a) * r, 0.16, Math.sin(a) * r * 0.8));
  }
  // 环园路
  g.add(mesh(new THREE.TorusGeometry(44, 1.6, 6, 30),
    new THREE.MeshStandardMaterial({ color: 0xcfc8b6, roughness: 1 }), 0, 0.14, 0));
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  g.userData = { nightMats };
  return g;
}

// ---------- 盘龙城遗址（夯土城台 + 茅草顶宫殿 + 考古棚） ----------
export function buildPanlongcheng() {
  const g = new THREE.Group();
  const nightMats = [];
  const earth = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 });
  const thatch = new THREE.MeshStandardMaterial({ color: 0xc2a35c, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e5137, roughness: 1 });
  // 夯土城台（分层）
  g.add(mesh(new THREE.CylinderGeometry(30, 34, 1.6, 20), earth, 0, 0.8, 0));
  g.add(mesh(new THREE.CylinderGeometry(24, 27, 1.8, 18), earth, 0, 2.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(18, 21, 2.0, 16), earth, 0, 4.4, 0));
  // 宫殿（四坡茅草顶 + 木柱廊）
  const hall = new THREE.Group();
  hall.add(mesh(new THREE.BoxGeometry(16, 3.2, 10), earth, 0, 1.6, 0));
  const roof = mesh(new THREE.ConeGeometry(11.5, 3.6, 4), thatch, 0, 4.9, 0);
  roof.rotation.y = Math.PI / 4;
  hall.add(roof);
  for (let c = -6; c <= 6; c += 2.4) {
    hall.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.2, 6), wood, c, 1.6, 5.4));
  }
  hall.position.set(0, 5.4, 0);
  g.add(hall);
  // 考古工作棚（白布棚+探方）
  const tent = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(10, 0.3, 6), tent, -26, 2.6, 8));
  for (const dx of [-30, -22]) for (const dz of [5.6, 10.4]) {
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 5), wood, dx, 1.3, dz));
  }
  for (let qx = -29; qx <= -23; qx += 3) for (let qz = 6; qz <= 10; qz += 2.2) {
    g.add(mesh(new THREE.BoxGeometry(2.8, 0.12, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x9a8a68, roughness: 1 }), qx, 0.28, qz));
  }
  // 遗址标志石碑
  g.add(mesh(new THREE.BoxGeometry(3.4, 2.4, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x8a8074, roughness: 1, flatShading: true }), 20, 1.2, 18));
  g.userData = { nightMats };
  return g;
}

// ---------- 知音号（民国风黄铜色游轮：双层甲板+双烟囱+桅杆） ----------
export function buildZhiyinHao(name = '知 音 号') {
  const g = new THREE.Group();
  const nightMats = [];
  const hullM = new THREE.MeshStandardMaterial({ color: 0x24333e, roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xd9b98a, roughness: 0.45, metalness: 0.3, emissive: 0xffdf9f, emissiveIntensity: 0,
  });
  nightMats.push(brass);
  const cream = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.75 });
  const winM = new THREE.MeshStandardMaterial({
    color: 0xffe9b8, roughness: 0.3, emissive: 0xffd880, emissiveIntensity: 0,
  });
  nightMats.push(winM);
  // 船体（双层：深色底+米色上层）
  g.add(mesh(new THREE.BoxGeometry(24, 2.6, 6.4), hullM, 0, 1.5, 0));
  g.add(mesh(new THREE.BoxGeometry(21.5, 2.4, 5.6), cream, 0, 3.9, 0));
  g.add(mesh(new THREE.BoxGeometry(17, 2.0, 4.8), cream, 0, 6.0, 0));
  // 舷窗两排
  for (let i = 0; i < 9; i++) {
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.7, 0.2), winM, -8 + i * 2, 4.0, 2.85));
  }
  for (let i = 0; i < 7; i++) {
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.6, 0.2), winM, -6 + i * 2, 6.1, 2.45));
  }
  // 双烟囱（红带黄环）
  for (const dx of [-4, 2]) {
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.6, 10),
      new THREE.MeshStandardMaterial({ color: 0xc8371f, roughness: 0.6 }), dx, 8.2, -0.4));
    g.add(mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.4, 10), brass, dx, 9.0, -0.4));
  }
  // 桅杆 + 前甲板灯
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6), M.steel, 8, 10.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), brass, 8, 12.3, 0));
  // 船名牌
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 48;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#24333e'; ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 30px "KaiTi", "STKaiti", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 25);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.MeshStandardMaterial({
    color: 0x24333e, map: tex, emissive: 0xffdf9f, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.6,
  });
  nightMats.push(signM);
  g.add(mesh(new THREE.PlaneGeometry(9, 1.7), signM, 0, 6.1, 2.45));
  g.userData = { nightMats };
  return g;
}

// ---------- 洪山广场（圆形广场 + 喷泉 + 省直机关楼群） ----------
export function buildHongshanSquare() {
  const g = new THREE.Group();
  const nightMats = [];
  const winM = new THREE.MeshStandardMaterial({
    color: 0x8fa8bc, roughness: 0.35, metalness: 0.3, emissive: 0xffe2b0, emissiveIntensity: 0,
  });
  nightMats.push(winM);
  const wall = new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.9 });
  // 圆形广场三层 + 中央喷泉
  g.add(mesh(new THREE.CylinderGeometry(46, 50, 0.35, 30), M.concrete, 0, 0.17, 0));
  g.add(mesh(new THREE.CylinderGeometry(30, 30, 0.42, 26),
    new THREE.MeshStandardMaterial({ color: 0x7fae6a, roughness: 1 }), 0, 0.21, 0));
  g.add(mesh(new THREE.CylinderGeometry(9, 10, 0.9, 18), M.stone, 0, 0.45, 0));
  const water = mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.35, 18),
    new THREE.MeshStandardMaterial({
      color: 0x69a8d8, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85,
      emissive: 0x9fd0f0, emissiveIntensity: 0,
    }), 0, 0.85, 0);
  nightMats.push(water.material);
  g.add(water);
  g.add(mesh(new THREE.ConeGeometry(1.1, 3.2, 10), M.stone, 0, 2.2, 0));
  // 旗杆（北弧一排）
  for (let i = 0; i < 5; i++) {
    const a = -0.5 + i * 0.25;
    const px = Math.sin(a) * 27, pz = -Math.cos(a) * 27;
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 6), M.steel, px, 4.5, pz));
    g.add(mesh(new THREE.BoxGeometry(2.4, 1.3, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xd03a2a, roughness: 0.8, emissive: 0xd03a2a, emissiveIntensity: 0 }), px + 1.3, 8.4, pz));
  }
  // 四座省直机关楼（庄重白墙 + 四坡顶 + 柱廊入口），环绕广场
  const roofM = new THREE.MeshStandardMaterial({ color: 0x5d6b5d, roughness: 0.85 });
  for (const [ang, dist, w, d, h] of [[Math.PI, 92, 30, 12, 11], [Math.PI / 2, 96, 26, 11, 9], [-Math.PI / 2, 96, 26, 11, 9], [0, 100, 34, 13, 12]]) {
    const b = new THREE.Group();
    b.add(mesh(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0));
    const roof = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.62, 3, 4), roofM, 0, h + 1.5, 0);
    roof.rotation.y = Math.PI / 4;
    b.add(roof);
    b.add(mesh(new THREE.BoxGeometry(w * 0.55, 2.4, 0.5), winM, 0, h * 0.45, d / 2 + 0.3));
    for (let c = -2; c <= 2; c++) b.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, h * 0.55, 8), wall, c * 3, h * 0.28, d / 2 + 1.2));
    b.position.set(Math.sin(ang) * dist, 0, -Math.cos(ang) * dist);
    b.rotation.y = ang + Math.PI;
    g.add(b);
  }
  // 广场树环
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 5);
  const crownGeo = new THREE.SphereGeometry(1.9, 7, 6);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x5d9455, roughness: 1 });
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2 + 0.15;
    g.add(mesh(trunkGeo, M.dark, Math.cos(a) * 60, 1.1, Math.sin(a) * 60));
    g.add(mesh(crownGeo, crownMat, Math.cos(a) * 60, 3.1, Math.sin(a) * 60));
  }
  g.userData = { nightMats };
  return g;
}

// ---------- 楚河汉街（楚河 + 民国风商铺街 + 灯笼牌坊） ----------
export function buildChuheHanjie() {
  const g = new THREE.Group();
  const nightMats = [];
  // 楚河（水面 320 长）
  const riverM = new THREE.MeshStandardMaterial({
    color: 0x69a8d8, roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.85,
    emissive: 0x9fd0f0, emissiveIntensity: 0,
  });
  nightMats.push(riverM);
  g.add(mesh(new THREE.BoxGeometry(330, 0.4, 20), riverM, 0, 0.2, -18));
  // 两岸步道
  g.add(mesh(new THREE.BoxGeometry(330, 0.3, 4), M.stone, 0, 0.26, -6));
  g.add(mesh(new THREE.BoxGeometry(330, 0.3, 4), M.stone, 0, 0.26, -30));
  // 汉街铺装
  g.add(mesh(new THREE.BoxGeometry(324, 0.3, 13), M.concrete, 0, 0.26, 8));
  // 民国风商铺（南列 13 间：彩色立面 + 深色坡顶）
  const facades = [0xc46a52, 0xd8c8a8, 0x8a9bb0, 0xb8894a, 0x9a8a78, 0xc9b8a0];
  const roofM = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.9 });
  const lanternM = new THREE.MeshStandardMaterial({
    color: 0xd03a2a, roughness: 0.6, emissive: 0xff5a3a, emissiveIntensity: 0,
  });
  nightMats.push(lanternM);
  for (let i = 0; i < 13; i++) {
    const x = -144 + i * 24;
    const h = 4.6 + (i % 3) * 1.1;
    const f = facades[i % facades.length];
    g.add(mesh(new THREE.BoxGeometry(17, h, 9),
      new THREE.MeshStandardMaterial({ color: f, roughness: 0.9 }), x, h / 2, 17));
    const roof = mesh(new THREE.ConeGeometry(12.2, 2.2, 4), roofM, x, h + 1.1, 17);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    // 店招横带
    g.add(mesh(new THREE.BoxGeometry(14, 1.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.8, emissive: 0xffc060, emissiveIntensity: 0 }), x, h - 0.9, 12.6));
    // 灯笼杆
    if (i % 2 === 0) {
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6), M.dark, x + 12, 2.4, 5));
      g.add(mesh(new THREE.SphereGeometry(0.45, 8, 6), lanternM, x + 12, 4.6, 5));
    }
  }
  // 两端牌坊
  for (const s of [-1, 1]) {
    const gate = buildArchway(9);
    gate.position.set(s * 164, 0, 8);
    g.add(gate);
  }
  g.userData = { nightMats };
  return g;
}

// ---------- 大学分校区套件（校门 + 教学楼 + 操场 + 树环） ----------
export function buildCampusSmall() {
  const g = new THREE.Group();
  const nightMats = [];
  const wall = new THREE.MeshStandardMaterial({ color: 0xe3ded2, roughness: 0.9 });
  const glassB = new THREE.MeshStandardMaterial({
    color: 0x8fb2c9, roughness: 0.35, metalness: 0.4, emissive: 0x9fc8e8, emissiveIntensity: 0,
  });
  nightMats.push(glassB);
  g.add(mesh(new THREE.BoxGeometry(16, 7, 8), wall, 0, 3.8, -12));
  g.add(mesh(new THREE.BoxGeometry(17, 0.9, 9), M.stone, 0, 7.7, -12));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(11, 5, 7), wall, s * 17, 2.8, 2));
    g.add(mesh(new THREE.BoxGeometry(11.6, 0.7, 7.6), M.stone, s * 17, 5.6, 2));
  }
  g.add(mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.3, 20),
    new THREE.MeshStandardMaterial({ color: 0xc4574a, roughness: 1 }), 0, 0.15, 22));
  g.add(mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.34, 18),
    new THREE.MeshStandardMaterial({ color: 0x6ba05f, roughness: 1 }), 0, 0.18, 22));
  const gate = buildArchway(7);
  gate.position.set(0, 0, 36);
  g.add(gate);
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 5);
  const crownGeo = new THREE.SphereGeometry(1.7, 7, 6);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x5d9455, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    g.add(mesh(trunkGeo, M.dark, Math.cos(a) * 28, 1, Math.sin(a) * 28));
    g.add(mesh(crownGeo, crownMat, Math.cos(a) * 28, 2.8, Math.sin(a) * 28));
  }
  g.userData = { nightMats };
  return g;
}

// ---------- 龙湖·天玺（石牌岭路 50+ 层超高层住宅双塔） ----------
export function buildLonghuTianxi() {
  const g = new THREE.Group();
  const nightMats = [];
  const wall = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.85 });
  const balc = new THREE.MeshStandardMaterial({ color: 0xc4beB0, roughness: 0.9 });
  const winM = new THREE.MeshStandardMaterial({
    color: 0x7f9db3, roughness: 0.3, metalness: 0.35, emissive: 0xffe9c0, emissiveIntensity: 0,
  });
  nightMats.push(winM);
  // 商业裙楼（沿路）
  g.add(mesh(new THREE.BoxGeometry(40, 3.4, 16), wall, 12, 2.0, 6));
  g.add(mesh(new THREE.BoxGeometry(41, 0.9, 17), M.stone, 12, 3.9, 6));
  // 双塔：52层/56层（1u≈4m，44u≈176m）
  for (const [ox, oz, h] of [[-2, -6, 44], [20, -14, 48]]) {
    g.add(mesh(new THREE.BoxGeometry(9, h, 9), wall, ox, h / 2 + 4, oz));
    for (let y = 7; y < h + 4; y += 4) {
      g.add(mesh(new THREE.BoxGeometry(9.9, 0.55, 9.9), balc, ox, y, oz));
    }
    g.add(mesh(new THREE.BoxGeometry(6, 1.4, 6), wall, ox, h + 4.8, oz));
    const beacon = mesh(new THREE.SphereGeometry(0.6, 6, 5), winM, ox, h + 6.2, oz);
    g.add(beacon);
  }
  g.userData = { nightMats };
  return g;
}
