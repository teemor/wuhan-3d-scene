// main.js — 江城武汉 · 两江三镇 场景入口（重建版 v1）
window.__M1 = true;
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import * as GEO from './geo.js?v=35';
import { buildHuanghelou, buildBridge, buildTvTower, buildQingchuanPavilion, buildSuspensionBridge, buildArchBridge, buildArchway, buildCableStayBridge, buildSupertall, buildBeamBridge, buildJianghanGu, drawJianghanClock, buildOldBank, buildWhiteCloudPavilion, buildHankouRailStation, buildWuchangRailStation, buildWuhanRailStation, buildDazhimenStation, buildHappyValley, buildWuhanUniversity, buildWUT, buildMengshidai, buildLonghuTianxi, buildHongshanSquare, buildChuheHanjie, buildCampusSmall, buildMall, buildCug, buildZuel, buildHospital, buildWuhanTiandi, buildWandaTower, buildOceanPark, buildGardenExpo, buildPanlongcheng, buildZhiyinHao } from './landmarks.js?v=24';

const $ = id => document.getElementById(id);
// 分母必须等于 boot 内 setStatus 的实际调用次数，否则进度条永远走不到 100%（表现为"卡住"）。
// 实测精确计数 = 12：加载OSM/解析/隆起/大地/沿街填充/生成城市/道路/水面/绿地/搭建地标/完成 …
// 核对方法：sed -n "${boot起},${boot止}p" js/main.js | grep -c "setStatus(['\`]"
// 改动 boot 的阶段划分后必须重新核对此数字。
const loadStages = { n: 0, total: 12 };
const setStatus = s => {
  loadStages.n++;
  const bar = document.getElementById('loadBar');
  const txt = document.getElementById('loadText');
  if (bar) bar.style.width = Math.min(100, loadStages.n / loadStages.total * 100) + '%';
  if (txt) txt.textContent = s;
};
// 阶段间让出主线程。
// 注意：这里必须用 setTimeout 而非 requestAnimationFrame —— animate() 已在 boot 期间无条件运行，
// rAF 要等下一帧绘制完成，而每帧包含 WebGL 渲染（此时场景已塞入大量几何体），
// 实测反而比定时器更慢。setTimeout(0) 让出到宏任务队列末端，浏览器可立即处理样式重绘与进度条更新。
const frame = () => new Promise(r => setTimeout(r, 0));

// ---------- 两阶段加载调度 ----------
// 首屏只建"视觉主体"（地形/大地/建筑/道路/水面），随后把 20+ 项细节构建放到空闲时段分片补齐。
// 目的：让用户尽快看到可交互画面，而不是对着封面等全部细节建完。
const deferredTasks = [];      // 待后台补齐的任务队列
const deferTask = (label, fn) => deferredTasks.push({ label, fn });
let __phase2Running = false;
let __fillCount = 0;           // 第二阶段生成的填充楼数量（首屏时为 0）

// ---------- 第二阶段：沿街填充建筑 ----------
// 从首屏移到这里的原因：填充楼共 10550 栋（主填充 4200 + 定向补城 6350），
// 与 OSM 的 11224 栋合计 21774 栋，一次性构建会产生 1.34M 顶点 / 56MB 几何体，
// 是加载 5 分钟的主因。填充楼用于填补 OSM 数据稀疏区，视觉上后补完全无感知。
//
// 注意：buildFillBuildings 内部每次都会 buildOccupancyGrid(parsed)，依赖 parsed.buildings
// 的当前状态，因此 7 次调用的先后顺序与参数必须与原实现完全一致，否则楼位会整体偏移。
function buildFillBuildingsDeferred() {
  const hfn = (x, z) => GEO.terrainHeight(x, z);
  const fills = GEO.buildFillBuildings(parsed, 4200, hfn);
  parsed.buildings = parsed.buildings.concat(fills);
  // 定向补城：网格街道密集填充（OSM 数据稀疏区：青山/后湖/汉阳西/武昌南）
  const fillZones = [
    { n: 1700, x0: 1700, x1: 3700, z0: -1950, z1: -650 },    // 青山
    { n: 900, x0: -1050, x1: 250, z0: -2400, z1: -1550 },    // 后湖
    { n: 800, x0: -1300, x1: -500, z0: -300, z1: 900 },      // 汉阳西
    { n: 850, x0: -400, x1: 950, z0: 200, z1: 1100 },        // 武昌南
    { n: 1100, x0: 950, x1: 1400, z0: -700, z1: 950 },       // 中北路片区
    { n: 1000, x0: 870, x1: 1360, z0: 560, z1: 1140 },       // 南湖片区
  ];
  for (const fz of fillZones) {
    const f = GEO.buildFillBuildings(parsed, fz.n, hfn,
      r => { const q = r.pts[0]; return q.x > fz.x0 && q.x < fz.x1 && q.z > fz.z0 && q.z < fz.z1; });
    parsed.buildings = parsed.buildings.concat(f);
  }
  __fillCount = fills.length;
  // 医院选址清场：陆总(10栋) + 中南(70栋密集让位)
  parsed.buildings = parsed.buildings.filter(b => {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    return Math.hypot(cx - 911, cz + 83) > 48 && Math.hypot(cx - 1678, cz - 333) > 60;
  });
  // 财大选址清场（3栋）
  parsed.buildings = parsed.buildings.filter(b => {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    return Math.hypot(cx - 985, cz - 825) > 52;
  });
  // 武汉大学核心区清场：OSM 简易楼让位给老图书馆+樱花大道地标组
  parsed.buildings = parsed.buildings.filter(b => {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    return Math.hypot(cx - 1798, cz - 222) > 58;
  });

  // 填充楼几何：并入既有 cityGroup，复用首屏已建好的材质（夜间发光依赖 cityResiMat/cityGlassMat 引用）
  const fillOnly = parsed.buildings.filter(b => b.fill);
  if (fillOnly.length && cityGroupRef) {
    const fillCity = GEO.buildCityMesh({ buildings: fillOnly }, hfn,
      { roofMat: cityRoofMat, resiMat: cityResiMat, glassMat: cityGlassMat });
    cityGroupRef.add(fillCity.group);
  }
}

// 空闲调度：优先 requestIdleCallback，回退到 setTimeout 分片
const idleSlice = () => new Promise(r => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => r(), { timeout: 120 });
  else setTimeout(r, 0);
});

function setPhase2Notice(text) {
  let el = document.getElementById('phase2');
  if (!el) {
    el = document.createElement('div');
    el.id = 'phase2';
    // z-index 必须高于 #loading 的 40，否则封面未撤除时提示条被完全遮住，用户看不到后台补齐进度
    el.style.cssText = 'position:fixed;right:16px;top:56px;z-index:50;padding:6px 14px;' +
      'background:rgba(16,24,40,.6);color:#ffd98a;border-radius:999px;font-size:12.5px;' +
      'letter-spacing:.5px;backdrop-filter:blur(8px);transition:opacity .5s;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = text ? '1' : '0';
}

// 后台分片执行：每完成一项就让出一帧，避免长时间独占主线程
async function runDeferredTasks() {
  if (__phase2Running) return;
  __phase2Running = true;
  const total = deferredTasks.length;
  for (let i = 0; i < total; i++) {
    const t = deferredTasks[i];
    setPhase2Notice(`后台补齐场景细节… ${i + 1}/${total}`);
    try {
      t.fn();
    } catch (e) {
      console.warn('后台补齐失败 [' + t.label + ']:', e);
    }
    await idleSlice();
  }
  setPhase2Notice('');
  window.__phase2done = true;
  window.__deferredCount = total;
}

// ---------- 渲染器 / 后期管线 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
$('app').appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 6000);
camera.position.set(620, 470, 1000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-80, 0, -240);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 15;
controls.maxDistance = 1800;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.45;
renderer.domElement.addEventListener('pointerdown', () => controls.autoRotate = false);
renderer.domElement.addEventListener('wheel', () => controls.autoRotate = false);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let gtaoPass = null;
try {
  gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  gtaoPass.enabled = false;
} catch (e) { console.warn('GTAO 降级:', e); }
composer.addPass(gtaoPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.16, 0.55, 0.8);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const fxaaPass = new ShaderPass(FXAAShader);
composer.addPass(fxaaPass);
function updateFXAA() {
  const dpr = renderer.getPixelRatio();
  fxaaPass.material.uniforms['resolution'].value.set(1 / (window.innerWidth * dpr), 1 / (window.innerHeight * dpr));
}
updateFXAA();
window.__M2 = true;
window.__snap = () => { try { composer.render(); return renderer.domElement.toDataURL('image/jpeg', 0.72); } catch (e) { return 'ERR:' + e.message; } };

// ---------- 昼夜配色 ----------




let walk;

const DAY = {
  sky: new THREE.Color(0xa9cde6), top: new THREE.Color(0x6fb0e0), horizon: new THREE.Color(0xd2e6f3),
  hemiSky: new THREE.Color(0xbfd9ee), hemiGround: new THREE.Color(0x8a8266),
  hemiI: 1.0, sun: new THREE.Color(0xfff1d6), sunI: 2.8, water: new THREE.Color(0xffffff),
};
const NIGHT = {
  sky: new THREE.Color(0x0c1428), top: new THREE.Color(0x04070f), horizon: new THREE.Color(0x1c2947),
  hemiSky: new THREE.Color(0x1d2a4c), hemiGround: new THREE.Color(0x0c1018),
  hemiI: 0.3, sun: new THREE.Color(0x8fa3e8), sunI: 0.4, water: new THREE.Color(0x2a3f55),
};
scene.background = DAY.horizon.clone();
scene.fog = new THREE.Fog(DAY.horizon.clone(), 1350, 4400);

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    topColor: { value: DAY.top.clone() },
    bottomColor: { value: DAY.horizon.clone() },
    offset: { value: 300 },
    exponent: { value: 0.75 },
  },
  vertexShader: 'varying vec3 vWorldPosition; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorldPosition = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y; gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0); }',
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 14), skyMat));
try {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 14), skyMat));
  scene.environment = pmrem.fromScene(envScene, 0.05).texture;
  pmrem.dispose();
} catch (e) { console.warn('PMREM 环境反射降级:', e); }

// ---------- 灯光 ----------
const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiI);
scene.add(hemi);
const sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI);
sun.position.set(700, 900, 300);
sun.castShadow = true;
// 阴影贴图规格自适应：低配设备（移动端 / 小屏 / 低内存）降到 1024，桌面 2048。
// 4096² 首帧阴影 pass 是加载期最大单项开销之一，2048² 视觉差异在此场景几乎不可见。
const SHADOW_SIZE = (() => {
  try {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    if (mobile || mem <= 4 || cores <= 4) return 1024;
    return 2048;
  } catch (e) { return 2048; }
})();
sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
sun.shadow.camera.left = -850; sun.shadow.camera.right = 850;
sun.shadow.camera.top = 650; sun.shadow.camera.bottom = -650;
sun.shadow.camera.near = 200; sun.shadow.camera.far = 2600;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 2.6;
scene.add(sun);

// ---------- 星空 / 银河 / 流星 / 日月 / 云 ----------
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 4, transparent: true, opacity: 0, fog: false });
{
  const pos = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.9 + 0.08;
    v.normalize().multiplyScalar(2400);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, starMat));
}
const mwMat = new THREE.PointsMaterial({ size: 1.7, transparent: true, opacity: 0, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
{
  const n = new THREE.Vector3(0.45, 0.3, 0.84).normalize();
  const pos = [], col = [];
  const rc = GEO.seededRand(777);
  const cw = new THREE.Color(0xcdd8ff), cb = new THREE.Color(0xffffff), cp = new THREE.Color(0xd8c8ff);
  for (let i = 0; i < 700; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.addScaledVector(n, -v.dot(n) * (0.86 + rc() * 0.1));
    v.normalize().multiplyScalar(2350);
    pos.push(v.x, v.y, v.z);
    const r = rc();
    const c = (r < 0.55 ? cw : r < 0.85 ? cb : cp).clone().multiplyScalar(0.5 + rc() * 0.5);
    col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, mwMat));
}
const meteor = {
  mesh: new THREE.Mesh(
    (() => { const pg = new THREE.PlaneGeometry(0.22, 7); pg.rotateX(Math.PI / 2); return pg; })(),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
  active: false, t: 0, life: 1.1, next: 6, pos0: new THREE.Vector3(), vel: new THREE.Vector3(),
};
meteor.mesh.visible = false;
scene.add(meteor.mesh);

const sunBall = new THREE.Mesh(new THREE.SphereGeometry(55, 20, 20), new THREE.MeshBasicMaterial({ color: 0xffd76b, fog: false }));
sunBall.position.set(1500, 1700, 600);
scene.add(sunBall);
const moonBall = new THREE.Mesh(new THREE.SphereGeometry(38, 20, 20), new THREE.MeshBasicMaterial({ color: 0xe8eefc, fog: false }));
moonBall.position.set(-1300, 1500, -900);
moonBall.visible = false;
scene.add(moonBall);

const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
const clouds = [];
for (const [x, y, z, sp] of [[-500, 300, -350, 6], [250, 340, -500, 4], [700, 290, 100, 7], [-150, 380, -650, 5]]) {
  const c = new THREE.Group();
  for (const [ox, oy, r] of [[0, 0, 26], [30, -4, 20], [-28, -2, 21], [10, 12, 17]]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), cloudMat);
    puff.position.set(ox, oy, 0);
    puff.scale.y = 0.6;
    c.add(puff);
  }
  c.position.set(x, y, z);
  c.userData.speed = sp;
  clouds.push(c);
  scene.add(c);
}

// ---------- 全局引用 ----------
const dayState = { mode: 'auto', tod: 0.34, speed: 1 / 210 };
let waterIdx = null;
let cityResiMat = null, cityGlassMat = null, waterMat = null, viaductLampMat = null;
let cityRoofMat = null;   // 第二阶段追加填充楼时复用首屏材质，避免重复生成窗纹理
let suspensionNightMats = null, archNightMats = null;
let bridgeGroup = null, bridgeCars = [];
let bridgeSpanInfo = null;
let cityGroupRef = null;
let bridgeErqiLampMat = null;
const autoBridgeLampMats = [];
const autoNightMats = [];
let towerPosRef = null, tvPosRef = null;
let happyValley = null, happyNightMats = [];
const campusNightMats = [];
const billNightMats = [];
const cranes = [];
let signsMatRef = null;
let jtWalkerIM = null;
const jtWalkers = [];
const jtTmp = new THREE.Object3D();
let streetLightMat = null, streetHeadMat = null;
let bridgeLampMat = null, tvPodMat = null;
const boats = [];
let riverGlintMat = null;
let waterfrontMat = null;
let waterMeshRef = null, waterBasePos = null;
let tour = null, tourCurve = null;
let boatGlowMat = null;
const boatLightMats = [];
let eastLakeLightMat = null;
const lakeBoatGlow = [];
const lakeBoats = [];
let trainWinMat = null, vehLightMat = null;
let trainSmokes = [], bridgeTrains = [];
const fwSites = [];
let fwPoints = null, fwActive = false, fwTimer = 0, fwRocketG = 60;
let fwBoatSources = [];
const fwFree = [], fwParts = [], fwRockets = [];
const fogPlanes = [];
let jianghanGu = null, jianghanLastHour = -1, jhClockT = 0;
let walkColliders = null;
let heritageNightMats = [];
const skylineGlowMats = [], skylineBeacons = [];
const ledScreens = [];
let ledClock = 0;
const tlSpots = [];
let tlRedA = null, tlGreenA = null, tlYellowA = null, tlRedB = null, tlGreenB = null, tlYellowB = null;
const tlCell = new Map();
let ferryBoat = null;
const ferry = { A: null, B: null, t: 0, dir: 1, dwell: 0, justDocked: false };
let duckIM = null, swanIM = null, pigeonIM = null;
const ducks = [], swans = [], pigeons = [];
let walkerIM = null;
const walkers = [];
let birdMesh = null, birdData = [];
let heliGroup = null, heliRotor = null, heliBeacon = null;
let trafficMesh = null, trafficCars = [], trafficSegs = [], trafficMat = null;
const trafficTmp = new THREE.Object3D();
const aerialTmp = new THREE.Object3D();
const walkerTmp = new THREE.Object3D();
const animalTmp = new THREE.Object3D();
let miniBase = null, miniTimer = 0;
const MINI = { x0: -1300, x1: 4300, z0: -2500, z1: 1500 };   // 覆盖全域（含青山/武汉站/汉口北/洪山）
let riverCurve = null;
let towerNightMats = [], towerSpot = null;
let artGlowMat = null;
const navLights = [];
let guideIM = null;
const lightRunners = [];
let obsIM = null;
let camTween = null, camTweenFrom = null;
const CAMS = {};
let env = { t: 0, target: 0 };
let pickDown = null;

// ---------- 地标信息 ----------
const INFO = {
  '黄鹤楼': '江南三大名楼之一，始建于三国吴黄武二年（223年），历代屡毁屡建。现楼 1985 年落成，外观五层，高约 51 米，坐蛇山之巅、扼长江之岸。"故人西辞黄鹤楼，烟花三月下扬州。"',
  '武汉长江大桥': '万里长江第一桥。1957 年 10 月建成通车，公路铁路两用，全长约 1670 米，西接汉阳龟山、东连武昌蛇山，是京广铁路的过江通道。',
  '龟山电视塔': '1986 年建成，塔高逾 300 米，中国第一座自行设计建造的电视塔，素有"亚洲桅杆"之称，与黄鹤楼隔江相望。',
  '晴川阁': '得名于"晴川历历汉阳树"，明嘉靖年间始建，与黄鹤楼、古琴台并称武汉三大名胜，隔江与黄鹤楼相望。',
  '鹦鹉洲长江大桥': '2014 年建成通车的悬索桥，橘红色桥塔是长江上的醒目标志，连接武昌与汉阳；"芳草萋萋鹦鹉洲"，洲名源自祢衡《鹦鹉赋》。',
  '晴川桥': '2000 年建成的红色系杆拱桥，横跨汉江连接汉口与汉阳，因毗邻晴川阁得名，与龙王庙、南岸嘴隔水相望。',
  '二七长江大桥': '2015 年建成的双塔双索面斜拉桥，位于二七纪念馆附近江段，是武汉长江上的重要过江通道之一。',
  '绿地中心': '武昌滨江商务区的超高层地标，设计高度约 438 米，曾规划为"华中第一高楼"，与对岸汉口江滩隔江相望。',
  '江汉关': '1924 年落成的江汉关大楼，希腊古典式与欧洲文艺复兴风格融合，曾是汉口海关总部。楼顶大钟报时近百年，是汉口开埠的象征，与上海江海关并称长江双璧。',
  '白云阁': '蛇山之巅的历史名阁，历代屡毁屡建，为黄鹤楼公园的制高点之一，登阁可俯瞰武汉三镇与长江大桥。',
  '大智门火车站': '1903 年建成的京汉铁路终点站，法式风格老站房，现已改为武汉铁路博物馆，是汉口租界时代的重要遗存。',
  '东湖': '中国最大的城中湖之一，水域约 33 平方公里，是国家 5A 级景区。环湖绿道全长逾百公里，湖畔有磨山、听涛、落雁等景区，"东湖之眼"摩天轮与樱花园闻名遐迩。',
  '武汉站': '2009 年建成的高铁枢纽，"千年鹤归"造型的流线型拱顶寓意黄鹤归来，是京广高铁的重要站点，中国第一座大型高铁站。',
  '汉口站': '1903 年京汉铁路起点大智门车站的继承者，现为华中地区最大普速客运站之一。欧式站房气势恢宏，是汉口北部门户。',
  '武昌站': '武昌站位于京广线上，1917 年通车的通湘门车站是其前身，2007 年改造为现代化客运站，武咸城际与京广铁路在此交汇。',
};

const LABEL_POS = new Map();   // 标签名 -> 世界坐标（点击直达用）
const LABEL_CAM_OVERRIDE = {}; // 特殊地标的观景机位微调（距离倍率）
function addLabel(name, worldPos) {
  const div = document.createElement('div');
  div.className = 'tag';
  div.textContent = name;
  div.addEventListener('click', () => {
    showInfo(name);
    try { flyToLabel(name); window.__flyLog = (window.__flyLog || []).concat(name + ':ok'); }
    catch (e) { window.__flyLog = (window.__flyLog || []).concat(name + ':ERR ' + e.message); }
  });
  const obj = new CSS2DObject(div);
  obj.position.copy(worldPos);
  scene.add(obj);
  LABEL_POS.set(name, worldPos.clone());
}
// 标签点击直达：从标签高度反推观景机位（高度越高越远）
function flyToLabel(name) {
  const p = LABEL_POS.get(name);
  if (!p || walk) return;
  const h = Math.max(6, p.y);
  const dist = h < 16 ? 55 : h < 40 ? 85 : h < 80 ? 150 : 240;
  const ov = LABEL_CAM_OVERRIDE[name] || 1;
  // 从黄鹤楼方向看过来（西南偏南），光线好
  const dir = new THREE.Vector3(-0.62, 0, 0.78);
  tweenTo({
    pos: p.clone().add(dir.multiplyScalar(dist * ov)).add(new THREE.Vector3(0, dist * 0.42, 0)),
    target: p.clone().setY(Math.max(2, p.y * 0.45)),
  });
  controls.autoRotate = false;
  stopTour();
  exitCruise();
}
function addRiverLabel(name, pos) {
  const div = document.createElement('div');
  div.className = 'river-tag';
  div.textContent = name;
  const obj = new CSS2DObject(div);
  obj.position.copy(pos);
  scene.add(obj);
}
function showInfo(name) {
  $('infoTitle').textContent = name;
  $('infoDesc').textContent = INFO[name] || '';
  $('info').style.display = 'block';
}
function addRiverLabel2(name, pos) { addRiverLabel(name, pos); }

function pickAnchor(list) {
  if (!list || !list.length) return null;
  const area = list.find(n => n.kind === 'area' && n.centroid);
  if (area) return area.centroid;
  const node = list.find(n => n.kind === 'node');
  if (node) return { x: node.x, z: node.z };
  const line = list.find(n => n.kind === 'line' && n.pts);
  if (line) return line.pts[Math.floor(line.pts.length / 2)];
  return null;
}

function nearestWaterPoint(x, z, waters) {
  let best = null, bd = 1e18;
  for (const ring of waters) for (const p of ring) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function largestWaterRing(waters) {
  let best = null, bestSpan = 0;
  for (const ring of waters) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const span = (x1 - x0) + (z1 - z0);
    if (span > bestSpan) { bestSpan = span; best = ring; }
  }
  return bestSpan > 600 ? best : null;
}

function buildRiverCurve(ring) {
  // 长江主航道锚点序列（沿真实 L 形走向：两江交汇→大桥→汉口江滩→二七→天兴洲南汊主汊）
  // 锚点坐标经离线验证在江上；吸附仅做微调，吸附点过少时直接用原始序列兜底
  const anchors = [
    [-30, 430], [-120, 160], [-150, -100],
    [-100, -380], [0, -620], [140, -800], [320, -950],
    [540, -1080], [700, -1250], [900, -1420], [1100, -1650],
    [1250, -1900], [1340, -2120],
  ];
  const snapped = [];
  let hits = 0;
  for (const [ax, az] of anchors) {
    if (GEO.pointInRing(ax, az, ring)) { snapped.push(new THREE.Vector3(ax, 0.4, az)); hits++; continue; }
    let fixed = null;
    outer:
    for (let r = 8; r <= 60; r += 6) {
      for (let a = 0; a < 12; a++) {
        const ang = a / 12 * Math.PI * 2;
        const tx = ax + Math.cos(ang) * r, tz = az + Math.sin(ang) * r;
        if (GEO.pointInRing(tx, tz, ring)) { fixed = { x: tx, z: tz }; break outer; }
      }
    }
    if (fixed) { snapped.push(new THREE.Vector3(fixed.x, 0.4, fixed.z)); hits++; }
  }
  window.__boatDbg = { ringPts: ring ? ring.length : 0, anchors: anchors.length, hits };
  // 吸附命中过半用吸附点；否则直接用原始锚点（跨瓦片超级链自交会误判 pointInRing）
  const use = hits >= Math.floor(anchors.length / 2)
    ? snapped
    : anchors.map(([x, z]) => new THREE.Vector3(x, 0.4, z));
  return new THREE.CatmullRomCurve3(use, false, 'catmullrom', 0.4);
}

// ---------- 地标锚点 ----------
function computeAnchors(parsed) {
  const named = parsed.named;
  const hhlAreas = (named['黄鹤楼'] || []).filter(n => n.kind === 'area' && n.ring);
  const diagOf = ring => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    return Math.hypot(x1 - x0, z1 - z0);
  };
  hhlAreas.sort((p, q) => diagOf(p.ring) - diagOf(q.ring));
  const tower = (hhlAreas[0] && hhlAreas[0].centroid) || pickAnchor(named['黄鹤楼']) || GEO.toXZ(114.3016, 30.5433);
  const guishan = pickAnchor(named['龟山']);
  const tv = pickAnchor(named['龟山电视塔'])
    || (guishan ? { x: guishan.x + 6, z: guishan.z - 6 } : GEO.toXZ(114.2747, 30.5510));
  const qc = pickAnchor(named['晴川阁']) || { x: tv.x + 120, z: tv.z + 60 };
  return { tower, tv, qc };
}

// ---------- 启动 ----------
window.__M3 = true;
async function boot() {
  window.__b = 'enter';
  setStatus('加载 OSM 数据…');
  const res = await fetch('data/wuhan.json');
  window.__b = 'fetched';
  if (!res.ok) throw new Error('data/wuhan.json 缺失（HTTP ' + res.status + '），请先完成数据抓取');
  const json = await res.json();
  window.__b = 'parsed-file';

  setStatus('解析地理数据…');
  await frame();
  const parsed = GEO.parseOverpass(json);
  if (!largestWaterRing(parsed.waters)) parsed.waters.push(...GEO.fallbackWaters());
  waterIdx = GEO.buildWaterIndex(parsed.waters);
  const anchors = computeAnchors(parsed);
  // 数据稀疏区程序化网格街道补城（青山/后湖/汉阳西/武昌南），避让龟蛇二山（否则会开挖山体）
  {
    const hillRects = [
      { x0: anchors.tower.x - 62, x1: anchors.tower.x + 396, z0: anchors.tower.z - 40, z1: anchors.tower.z + 126 },   // 蛇山
      { x0: Math.min(anchors.qc.x + 34, anchors.tv.x - 420) - 15, x1: Math.max(anchors.tv.x + 46, anchors.qc.x + 34) + 15,
        z0: Math.min(anchors.tv.z - 210, anchors.qc.z - 14) - 15, z1: Math.max(anchors.tv.z - 16, anchors.qc.z - 14) + 15 },   // 龟山
    ];
    // 石牌岭路（OSM 未覆盖，程序化补路）：北起武珞路一带，南到武汉理工北门，端点吸附现有路网
    {
      const spPts = [[1352, -80], [1347, 50], [1339, 175], [1332, 300], [1325, 425], [1317, 555], [1303, 660], [1292, 712]]
        .map(([x, z]) => ({ x, z }));
      const snapNearest = (p, maxD) => {
        let bq = null, bd = maxD;
        for (const r of parsed.roads) {
          if (r.bridge) continue;
          for (const q of r.pts) {
            const d = Math.hypot(p.x - q.x, p.z - q.z);
            if (d < bd) { bd = d; bq = q; }
          }
        }
        return bq ? { x: bq.x, z: bq.z } : p;
      };
      spPts[0] = snapNearest(spPts[0], 160);
      spPts[spPts.length - 1] = snapNearest(spPts[spPts.length - 1], 200);
      parsed.roads.push({ pts: spPts, kind: 'primary', bridge: false, name: '石牌岭路' });
      // 横向接驳：石牌岭路中段 → 武昌南网格东缘
      parsed.roads.push({ pts: [{ x: 1332, z: 300 }, { x: 1160, z: 305 }, { x: 905, z: 300 }], kind: 'secondary', bridge: false, name: null });
    }
    const gridStart = parsed.roads.length;
    // 楚河水体由 buildChuheHanjie 地标组自绘（不入 parsed.waters：细长环在 buildWaterMesh 中会三角化出黑面）
    // 南湖大道（OSM 未覆盖该段）：西起珞狮路，东去光谷方向，横贯南湖片区
    {
      const nhPts = [[1085, 555], [1150, 570], [1215, 590], [1280, 615], [1345, 645], [1420, 680], [1500, 715]]
        .map(([x, z]) => ({ x, z }));
      const snapNear = (p, maxD) => {
        let bq = null, bd = maxD;
        for (const r of parsed.roads) {
          if (r.bridge) continue;
          for (const q of r.pts) {
            const d = Math.hypot(p.x - q.x, p.z - q.z);
            if (d < bd) { bd = d; bq = q; }
          }
        }
        return bq ? { x: bq.x, z: bq.z } : p;
      };
      nhPts[0] = snapNear(nhPts[0], 200);
      parsed.roads.push({ pts: nhPts, kind: 'primary', bridge: false, name: '南湖大道' });
    }
    // 中北路（OSM 未覆盖）：洪山广场北去梨园方向
    {
      const zbPts = [[1211, 97], [1225, -50], [1245, -200], [1262, -350], [1278, -490], [1295, -620]]
        .map(([x, z]) => ({ x, z }));
      let bq = null, bd = 170;
      for (const r of parsed.roads) {
        if (r.bridge) continue;
        for (const q of r.pts) {
          const d = Math.hypot(zbPts[zbPts.length - 1].x - q.x, zbPts[zbPts.length - 1].z - q.z);
          if (d < bd) { bd = d; bq = q; }
        }
      }
      if (bq) zbPts[zbPts.length - 1] = { x: bq.x, z: bq.z };
      parsed.roads.push({ pts: zbPts, kind: 'primary', bridge: false, name: '中北路' });
    }
    const avoidRects = hillRects.concat([
      { x0: 1215, x1: 1325, z0: 583, z1: 693 },     // 理工本部
      { x0: 1405, x1: 1565, z0: 85, z1: 195 },      // 梦时代
      { x0: 1150, x1: 1275, z0: 35, z1: 160 },      // 洪山广场
      { x0: 1290, x1: 1580, z0: -450, z1: -80 },    // 楚河汉街带
      { x0: 1315, x1: 1390, z0: 305, z1: 390 },     // 龙湖天玺
      { x0: 1340, x1: 1430, z0: 10, z1: 105 },      // 合成中心
      { x0: 1130, x1: 1245, z0: 832, z1: 942 },     // 理工南湖校区
      { x0: 1434, x1: 1544, z0: -749, z1: -639 },   // 理工余家头校区
      { x0: 1155, x1: 1235, z0: 135, z1: 215 },     // 武商汇
      { x0: 1215, x1: 1300, z0: 88, z1: 168 },      // 群光广场
      { x0: 1440, x1: 1520, z0: 300, z1: 380 },     // 地大
      { x0: 945, x1: 1025, z0: 785, z1: 865 },      // 财大
    ]);
    const gridBoxes = [
      { x0: 1780, x1: 3620, z0: -1880, z1: -720 },    // 青山
      { x0: -1000, x1: 200, z0: -2350, z1: -1600 },   // 后湖（汉口北）
      { x0: -1250, x1: -550, z0: -250, z1: 850 },     // 汉阳西
      { x0: -350, x1: 900, z0: 250, z1: 1050, density: 1.5 },       // 武昌南（洪山，细网格）
      { x0: 950, x1: 1380, z0: -650, z1: 950, density: 1.5 },       // 中北路片区（细网格）
      { x0: 870, x1: 1360, z0: 590, z1: 1120, density: 1.4 },       // 南湖片区
    ];
    for (const gb of gridBoxes)
      parsed.roads.push(...GEO.qingshanGridRoads(
        { x0: gb.x0, x1: gb.x1, z0: gb.z0, z1: gb.z1 }, parsed.waters, avoidRects, gb.density || 1));
    // 联通性补链：网格线端点若离既有路网 >25u，补接驳短路线（每线最多1条，长度≤320）
    {
      let linked = 0;
      for (const gr of parsed.roads.slice(gridStart)) {
        const ends = [gr.pts[0], gr.pts[gr.pts.length - 1]];
        for (const e of ends) {
          let bd = 1e9, bq = null;
          for (const r of parsed.roads) {
            if (r === gr || r.bridge) continue;
            for (const q of r.pts) {
              const d = Math.hypot(e.x - q.x, e.z - q.z);
              if (d < bd) { bd = d; bq = q; }
            }
          }
          if (bd > 25 && bd < 320 && bq && linked < 24) {
            parsed.roads.push({ pts: [e, { x: bq.x, z: bq.z }], kind: 'secondary', bridge: false, name: null });
            linked++;
          }
        }
      }
      window.__linkInfo = linked;
    }
  }
  {
    const bpts = (parsed.named['武汉长江大桥'] || []).filter(n => n.kind === 'line').flatMap(n => n.pts);
    if (bpts.length >= 2) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const q of bpts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
      const byX = (x1 - x0) >= (z1 - z0);
      const s = [...bpts].sort(byX ? (a, b) => a.x - b.x : (a, b) => a.z - b.z);
      anchors.bridgeAxis = [s[0], s[s.length - 1]];
    }
  }

  setStatus('隆起龟蛇二山…');
  await frame();
  GEO.buildHills(parsed, anchors);              // 第一遍：只填充 hillsData 以读取楼址原始山高
  {
    const tx0 = anchors.tower.x, tz0 = anchors.tower.z;
    const raw = GEO.terrainHeightRaw(tx0, tz0);
    GEO.setTerrainFlat(tx0, tz0, 30, Math.min(raw, 17));
    const merlons = [];
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * Math.PI * 2;
      const mx = tx0 + Math.cos(a) * 31.5, mz = tz0 + Math.sin(a) * 31.5;
      const g = new THREE.BoxGeometry(1.5, 0.55, 0.5);
      g.rotateY(-a + Math.PI / 2);
      g.translate(mx, 17.35, mz);
      merlons.push(g);
    }
    const mm = new THREE.Mesh(GEO.mergeGeometriesPublic(merlons),
      new THREE.MeshStandardMaterial({ color: 0xc9c2ae, roughness: 1 }));
    mm.castShadow = true;
    scene.add(mm);
  }
  scene.add(GEO.buildHills(parsed, anchors));   // 第二遍：顶点经 terrainHeight，台地真正压平
  {
    const portals = GEO.buildTunnelPortals(parsed, GEO.terrainHeightRaw, GEO.terrainHeight);
    if (portals) scene.add(portals);
    window.__portalInfo = portals ? 'built' : 'none';
  }

  setStatus('铺设大地 …');
  await frame();
  scene.add(GEO.buildGroundMesh(9000, 8200));

  setStatus('沿街填充生成中…');
  await frame();
  // 填充楼（10550 栋）已移至第二阶段后台生成，此处仅构建 OSM 建筑。
  // 首屏建筑量从 21774 栋降至 11224 栋（-48%），是本轮提速的主要来源。
  const osmBuildingCount = parsed.buildings.length;
  setStatus(`生成城市（OSM ${osmBuildingCount} 栋）…`);
  await frame();
  const city = GEO.buildCityMesh(parsed, (x, z) => GEO.terrainHeight(x, z));
  scene.add(city.group);
  cityGroupRef = city.group;
  cityResiMat = city.resiMat;
  cityGlassMat = city.glassMat;
  cityRoofMat = city.roofMat;

  setStatus('铺装道路 …'); await frame();
  window.__b = 'roadmesh-begin';
  console.time('roadmesh');
  const roadMesh = GEO.buildRoadMesh(parsed, (x, z) => GEO.terrainHeight(x, z));
  console.timeEnd('roadmesh');
  window.__b = 'roadmesh-done';
  if (roadMesh) scene.add(roadMesh);
  setStatus('水面 …'); await frame();
  const waterMesh = GEO.buildWaterMesh(parsed);
  scene.add(waterMesh);
  waterMat = waterMesh.material;
  waterMeshRef = waterMesh;
  waterBasePos = waterMesh.geometry.attributes.position.array.slice();
  {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const H = (x, y) => Math.sin(x / S * Math.PI * 8 + Math.cos(y / S * Math.PI * 4) * 1.5) * 0.6
      + Math.sin((x + y * 1.7) / S * Math.PI * 16) * 0.4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hL = H(x - 2, y), hR = H(x + 2, y), hD = H(x, y - 2), hU = H(x, y + 2);
      const nx = (hL - hR) * 1.6, ny = (hD - hU) * 1.6, nz = 1.4;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const nm = new THREE.CanvasTexture(c);
    nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
    nm.repeat.set(1 / 7, 1 / 7);
    waterMat = waterMesh.material.clone();
    waterMat.normalMap = nm;
    waterMat.normalScale = new THREE.Vector2(0.45, 0.45);
    waterMesh.material = waterMat;
  }
  setStatus('绿地 …'); await frame();
  const greenMesh = GEO.buildGreenMesh(parsed);
  if (greenMesh) {
    const pa = greenMesh.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      pa.setY(i, pa.getY(i) + GEO.terrainHeight(pa.getX(i), pa.getZ(i)));
    }
    greenMesh.geometry.computeVertexNormals();
    scene.add(greenMesh);
  }
  const shoreMesh = GEO.buildLakeShores(parsed);
  if (shoreMesh) scene.add(shoreMesh);

  // —— 以下为「细节层」，全部延后到第二阶段后台补齐，首屏只需视觉主体 ——
  // 顺序要求：填充楼必须最先跑 —— 后续「屋顶细节」等任务依赖完整的 parsed.buildings，
  // 且 buildFillBuildings 内部的占用网格依赖当前 buildings 状态，顺序变化会导致楼位偏移。
  deferTask('沿街填充楼', () => {
    buildFillBuildingsDeferred();
  });

  deferTask('绿化', () => {
    const treePts = GEO.scatterTreePoints(parsed.greens, 260, (x, z) => GEO.terrainHeight(x, z))
      .concat(GEO.scatterRoadsideTrees(parsed, 260))
      .concat(GEO.hillTreePoints(240));
    buildTrees(treePts);
    streetLightMat = buildStreetLights(parsed);
  });

  // 地标：黄鹤楼/长江大桥等地标是场景看点，保留在第一阶段（下面 setStatus('搭建地标…') 处理）
  // 其余大型程序化建构筑物延后
  deferTask('车流与空中', () => {
    buildTraffic(parsed);
    buildAerial();
  });
  deferTask('江面细节', () => {
    buildRiverGlints();
    buildWaterfront(parsed);
    buildRiversideSkyline();
    buildErqiBridge(parsed);
  });
  deferTask('游船与轮渡', () => {
    buildBoats(parsed);
    buildFerry(parsed);
  });
  deferTask('行人动物', () => {
    buildPedestrians(parsed);
    buildAnimals(parsed);
  });
  deferTask('路口与立交', () => {
    buildIntersections(parsed);
    buildInterchanges(parsed);
    buildParkingLots(parsed);
  });
  deferTask('航道与导引', () => {
    buildObstructionLights(parsed);
    buildRiverArt(parsed);
    buildNavLights();
    buildSidewalkGuides(parsed);
    autoBridges(parsed);
  });
  deferTask('东湖与园区', () => {
    buildEastLake(parsed);
    buildHankouHeritage(parsed);
    buildParkClosure(parsed);
    buildRailStations(parsed);
    buildLEDScreens(parsed);
    buildMiniMap(parsed);
    buildLightShow(parsed);
    buildTourPath();
  });

  // 屋顶细节层：4062 件屋顶生活件 + 填充楼顶 + 立面件 + 广告牌 + 天桥塔吊，
  // 全部延后（这些是加载期最重的一批，却只影响近景观感）
  deferTask('屋顶细节', () => {
    const roofBoxes = GEO.buildRoofBoxes(parsed, (x, z) => GEO.terrainHeight(x, z));
    if (roofBoxes) scene.add(roofBoxes);
    const fillRoofs = GEO.buildFillRooftops(parsed, (x, z) => GEO.terrainHeight(x, z));
    if (fillRoofs) scene.add(fillRoofs);
    const roofLife = GEO.buildRooftopLife(parsed, (x, z) => GEO.terrainHeight(x, z));
    if (roofLife) scene.add(roofLife.group);
    const facLife = GEO.buildFacadeLife(parsed, (x, z) => GEO.terrainHeight(x, z));
    if (facLife) scene.add(facLife);
    const bill = GEO.buildBillboards(parsed, (x, z) => GEO.terrainHeight(x, z));
    if (bill) { scene.add(bill); billNightMats.push(...(bill.userData.nightMats || [])); }
    const signs = GEO.buildStreetSignage(parsed);
    if (signs) { scene.add(signs); signsMatRef = signs.material; }
  });
  deferTask('人行天桥与塔吊', () => {
    // 人行天桥 ×4：跨主干道，程序化选位（primary 路长直线段中点）
    const mains = parsed.roads.filter(r => !r.bridge && r.kind === 'primary');
    const placed = [];
    for (const r of mains) {
      for (let i = 0; i < r.pts.length - 2; i++) {
        const a = r.pts[i], b = r.pts[i + 1], c2 = r.pts[i + 2];
        const l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(c2.x - b.x, c2.z - b.z);
        if (l1 < 44 || l2 < 44) continue;
        const cross = (b.x - a.x) * (c2.z - b.z) - (b.z - a.z) * (c2.x - b.x);
        if (Math.abs(cross) / (l1 * l2) > 0.05) continue;   // 只取顺直段
        const yaw = Math.atan2(-(c2.z - b.z), c2.x - b.x) + Math.PI / 2;
        if (placed.some(q => Math.hypot(q.x - b.x, q.z - b.z) < 700)) continue;
        if (GEO.terrainHeight(b.x, b.z) > 1.5) continue;    // 避开山体
        placed.push({ x: b.x, z: b.z });
        scene.add(GEO.buildPedBridge(b.x, b.z, yaw));
        if (placed.length >= 4) break;
      }
      if (placed.length >= 4) break;
    }
    // 塔吊工地 ×3：青山/后湖/南湖网格区内，圆盘(r30)水检自适配防落水
    const sites = [[2600, -1100, 0.4], [-300, -1900, 1.2], [1150, 980, -0.5]];
    for (const [sx, sz, sy] of sites) {
      let bx = sx, bz = sz;
      if (GEO.waterNear) {
        for (let r2 = 0; r2 < 6; r2++) {
          if (!GEO.waterNear(bx, bz, 30, parsed.waters)) break;
          bz -= 60;   // 向北找干地
        }
      }
      const cs = GEO.buildCraneSite(bx, bz, sy, (x, z) => GEO.terrainHeight(x, z));
      scene.add(cs);
      cranes.push(cs);
    }
  });

  setStatus('搭建地标…');
  await frame();
  placeLandmarks(parsed);
  const viaduct = GEO.buildViaducts(parsed, bridgeSpanInfo);
  scene.add(viaduct.group);
  viaductLampMat = viaduct.lampMat;
  walkColliders = GEO.buildWalkColliders(parsed);
  {
    const dz = buildDazhimenStation();
    dz.position.set(41, 0, -1430);
    dz.rotation.y = Math.PI;
    scene.add(dz);
    if (dz.userData.nightMats) heritageNightMats.push(...dz.userData.nightMats);
    addLabel('大智门火车站', new THREE.Vector3(41, 12, -1430));
  }
  if (riverCurve) addRiverLabel('长  江', riverCurve.getPointAt(0.8).clone().setY(2.5));
  {
    const han = parsed.waters
      .map(r => {
        let cx = 0, cz = 0;
        for (const p of r) { cx += p.x; cz += p.z; }
        return { x: cx / r.length, z: cz / r.length, n: r.length };
      })
      .filter(c => c.x < -320 && c.z < -60)
      .sort((p, q) => q.n - p.n)[0];
    addRiverLabel('汉  江', new THREE.Vector3(han ? han.x : -520, 2, han ? han.z : -140));
  }

  setupUI();
  setStatus('完成');
  $('err').style.display = 'none';   // 清除600s看门狗的误报面板
  const ld = $('loading');
  ld.style.transition = 'opacity .8s';
  ld.style.opacity = '0';
  setTimeout(() => { ld.style.display = 'none'; }, 850);
  window.__booted = true;
  window.__phase1done = Date.now();
  // 首屏已可用 → 立刻启动第二阶段：在后台空闲时段分片补齐细节层
  setTimeout(() => { runDeferredTasks(); }, 900);
  window.__dbg = { camera, controls, CAMS, scene, towerPosRef, dayState, fillCount: __fillCount, osmCount: osmBuildingCount, buildings: parsed.buildings, cityGroup: cityGroupRef };
window.__probe = (x, z) => {
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
  const hits = rc.intersectObjects(scene.children, true);
  for (const h of hits) {
    const m = h.object.material;
    const trans = !!(m && m.transparent && m.opacity < 1);
    return { y: Math.round(h.point.y * 100) / 100, water: trans };
  }
  return null;
};
}

// ---------- 树 ----------
function buildTrees(points) {
  const rnd = GEO.seededRand(2828);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.6, 6);
  trunkGeo.translate(0, 0.8, 0);
  const c1 = new THREE.ConeGeometry(1.55, 2.4, 7); c1.translate(0, 2.6, 0);
  const c2 = new THREE.ConeGeometry(1.15, 2.0, 7); c2.translate(0, 3.9, 0);
  const c3 = new THREE.ConeGeometry(0.72, 1.6, 7); c3.translate(0, 5.1, 0);
  const pineGeo = mergeGeometries([c1, c2, c3]);
  const s1 = new THREE.IcosahedronGeometry(1.9, 1); s1.translate(0, 3.3, 0);
  const s2 = new THREE.IcosahedronGeometry(1.25, 1); s2.translate(1.15, 2.55, 0.45);
  const s3 = new THREE.IcosahedronGeometry(1.15, 1); s3.translate(-1.05, 2.65, -0.5);
  const roundGeo = mergeGeometries([s1, s2, s3]);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const roundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const pines = points.filter(p => p.pine), rounds = points.filter(p => !p.pine);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, points.length);
  const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, Math.max(pines.length, 1));
  const roundMesh = new THREE.InstancedMesh(roundGeo, roundMat, Math.max(rounds.length, 1));
  pineMesh.count = pines.length; roundMesh.count = rounds.length;
  trunkMesh.castShadow = pineMesh.castShadow = roundMesh.castShadow = true;
  const tmp = new THREE.Object3D();
  points.forEach((p, i) => {
    tmp.position.set(p.x, p.y || 0, p.z);
    tmp.scale.setScalar(p.s);
    tmp.rotation.set(0, p.x * 1.7, 0);
    tmp.updateMatrix();
    trunkMesh.setMatrixAt(i, tmp.matrix);
  });
  const col = new THREE.Color();
  pines.forEach((p, i) => {
    tmp.position.set(p.x, p.y || 0, p.z);
    tmp.scale.set(p.s * (0.9 + rnd() * 0.25), p.s * (0.9 + rnd() * 0.35), p.s * (0.9 + rnd() * 0.25));
    tmp.rotation.set(0, p.z, 0);
    tmp.updateMatrix();
    pineMesh.setMatrixAt(i, tmp.matrix);
    col.setHSL(0.34 + rnd() * 0.05, 0.42 + rnd() * 0.2, 0.26 + rnd() * 0.1);
    pineMesh.setColorAt(i, col);
  });
  rounds.forEach((p, i) => {
    tmp.position.set(p.x, p.y || 0, p.z);
    tmp.scale.setScalar(p.s);
    tmp.rotation.set(0, p.x, 0);
    tmp.updateMatrix();
    roundMesh.setMatrixAt(i, tmp.matrix);
    col.setHSL(0.26 + rnd() * 0.07, 0.45 + rnd() * 0.2, 0.3 + rnd() * 0.12);
    roundMesh.setColorAt(i, col);
  });
  scene.add(trunkMesh, pineMesh, roundMesh);
}

// ---------- 地标摆放 ----------
function placeLandmarks(parsed) {
  const named = parsed.named;
  const anchors = computeAnchors(parsed);
  const towerPos = anchors.tower;
  towerPosRef = towerPos;
  const towerY = GEO.terrainHeight(towerPos.x, towerPos.z);
  const tower = buildHuanghelou();
  tower.position.set(towerPos.x, towerY - 0.35, towerPos.z);   // 石座入地，避免与台地精确共面
  const wp = nearestWaterPoint(towerPos.x, towerPos.z, parsed.waters);
  if (wp) tower.rotation.y = Math.atan2(wp.x - towerPos.x, wp.z - towerPos.z);
  scene.add(tower);
  towerNightMats = tower.userData.nightMats || [];
  addLabel('黄鹤楼', new THREE.Vector3(towerPos.x, towerY + 19, towerPos.z));

  let a = null, b = null;
  const bridgeLines = (named['武汉长江大桥'] || []).filter(n => n.kind === 'line');
  {
    const pts = bridgeLines.flatMap(n => n.pts);
    if (pts.length >= 2) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of pts) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
      }
      const byX = (x1 - x0) >= (z1 - z0);
      const sorted = [...pts].sort(byX ? (p, q) => p.x - q.x : (p, q) => p.z - q.z);
      const A = sorted[0], B = sorted[sorted.length - 1];
      const dx = B.x - A.x, dz = B.z - A.z, axisLen = Math.hypot(dx, dz) || 1;
      const ux = dx / axisLen, uz = dz / axisLen;
      const INSET = 50;
      a = { x: A.x + ux * INSET, z: A.z + uz * INSET };
      b = { x: B.x - ux * INSET, z: B.z - uz * INSET };
      bridgeSpanInfo = { A, ux, uz, axisLen, tMin: INSET, tMax: axisLen - INSET };
    }
  }
  if (!a) { a = GEO.toXZ(114.2755, 30.5490); b = GEO.toXZ(114.3010, 30.5448); }
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  bridgeARef = { ...a };
  bridgeURef = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
  bridgeLenRef = L;
  bridgeGroup = buildBridge(L);
  bridgeGroup.position.set(a.x, 0, a.z);
  bridgeGroup.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  scene.add(bridgeGroup);
  bridgeLampMat = bridgeGroup.userData.lampMat;
  addLabel('武汉长江大桥', new THREE.Vector3((a.x + b.x) / 2, 14, (a.z + b.z) / 2));
  buildBridgeTraffic(L);

  const tvPos = anchors.tv;
  tvPosRef = tvPos;
  const tv = buildTvTower();
  const tvY = GEO.terrainHeight(tvPos.x, tvPos.z);
  tv.position.set(tvPos.x, tvY, tvPos.z);
  scene.add(tv);
  tvPodMat = tv.userData.podMat;
  addLabel('龟山电视塔', new THREE.Vector3(tvPos.x, tvY + 80, tvPos.z));

  const qcPos = anchors.qc;
  if (qcPos) {
    const qc = buildQingchuanPavilion();
    const qcY = GEO.terrainHeight(qcPos.x, qcPos.z);
    qc.position.set(qcPos.x, qcY, qcPos.z);
    scene.add(qc);
    addLabel('晴川阁', new THREE.Vector3(qcPos.x, qcY + 10, qcPos.z));
  }

  const archPos = { x: towerPos.x + 64, z: towerPos.z + 24 };
  const arch = buildArchway(7);
  arch.position.set(archPos.x, GEO.terrainHeight(archPos.x, archPos.z), archPos.z);
  arch.rotation.y = Math.atan2(towerPos.x - archPos.x, towerPos.z - archPos.z);
  scene.add(arch);

  const southSpans = GEO.waterCrossSpans(parsed.waters, 455)
    .sort((p, q) => (q.x1 - q.x0) - (p.x1 - p.x0));
  const south = southSpans[0];
  if (south && south.x1 - south.x0 > 250) {
    const L2 = south.x1 - south.x0 + 48;
    const parrot = buildSuspensionBridge(L2);
    parrot.position.set(south.x0 - 24, 0, 455);
    scene.add(parrot);
    suspensionNightMats = parrot.userData.nightMats;
    const pm = (south.x0 + south.x1) / 2;
    addLabel('鹦鹉洲长江大桥', new THREE.Vector3(pm, 20, 455));
    CAMS.parrot = { pos: new THREE.Vector3(pm + 60, 42, 455 + 150), target: new THREE.Vector3(pm, 6, 455) };
  }

  const hanRings = parsed.waters.filter(r => {
    if (r.length < 60) return false;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of r) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    return x1 < -350 && x0 < x1 && z0 < 150;
  });
  let hanBest = null;
  for (const ring of hanRings) {
    let x0 = 1e9, x1 = -1e9;
    for (const p of ring) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); }
    for (let x = x0 + 30; x < x1 - 30; x += 20) {
      for (const s of GEO.waterCrossSpansZ([ring], x)) {
        const w = s.z1 - s.z0;
        if (w > 40 && w < 260 && (!hanBest || w > hanBest.w)) hanBest = { ...s, w, x };
      }
    }
  }
  if (hanBest) {
    const L3 = hanBest.w + 20;
    const qcb = buildArchBridge(L3);
    qcb.position.set(hanBest.x, 0, hanBest.z1 + 10);
    qcb.rotation.y = Math.PI / 2;
    scene.add(qcb);
    archNightMats = qcb.userData.nightMats || null;
    addLabel('晴川桥', new THREE.Vector3(hanBest.x, 14, (hanBest.z0 + hanBest.z1) / 2));
  }

  const bridgeMid = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  const bdir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  let bn = new THREE.Vector3(-bdir.z, 0, bdir.x);
  if (bn.z < 0) bn.negate();
  CAMS.overview = { pos: new THREE.Vector3(620, 470, 1000), target: new THREE.Vector3(-80, 0, -240) };
  CAMS.tower = {
    pos: new THREE.Vector3(towerPos.x + 60, GEO.terrainHeight(towerPos.x, towerPos.z) + 26, towerPos.z + 80),
    target: new THREE.Vector3(towerPos.x, GEO.terrainHeight(towerPos.x, towerPos.z) + 8, towerPos.z),
  };
  CAMS.bridge = { pos: bridgeMid.clone().add(bn.clone().multiplyScalar(120)).setY(42), target: bridgeMid.clone().setY(6) };
  CAMS.cruise = riverCurve
    ? { pos: riverCurve.getPointAt(0.35).clone().add(new THREE.Vector3(0, 14, 26)), target: riverCurve.getPointAt(0.5) }
    : { pos: new THREE.Vector3(0, 16, 60), target: new THREE.Vector3(0, 4, -100) };
}
let bridgeARef = null, bridgeURef = null, bridgeLenRef = 0;

// ---------- 树下路灯（点海 + 灯杆） ----------
function buildStreetLights(parsed) {
  const pos = [];
  for (const r of parsed.roads) {
    if (r.bridge) continue;
    if (r.kind !== 'primary' && r.kind !== 'trunk' && r.kind !== 'secondary') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.floor(len / 16));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        pos.push(a.x + (b.x - a.x) * t, 0.5, a.z + (b.z - a.z) * t);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffd9a0, size: 1.5, transparent: true, opacity: 0 });
  scene.add(new THREE.Points(g, m));
  const nLamp = Math.min(pos.length / 3, 520);
  const poleIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 2.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.7 }), nLamp);
  streetHeadMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, emissive: 0xffe2a8, emissiveIntensity: 0 });
  const headIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 10), streetHeadMat, nLamp);
  const t2 = new THREE.Object3D();
  for (let i = 0; i < nLamp; i++) {
    const x = pos[i * 3], z = pos[i * 3 + 2];
    const gy = GEO.terrainHeight(x, z);
    t2.position.set(x, gy + 1.15, z);
    t2.rotation.set(0, 0, 0); t2.scale.set(1, 1, 1);
    t2.updateMatrix();
    poleIM.setMatrixAt(i, t2.matrix);
    t2.position.y = gy + 2.42;
    t2.updateMatrix();
    headIM.setMatrixAt(i, t2.matrix);
  }
  poleIM.castShadow = true;
  scene.add(poleIM, headIM);
  return m;
}

// ---------- 行人 ----------
function buildPedestrians(parsed) {
  const roads = parsed.roads.filter(r => !r.bridge &&
    ['primary', 'secondary', 'tertiary', 'residential'].includes(r.kind));
  if (!roads.length) return;
  const rnd = GEO.seededRand(1919);
  const body = new THREE.CylinderGeometry(0.11, 0.14, 0.42, 6);
  body.translate(0, 0.21, 0);
  const head = new THREE.SphereGeometry(0.09, 8, 8);
  head.translate(0, 0.5, 0);
  const human = mergeGeometries([body, head]);
  const N = 160;
  walkerIM = new THREE.InstancedMesh(human,
    new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  walkerIM.castShadow = true;
  const palette = [0xc25b4a, 0x4a6a8a, 0xd8c8a8, 0x5d7a52, 0x8a5d7a, 0x3f4650, 0xb8863b, 0x7a8a99];
  for (let i = 0; i < N; i++) {
    const r = roads[Math.floor(rnd() * roads.length)];
    let len = 0;
    for (let k = 0; k < r.pts.length - 1; k++) len += Math.hypot(r.pts[k + 1].x - r.pts[k].x, r.pts[k + 1].z - r.pts[k].z);
    walkers.push({
      pts: r.pts, len, dist: rnd() * len,
      dir: rnd() < 0.5 ? 1 : -1,
      speed: (0.55 + rnd() * 0.5) * (rnd() < 0.15 ? 1.7 : 1),
      side: (rnd() < 0.5 ? 1 : -1) * ((GEO.ROAD_WIDTH[r.kind] ?? 1.4) / 2 + 1.0 + rnd() * 0.3),
      wob: rnd() * Math.PI * 2,
    });
    walkerIM.setColorAt(i, new THREE.Color(palette[Math.floor(rnd() * palette.length)]));
  }
  scene.add(walkerIM);
}
function updatePedestrians(dt, time) {
  if (!walkerIM) return;
  walkers.forEach((w, i) => {
    w.dist += w.speed * w.dir * dt;
    if (w.dist > w.len) w.dist = 0;
    if (w.dist < 0) w.dist = w.len;
    let acc = 0, px = w.pts[0].x, pz = w.pts[0].z, ang = 0;
    for (let k = 0; k < w.pts.length - 1; k++) {
      const a = w.pts[k], b = w.pts[k + 1];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (w.dist <= acc + l) {
        const t = (w.dist - acc) / (l || 1);
        px = a.x + (b.x - a.x) * t; pz = a.z + (b.z - a.z) * t;
        ang = Math.atan2(b.x - a.x, b.z - a.z);
        break;
      }
      acc += l;
    }
    const rx = Math.cos(ang), rz = -Math.sin(ang);
    const x = px + rx * w.side * (w.dir > 0 ? 1 : -1), z = pz + rz * w.side * (w.dir > 0 ? 1 : -1);
    walkerTmp.position.set(x, GEO.terrainHeight(x, z) + Math.abs(Math.sin(time * 6 + w.wob)) * 0.04, z);
    walkerTmp.rotation.set(0, ang + (w.dir < 0 ? Math.PI : 0), 0);
    walkerTmp.updateMatrix();
    walkerIM.setMatrixAt(i, walkerTmp.matrix);
  });
  walkerIM.instanceMatrix.needsUpdate = true;
}

// ---------- 公园动物 ----------
function buildAnimals(parsed) {
  const rnd = GEO.seededRand(1616);
  const lakes = [];
  for (const ring of parsed.waters) {
    if (ring.length < 30) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const span = (x1 - x0) + (z1 - z0);
    if (span > 60 && span < 460) {
      let cx = 0, cz = 0;
      for (const p of ring) { cx += p.x; cz += p.z; }
      lakes.push({ ring, x: cx / ring.length, z: cz / ring.length });
    }
  }
  const inRing = (x, z, ring) => GEO.pointInRing(x, z, ring);
  const dBody = new THREE.SphereGeometry(0.19, 10, 8); dBody.scale(1.65, 1, 1.05); dBody.translate(0, 0.1, 0);
  const dHead = new THREE.SphereGeometry(0.095, 8, 8); dHead.translate(0.27, 0.32, 0);
  const dBeak = new THREE.ConeGeometry(0.04, 0.13, 6); dBeak.rotateZ(-Math.PI / 2); dBeak.translate(0.4, 0.3, 0);
  const duckGeo = mergeGeometries([dBody, dHead, dBeak]);
  const sBody = new THREE.SphereGeometry(0.16, 10, 8); sBody.scale(1.95, 1, 1.1); sBody.translate(0, 0.1, 0);
  const sNeck = new THREE.CylinderGeometry(0.038, 0.05, 0.42, 6); sNeck.rotateZ(0.5); sNeck.translate(0.22, 0.38, 0);
  const sHead = new THREE.SphereGeometry(0.07, 8, 8); sHead.translate(0.34, 0.58, 0);
  const sBeak = new THREE.ConeGeometry(0.03, 0.1, 6); sBeak.rotateZ(-Math.PI / 2); sBeak.translate(0.44, 0.57, 0);
  const swanGeo = mergeGeometries([sBody, sNeck, sHead, sBeak]);
  const pBody = new THREE.SphereGeometry(0.075, 8, 6); pBody.scale(1.5, 1, 1); pBody.translate(0, 0.08, 0);
  const pHead = new THREE.SphereGeometry(0.045, 8, 6); pHead.translate(0.1, 0.16, 0);
  const pigeonGeo = mergeGeometries([pBody, pHead]);
  const mkWaterBird = (arr, n, lakesArr, rBase) => {
    for (let i = 0; i < n && lakesArr.length; i++) {
      const lk = lakesArr[i % lakesArr.length];
      let ax = lk.x, az = lk.z, ok = false;
      for (let t = 0; t < 8 && !ok; t++) {
        ax = lk.x + (rnd() - 0.5) * 60; az = lk.z + (rnd() - 0.5) * 60;
        ok = inRing(ax, az, lk.ring);
      }
      if (!ok) continue;
      arr.push({ x: ax, z: az, r: rBase + rnd() * 4, sp: (0.1 + rnd() * 0.18) * (rnd() < 0.5 ? 1 : -1),
        ph: rnd() * Math.PI * 2, bob: rnd() * Math.PI * 2, s: 0.8 + rnd() * 0.5 });
    }
  };
  mkWaterBird(ducks, 36, lakes, 2.5);
  mkWaterBird(swans, 8, lakes, 4);
  const spots = [];
  for (const ring of parsed.greens) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    if ((x1 - x0) + (z1 - z0) > 120) spots.push({ ring, x0, x1, z0, z1 });
  }
  if (towerPosRef) spots.push({ tower: towerPosRef });
  for (let i = 0; i < 70 && spots.length; i++) {
    const sp = spots[i % spots.length];
    let x, z;
    if (sp.tower) {
      const a = rnd() * Math.PI * 2, r = 10 + rnd() * 8;
      x = sp.tower.x + Math.cos(a) * r; z = sp.tower.z + Math.sin(a) * r;
    } else {
      x = sp.x0 + rnd() * (sp.x1 - sp.x0); z = sp.z0 + rnd() * (sp.z1 - sp.z0);
      if (sp.ring && !inRing(x, z, sp.ring)) { i--; continue; }
    }
    pigeons.push({ x, z, ph: rnd() * 10, sp: 0.5 + rnd() * 0.7, dir: rnd() * Math.PI * 2, hop: rnd() * 10 });
  }
  if (ducks.length) {
    duckIM = new THREE.InstancedMesh(duckGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.9 }), ducks.length);
    const cArr = [0x8a6a4a, 0x6d5a48, 0x7a5238, 0x5c6d52];
    ducks.forEach((d, i) => duckIM.setColorAt(i, new THREE.Color(cArr[(rnd() * 4) | 0])));
    scene.add(duckIM);
  }
  if (swans.length) {
    swanIM = new THREE.InstancedMesh(swanGeo,
      new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.7 }), swans.length);
    scene.add(swanIM);
  }
  if (pigeons.length) {
    pigeonIM = new THREE.InstancedMesh(pigeonGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.9 }), pigeons.length);
    const cArr = [0xb8bcc4, 0x9aa0a8, 0xd8d4cc, 0x8a8f96];
    pigeons.forEach((d, i) => pigeonIM.setColorAt(i, new THREE.Color(cArr[(rnd() * 4) | 0])));
    scene.add(pigeonIM);
  }
}
function updateAnimals(time) {
  if (duckIM) ducks.forEach((d, i) => {
    const a = d.ph + time * d.sp;
    const x = d.x + Math.cos(a) * d.r, z = d.z + Math.sin(a) * d.r;
    animalTmp.position.set(x, 0.34 + Math.sin(time * 2 + d.bob) * 0.04, z);
    animalTmp.rotation.set(0, -a - Math.PI / 2, 0);
    animalTmp.scale.setScalar(d.s);
    animalTmp.updateMatrix();
    duckIM.setMatrixAt(i, animalTmp.matrix);
  });
  if (duckIM) duckIM.instanceMatrix.needsUpdate = true;
  if (swanIM) swans.forEach((d, i) => {
    const a = d.ph + time * d.sp * 0.7;
    const x = d.x + Math.cos(a) * d.r, z = d.z + Math.sin(a) * d.r;
    animalTmp.position.set(x, 0.36 + Math.sin(time * 1.4 + d.bob) * 0.035, z);
    animalTmp.rotation.set(0, -a - Math.PI / 2, 0);
    animalTmp.scale.setScalar(d.s);
    animalTmp.updateMatrix();
    swanIM.setMatrixAt(i, animalTmp.matrix);
  });
  if (swanIM) swanIM.instanceMatrix.needsUpdate = true;
  if (pigeonIM) pigeons.forEach((d, i) => {
    const t = time * d.sp + d.ph;
    const wob = Math.sin(t * 0.6) * 1.2;
    const hop = Math.abs(Math.sin(t * 5 + d.hop));
    animalTmp.position.set(d.x + Math.cos(d.dir) * wob, GEO.terrainHeight(d.x, d.z) + 0.05 + hop * 0.14, d.z + Math.sin(d.dir) * wob);
    animalTmp.rotation.set(0, d.dir + Math.sin(t) * 0.6, 0);
    animalTmp.scale.setScalar(1);
    animalTmp.updateMatrix();
    pigeonIM.setMatrixAt(i, animalTmp.matrix);
  });
  if (pigeonIM) pigeonIM.instanceMatrix.needsUpdate = true;
}

// ---------- 游船 / 轮渡 ----------
function buildBoats(parsed) {
  const ring = largestWaterRing(parsed.waters);
  riverCurve = ring ? buildRiverCurve(ring) : null;
  if (!riverCurve) return;
  boatGlowMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.9, emissive: 0xffc873, emissiveIntensity: 0 });
  boatLightMats.push(boatGlowMat);
  const hullGlow = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0 });
  boatLightMats.push(hullGlow);
  const mastWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 });
  boatLightMats.push(mastWhite);
  const strLight = new THREE.MeshStandardMaterial({ color: 0xffe8b0, emissive: 0xffd080, emissiveIntensity: 0 });
  boatLightMats.push(strLight);
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
  const addWake = (boat, len) => {
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), wakeMat);
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(-len / 2 - 1.6, 0.06, 0);
    boat.add(wake);
  };
  const makeCruise = hullColor => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 1.2),
      new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.8 }));
    hull.position.y = 0.25;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.9 }));
    cabin.position.set(-0.2, 0.75, 0);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xb0483e, roughness: 0.8 }));
    chimney.position.set(1.1, 0.85, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.07, 1.22), hullGlow);
    strip.position.y = 0.52;
    b.add(hull, cabin, chimney, strip);
    addWake(b, 3.6);
    return b;
  };
  const makeGlass = () => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x2e4a66, roughness: 0.6 }));
    hull.position.y = 0.3;
    const d1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.62, 1.35), boatGlowMat);
    d1.position.set(-0.2, 0.9, 0);
    const d2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.56, 1.2), boatGlowMat);
    d2.position.set(-0.3, 1.5, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8dde2 }));
    mast.position.set(1.6, 1.6, 0);
    const topW = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mastWhite);
    topW.position.set(1.6, 2.2, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(4.62, 0.07, 1.62), hullGlow);
    strip.position.y = 0.62;
    b.add(hull, d1, d2, mast, topW, strip);
    addWake(b, 5.0);
    return b;
  };
  const makeRetro = () => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.62, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x27402e, roughness: 0.8 }));
    hull.position.y = 0.31;
    const sup = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.95, 1.25),
      new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.9 }));
    sup.position.set(-0.1, 1.1, 0);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.9 }));
    bow.position.set(1.7, 0.85, 0);
    const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f }));
    m1.position.set(1.2, 2.2, 0);
    const m2 = m1.clone(); m2.position.set(-1.4, 2.2, 0);
    const topW = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mastWhite);
    topW.position.set(1.2, 3.6, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.07, 1.52), hullGlow);
    strip.position.y = 0.64;
    b.add(hull, sup, bow, m1, m2, topW, strip);
    for (let k = 0; k < 7; k++) {
      const t = (k + 1) / 8;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), strLight);
      s.position.set(1.2 + (-2.6) * t, 3.5 - Math.sin(t * Math.PI) * 0.28, 0);
      b.add(s);
    }
    addWake(b, 4.8);
    return b;
  };
  // —— 砂石散货船：肥硕船体 + 满载沙堆 + 尾部驾驶楼 + 航行灯（左红右绿桅白） ——
  const redNav = new THREE.MeshStandardMaterial({ color: 0xd03a2a, emissive: 0xff4030, emissiveIntensity: 0 });
  const greenNav = new THREE.MeshStandardMaterial({ color: 0x2f9a50, emissive: 0x40ff60, emissiveIntensity: 0 });
  boatLightMats.push(redNav, greenNav);
  const sandM = new THREE.MeshStandardMaterial({ color: 0xc2a35c, roughness: 1 });
  const makeBulk = () => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(13, 0.85, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.8 }));
    hull.position.y = 0.42;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.0, 4),
      new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.8 }));
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(7.4, 0.42, 0);
    b.add(hull, bow);
    // 舱口围板 + 三堆满载沙石（不规则堆形）
    const coaming = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.35, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x5a2f28, roughness: 0.85 }));
    coaming.position.set(-0.6, 0.95, 0);
    b.add(coaming);
    for (const [sx, sw] of [[-4.2, 2.4], [-0.6, 2.8], [3.0, 2.4]]) {
      const pile = new THREE.Mesh(new THREE.SphereGeometry(sw * 0.52, 8, 5), sandM);
      pile.scale.set(1.5, 0.42, 1);
      pile.position.set(sx, 1.15, 0);
      b.add(pile);
    }
    // 尾部驾驶楼（两层层 + 白顶）
    const house = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 2.0),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.85 }));
    house.position.set(-5.4, 1.7, 0);
    b.add(house);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.8), boatGlowMat);
    bridge.position.set(-5.4, 2.9, 0);
    b.add(bridge);
    // 航行灯：桅顶白 + 左红右绿
    const mastB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x8b9298 }));
    mastB.position.set(-5.4, 4.4, 0);
    b.add(mastB);
    const topN = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mastWhite);
    topN.position.set(-5.4, 5.4, 0);
    const portR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), redNav);
    portR.position.set(-4.6, 2.1, -1.05);
    const stbdG = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), greenNav);
    stbdG.position.set(-4.6, 2.1, 1.05);
    b.add(topN, portR, stbdG);
    addWake(b, 14.5);
    return b;
  };
  // —— 集装箱货轮：甲板两列彩箱 ——
  const boxPalette = [0xc4574a, 0x3f7ac4, 0xe0b23c, 0x3f9a56, 0xb06ab8];
  const makeContainer = () => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x2e4250, roughness: 0.75 }));
    hull.position.y = 0.4;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x2e4250, roughness: 0.75 }));
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(6.8, 0.4, 0);
    const house = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.85 }));
    house.position.set(-5.2, 1.7, 0);
    b.add(hull, bow, house);
    const boxGeo = new THREE.BoxGeometry(1.55, 0.62, 1.35);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
      if ((i + j + k) % 4 === 3) continue;
      const box = new THREE.Mesh(boxGeo,
        new THREE.MeshStandardMaterial({ color: boxPalette[(i * 3 + j) % 5], roughness: 0.8 }));
      box.position.set(-3.6 + i * 1.8, 1.15 + k * 0.66, (j - 0.5) * 1.45);
      b.add(box);
    }
    const topN = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mastWhite);
    topN.position.set(-5.2, 3.5, 0);
    b.add(topN);
    addWake(b, 13.5);
    return b;
  };
  const fleet = [
    { m: makeCruise(0xf0ece2), t0: 0, speed: 0.014 },
    { m: makeCruise(0xe8dcc8), t0: 0.5, speed: 0.011 },
    { m: makeGlass(), t0: 0.25, speed: 0.009 },
    { m: makeGlass(), t0: 0.72, speed: 0.010 },
    { m: makeRetro(), t0: 0.12, speed: 0.008 },
    { m: makeRetro(), t0: 0.62, speed: 0.0095 },
  ];
  // —— 大游轮 ×5（知音号级，各有船名） ——
  const linerNames = ['长 江 观 光', '黄 鹤 号', '两 江 游 轮', '晴 川 号', '江 城 之 星'];
  for (let i = 0; i < linerNames.length; i++) {
    const liner = buildZhiyinHao(linerNames[i]);
    liner.scale.setScalar(0.85);
    fleet.push({ m: liner, t0: 0.06 + (i >> 1) * 0.24 + (i % 2) * 0.06, speed: 0.0055 + (i % 3) * 0.0012, dir: i % 2 === 0 ? 1 : -1 });
  }
  // —— 砂石散货船 ×6：满载下水 / 空载上水各半 ——
  for (let i = 0; i < 6; i++) {
    fleet.push({ m: makeBulk(), t0: 0.04 + (i >> 1) * 0.18 + (i % 2) * 0.07, speed: 0.006 + (i % 3) * 0.0015, dir: i % 2 === 0 ? 1 : -1 });
  }
  // —— 集装箱货轮 ×2：一下水一上水 ——
  for (let i = 0; i < 2; i++) {
    fleet.push({ m: makeContainer(), t0: 0.3 + i * 0.45, speed: 0.0075 + i * 0.001, dir: i === 0 ? 1 : -1 });
  }
  // 双向分道：dir=1 下水走航道中线，dir=-1 上水由 animate 沿左法向偏移 11u
  for (const f of fleet) {
    f.m.userData = { t0: f.t0, speed: f.speed, dir: f.dir || 1 };
    boats.push(f.m);
    scene.add(f.m);
  }
}

// ---------- 桥上交通（双线客货列车 + 公路车流） ----------
const bridgeTrainsRef = bridgeTrains;
function buildBridgeTraffic(L) {
  const railY = bridgeGroup.userData.midY + 0.18;
  trainWinMat = new THREE.MeshStandardMaterial({ color: 0x2e3338, emissive: 0xffe0a8, emissiveIntensity: 0 });
  vehLightMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffeeb8, emissiveIntensity: 0 });
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.5, depthWrite: false });
  const makeLoco = color => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 1.06),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    body.position.y = 0.52;
    body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 1.0),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    nose.position.set(1.9, 0.34, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.8 }));
    roof.position.set(-0.3, 1.06, 0);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.7), trainWinMat);
    win.position.set(1.72, 0.66, 0);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x33383d }));
    chim.position.set(0.9, 1.15, 0);
    g.add(body, nose, roof, win, chim);
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), smokeMat.clone());
      p.userData.phase = k / 3;
      g.add(p);
      trainSmokes.push(p);
    }
    return g;
  };
  const makeCoach = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.78, 1.02),
      new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.8 }));
    body.position.y = 0.5;
    body.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.78),
      new THREE.MeshStandardMaterial({ color: 0xd8e4da, roughness: 0.9 }));
    roof.position.y = 0.94;
    g.add(body, roof);
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 0.06), trainWinMat);
      win.position.set(0, 0.58, s * 0.53);
      g.add(win);
    }
    return g;
  };
  const makeFreight = i => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.95 }));
    body.position.y = 0.42;
    body.castShadow = true;
    g.add(body);
    if (i % 3 !== 2) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.6, 0.9),
        new THREE.MeshStandardMaterial({ color: i % 3 ? 0x4a6a8a : 0xa84438, roughness: 0.9 }));
      box.position.y = 0.98;
      box.castShadow = true;
      g.add(box);
    }
    return g;
  };
  const assemble = (cars, z) => {
    const grp = new THREE.Group();
    grp.position.set(0, railY, z);
    cars.forEach(c => grp.add(c));
    bridgeGroup.add(grp);
    return grp;
  };
  const pax = [makeLoco(0xb8422e)];
  for (let i = 0; i < 8; i++) pax.push(makeCoach());
  pax.push(makeLoco(0xb8422e));
  bridgeTrains.push({ grp: assemble(pax, -0.56), n: pax.length, gap: 3.15, speed: 11, phase: 0 });
  const frt = [makeLoco(0x33632f)];
  for (let i = 0; i < 10; i++) frt.push(makeFreight(i));
  frt.push(makeLoco(0x33632f));
  bridgeTrains.push({ grp: assemble(frt, 0.56), n: frt.length, gap: 2.55, speed: 8.5, phase: 260 });

  const roadTypes = [
    { w: 1.5, h: 0.5, d: 0.8, colors: [0xd9d3c5, 0xb0483e, 0x4a6a8a, 0xd8d8dc, 0x3b3f45, 0xb8863b, 0x6a8f6a, 0xe0d6b8] },
    { w: 3.1, h: 0.78, d: 0.95, colors: [0xe8e4da, 0xd84438, 0x3a6ea5] },
    { w: 2.5, h: 0.72, d: 1.0, colors: [0x8a8f94, 0x6b7280] },
  ];
  const N = 16;
  const rnd = GEO.seededRand(88);
  for (let i = 0; i < N; i++) {
    const r = rnd();
    const t = r < 0.7 ? roadTypes[0] : (r < 0.88 ? roadTypes[1] : roadTypes[2]);
    const color = t.colors[Math.floor(rnd() * t.colors.length)];
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    m.castShadow = true;
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, t.d * 0.7), vehLightMat);
    light.position.set(t.w / 2, 0, 0);
    m.add(light);
    m.position.set(4 + (i / N) * (L - 8), 7.23 + t.h / 2, i % 2 ? 1.0 : -1.0);
    m.userData = { dir: i % 2 ? 1 : -1, speed: 13 + rnd() * 9 };
    bridgeGroup.add(m);
    bridgeCars.push(m);
  }
  bridgeGroup.userData.L = L;
}

// ---------- 长江灯光秀 ----------
function buildLightShow(parsed) {
  const tall = parsed.buildings.filter(b => b.heightM >= 38)
    .sort((p, q) => q.heightM - p.heightM).slice(0, 28);
  for (const b of tall) {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    const h = b.heightM * GEO.SCALE;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.7, h * 0.92, 0.7), mat);
    const edge = b.ring[0];
    const dx = edge.x - cx, dz = edge.z - cz;
    const dl = Math.hypot(dx, dz) || 1;
    strip.position.set(edge.x + dx / dl * 0.9, h / 2, edge.z + dz / dl * 0.9);
    strip.userData.hue0 = Math.random();
    scene.add(strip);
    lightShowStrips.push(strip);
  }
  const tp = towerPosRef;
  towerSpot = new THREE.SpotLight(0xffd080, 0, 500, 0.5, 0.5, 1.6);
  towerSpot.position.set(tp.x + 50, 70, tp.z + 65);
  towerSpot.target.position.set(tp.x, 8, tp.z);
  scene.add(towerSpot, towerSpot.target);
}

// ---------- 武昌滨江天际线 + 二七桥 ----------
function buildRiversideSkyline() {
  const hero = buildSupertall(100);
  hero.position.set(470, 0, -250);
  scene.add(hero);
  skylineGlowMats.push(...hero.userData.glowMats);
  skylineBeacons.push(hero.userData.beacon);
  addLabel('绿地中心', new THREE.Vector3(470, 108, -250));
  const rnd = GEO.seededRand(717);
  const spots = [
    [380, -195, 46], [525, -215, 38], [405, -305, 34], [560, -290, 54],
    [330, -262, 30], [498, -335, 42], [605, -245, 36], [445, -165, 28],
  ];
  const glassA = new THREE.MeshStandardMaterial({ color: 0x9db8d2, roughness: 0.3, metalness: 0.3 });
  const glassB = new THREE.MeshStandardMaterial({ color: 0xaec4d4, roughness: 0.35, metalness: 0.25 });
  for (const [x, z, h] of spots) {
    const w = 4 + rnd() * 3;
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.85), rnd() < 0.5 ? glassA : glassB);
    t.position.set(x + (rnd() - 0.5) * 8, h / 2, z + (rnd() - 0.5) * 8);
    t.rotation.y = rnd() * 0.4;
    t.castShadow = true;
    scene.add(t);
    const glow = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0 });
    skylineGlowMats.push(glow);
    for (const s of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.26, h * 0.94, 0.26), glow,
        t.position.x + s * w * 0.55, h / 2, t.position.z + s * w * 0.45);
      scene.add(strip);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.5, w * 0.6), glow);
    crown.position.set(t.position.x, h + 0.25, t.position.z);
    scene.add(crown);
  }
}
function buildErqiBridge(parsed) {
  const spans = GEO.waterCrossSpans(parsed.waters, -390).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
  const sp = spans[0];
  if (!sp || sp.x1 - sp.x0 < 150) return;
  const L = sp.x1 - sp.x0 + 60;
  const b = buildCableStayBridge(L);
  b.position.set(sp.x0 - 30, 0, -390);
  scene.add(b);
  if (b.userData.lampMat) bridgeErqiLampMat = b.userData.lampMat;
  addLabel('二七长江大桥', new THREE.Vector3((sp.x0 + sp.x1) / 2, 20, -390));
}

// ---------- 江面波光 / 江滩 / 晨雾 ----------
function buildRiverGlints() {
  if (!riverCurve) return;
  const rnd = GEO.seededRand(515);
  const pts = [], cols = [];
  const warm = new THREE.Color(0xffc37e), cool = new THREE.Color(0x8fb4e8), white = new THREE.Color(0xffffff);
  for (let i = 0; i < 260; i++) {
    const t = rnd();
    const p = riverCurve.getPointAt(t);
    const tan = riverCurve.getTangentAt(t);
    const nx = -tan.z, nz = tan.x;
    const off = (rnd() < 0.5 ? 1 : -1) * (5 + rnd() * 26);
    pts.push(p.x + nx * off, 0.62, p.z + nz * off);
    const r = rnd();
    const c = r < 0.55 ? warm : (r < 0.85 ? cool : white);
    cols.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  riverGlintMat = new THREE.PointsMaterial({
    vertexColors: true, size: 1.25, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Points(g, riverGlintMat));
}
function buildWaterfront(parsed) {
  if (!riverCurve) return;
  const inWater = (x, z) => waterIdx && waterIdx.hit(x, z);
  const rnd = GEO.seededRand(606);
  const greens = [], walks = [];
  const treePts = [], lightPts = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const p = riverCurve.getPointAt(t);
    if (Math.abs(p.x) > 1100 || p.z < -2100 || p.z > 1000) continue;
    const tan = riverCurve.getTangentAt(t);
    const nx = -tan.z, nz = tan.x;
    for (const s of [1, -1]) {
      let d = null;
      for (let q = 8; q <= 82; q += 6) {
        if (!inWater(p.x + nx * s * q, p.z + nz * s * q)) { d = q; break; }
      }
      if (d === null) continue;
      const g = new THREE.CircleGeometry(8 + rnd() * 5, 9);
      g.rotateX(-Math.PI / 2);
      g.translate(p.x + nx * s * (d + 10), 0.055, p.z + nz * s * (d + 10));
      greens.push(g);
      const w = new THREE.BoxGeometry(15, 0.09, 1.7);
      w.rotateY(-Math.atan2(tan.z, tan.x));
      w.translate(p.x + nx * s * (d + 3.5), 0.1, p.z + nz * s * (d + 3.5));
      walks.push(w);
      if (i % 2 === 0) {
        treePts.push({
          x: p.x + nx * s * (d + 13 + rnd() * 5), z: p.z + nz * s * (d + 13 + rnd() * 5),
          y: 0, s: 0.6 + rnd() * 0.7, pine: rnd() < 0.25,
        });
      } else {
        lightPts.push(p.x + nx * s * (d + 3.5), 0.9, p.z + nz * s * (d + 3.5));
      }
    }
  }
  if (greens.length) {
    const gm = new THREE.Mesh(mergeGeometries(greens),
      new THREE.MeshStandardMaterial({ color: 0x8fbc6e, roughness: 1 }));
    gm.receiveShadow = true;
    scene.add(gm);
  }
  if (walks.length) {
    const wm = new THREE.Mesh(mergeGeometries(walks),
      new THREE.MeshStandardMaterial({ color: 0xcbb98f, roughness: 1 }));
    wm.receiveShadow = true;
    scene.add(wm);
  }
  if (treePts.length) buildTrees(treePts);
  if (lightPts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3));
    waterfrontMat = new THREE.PointsMaterial({
      color: 0xffd9a0, size: 1.3, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    scene.add(new THREE.Points(g, waterfrontMat));
  }
}
function initMorningFog() {
  if (!riverCurve) return;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const rc = GEO.seededRand(2121);
  for (let i = 0; i < 42; i++) {
    const x = rc() * 256, y = 30 + rc() * 68, r = 18 + rc() * 36;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(235,240,244,${0.05 + rc() * 0.08})`);
    gr.addColorStop(1, 'rgba(235,240,244,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(2, 1);
  for (const [t, y, w] of [[0.3, 2.6, 1100], [0.55, 4.2, 1300], [0.75, 2.2, 1000], [0.42, 6.5, 900]]) {
    const p = riverCurve.getPointAt(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.22),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(riverCurve.getTangentAt(t).x, riverCurve.getTangentAt(t).z);
    m.position.set(p.x, y, p.z);
    m.userData.spin = (Math.random() - 0.5) * 0.02;
    fogPlanes.push(m);
    scene.add(m);
  }
}
function updateMorningFog(dt) {
  if (!fogPlanes.length) return;
  const tod = dayState.tod;
  const morningK = Math.exp(-Math.pow((tod - 0.285) / 0.05, 2));
  for (const m of fogPlanes) {
    m.material.opacity += (morningK * 0.5 - m.material.opacity) * Math.min(1, dt * 0.5);
    m.rotation.z += m.userData.spin * dt;
  }
}

// ---------- 烟花 ----------
const FW_N = 2600;
let fwRocketTimer = 0;
function initFireworks() {
  if (!riverCurve) return;
  for (const t of [0.28, 0.45, 0.62]) {
    const p = riverCurve.getPointAt(t);
    fwSites.push(new THREE.Vector3(p.x, 0.5, p.z));
  }
  fwBoatSources = boats.slice(0, 4);
  const pos = new Float32Array(FW_N * 3), col = new Float32Array(FW_N * 3);
  for (let i = 0; i < FW_N; i++) { pos[i * 3 + 1] = -9999; fwFree.push(i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const cx = c.getContext('2d');
  const grad = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = grad; cx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  fwPoints = new THREE.Points(g, new THREE.PointsMaterial({
    size: 2.5, map: tex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, vertexColors: true, fog: false,
  }));
  fwPoints.frustumCulled = false;
  scene.add(fwPoints);
}
function fwSpawn(pos, vel, life, r, g2, b2, grav) {
  if (!fwFree.length) return;
  const i = fwFree.pop();
  fwParts.push({ i, x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z,
    life, max: life, r, g: g2, b: b2, grav, tw: Math.random() < 0.35 });
}
function fwLaunch(site) {
  fwRockets.push({
    x: site.x, y: site.y, z: site.z,
    vx: (Math.random() - 0.5) * 6, vy: 72 + Math.random() * 14, vz: (Math.random() - 0.5) * 6,
    apex: 55 + Math.random() * 40, hue: Math.random(),
  });
}
function fwExplode(r) {
  const n = 80 + (Math.random() * 50 | 0);
  const base = r.hue;
  for (let k = 0; k < n; k++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const sp = 13 + Math.random() * 19;
    const col = new THREE.Color().setHSL((base + (Math.random() - 0.5) * 0.12 + 1) % 1, 1, 0.55 + Math.random() * 0.3);
    fwSpawn(new THREE.Vector3(r.x, r.y, r.z),
      new THREE.Vector3(Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp),
      1.3 + Math.random() * 1.1, col.r, col.g, col.b, 17);
  }
}
function updateFireworks(dt) {
  if (!fwPoints) return;
  if (fwActive) {
    fwTimer -= dt;
    if (fwTimer <= 0) {
      fwTimer = 0.42 + Math.random() * 0.5;
      const useBoat = fwBoatSources.length && Math.random() < 0.75;
      if (useBoat) {
        const b = fwBoatSources[Math.random() * fwBoatSources.length | 0];
        fwLaunch(new THREE.Vector3(b.position.x + 1.2, b.position.y + 1.6, b.position.z));
      } else {
        fwLaunch(fwSites[Math.random() * fwSites.length | 0]);
      }
    }
  }
  for (let k = fwRockets.length - 1; k >= 0; k--) {
    const r = fwRockets[k];
    r.vy -= fwRocketG * dt * 0.4;
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
    fwSpawn(new THREE.Vector3(r.x, r.y, r.z), new THREE.Vector3(0, -3, 0), 0.35, 1, 0.85, 0.55, 0);
    if (r.y >= r.apex || r.vy < 6) { fwExplode(r); fwRockets.splice(k, 1); }
  }
  const pa = fwPoints.geometry.attributes.position, ca = fwPoints.geometry.attributes.color;
  for (let k = fwParts.length - 1; k >= 0; k--) {
    const q = fwParts[k];
    q.life -= dt;
    if (q.life <= 0) {
      pa.array[q.i * 3 + 1] = -9999;
      ca.setXYZ(q.i, 0, 0, 0);
      fwFree.push(q.i);
      fwParts.splice(k, 1);
      continue;
    }
    q.vy -= q.grav * dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    const f = q.life / q.max * (q.tw ? (0.4 + Math.random() * 0.6) : 1);
    pa.setXYZ(q.i, q.x, q.y, q.z);
    ca.setXYZ(q.i, q.r * f, q.g * f, q.b * f);
  }
  pa.needsUpdate = true;
  ca.needsUpdate = true;
}

// ---------- 环境音效 ----------
const Snd = {
  ctx: null, master: null, on: false,
  wavesGain: null, windGain: null, noiseBuf: null,
  birdT: 3, cricketT: 1, hornCd: 8, riverPts: [],
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const ws = this.ctx.createBufferSource();
    ws.buffer = this.noiseBuf; ws.loop = true;
    const wf = this.ctx.createBiquadFilter();
    wf.type = 'lowpass'; wf.frequency.value = 520;
    this.wavesGain = this.ctx.createGain(); this.wavesGain.gain.value = 0.3;
    ws.connect(wf).connect(this.wavesGain).connect(this.master);
    ws.start();
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.14;
    lfo.connect(lfoG).connect(this.wavesGain.gain); lfo.start();
    const ws2 = this.ctx.createBufferSource();
    ws2.buffer = this.noiseBuf; ws2.loop = true; ws2.playbackRate.value = 0.6;
    const wf2 = this.ctx.createBiquadFilter();
    wf2.type = 'bandpass'; wf2.frequency.value = 800; wf2.Q.value = 0.4;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.05;
    ws2.connect(wf2).connect(this.windGain).connect(this.master);
    ws2.start();
  },
  toggle() {
    this.init();
    if (!this.ctx) return false;
    this.on = !this.on;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.linearRampToValueAtTime(this.on ? 0.8 : 0, this.ctx.currentTime + 0.5);
    return this.on;
  },
  blip(freq, dur, vol, type = 'sine', f2 = null) {
    if (!this.on || !this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (f2) o.frequency.linearRampToValueAtTime(f2, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  },
  bird() {
    this.blip(2900, 0.09, 0.06, 'sine', 3500);
    setTimeout(() => this.blip(3300, 0.07, 0.05, 'sine', 2700), 130);
    setTimeout(() => this.blip(3100, 0.1, 0.045, 'sine', 3600), 260);
  },
  cricket() { this.blip(4300 + Math.random() * 500, 0.05, 0.02, 'sine'); },
  horn() {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [116, 174]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f;
      fl.type = 'lowpass'; fl.frequency.value = 380;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.1);
      g.gain.setValueAtTime(0.11, t + 1.0);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      o.connect(fl).connect(g).connect(this.master);
      o.start(t); o.stop(t + 1.7);
    }
  },
  update(dt, camPos, envT) {
    if (!this.on || !this.ctx) return;
    let best = 1e9;
    for (const p of this.riverPts) {
      const d = (p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2;
      if (d < best) best = d;
    }
    const dv = Math.max(0, 1 - Math.sqrt(best) / 650);
    this.wavesGain.gain.setTargetAtTime(0.08 + dv * 0.5, this.ctx.currentTime, 0.4);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 4 + Math.random() * 9;
      if (envT < 0.45) this.bird();
    }
    this.cricketT -= dt;
    if (this.cricketT <= 0) {
      this.cricketT = 0.35 + Math.random() * 0.5;
      if (envT > 0.62) this.cricket();
    }
    this.hornCd -= dt;
    if (this.hornCd <= 0) {
      for (const b of boats) {
        if (Math.hypot(b.position.x - camPos.x, b.position.z - camPos.z) < 130) {
          this.horn(); this.hornCd = 16 + Math.random() * 10;
          break;
        }
      }
      if (this.hornCd < 0) this.hornCd = 4;
    }
  },
};

// ---------- 车流（560 辆 + 红灯停车） ----------
function buildTraffic(parsed) {
  const roads = parsed.roads.filter(r => !r.bridge &&
    (r.kind === 'primary' || r.kind === 'trunk' || r.kind === 'secondary'));
  trafficSegs = [];
  for (const r of roads) {
    let len = 0;
    const cum = [0];
    for (let i = 0; i < r.pts.length - 1; i++) {
      len += Math.hypot(r.pts[i + 1].x - r.pts[i].x, r.pts[i + 1].z - r.pts[i].z);
      cum.push(len);
    }
    if (len > 40) trafficSegs.push({ pts: r.pts, cum, len });
  }
  if (!trafficSegs.length) return;
  const total = trafficSegs.reduce((s, x) => s + x.len, 0);
  const N = Math.max(60, Math.min(560, Math.floor(total / 14)));
  trafficMat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0xffe8c0, emissiveIntensity: 0 });
  trafficMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.4, 1.3), trafficMat, N);
  trafficMesh.castShadow = true;
  const palette = [0xd9d3c5, 0xb0483e, 0x4a6a8a, 0xd8d8dc, 0x3b3f45, 0xb8863b, 0x6a8f6a, 0xe0d6b8];
  const rnd = GEO.seededRand(2026);
  for (let i = 0; i < N; i++) {
    trafficCars.push({
      seg: Math.floor(rnd() * trafficSegs.length),
      dist: rnd() * 300, dir: rnd() < 0.5 ? 1 : -1,
      speed: 4 + rnd() * 5, lane: rnd() < 0.5 ? 0.5 : -0.5,
    });
    trafficMesh.setColorAt(i, new THREE.Color(palette[Math.floor(rnd() * palette.length)]));
  }
  scene.add(trafficMesh);
}
function pointOnSeg(seg, dist) {
  const d = THREE.MathUtils.clamp(dist, 0, seg.len);
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < d) i++;
  const t0 = seg.cum[i - 1], t1 = seg.cum[i];
  const k = t1 > t0 ? (d - t0) / (t1 - t0) : 0;
  const a = seg.pts[i - 1], b = seg.pts[i];
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, ang: Math.atan2(b.x - a.x, b.z - a.z) };
}
function tlGreenFor(x, z, alongX, time) {
  const key = Math.round(x / 40) + '_' + Math.round(z / 40);
  if (!tlCell.has(key)) return true;
  return alongX ? (time % 19) < 9.5 : (time % 19) >= 9.5;
}
function updateTraffic(dt) {
  if (!trafficMesh) return;
  if (!tlCell.size && tlSpots.length) {
    for (const s of tlSpots) tlCell.set(s.key, 1);
  }
  const time = performance.now() / 1000;
  trafficCars.forEach((car, i) => {
    const seg = trafficSegs[car.seg];
    let step = car.speed * car.dir * dt;
    const pNow = pointOnSeg(seg, car.dist);
    let hold = 1;
    for (let k = -1; k <= 1; k++) {
      const key = Math.round((pNow.x + Math.sin(pNow.ang) * k * 12) / 40) + '_' + Math.round((pNow.z + Math.cos(pNow.ang) * k * 12) / 40);
      if (!tlCell.has(key)) continue;
      const spot = tlSpots.find(s => s.key === key);
      if (!spot) continue;
      const dx = spot.x - pNow.x, dz = spot.z - pNow.z;
      const d = Math.hypot(dx, dz);
      const fwd = (dx * Math.sin(pNow.ang) + dz * Math.cos(pNow.ang)) * car.dir;
      if (d < 18 && fwd > 0) {
        const alongX = Math.abs(Math.sin(pNow.ang)) > Math.abs(Math.cos(pNow.ang));
        if (!tlGreenFor(spot.x, spot.z, alongX, time)) {
          hold = Math.max(0, Math.min(1, (d - 6.5) / 5));
          if (d < 7.2) hold = 0;
        }
      }
    }
    car.dist += step * hold;
    if (car.dist > seg.len) car.dist = 0;
    if (car.dist < 0) car.dist = seg.len;
    const p = pointOnSeg(seg, car.dist);
    const rx = Math.cos(p.ang), rz = -Math.sin(p.ang);
    trafficTmp.position.set(p.x + rx * car.lane, 0.55 + (GEO.terrainHeight(p.x, p.z) || 0), p.z + rz * car.lane);
    trafficTmp.rotation.set(0, p.ang + (car.dir < 0 ? Math.PI : 0), 0);
    trafficTmp.updateMatrix();
    trafficMesh.setMatrixAt(i, trafficTmp.matrix);
  });
  trafficMesh.instanceMatrix.needsUpdate = true;
}

// ---------- 空中：鸟群 + 直升机 ----------
function buildAerial() {
  const N = 26;
  birdMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.66, 3),
    new THREE.MeshStandardMaterial({ color: 0x39404a, roughness: 1 }), N);
  const rnd = GEO.seededRand(31);
  for (let i = 0; i < N; i++) birdData.push({
    cx: -260 + (rnd() - 0.5) * 420, cz: 160 + (rnd() - 0.5) * 380,
    r: 26 + rnd() * 60, h: 26 + rnd() * 22,
    ph: rnd() * Math.PI * 2, sp: (0.1 + rnd() * 0.1) * (rnd() < 0.5 ? 1 : -1),
    flap: rnd() * Math.PI * 2,
  });
  scene.add(birdMesh);
  heliGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.55 }));
  body.rotation.z = Math.PI / 2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.7 }));
  tail.position.set(-1.6, 0.1, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x3b4148 }));
  mast.position.y = 0.45;
  heliRotor = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.05, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.8 }));
  heliRotor.position.y = 0.72;
  heliBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 1.4 }));
  heliBeacon.position.set(0.1, 0.55, 0);
  heliGroup.add(body, tail, mast, heliRotor, heliBeacon);
  scene.add(heliGroup);
}
function updateAerial(dt, time) {
  if (birdMesh) {
    birdData.forEach((b, i) => {
      const a = b.ph + time * b.sp;
      const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r;
      aerialTmp.position.set(x, b.h + Math.sin(time * 1.6 + b.ph) * 1.6, z);
      aerialTmp.rotation.set(0, ang2(a, b), 0);
      aerialTmp.scale.set(1, 0.55 + Math.abs(Math.sin(time * 7 + b.flap)) * 0.9, 1);
      aerialTmp.updateMatrix();
      birdMesh.setMatrixAt(i, aerialTmp.matrix);
    });
    birdMesh.instanceMatrix.needsUpdate = true;
  }
  if (heliGroup) {
    const a = time * 0.05;
    heliGroup.position.set(Math.cos(a) * 520 - 60, 105 + Math.sin(time * 0.4) * 6, Math.sin(a) * 380 - 40);
    heliGroup.rotation.set(0.04, -a - Math.PI / 2, 0.03);
    heliRotor.rotation.y += dt * 28;
    heliBeacon.material.emissiveIntensity = Math.sin(time * 6) > 0 ? 2.0 : 0.15;
  }
}
function ang2(a, b) { return a + (b.sp > 0 ? -Math.PI / 2 : Math.PI / 2); }

// ---------- 轮渡 ----------
function buildFerry(parsed) {
  if (!riverCurve) return;
  const inWater = (x, z) => waterIdx && waterIdx.hit(x, z);
  const t0 = 0.40;
  const p = riverCurve.getPointAt(t0);
  const tan = riverCurve.getTangentAt(t0);
  const nx = -tan.z, nz = tan.x;
  const banks = [];
  for (const s of [1, -1]) {
    let d = null;
    for (let q = 6; q <= 90; q += 6) {
      if (!inWater(p.x + nx * s * q, p.z + nz * s * q)) { d = q; break; }
    }
    if (d === null) continue;
    banks.push({ x: p.x + nx * s * (d - 4), z: p.z + nz * s * (d - 4) });
    const dock = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, 3),
      new THREE.MeshStandardMaterial({ color: 0x4a5a66, roughness: 0.8 }));
    plat.position.y = 0.55;
    const house = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.9 }));
    house.position.set(-2, 1.5, 0);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.24, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 }));
    ramp.position.set(nx * s * 3.2, 0.75, 0);
    ramp.rotation.y = Math.atan2(nx * s, nz * s);
    dock.add(plat, house, ramp);
    dock.position.set(p.x + nx * s * (d - 4), 0.25, p.z + nz * s * (d - 4));
    scene.add(dock);
  }
  if (banks.length < 2) return;
  ferry.A = new THREE.Vector3(banks[0].x, 0, banks[0].z);
  ferry.B = new THREE.Vector3(banks[1].x, 0, banks[1].z);
  ferryBoat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.9, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.7 }));
  hull.position.y = 0.45;
  const deckCars = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.24, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 1 }));
  deckCars.position.y = 1.0;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 1.9),
    new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.85, emissive: 0xffc873, emissiveIntensity: 0 }));
  cab.position.set(-0.2, 1.6, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8dde2 }));
  mast.position.set(2.2, 1.9, 0);
  const topL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 }));
  topL.position.set(2.2, 2.6, 0);
  ferryBoat.add(hull, deckCars, cab, mast, topL);
  ferryBoat.userData = { cabMat: cab.material, topMat: topL.material };
  ferryBoat.position.copy(ferry.A);
  scene.add(ferryBoat);
}
function updateFerry(dt, time) {
  if (!ferryBoat || !ferry.A) return;
  if (ferry.dwell > 0) {
    if (ferry.justDocked) { Snd.horn(); ferry.justDocked = false; }
    ferry.dwell -= dt;
    ferryBoat.position.y = 0.3 + Math.sin(time * 2) * 0.05;
  } else {
    ferry.t += dt * 0.055 * ferry.dir;
    if (ferry.t >= 1) { ferry.t = 1; ferry.dir = -1; ferry.dwell = 4.5; ferry.justDocked = true; }
    if (ferry.t <= 0) { ferry.t = 0; ferry.dir = 1; ferry.dwell = 4.5; ferry.justDocked = true; }
    const k = ferry.t * ferry.t * (3 - 2 * ferry.t);
    ferryBoat.position.lerpVectors(ferry.A, ferry.B, k);
    ferryBoat.position.y = 0.3 + Math.sin(time * 1.8) * 0.06;
    const dir = ferry.B.clone().sub(ferry.A);
    ferryBoat.rotation.y = Math.atan2(dir.x, dir.z) + (ferry.dir > 0 ? 0 : Math.PI);
  }
  const m = ferryBoat.userData;
  m.cabMat.emissiveIntensity = env.t * 1.3;
  m.topMat.emissiveIntensity = env.t * 2;
}

// ---------- 路口红绿灯 + 斑马线 ----------
function buildIntersections(parsed) {
  const majors = parsed.roads.filter(r => !r.bridge && (r.kind === 'primary' || r.kind === 'trunk'));
  if (majors.length < 2) return;
  const cell = 10, map = new Map();
  majors.forEach((r, ri) => {
    for (const p of r.pts) {
      const key = Math.round(p.x / cell) + '_' + Math.round(p.z / cell);
      if (!map.has(key)) map.set(key, []);
      const arr = map.get(key);
      if (!arr.some(e => e.ri === ri)) arr.push({ ri, x: p.x, z: p.z });
    }
  });
  const raw = [];
  for (const arr of map.values()) {
    if (arr.length >= 2) {
      let x = 0, z = 0;
      arr.forEach(e => { x += e.x; z += e.z; });
      raw.push({ x: x / arr.length, z: z / arr.length });
    }
  }
  const spots = [];
  for (const s of raw) {
    if (!spots.some(q => Math.hypot(q.x - s.x, q.z - s.z) < 30)) spots.push(s);
    if (spots.length >= 36) break;
  }
  if (!spots.length) return;
  const poleGeos = [], walkGeos = [];
  const mk = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f353b, roughness: 0.7 });
  spots.forEach((s, i) => {
    const g = i % 2;
    const ox = g ? 5.5 : -5.5, oz = g ? 5.5 : -5.5;
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 3.1, 6);
    pole.translate(s.x + ox, 1.55, s.z + oz);
    poleGeos.push(pole);
    const head = new THREE.BoxGeometry(0.42, 1.05, 0.42);
    head.translate(s.x + ox, 3.4, s.z + oz);
    poleGeos.push(head);
    mk.push({ x: s.x + ox, z: s.z + oz, g });
    tlSpots.push({ x: s.x, z: s.z, key: Math.round(s.x / 40) + '_' + Math.round(s.z / 40) });
    for (const rot of [0, Math.PI / 2]) {
      for (let k = -2; k <= 2; k++) {
        const stripe = new THREE.BoxGeometry(0.34, 0.02, 4.2);
        stripe.rotateY(rot);
        stripe.translate(s.x + Math.cos(rot + Math.PI / 2) * k * 0.85, 0.125, s.z + Math.sin(rot + Math.PI / 2) * k * 0.85);
        walkGeos.push(stripe);
      }
    }
  });
  const poles = new THREE.Mesh(mergeGeometries(poleGeos), poleMat);
  poles.castShadow = true;
  scene.add(poles);
  const walks = new THREE.Mesh(mergeGeometries(walkGeos),
    new THREE.MeshStandardMaterial({ color: 0xe4e2da, roughness: 0.9 }));
  scene.add(walks);
  const ballGeo = new THREE.SphereGeometry(0.13, 8, 8);
  const mkIM = (col, glow) => new THREE.InstancedMesh(ballGeo,
    new THREE.MeshStandardMaterial({ color: col, emissive: glow, emissiveIntensity: 0.2 }), mk.length);
  const gA = mk.filter(m => m.g === 0), gB = mk.filter(m => m.g === 1);
  const fill = (im, list) => {
    const t = new THREE.Object3D();
    list.forEach((m, i) => {
      t.position.set(m.x, 3.72, m.z); t.updateMatrix(); im.setMatrixAt(i, t.matrix);
    });
    scene.add(im);
    return im;
  };
  tlRedA = fill(mkIM(0xff4030, 0xff2010), gA);
  tlYellowA = fill(mkIM(0xffd23a, 0xffc010), gA);
  tlGreenA = fill(mkIM(0x38e070, 0x10c050), gA);
  tlRedB = fill(mkIM(0xff4030, 0xff2010), gB);
  tlYellowB = fill(mkIM(0xffd23a, 0xffc010), gB);
  tlGreenB = fill(mkIM(0x38e070, 0x10c050), gB);
  [tlRedA, tlYellowA, tlGreenA, tlRedB, tlYellowB, tlGreenB].forEach((im, idx) => {
    const off = idx % 3;
    const t = new THREE.Object3D();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, t.matrix);
      t.position.set(t.position.x, 3.72 - (off - 1) * 0.34, t.position.z);
      t.updateMatrix();
      im.setMatrixAt(i, t.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });
}
function updateTrafficLights(time) {
  if (!tlRedA) return;
  const cyc = 20, ph = time % cyc;
  const setLights = (red, yel, grn, phase) => {
    const green = phase < 8, yellow = phase >= 8 && phase < 10, reds = phase >= 10;
    red.emissiveIntensity = reds ? 2.4 : 0.15;
    yel.emissiveIntensity = yellow ? 2.4 : 0.15;
    grn.emissiveIntensity = green ? 2.4 : 0.15;
  };
  setLights(tlRedA.material, tlYellowA.material, tlGreenA.material, ph);
  setLights(tlRedB.material, tlYellowB.material, tlGreenB.material, (ph + 10) % cyc);
}

// ---------- 高架立交 ----------
function buildInterchanges(parsed) {
  const majors = parsed.roads.filter(r => !r.bridge && (r.kind === 'trunk' || r.kind === 'primary'));
  if (majors.length < 3) return;
  const cell = 60, map = new Map();
  majors.forEach((r, ri) => {
    for (const p of r.pts) {
      const key = Math.round(p.x / cell) + '_' + Math.round(p.z / cell);
      if (!map.has(key)) map.set(key, { roads: new Set(), x: 0, z: 0, n: 0 });
      const e = map.get(key);
      if (!e.roads.has(ri)) {
        e.roads.add(ri);
        e.x += p.x; e.z += p.z; e.n++;
      }
    }
  });
  const cands = [];
  for (const e of map.values()) {
    if (e.roads.size >= 3) cands.push({ x: e.x / e.n, z: e.z / e.n, n: e.roads.size });
  }
  cands.sort((a, b) => b.n - a.n);
  const built = [];
  const geos = [];
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xa8adb2, roughness: 0.9, side: THREE.DoubleSide });
  for (const c of cands) {
    if (built.some(b => Math.hypot(b.x - c.x, b.z - c.z) < 380)) continue;
    if (GEO.terrainHeight(c.x, c.z) > 2) continue;
    built.push(c);
    if (built.length >= 4) break;
    const R = 27, Y = 5.4;
    for (let k = 0; k < 16; k++) {
      const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2;
      const x0 = c.x + Math.cos(a0) * R, z0 = c.z + Math.sin(a0) * R;
      const x1 = c.x + Math.cos(a1) * R, z1 = c.z + Math.sin(a1) * R;
      const L = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.BoxGeometry(L + 1.6, 0.5, 3.4);
      g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      g.translate((x0 + x1) / 2, Y, (z0 + z1) / 2);
      geos.push(g);
    }
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const g = new THREE.BoxGeometry(22, 0.42, 3.1);
      g.rotateY(-a - Math.PI / 2);
      g.translate(c.x + Math.cos(a) * (R + 10), Y - 1.6, c.z + Math.sin(a) * (R + 10));
      geos.push(g);
    }
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      const g = new THREE.CylinderGeometry(0.55, 0.7, Y, 8);
      g.translate(c.x + Math.cos(a) * R * 0.8, Y / 2, c.z + Math.sin(a) * R * 0.8);
      geos.push(g);
    }
  }
  if (geos.length) {
    const m = new THREE.Mesh(mergeGeometries(geos), deckMat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
}

// ---------- 停车场 ----------
function buildParkingLots(parsed) {
  const rnd = GEO.seededRand(4141);
  const spots = [];
  const bs = [];
  for (let i = 0; i < parsed.buildings.length; i += 4) {
    let cx = 0, cz = 0;
    const b = parsed.buildings[i];
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    bs.push({ x: cx / b.ring.length, z: cz / b.ring.length });
  }
  const roadsPts = [];
  for (const r of parsed.roads) for (let i = 0; i < r.pts.length; i += 2) roadsPts.push(r.pts[i]);
  let tries = 0;
  while (spots.length < 10 && tries < 600) {
    tries++;
    const x = -650 + rnd() * 1500, z = -420 + rnd() * 800;
    if ((waterIdx && waterIdx.hit(x, z)) || GEO.terrainHeight(x, z) > 1.5) continue;
    let ok = true;
    for (let k = 0; k < bs.length && ok; k++) if (Math.hypot(bs[k].x - x, bs[k].z - z) < 13) ok = false;
    if (!ok) continue;
    for (let k = 0; k < roadsPts.length && ok; k += 1) {
      if (Math.hypot(roadsPts[k].x - x, roadsPts[k].z - z) < 7) { ok = false; break; }
    }
    if (ok) spots.push({ x, z, ry: rnd() * Math.PI });
  }
  if (!spots.length) return;
  const lotGeos = [], stripeGeos = [];
  for (const s of spots) {
    const lot = new THREE.BoxGeometry(11, 0.08, 7.6);
    lot.rotateY(s.ry);
    lot.translate(s.x, 0.12, s.z);
    lotGeos.push(lot);
    for (let k = -2; k <= 2; k++) {
      const st = new THREE.BoxGeometry(0.16, 0.02, 3.6);
      st.rotateY(s.ry);
      const a = s.ry + Math.PI / 2;
      st.translate(s.x + Math.cos(a) * k * 1.9, 0.17, s.z + Math.sin(a) * k * 1.9);
      stripeGeos.push(st);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(lotGeos),
    new THREE.MeshStandardMaterial({ color: 0x63686d, roughness: 1 })));
  scene.add(new THREE.Mesh(mergeGeometries(stripeGeos),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.8 })));
  const carGeo = new THREE.BoxGeometry(1.35, 0.5, 0.68);
  const carIM = new THREE.InstancedMesh(carGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.7 }), spots.length * 5);
  const cols = [0xd9d3c5, 0xb0483e, 0x4a6a8a, 0x3b3f45, 0xe0d6b8];
  let n = 0;
  const t2 = new THREE.Object3D();
  for (const s of spots) {
    const cnt = 3 + (rnd() * 3 | 0);
    for (let k = 0; k < cnt && n < carIM.count; k++) {
      const off = (k - cnt / 2) * 1.9;
      t2.position.set(s.x + Math.cos(s.ry + Math.PI / 2) * off, 0.45, s.z + Math.sin(s.ry + Math.PI / 2) * off);
      t2.rotation.set(0, s.ry + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.1, 0);
      t2.updateMatrix();
      carIM.setMatrixAt(n, t2.matrix);
      carIM.setColorAt(n, new THREE.Color(cols[rnd() * cols.length | 0]));
      n++;
    }
  }
  carIM.count = n;
  carIM.castShadow = true;
  scene.add(carIM);
}

// ---------- 航空障碍灯 ----------
function buildObstructionLights(parsed) {
  const tall = parsed.buildings
    .filter(b => b.heightM > 55 && !b.fill)
    .sort((a, b) => b.heightM - a.heightM)
    .slice(0, 20);
  if (!tall.length) return;
  obsIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1 }), tall.length);
  const t = new THREE.Object3D();
  tall.forEach((b, i) => {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    t.position.set(cx, b.heightM * GEO.SCALE + 1, cz);
    t.updateMatrix();
    obsIM.setMatrixAt(i, t.matrix);
  });
  scene.add(obsIM);
}
function updateObstructionLights(time) {
  if (obsIM) obsIM.material.emissiveIntensity = (time % 1.6) < 0.8 ? 1.9 : 0.15;
}

// ---------- 江滩雕塑 / 航道灯 / 导引灯 ----------
function buildRiverArt(parsed) {
  if (!riverCurve) return;
  const inWater = (x, z) => waterIdx && waterIdx.hit(x, z);
  const t0 = 0.58;
  const p = riverCurve.getPointAt(t0);
  const tan = riverCurve.getTangentAt(t0);
  const nx = -tan.z, nz = tan.x;
  for (const s of [1, -1]) {
    let d = null;
    for (let q = 8; q <= 90; q += 6) {
      if (!inWater(p.x + nx * s * q, p.z + nz * s * q)) { d = q; break; }
    }
    if (d === null) continue;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.34, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.35, metalness: 0.6 }));
    ring.position.y = 6.2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 2.6, 12),
      new THREE.MeshStandardMaterial({ color: 0xb0aa9c, roughness: 1 }));
    base.position.y = 1.3;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffd060, emissiveIntensity: 0 }));
    top.position.y = 10.8;
    artGlowMat = top.material;
    g.add(ring, base, top);
    g.position.set(p.x + nx * s * (d + 10), 0, p.z + nz * s * (d + 10));
    g.rotation.y = Math.atan2(nx * s, nz * s);
    scene.add(g);
  }
}
function buildNavLights() {
  if (!bridgeGroup) return;
  const geo = new THREE.SphereGeometry(0.22, 8, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x30ff70, emissive: 0x10e050, emissiveIntensity: 0 });
  let n = 0;
  bridgeGroup.traverse(o => {
    if (!o.isMesh || !o.geometry.boundingBox) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (bb.max.y < 5.5 && bb.max.y > 0.8 && (bb.max.x - bb.min.x) > 1 && (bb.max.z - bb.min.z) > 1.5) n++;
  });
  if (!n) return;
  const im = new THREE.InstancedMesh(geo, mat, n * 2);
  const t = new THREE.Object3D();
  let i = 0;
  bridgeGroup.traverse(o => {
    if (i >= n * 2 || !o.isMesh || !o.geometry.boundingBox) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (bb.max.y < 5.5 && bb.max.y > 0.8 && (bb.max.x - bb.min.x) > 1 && (bb.max.z - bb.min.z) > 1.5) {
      const c = new THREE.Vector3();
      o.getWorldPosition(c);
      for (const s of [-1, 1]) {
        t.position.set(c.x + s * 1.4, bb.max.y + 0.3, c.z);
        t.updateMatrix();
        if (i < im.count) im.setMatrixAt(i++, t.matrix);
      }
    }
  });
  im.count = Math.min(i, im.count);
  scene.add(im);
  navLights.push(im);
}
function updateNavLights(time) {
  for (const im of navLights) im.material.emissiveIntensity = 0.7 + Math.sin(time * 2.4) * 0.5;
}
function buildSidewalkGuides(parsed) {
  const pts = [];
  for (const r of parsed.roads) {
    if (r.bridge) continue;
    if (r.kind !== 'primary' && r.kind !== 'trunk') continue;
    for (let i = 0; i < r.pts.length; i += 8) {
      const p = r.pts[i];
      for (const s of [1, -1]) {
        const w = (GEO.ROAD_WIDTH[r.kind] ?? 1.4) / 2 + 1.9;
        const dx = r.pts[Math.min(i + 1, r.pts.length - 1)].x - p.x;
        const dz = r.pts[Math.min(i + 1, r.pts.length - 1)].z - p.z;
        const l = Math.hypot(dx, dz) || 1;
        pts.push({ x: p.x - dz / l * w * s, z: p.z + dx / l * w * s });
      }
    }
  }
  if (!pts.length) return;
  pts.length = Math.min(pts.length, 900);
  guideIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffd9a0, emissiveIntensity: 0 }), pts.length);
  const t = new THREE.Object3D();
  pts.forEach((p, i) => {
    t.position.set(p.x, GEO.terrainHeight(p.x, p.z) + 0.25, p.z);
    t.updateMatrix();
    guideIM.setMatrixAt(i, t.matrix);
  });
  scene.add(guideIM);
}
function updateSidewalkGuides(t) {
  if (guideIM) guideIM.material.emissiveIntensity = t * 1.8;
}

// ---------- 自动造桥 ----------
function autoBridges(parsed) {
  const built = [
    { x: -405, z: 455 },
    { x: -50, z: -390 },
  ];
  for (const r of parsed.roads) {
    if (!r.bridge || r.name === '武汉长江大桥') continue;
    if (!r.pts || r.pts.length < 2) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of r.pts) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
      z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
    }
    const byX = (x1 - x0) >= (z1 - z0);
    const sorted = [...r.pts].sort(byX ? (a, b) => a.x - b.x : (a, b) => a.z - b.z);
    const A = sorted[0], B = sorted[sorted.length - 1];
    const dx = B.x - A.x, dz = B.z - A.z, axisLen = Math.hypot(dx, dz) || 1;
    const ux = dx / axisLen, uz = dz / axisLen;
    const spans = [];
    let cur = null;
    const S = 80;
    for (let i = 0; i <= S; i++) {
      const t = axisLen * i / S;
      const px = A.x + ux * t, pz = A.z + uz * t;
      const wet = waterIdx && waterIdx.hit(px, pz);
      if (wet && cur === null) cur = t;
      if (!wet && cur !== null) { spans.push([cur, t]); cur = null; }
    }
    if (cur !== null) spans.push([cur, axisLen]);
    for (const [t0, t1] of spans) {
      const span = t1 - t0;
      if (span < 90 || span > 950) continue;
      const midT = (t0 + t1) / 2;
      const mx = A.x + ux * midT, mz = A.z + uz * midT;
      if (built.some(m => Math.hypot(m.x - mx, m.z - mz) < 200)) continue;
      built.push({ x: mx, z: mz });
      const M = 24;
      const s = Math.max(0, t0 - M), e = Math.min(axisLen, t1 + M);
      const L = e - s;
      const a = { x: A.x + ux * s, z: A.z + uz * s };
      const b = { x: A.x + ux * e, z: A.z + uz * e };
      let g = null;
      if (span > 300) g = buildCableStayBridge(L);
      else if (span > 130) g = buildArchBridge(L);
      else g = buildBeamBridge(L);
      g.position.set(a.x, 0, a.z);
      g.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
      scene.add(g);
      if (g.userData && g.userData.lampMat) autoBridgeLampMats.push(g.userData.lampMat);
      if (g.userData && g.userData.nightMats) for (const m of g.userData.nightMats) autoNightMats.push(m);
      const nm = r.name && /[桥]/.test(r.name) ? r.name : null;
      if (nm) addLabel(nm, new THREE.Vector3((a.x + b.x) / 2, 18, (a.z + b.z) / 2));
    }
  }
}

// ---------- 东湖 ----------
function buildEastLake(parsed) {
  const eastRings = [];
  for (const ring of parsed.waters) {
    if (ring.length < 40) continue;
    let x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of ring) {
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    if (x1 > 1550 && z0 > -1900 && z1 < 1300) eastRings.push(ring);
  }
  eastRings.sort((a, b) => b.length - a.length);
  const lake = eastRings[0];
  if (!lake || lake.length < 80) return;
  let cx = 0, cz = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of lake) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    cx += p.x; cz += p.z;
  }
  const lakeC = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, x0, x1, z0, z1 };
  {
    const mx = lakeC.x + (lakeC.x1 - lakeC.x0) * 0.18, mz = lakeC.z + (lakeC.z1 - lakeC.z0) * 0.3;
    scene.add(GEO.appendHill(
      [{ x: mx - 70, z: mz - 30 }, { x: mx, z: mz }, { x: mx + 80, z: mz + 40 }],
      { peak: 13, halfWidth: 24, endFall: 45 }));
  }
  const rnd = GEO.seededRand(1314);
  const walkGeos = [], treePts = [], lightPts = [];
  const n = lake.length;
  for (let i = 0; i < n; i += 2) {
    const a = lake[i], b = lake[(i + 2) % n];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    let dx = lakeC.x - mx, dz = lakeC.z - mz;
    const dl = Math.hypot(dx, dz) || 1;
    const px = mx + dx / dl * 3, pz = mz + dz / dl * 3;
    const seg = new THREE.BoxGeometry(Math.hypot(b.x - a.x, b.z - a.z) + 1, 0.1, 1.8);
    seg.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
    seg.translate(px, 0.14, pz);
    walkGeos.push(seg);
    if (i % 6 === 0) lightPts.push(px - dx / dl * 1.4, 0.85, pz - dz / dl * 1.4);
    if (i % 4 === 0) {
      treePts.push({
        x: mx - dx / dl * (10 + rnd() * 6), z: mz - dz / dl * (10 + rnd() * 6),
        y: 0, s: 0.7 + rnd() * 0.8, pine: rnd() < 0.4,
      });
    }
  }
  const walkMesh = new THREE.Mesh(mergeGeometries(walkGeos),
    new THREE.MeshStandardMaterial({ color: 0xcbb98f, roughness: 1 }));
  walkMesh.receiveShadow = true;
  scene.add(walkMesh);
  buildTrees(treePts);
  if (lightPts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3));
    eastLakeLightMat = new THREE.PointsMaterial({
      color: 0xaad4ff, size: 1.2, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    scene.add(new THREE.Points(g, eastLakeLightMat));
  }
  for (let k = 0; k < 3; k++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.8 }));
    hull.position.y = 0.2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xd8cdb4, emissive: 0xffc873, emissiveIntensity: 0 }));
    cab.position.y = 0.62;
    lakeBoatGlow.push(cab.material);
    boat.add(hull, cab);
    let ax = 0, az = 0, tries = 0;
    do {
      ax = lakeC.x0 + rnd() * (lakeC.x1 - lakeC.x0);
      az = lakeC.z0 + rnd() * (lakeC.z1 - lakeC.z0);
      tries++;
    } while (!(waterIdx ? waterIdx.hit(ax, az) : GEO.pointInRing(ax, az, lake)) && tries < 40);
    lakeBoats.push({ g: boat, ax, az, ph: rnd() * 6.28, sp: 0.06 + rnd() * 0.06, r: 14 + rnd() * 20 });
    scene.add(boat);
  }
  addLabel('东湖', new THREE.Vector3(lakeC.x, 3, lakeC.z));
}
function updateEastLake(time) {
  for (const b of lakeBoats) {
    const a = b.ph + time * b.sp;
    b.g.position.set(b.ax + Math.cos(a) * b.r, 0.35 + Math.sin(time * 1.6 + b.ph) * 0.05, b.az + Math.sin(a) * b.r);
    b.g.rotation.y = -a - Math.PI / 2;
  }
}

// ---------- 汉口历史风貌区 ----------
function buildHankouHeritage(parsed) {
  let anchor = { x: 48, z: -931 };
  let found = null;
  for (const b of parsed.buildings) {
    let cx = 0, cz = 0;
    for (const q of b.ring) { cx += q.x; cz += q.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    if (Math.hypot(cx - 48, cz + 931) < 14 && (!found || b.areaM2 > found.areaM2)) found = b;
  }
  if (found) {
    let cx = 0, cz = 0;
    for (const q of found.ring) { cx += q.x; cz += q.z; }
    anchor = { x: cx / found.ring.length, z: cz / found.ring.length };
  }
  jianghanGu = buildJianghanGu();
  jianghanGu.position.set(anchor.x, 0, anchor.z);
  jianghanGu.rotation.y = Math.PI * 0.06;
  scene.add(jianghanGu);
  addLabel('江汉关', new THREE.Vector3(anchor.x, 16, anchor.z));

  const rnd = GEO.seededRand(5050);
  const specs = [
    { dx: 26, dz: -14, w: 5.2, d: 2.8, h: 2.4, dome: false, ry: 0.12 },
    { dx: 45, dz: -30, w: 6.0, d: 3.1, h: 3.0, dome: true, ry: -0.08 },
    { dx: 68, dz: -46, w: 4.6, d: 2.6, h: 2.2, dome: false, ry: 0.05 },
    { dx: 20, dz: -46, w: 5.6, d: 2.9, h: 2.7, dome: false, ry: -0.05 },
    { dx: 52, dz: -66, w: 5.0, d: 3.0, h: 2.5, dome: true, ry: 0.1 },
    { dx: 84, dz: -62, w: 4.2, d: 2.4, h: 2.1, dome: false, ry: 0.03 },
  ];
  for (const s of specs) {
    const b = buildOldBank(s.w, s.d, s.h, s.dome);
    const gx = anchor.x + s.dx, gz = anchor.z + s.dz;
    b.position.set(gx, GEO.terrainHeight(gx, gz), gz);
    b.rotation.y = s.ry;
    scene.add(b);
    if (b.userData.nightMats) heritageNightMats.push(...b.userData.nightMats);
  }
  addLabel('汉口历史风貌区', new THREE.Vector3(anchor.x + 55, 14, anchor.z - 45));
}

// ---------- 黄鹤楼公园闭环 ----------
function buildParkClosure(parsed) {
  const t = towerPosRef;
  if (!t) return;
  const R = 40;
  const gateAngles = [-0.35, 1.35];
  for (let k = 0; k < 34; k++) {
    const a = k / 34 * Math.PI * 2;
    let nearGate = false;
    for (const ga of gateAngles) {
      let d = Math.abs(a - ga); d = Math.min(d, Math.PI * 2 - d);
      if (d < 0.22) nearGate = true;
    }
    if (nearGate) continue;
    const wx = t.x + Math.cos(a) * R, wz = t.z + Math.sin(a) * R;
    const wy = GEO.terrainHeight(wx, wz);
    if (wy < 1) continue;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.15, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.9 }));
    seg.position.set(wx, wy + 0.35, wz);
    seg.rotation.y = -a + Math.PI / 2;
    seg.castShadow = true;
    scene.add(seg);
  }
  const gx = t.x + 150, gz = t.z + 34;
  const gy = GEO.terrainHeight(gx, gz);
  const wc = buildWhiteCloudPavilion();
  wc.position.set(gx, gy, gz);
  wc.rotation.y = Math.PI / 2;
  scene.add(wc);
  addLabel('白云阁', new THREE.Vector3(gx, gy + 15, gz));
}

// ---------- 三大火车站 ----------
function buildRailStations(parsed) {
  const defs = [
    { name: '汉口站', x: -980, z: -2119, ry: -2.2, build: buildHankouRailStation,
      info: '1903 年京汉铁路起点大智门车站的继承者，现为华中地区最大普速客运站之一。欧式站房气势恢宏，是汉口北部门户。' },
    { name: '武昌站', x: 538, z: 389, ry: -1.05, build: buildWuchangRailStation,
      info: '武昌站位于京广线上，1917 年通车的通湘门车站是其前身，2007 年改造为现代化客运站，武咸城际与京广铁路在此交汇。' },
    { name: '武汉站', x: 3243, z: -1681, ry: 0.62, build: buildWuhanRailStation,
      info: '2009 年建成的高铁枢纽，"千年鹤归"造型的流线型拱顶寓意黄鹤归来，是京广高铁的重要站点，中国第一座大型高铁站。' },
  ];
  for (const s of defs) {
    const st = s.build();
    st.position.set(s.x, 0, s.z);
    st.rotation.y = s.ry;
    if (s.name === '武汉站') st.scale.setScalar(1.5);


    st.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    scene.add(st);
    addLabel(s.name, new THREE.Vector3(s.x, 14, s.z));
    INFO[s.name] = s.info;
  }

  // —— 欢乐谷（武汉站旁）：摩天轮+过山车+旋转木马 ——
  {
    // 干地自适配：在原址附近搜索整片圆盘(r62+6)都不落水的重心
    let best = null, bestD = 1e9;
    for (let gx = 2750; gx <= 3300; gx += 25)
      for (let gz = -1650; gz <= -1050; gz += 25) {
        let ok = true;
        for (let a = 0; a < 12 && ok; a++) {
          const ang = a / 12 * Math.PI * 2;
          if (GEO.waterNear(gx + Math.cos(ang) * 62, gz + Math.sin(ang) * 62, 6, parsed.waters) ||
              GEO.waterNear(gx, gz, 6, parsed.waters)) ok = false;
        }
        if (ok) {
          const d = Math.hypot(gx - 2950, gz + 1330);
          if (d < bestD) { bestD = d; best = { x: gx, z: gz }; }
        }
      }
    const hx = best ? best.x : 2950, hz = best ? best.z : -1330;
    const hv = buildHappyValley();
    hv.position.set(hx, GEO.terrainHeight(hx, hz), hz);
    scene.add(hv);
    happyValley = hv;
    happyNightMats = hv.userData.nightMats || [];
    hv.userData.center = { x: hx, z: hz };
    INFO['欢乐谷'] = '武汉欢乐谷主题乐园，紧邻武汉站与东湖。园内摩天轮、过山车、旋转木马昼夜运转，夜间灯光璀璨。';
    addLabel('欢乐谷', new THREE.Vector3(hx, GEO.terrainHeight(hx, hz) + 44, hz));
  }
  // —— 青山工业角（武钢意象：烟囱群+大厂房棚）——
  {
    const ind = new THREE.Group();
    const chimM = new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 1 });
    for (const [ox, oz, h] of [[0, 0, 34], [16, 9, 30], [-14, 14, 27]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.6, h, 10), chimM);
      c.position.set(ox, h / 2, oz);
      c.castShadow = true;
      ind.add(c);
    }
    const shedM = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.9, metalness: 0.25 });
    for (const [ox, oz, w, d] of [[-34, -24, 46, 20], [28, -28, 30, 16], [10, 32, 52, 18]]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), shedM);
      sh.position.set(ox, 4.5, oz);
      sh.castShadow = true;
      ind.add(sh);
    }
    ind.position.set(2420, 0, -1520);
    scene.add(ind);
    INFO['青山'] = '青山区，因武钢而兴的工业城区，红砖职工住宅楼群与厂区烟囱是几代人的记忆，沿江布局 industrial 带与生态回填公园。';
    addLabel('青山', new THREE.Vector3(2450, 28, -1630));
  }
  // —— 五处江滩公园：滨江步道/草坪/树行/栈桥 + 游人 ——
  {
    const jtSpots = [
      { name: '汉口江滩', bbox: { x0: -150, x1: 800, z0: -1550, z1: -200 }, anchor: { x: 320, z: -800 }, seed: 11,
        info: '汉口江滩公园，"两江四岸"最经典的一段。芦苇、步道与老租界建筑隔堤相望，是武汉人宵夜、放风筝、看江景的城市客厅。' },
      { name: '武昌江滩', bbox: { x0: 80, x1: 950, z0: -1050, z1: -40 }, anchor: { x: 500, z: -350 }, seed: 23,
        info: '武昌江滩，与大堤口广场相连，遥望汉口天际线与长江大桥，夏夜江风是武昌人的集体记忆。' },
      { name: '汉阳江滩', bbox: { x0: -700, x1: -140, z0: -800, z1: -220 }, anchor: { x: -420, z: -520 }, seed: 37,
        info: '汉阳江滩，地处两江交汇的南岸嘴，大禹治水传说之地，晴川阁与铁门关近在咫尺。' },
      { name: '青山江滩', bbox: { x0: 1650, x1: 2950, z0: -1950, z1: -650 }, anchor: { x: 2500, z: -1300 }, seed: 51,
        info: '青山江滩，全国挑剔奖项拿捏者——缓坡式生态堤防，婚纱摄影胜地，工业记忆与江滩湿地共生。' },
      { name: '洪山江滩', bbox: { x0: -700, x1: 100, z0: 350, z1: 1200 }, anchor: { x: -260, z: 750 }, seed: 67,
        info: '洪山江滩（白沙洲片区），杨泗港大桥下游的新滨水绿带，陶瓷厂旧港蜕变而来。' },
    ];
    window.__jtInfo = [];
    for (const sp of jtSpots) {
      const jt = GEO.buildJiangtan({ waters: parsed.waters, anchor: sp.anchor, bbox: sp.bbox, seed: sp.seed });
      window.__jtInfo.push(sp.name + '=' + (jt ? 'ok' + jt.walkPts.length : 'null'));
      if (!jt) continue;
      scene.add(jt.group);
      INFO[sp.name] = sp.info;
      addLabel(sp.name, new THREE.Vector3(jt.centroid.x, 14, jt.centroid.z));
      // 游人：沿步道散步
      const N = Math.min(10, Math.max(4, Math.floor(jt.walkPts.length / 14)));
      for (let i = 0; i < N; i++) {
        jtWalkers.push({ pts: jt.walkPts, i: Math.random() * jt.walkPts.length, spd: 2.2 + Math.random() * 2.4 });
      }
    }
    // 欢乐谷广场游人（环广场）
    if (happyValley && happyValley.userData.center) {
      const c = happyValley.userData.center;
      const circle = [];
      for (let a = 0; a < 40; a++) {
        const ang = a / 40 * Math.PI * 2;
        circle.push({ x: c.x + Math.cos(ang) * 36, z: c.z + Math.sin(ang) * 36 });
      }
      for (let i = 0; i < 8; i++) jtWalkers.push({ pts: circle, i: Math.random() * circle.length, spd: 2.6 + Math.random() * 2 });
    }
    // 游人实例网格
    const cap = Math.max(1, jtWalkers.length);
    jtWalkerIM = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 1.0, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), cap);
    const palette = [0xd66a5a, 0x4a7fc1, 0xe0b23c, 0x5da05a, 0xc9c9d4, 0xb06ab8, 0xd88f4a];
    for (let i = 0; i < cap; i++) jtWalkerIM.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    jtWalkerIM.instanceColor.needsUpdate = true;
    jtWalkerIM.castShadow = true;
    jtWalkerIM.frustumCulled = false;
    scene.add(jtWalkerIM);
  }
  // —— 大学与梦时代 ——
  {
    const whu = buildWuhanUniversity();
    whu.position.set(1798, 0, 222);
    whu.rotation.y = 2.6;               // 校门朝西南（珞珈山路方向）
    scene.add(whu);
    campusNightMats.push(...(whu.userData.nightMats || []));
    INFO['武汉大学'] = '武汉大学，珞珈山麓、东湖之滨的中国最美大学。老图书馆雄踞樱顶，宋卿体育馆、樱园宿舍依山而建，三月樱花大道落英缤纷。';
    addLabel('武汉大学', new THREE.Vector3(1798, 24, 222));

    const wut = buildWUT();
    wut.position.set(1270, 0, 638);
    scene.add(wut);
    campusNightMats.push(...(wut.userData.nightMats || []));
    INFO['武汉理工大学'] = '武汉理工大学，教育部直属全国重点大学，材料科学与工程学科全国顶尖。马房山、南湖、余家头三大校区遍布武昌。';
    addLabel('武汉理工大学', new THREE.Vector3(1270, 20, 638));

    const msd = buildMengshidai();
    msd.position.set(1486, 0, 139);
    // 沿八一路走向摆放
    const bayi = parsed.roads.find(r => r.name === '八一路' && r.pts.some(p => Math.hypot(p.x - 1486, p.z - 139) < 90));
    if (bayi) {
      let bd = 1e9, bseg = null;
      for (let i = 0; i < bayi.pts.length - 1; i++) {
        const a = bayi.pts[i], b2 = bayi.pts[i + 1];
        const mx2 = (a.x + b2.x) / 2, mz2 = (a.z + b2.z) / 2;
        const d = Math.hypot(mx2 - 1486, mz2 - 139);
        if (d < bd) { bd = d; bseg = [a, b2]; }
      }
      if (bseg) msd.rotation.y = Math.atan2(-(bseg[1].z - bseg[0].z), bseg[1].x - bseg[0].x);
    }
    scene.add(msd);
    campusNightMats.push(...(msd.userData.nightMats || []));
    INFO['武商梦时代'] = '武商梦时代广场，建筑面积约80万平方米的全球最大纯商业综合体，室内滑雪场、主题乐园与商业街填满整栋巨盒，屋顶花园可眺望东湖。';
    addLabel('武商梦时代', new THREE.Vector3(1486, 26, 139));

    // 合成中心：号称洪山区第一高楼，梦时代西侧、石牌岭路口
    const hz = buildSupertall(70);
    hz.position.set(1385, 0, 55);
    hz.rotation.y = 0.35;
    scene.add(hz);
    INFO['合成中心'] = '合成中心，号称洪山区第一高楼的超高层地标，与武商梦时代隔街相望，是街道口-石牌岭商圈的天际线之巅。';
    addLabel('合成中心', new THREE.Vector3(1385, 82, 55));

    // 龙湖·天玺：石牌岭路上 50+ 层超高层住宅双塔
    const lhtx = buildLonghuTianxi();
    lhtx.position.set(1352, 0, 345);
    scene.add(lhtx);
    campusNightMats.push(...(lhtx.userData.nightMats || []));
    INFO['龙湖天玺'] = '龙湖·天玺，石牌岭路上的超高层住宅代表作，50 多层的塔楼拔地而起，是武昌老城最"夸张"的天际线之一。';
    addLabel('龙湖天玺', new THREE.Vector3(1362, 58, 345));

    // 洪山广场（省直机关楼群环绕）
    const hsq = buildHongshanSquare();
    hsq.position.set(1211, 0, 97);
    scene.add(hsq);
    campusNightMats.push(...(hsq.userData.nightMats || []));
    INFO['洪山广场'] = '洪山广场，武昌核心的城市客厅，周边环绕省直机关办公楼群。喷泉、鸽群与银杏是几代武汉人的记忆，中北路由此北去东湖。';
    addLabel('洪山广场', new THREE.Vector3(1211, 20, 97));

    // 楚河汉街（楚河 + 民国风商铺街）
    const chj = buildChuheHanjie();
    chj.position.set(1420, 0, -250);
    chj.rotation.y = 1.052;               // 街沿楚河走向（西南→东北）
    scene.add(chj);
    campusNightMats.push(...(chj.userData.nightMats || []));
    INFO['楚河汉街'] = '楚河汉街，人造楚河与民国建筑风格的商业步行街，号称"中国第一商业街"，白天灰墙黛瓦，夜里灯笼与店招彻夜通明。';
    addLabel('楚河汉街', new THREE.Vector3(1420, 18, -250));

    // 武汉理工大学多校区
    const wutNh = buildCampusSmall();
    wutNh.position.set(1187, 0, 887);
    scene.add(wutNh);
    campusNightMats.push(...(wutNh.userData.nightMats || []));
    INFO['理工南湖校区'] = '武汉理工大学南湖校区，与马房山本部隔珞狮南路相望，以航运、海事等学科见长。';
    addLabel('理工南湖校区', new THREE.Vector3(1187, 16, 887));

    const wutYjt = buildCampusSmall();
    wutYjt.position.set(1489, 0, -694);
    wutYjt.rotation.y = 1.6;              // 朝西面江
    scene.add(wutYjt);
    campusNightMats.push(...(wutYjt.userData.nightMats || []));
    INFO['理工余家头校区'] = '武汉理工大学余家头校区，雄踞青山江滩之畔，轮机工程与船舶学科在此伴江而生。';
    addLabel('理工余家头校区', new THREE.Vector3(1489, 16, -694));

    // —— 街道口商圈双商场 ——
    const wsm = buildMall('武 商 汇', { towerH: 30 });
    wsm.position.set(1195, 0, 175);
    scene.add(wsm);
    campusNightMats.push(...(wsm.userData.nightMats || []));
    INFO['武商汇'] = '武商汇（武商Mall街道口店），街道口商圈的旗舰购物中心之一，与武商梦时代同属武商集团。';
    addLabel('武商汇', new THREE.Vector3(1195, 44, 175));

    const qg = buildMall('群 光 广 场', { towerH: 24, tw: 19, color: 0xe8e4da });
    qg.position.set(1258, 0, 128);
    qg.rotation.y = -0.4;
    scene.add(qg);
    campusNightMats.push(...(qg.userData.nightMats || []));
    INFO['群光广场'] = '群光广场，台湾诚品集团在华中开设的大型百货，街道口人气地标，珞珈山下学生党的逛街记忆。';
    addLabel('群光广场', new THREE.Vector3(1258, 38, 128));

    // —— 中国地质大学（鲁磨路） ——
    const cug = buildCug();
    cug.position.set(1480, 0, 340);
    cug.rotation.y = 2.5;
    scene.add(cug);
    campusNightMats.push(...(cug.userData.nightMats || []));
    INFO['中国地质大学'] = '中国地质大学（武汉），历任校长多为地质巨擘，馆藏化石标本逾万件，逸夫博物馆是亚洲最大的地质博物馆之一。校园紧邻东湖与磨山。';
    addLabel('中国地质大学', new THREE.Vector3(1480, 22, 340));

    // —— 中南财经政法大学（南湖大道旁） ——
    const zuel = buildZuel();
    zuel.position.set(985, 0, 825);
    zuel.rotation.y = 1.35;
    scene.add(zuel);
    campusNightMats.push(...(zuel.userData.nightMats || []));
    INFO['中南财经政法大学'] = '中南财经政法大学，"五院四系"法学重镇与财经名校，南湖之滨的首义校区与南湖校区隔路相望。';
    addLabel('中南财经政法大学', new THREE.Vector3(985, 20, 825));

    // —— 四大医院 ——
    const tj = buildHospital('同 济 医 院', { towerH: 24, tw: 17 });
    tj.position.set(-2013, 0, -1054);
    tj.rotation.y = 2.2;
    scene.add(tj);
    campusNightMats.push(...(tj.userData.nightMats || []));
    INFO['同济医院'] = '华中科技大学同济医学院附属同济医院，1900 年由德国医师创办于上海、后迁汉口，亚洲级的医疗航母，儿科与器官移植全国顶尖。';
    addLabel('同济医院', new THREE.Vector3(-2013, 30, -1054));

    const xh = buildHospital('协 和 医 院', { towerH: 22, tw: 16 });
    xh.position.set(-288, 0, -1082);
    xh.rotation.y = -0.9;
    scene.add(xh);
    campusNightMats.push(...(xh.userData.nightMats || []));
    INFO['协和医院'] = '华中科技大学同济医学院附属协和医院，1866 年英国传教士杨格非创办的仁济医院演变而来，汉口最老牌的百年名院。';
    addLabel('协和医院', new THREE.Vector3(-288, 28, -1082));

    const lz = buildHospital('陆 军 总 医 院', { towerH: 18, tw: 14 });
    lz.position.set(911, 0, -83);
    lz.rotation.y = 1.8;
    scene.add(lz);
    campusNightMats.push(...(lz.userData.nightMats || []));
    INFO['陆总医院'] = '中国人民解放军中部战区总医院（原广州军区武汉总医院），武昌洪山脚下的军队大型综合医院，急症救治能力享誉华中。';
    addLabel('陆总医院', new THREE.Vector3(911, 24, -83));

    const zn = buildHospital('中南医院', { towerH: 26, tw: 18 });
    zn.position.set(1678, 0, 333);
    zn.rotation.y = -2.4;
    scene.add(zn);
    campusNightMats.push(...(zn.userData.nightMats || []));
    INFO['中南医院'] = '武汉大学中南医院，依东湖而建的三甲名院，放化疗中心与急救中心实力雄厚，与武大人民医院并称珞珈双璧。';
    addLabel('中南医院', new THREE.Vector3(1678, 32, 333));

    // —— 武汉天地（石库门里弄） ——
    const wtd = buildWuhanTiandi();
    wtd.position.set(264, 0, -1248);
    scene.add(wtd);
    campusNightMats.push(...(wtd.userData.nightMats || []));
    INFO['武汉天地'] = '武汉天地，卢汉铁路旧宅区改造的石库门风情街区，红砖里弄里藏着咖啡馆与米其林餐厅，汉口小资生活的代名词。';
    addLabel('武汉天地', new THREE.Vector3(264, 16, -1248));

    // —— 万达御湖世家（楚河汉街旁豪宅） ——
    const wdt = buildWandaTower();
    wdt.position.set(1486, 0, -28);
    wdt.rotation.y = 1.052;
    scene.add(wdt);
    campusNightMats.push(...(wdt.userData.nightMats || []));
    INFO['万达御湖世家'] = '万达御湖世家，楚河汉街旁的顶级豪宅小区，三栋超高层一线望楚河与东湖，是武昌改善置业的天花板之一。';
    addLabel('万达御湖世家', new THREE.Vector3(1486, 50, -28));

    // —— 极地海洋公园 ——
    const ocp = buildOceanPark();
    ocp.position.set(3020, 0, -1997);
    scene.add(ocp);
    campusNightMats.push(...(ocp.userData.nightMats || []));
    INFO['极地海洋公园'] = '武汉海昌极地海洋公园，白鲸、企鹅、北极熊齐聚的极地主题乐园，海豚表演场与巨型穹顶馆是孩子们的梦幻世界。';
    addLabel('极地海洋公园', new THREE.Vector3(3020, 20, -1997));

    // —— 园博园 ——
    const gye = buildGardenExpo();
    gye.position.set(-1294, 0, -1692);
    scene.add(gye);
    campusNightMats.push(...(gye.userData.nightMats || []));
    INFO['园博园'] = '武汉园博园，2015 年国际园林博览会会址，由金口垃圾填埋场生态修复而来，双温室穹顶与百座城市展园是江城绿肺。';
    addLabel('园博园', new THREE.Vector3(-1294, 18, -1692));

    // —— 盘龙城遗址 ——
    const plc = buildPanlongcheng();
    plc.position.set(-623, 0, -2857);
    scene.add(plc);
    INFO['盘龙城遗址'] = '盘龙城遗址，3500 年前商代方国都邑，"武汉城市之根"。夯土城垣与宫殿基址出土了大鼎与玉戈，考古工作仍在继续。';
    addLabel('盘龙城遗址', new THREE.Vector3(-623, 16, -2857));

    // —— 知音号（泊长江江心：横向扫描连续水面段） ——
    {
      let bx = null, bz = -980;
      if (waterIdx) {
        for (let x = 900; x > -200; x -= 10) {
          if (waterIdx.hit(x, bz) && waterIdx.hit(x - 25, bz) && waterIdx.hit(x + 25, bz) &&
              waterIdx.hit(x, bz - 12) && waterIdx.hit(x, bz + 12)) {
            let ok = true;
            for (let k = 1; k <= 4 && ok; k++) {
              if (!waterIdx.hit(x - k * 10, bz)) ok = false;
            }
            if (ok) { bx = x - 25; break; }
          }
        }
      }
      if (bx === null) { bx = 430; }                      // 兜底：解析侧验证过的江心
      const zyh = buildZhiyinHao();
      zyh.position.set(bx, 0.35, bz);
      zyh.rotation.y = 1.22;                              // 船头顺江向
      scene.add(zyh);
      campusNightMats.push(...(zyh.userData.nightMats || []));
      INFO['知音号'] = '知音号，复原民国风情的长江漂移剧场游轮， 夜幕启航后全船化作沉浸式戏剧舞台，与两岸灯光秀互为风景。';
      addLabel('知音号', new THREE.Vector3(bx, 18, bz));
    }
  }
}

// ---------- LED 大屏 ----------
function buildLEDScreens(parsed) {
  const cands = parsed.buildings
    .filter(b => b.heightM > 42 && b.areaM2 > 1100)
    .sort((a, b) => b.heightM - a.heightM);
  const picked = [];
  for (const b of cands) {
    let cx = 0, cz = 0;
    for (const p of b.ring) { cx += p.x; cz += p.z; }
    cx /= b.ring.length; cz /= b.ring.length;
    if (Math.abs(cx) > 1050 || cz < -850 || cz > 1300) continue;
    if (picked.some(q => Math.hypot(q.x - cx, q.z - cz) < 90)) continue;
    picked.push({ b, x: cx, z: cz });
    if (picked.length >= 7) break;
  }
  if (!picked.length) return;
  const canvases = [];
  for (let k = 0; k < 3; k++) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 72;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    canvases.push({ c, ctx: c.getContext('2d'), tex });
  }
  picked.forEach((q, i) => {
    const cv = canvases[i % 3];
    const b = q.b;
    const h = b.heightM * GEO.SCALE;
    const w = Math.min(3.6, Math.max(2.2, Math.sqrt(b.areaM2) * GEO.SCALE * 0.14));
    const mat = new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, opacity: 0.96, fog: true });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.52), mat);
    const e = b.ring[0];
    let dx = e.x - q.x, dz = e.z - q.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    scr.position.set(e.x + dx * 0.35, h * 0.55, e.z + dz * 0.35);
    scr.rotation.y = Math.atan2(dx, dz);
    scene.add(scr);
    ledScreens.push({ cv: cv.c, ctx: cv.ctx, mat });
  });
}
function updateLEDScreens(dt, time) {
  ledClock += dt;
  if (ledClock < 0.12) return;
  ledClock = 0;
  for (const s of ledScreens) {
    const g = s.ctx, W = s.cv.width, H = s.cv.height;
    const hue = (time * 0.05) % 1;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `hsl(${(hue * 360) | 0},85%,55%)`);
    grad.addColorStop(0.5, `hsl(${((hue + 0.33) * 360) | 0},85%,45%)`);
    grad.addColorStop(1, `hsl(${((hue + 0.66) * 360) | 0},85%,55%)`);
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = grad;
    for (let k = 0; k < 3; k++) {
      const x = ((time * 40 + k * 55) % (W + 60)) - 30;
      g.fillRect(x, 8 + k * 6, 34, H - 16 - k * 12);
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    const tx = W - ((time * 30) % (W + 90));
    g.fillRect(tx, H - 12, 80, 6);
    s.mat.map.needsUpdate = true;
  }
}

// ---------- 小地图 ----------
function buildMiniMap(parsed) {
  const cv = document.getElementById('miniMap');
  if (!cv) return;
  cv.style.pointerEvents = 'auto';
  cv.style.cursor = 'crosshair';
  cv.addEventListener('pointerdown', e => {
    if (walk) return;
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const mz = (e.clientY - r.top) / r.height;
    const wx = MINI.x0 + mx * (MINI.x1 - MINI.x0);
    const wz = MINI.z0 + mz * (MINI.z1 - MINI.z0);
    stopTour();
    exitCruise();
    camTween = null;
    controls.enabled = true;
    camTween = { to: { pos: new THREE.Vector3(wx + 60, 130, wz + 90), target: new THREE.Vector3(wx, 0, wz) }, t: 0 };
    camTweenFrom = { pos: camera.position.clone(), target: controls.target.clone() };
    controls.autoRotate = false;
  });
  const W = cv.width, H = cv.height;
  miniBase = document.createElement('canvas');
  miniBase.width = W; miniBase.height = H;
  const g = miniBase.getContext('2d');
  g.fillStyle = 'rgba(16,24,30,0.88)';
  g.fillRect(0, 0, W, H);
  const tx = x => (x - MINI.x0) / (MINI.x1 - MINI.x0) * W;
  const tz = z => (z - MINI.z0) / (MINI.z1 - MINI.z0) * H;
  g.fillStyle = '#2d5a7a';
  for (const ring of parsed.waters) {
    if (ring.length < 25) continue;
    g.beginPath();
    g.moveTo(tx(ring[0].x), tz(ring[0].z));
    for (let i = 1; i < ring.length; i += 2) g.lineTo(tx(ring[i].x), tz(ring[i].z));
    g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(150,160,150,0.55)'; g.lineWidth = 0.6;
  let segs = 0;
  for (const r of parsed.roads) {
    if (r.kind !== 'primary' && r.kind !== 'trunk' && r.kind !== 'secondary') continue;
    if (segs++ > 2600) break;
    g.beginPath();
    g.moveTo(tx(r.pts[0].x), tz(r.pts[0].z));
    for (let i = 1; i < r.pts.length; i++) g.lineTo(tx(r.pts[i].x), tz(r.pts[i].z));
    g.stroke();
  }
  g.fillStyle = '#ffd060';
  const marks = [];
  if (towerPosRef) marks.push(towerPosRef);
  if (tvPosRef) marks.push(tvPosRef);
  for (const m of marks) {
    g.beginPath(); g.arc(tx(m.x), tz(m.z), 2.2, 0, 6.29); g.fill();
  }
  miniTimer = 0;
}
function updateMiniMap(dt) {
  const cv = document.getElementById('miniMap');
  if (!cv || !miniBase) return;
  miniTimer -= dt;
  if (miniTimer > 0) return;
  miniTimer = 0.25;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.drawImage(miniBase, 0, 0);
  const tx = x => (x - MINI.x0) / (MINI.x1 - MINI.x0) * W;
  const tz = z => (z - MINI.z0) / (MINI.z1 - MINI.z0) * H;
  const cx = tx(camera.position.x), cz = tz(camera.position.z);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const ang = Math.atan2(dir.x, -dir.z);
  g.save();
  g.translate(cx, cz);
  g.rotate(ang);
  g.fillStyle = '#ff5040';
  g.beginPath();
  g.moveTo(0, -5.5); g.lineTo(3.6, 4.5); g.lineTo(0, 2.4); g.lineTo(-3.6, 4.5);
  g.closePath(); g.fill();
  g.restore();
}

// ---------- 巡游路径 ----------
function buildTourPath() {
  const t = towerPosRef, v = tvPosRef || { x: -360, z: -170 };
  const ty = GEO.terrainHeight(t.x, t.z);
  tourCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(520, 330, 860),
    new THREE.Vector3(160, 130, 470),
    new THREE.Vector3(60, 30, 170),
    new THREE.Vector3(-360, 16, 470),
    new THREE.Vector3(-580, 26, 180),
    new THREE.Vector3(-380, 34, -30),
    new THREE.Vector3(-140, 3.2, -190),
    new THREE.Vector3(t.x + 46, ty + 16, t.z + 44),
    new THREE.Vector3(t.x + 130, ty + 34, t.z - 60),
    new THREE.Vector3(v.x - 70, 46, v.z + 60),
    new THREE.Vector3(150, 26, -1250),
    new THREE.Vector3(420, 90, -1650),
    new THREE.Vector3(-80, 180, -1450),
    new THREE.Vector3(60, 200, -420),
  ], true, 'catmullrom', 0.25);
}
function stopTour() {
  if (!tour) return;
  tour = null;
  controls.enabled = true;
  const b = document.getElementById('tourBtn');
  if (b) b.textContent = '🎥 空中巡游';
}

// ---------- 灯光秀扫光 ----------
function addRunner(fn, speed, size, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.4, size * 0.4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  scene.add(m);
  lightRunners.push({ fn, speed, mesh: m, off: Math.random() });
}
function initLightRunners() {
  if (bridgeARef) {
    const a = bridgeARef, u = bridgeURef, L = bridgeLenRef;
    addRunner(f => new THREE.Vector3(a.x + u.x * f * L, 9.6, a.z + u.z * f * L), 0.10, 1.5, 0xfff0b0);
    addRunner(f => new THREE.Vector3(a.x + u.x * (1 - f) * L, 9.6, a.z + u.z * (1 - f) * L), 0.07, 1.2, 0x8fd8ff);
  }
  addRunner(f => new THREE.Vector3(470, 4 + f * 96, -250), 0.16, 1.3, 0xffb060);
  addRunner(f => new THREE.Vector3(470, 100 - f * 96, -250), 0.11, 1.0, 0x9fffd0);
  addRunner(f => new THREE.Vector3(-688 + f * 566, 11 + Math.sin(f * Math.PI) * 5.5, 455), 0.09, 1.2, 0xffc0e0);
}
function updateLightRunners(time, nightK) {
  for (const r of lightRunners) {
    const f = (time * r.speed + r.off) % 1;
    r.mesh.position.copy(r.fn(f));
    r.mesh.material.opacity = nightK * 0.95;
  }
}

// ---------- 漫游（第一人称 + 碰撞 + 水域阻挡） ----------
function enterWalk() {
  stopTour();
  exitCruise();
  walk = { keys: new Set(), dragging: false, lx: 0, ly: 0 };
  controls.enabled = false;
  camera.near = 0.08;
  camera.updateProjectionMatrix();
  const gy = Math.max(GEO.terrainHeight(camera.position.x, camera.position.z), 0);
  camera.position.y = gy + 0.55;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const yaw = Math.atan2(-dir.x, -dir.z);
  walk.yaw = yaw; walk.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  $('walkBtn').textContent = '🚶 退出漫游';
  $('walkHint').style.display = 'block';
}
function exitWalk() {
  walk = null;
  camera.near = 1;
  camera.updateProjectionMatrix();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  controls.target.copy(camera.position).addScaledVector(dir, 12);
  controls.enabled = true;
  $('walkBtn').textContent = '🚶 街景漫游';
  $('walkHint').style.display = 'none';
}
function setupWalk() {
  $('walkBtn').addEventListener('click', () => walk ? exitWalk() : enterWalk());
  window.addEventListener('keydown', e => {
    if (!walk) return;
    if (e.key === 'Escape') { exitWalk(); return; }
    walk.keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', e => { if (walk) walk.keys.delete(e.key.toLowerCase()); });
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => {
    if (!walk) return;
    walk.dragging = true; walk.lx = e.clientX; walk.ly = e.clientY;
  });
  window.addEventListener('pointermove', e => {
    if (!walk || !walk.dragging) return;
    walk.yaw -= (e.clientX - walk.lx) * 0.0035;
    walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - walk.ly) * 0.003, -1.2, 1.2);
    walk.lx = e.clientX; walk.ly = e.clientY;
  });
  window.addEventListener('pointerup', () => { if (walk) walk.dragging = false; });
}
function updateWalk(dt) {
  if (!walk) return;
  const e = new THREE.Euler(walk.pitch, walk.yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(e);
  const f = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const mv = new THREE.Vector3();
  if (walk.keys.has('w') || walk.keys.has('arrowup')) mv.add(f);
  if (walk.keys.has('s') || walk.keys.has('arrowdown')) mv.sub(f);
  if (walk.keys.has('d') || walk.keys.has('arrowright')) mv.add(r);
  if (walk.keys.has('a') || walk.keys.has('arrowleft')) mv.sub(r);
  if (mv.lengthSq() > 0) {
    const sp = (walk.keys.has('shift') ? 4.5 : 2.0);
    mv.normalize().multiplyScalar(sp * dt);
    let nx = camera.position.x + mv.x, nz = camera.position.z + mv.z;
    if (walkColliders) [nx, nz] = walkColliders.resolve(nx, nz, 0.42);
    if (waterIdx && waterIdx.hit(nx, nz)) { nx = camera.position.x; nz = camera.position.z; }
    camera.position.x = nx; camera.position.z = nz;
  }
  const gy = Math.max(GEO.terrainHeight(camera.position.x, camera.position.z), 0);
  camera.position.y = gy + 0.55;
}

// ---------- 登船夜游 ----------
let cruiseBoat = null;
function enterCruise() {
  stopTour();
  if (walk) exitWalk();
  cruiseBoat = boats.filter(b => b.userData && b.userData.speed <= 0.0095)[0] || boats[0];
  if (!cruiseBoat) return;
  controls.enabled = false;
  camera.near = 0.1;
  camera.updateProjectionMatrix();
  camTween = null;
  const h = $('walkHint');
  h.textContent = '🚢 已登船游览 · 相机随船行进 · 点击画面下船';
  h.style.display = 'block';
  const btn = document.querySelector('[data-cam="cruise"]');
  if (btn) btn.textContent = '⏹ 下船';
}
function exitCruise() {
  if (!cruiseBoat) return;
  cruiseBoat = null;
  camera.near = 1;
  camera.updateProjectionMatrix();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  controls.target.copy(camera.position).addScaledVector(dir, 14);
  controls.enabled = true;
  $('walkHint').style.display = 'none';
  const btn = document.querySelector('[data-cam="cruise"]');
  if (btn) btn.textContent = '🚢 夜游长江';
}
function updateCruise(time) {
  if (!cruiseBoat || !riverCurve) return;
  const ud = cruiseBoat.userData;
  const t = (time * ud.speed + ud.t0) % 1;
  const p = riverCurve.getPointAt(t);
  const ahead = riverCurve.getPointAt((t + 0.012) % 1);
  let fx = ahead.x - p.x, fz = ahead.z - p.z;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl; fz /= fl;
  camera.position.set(
    p.x + fx * 1.9,
    2.35 + Math.sin(time * 1.7) * 0.06,
    p.z + fz * 1.9);
  camera.lookAt(ahead.x, 1.4 + Math.sin(time * 1.1) * 0.3, ahead.z);
  camera.rotateZ(Math.sin(time * 1.3) * 0.02);
}

// ---------- 建筑点击 ----------
const pickRay = new THREE.Raycaster();
const pickNDC = new THREE.Vector2();
let pickHL = null, pickHLTimer = 0;
function setupBuildingPick() {
  renderer.domElement.addEventListener('pointerdown', e => { pickDown = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (walk || tour || !window.__dbg || !window.__dbg.buildings) return;
    const dx = e.clientX - (pickDown ? pickDown[0] : e.clientX);
    const dy = e.clientY - (pickDown ? pickDown[1] : e.clientY);
    if (dx * dx + dy * dy > 36) return;
    const r = renderer.domElement.getBoundingClientRect();
    pickNDC.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pickRay.setFromCamera(pickNDC, camera);
    let pt = null;
    if (window.__dbg.cityGroup) {
      const hits = pickRay.intersectObjects(window.__dbg.cityGroup.children, false);
      if (hits.length) pt = hits[0].point;
    }
    if (!pt) {
      pt = new THREE.Vector3();
      if (!pickRay.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) return;
    }
    const hit = window.__dbg.buildings.find(b => GEO.pointInRing(pt.x, pt.z, b.ring));
    if (!hit) return;
    const nm = hit.tags && (hit.tags.name || hit.tags['building']);
    const nmCn = nm && /[\u4e00-\u9fa5]/.test(nm) ? nm : '';
    const lv = hit.tags && hit.tags['building:levels'];
    $('infoTitle').textContent = nmCn || '建筑';
    $('infoDesc').textContent =
      (hit.fill ? '程序生成沿街建筑' : 'OpenStreetMap 建筑') +
      '\n高度约 ' + Math.round(hit.heightM) + ' 米' +
      (lv ? '\n楼层标注 ' + lv + ' 层' : '') +
      (nmCn ? '' : '\n（该楼在 OSM 中未命名）');
    $('info').style.display = 'block';
    if (pickHL) { scene.remove(pickHL); pickHL = null; }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of hit.ring) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
      z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
    }
    const h = hit.heightM * GEO.SCALE;
    pickHL = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0 + 0.4, h + 0.4, z1 - z0 + 0.4)),
      new THREE.LineBasicMaterial({ color: 0xffd060 }));
    pickHL.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    scene.add(pickHL);
    pickHLTimer = 4;
  });
}

// ---------- UI ----------
function tweenTo(cam) {
  camTweenFrom = { pos: camera.position.clone(), target: controls.target.clone() };
  camTween = { to: cam, t: 0 };
  window.__ct = camTween; window.__ctf = camTweenFrom;   // 调试镜像
}
function setupUI() {
  setupWalk();
  setupBuildingPick();
  const shotBtn = document.getElementById('shotBtn');
  if (shotBtn) shotBtn.addEventListener('click', () => {
    composer.render();
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = 'wuhan-' + Date.now() + '.png';
    a.click();
  });
  const qBtn = document.getElementById('qBtn');
  let qLevel = 1;
  const applyQuality = () => {
    renderer.shadowMap.enabled = qLevel > 0;
    sun.castShadow = qLevel > 0;
    bloomPass.enabled = qLevel > 0;
    fxaaPass.enabled = qLevel > 0;
    if (gtaoPass) gtaoPass.enabled = qLevel === 2;
    renderer.setPixelRatio(qLevel === 0 ? 1 : Math.min(window.devicePixelRatio, 1.75));
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    if (qBtn) qBtn.textContent = ['🖥 流畅', '🎞 均衡', '✨ 高清'][qLevel];
  };
  if (qBtn) qBtn.addEventListener('click', () => { qLevel = (qLevel + 1) % 3; applyQuality(); });
  applyQuality();
  const fwBtn = document.getElementById('fwBtn');
  if (fwBtn) fwBtn.addEventListener('click', () => {
    fwActive = !fwActive;
    fwBtn.textContent = fwActive ? '🎆 停放' : '🎆 烟花';
    if (fwActive) {
      if (env.t < 0.45) { dayState.mode = 'manual'; dayState.tod = 0.955; }
      for (let k = 0; k < 4; k++) setTimeout(() => fwLaunch(fwSites[k % fwSites.length]), k * 220);
    }
  });
  const sndBtn = document.getElementById('sndBtn');
  if (sndBtn) sndBtn.addEventListener('click', () => {
    const on = Snd.toggle();
    sndBtn.textContent = on ? '🔊 音效' : '🔇 音效';
  });
  const tourBtn = document.getElementById('tourBtn');
  if (tourBtn) tourBtn.addEventListener('click', () => {
    if (tour) { stopTour(); return; }
    if (walk) exitWalk();
    exitCruise();
    if (!tourCurve) buildTourPath();
    controls.autoRotate = false;
    controls.enabled = false;
    camTween = null;
    tour = { t: 0 };
    tourBtn.textContent = '⏹ 停止巡游';
  });
  renderer.domElement.addEventListener('pointerdown', () => { stopTour(); exitCruise(); });
  const slider = $('timeSlider'), autoB = $('autoBtn');
  if (slider) {
    slider.addEventListener('input', () => {
      dayState.mode = 'manual';
      dayState.tod = slider.value / 1440;
      syncAutoBtn();
    });
  }
  const syncAutoBtn = () => {
    if (autoB) autoB.textContent = dayState.mode === 'auto' ? '🕐 自动' : '🕐 跟随';
  };
  if (autoB) autoB.addEventListener('click', () => {
    dayState.mode = dayState.mode === 'auto' ? 'manual' : 'auto';
    syncAutoBtn();
  });
  syncAutoBtn();
  document.querySelectorAll('[data-cam]').forEach(btn => {
    btn.addEventListener('click', () => {
      controls.autoRotate = false;
      if (btn.dataset.cam === 'cruise') {
        if (cruiseBoat) exitCruise(); else enterCruise();
        return;
      }
      exitCruise();
      const cam = CAMS[btn.dataset.cam];
      if (cam) tweenTo(cam);
    });
  });
  $('infoClose').addEventListener('click', () => $('info').style.display = 'none');
}

// ---------- 江面晨雾更新 / 东湖更新 / 动物更新已在上面 ----------

const lightShowStrips = [];

// ---------- 昼夜应用 ----------
const lerp = THREE.MathUtils.lerp;
function applyEnvironment(t, duskK = 0) {
  const duskSky = new THREE.Color(0xff9a5a), duskTop = new THREE.Color(0x6a4a72), duskHemi = new THREE.Color(0xffb27a);
  scene.background.lerpColors(DAY.horizon, NIGHT.horizon, t);
  scene.fog.color.copy(scene.background);
  skyMat.uniforms.topColor.value.lerpColors(DAY.top, NIGHT.top, t).lerp(duskTop, duskK * 0.55);
  skyMat.uniforms.bottomColor.value.lerpColors(DAY.horizon, NIGHT.horizon, t).lerp(duskSky, duskK * 0.7);
  scene.background.lerp(duskSky, duskK * 0.6);
  hemi.color.lerp(duskHemi, duskK * 0.4);
  hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, t);
  hemi.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, t);
  hemi.intensity = lerp(DAY.hemiI, NIGHT.hemiI, t);
  sun.color.lerpColors(DAY.sun, NIGHT.sun, t);
  sun.intensity = lerp(DAY.sunI, NIGHT.sunI, t);
  starMat.opacity = t * (1 - duskK * 0.4);
  cloudMat.color.lerpColors(new THREE.Color(0xffffff), new THREE.Color(0x2c3654), t);
  if (waterMat) waterMat.color.lerpColors(DAY.water, NIGHT.water, t);
  if (cityResiMat) cityResiMat.emissiveIntensity = t * 0.75;
  if (cityGlassMat) cityGlassMat.emissiveIntensity = t * 0.5;
  if (streetLightMat) streetLightMat.opacity = t * 0.85;
  if (streetHeadMat) streetHeadMat.emissiveIntensity = t * 2.4;
  if (trainWinMat) trainWinMat.emissiveIntensity = t * 1.4;
  if (vehLightMat) vehLightMat.emissiveIntensity = t * 2.6;
  if (bridgeGroup && bridgeGroup.userData.towerWinMat) bridgeGroup.userData.towerWinMat.emissiveIntensity = t * 1.5;
  if (bridgeLampMat) bridgeLampMat.emissiveIntensity = t * 3;
  if (viaductLampMat) viaductLampMat.emissiveIntensity = t * 3;
  if (suspensionNightMats) for (const m of suspensionNightMats) m.emissiveIntensity = t * 0.5;
  if (archNightMats) for (const m of archNightMats) m.emissiveIntensity = t * 0.5;
  for (const m of autoNightMats) m.emissiveIntensity = t * 0.6;
  for (const m of autoBridgeLampMats) m.emissiveIntensity = t * 3;
  if (bridgeErqiLampMat) bridgeErqiLampMat.emissiveIntensity = t * 3;
  if (tvPodMat) tvPodMat.emissiveIntensity = t * 1.5;
  if (towerSpot) towerSpot.intensity = t * 14000;
  for (const m of towerNightMats) m.emissiveIntensity = t * 1.1;
  for (const m of boatLightMats) m.emissiveIntensity = t * 2.2;
  if (eastLakeLightMat) eastLakeLightMat.opacity = t * 0.9;
  for (const m of lakeBoatGlow) m.emissiveIntensity = t * 1.4;
  if (riverGlintMat) riverGlintMat.opacity = 0.04 + t * 0.82;
  if (waterfrontMat) waterfrontMat.opacity = t * 0.9;
  bloomPass.strength = 0.14 + t * 0.72;
  if (scene.environmentIntensity !== undefined) scene.environmentIntensity = 1.0 - t * 0.62;
  for (const m of skylineGlowMats) m.emissiveIntensity = t * 2.0;
  for (const m of happyNightMats) m.emissiveIntensity = t * 1.9;
  for (const m of campusNightMats) m.emissiveIntensity = t * 1.3;
  for (const m of billNightMats) m.emissiveIntensity = t * 1.6;
  if (signsMatRef) signsMatRef.emissiveIntensity = t * 0.9;
  for (const m of skylineBeacons) m.emissiveIntensity = time % 1.2 < 0.6 ? 1.6 : 0.15;
  if (artGlowMat) artGlowMat.emissiveIntensity = t * 2.2;
  updateNavLights(time);
  updateSidewalkGuides(t);
  sunBall.visible = t < 0.5;
  moonBall.visible = t >= 0.5;
  for (const s of lightShowStrips) {
    s.material.opacity = t * 0.85;
    if (t > 0.02) {
      const hue = (s.userData.hue0 + time * 0.05) % 1;
      s.material.color.setHSL(hue, 0.85, 0.6);
    }
  }
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let time = 0;
let lastRenderT = 0;
let lastShadowTod = -1;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  // ---- 24h 昼夜循环 ----
  if (dayState.mode === 'auto') dayState.tod = (dayState.tod + dt * dayState.speed) % 1;
  {
    const sl = document.getElementById('timeSlider');
    if (sl && document.activeElement !== sl) sl.value = Math.round(dayState.tod * 1440);
    const lb = document.getElementById('timeLabel');
    if (lb) {
      const mins = Math.round(dayState.tod * 1440);
      lb.textContent = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    }
  }
  const sunA = (dayState.tod - 0.25) * Math.PI * 2;
  const elev = Math.sin(sunA);
  const dayK = THREE.MathUtils.clamp(elev * 2.4 + 0.06, 0, 1);
  const envTarget = 1 - dayK;
  env.t += (envTarget - env.t) * Math.min(1, dt * 2.5);
  const duskK = Math.exp(-Math.pow(elev / 0.16, 2)) * THREE.MathUtils.clamp((elev + 0.3) * 4, 0, 1);
  applyEnvironment(env.t, duskK);
  sunBall.position.set(Math.cos(sunA) * 2300, Math.sin(sunA) * 2000 + 50, 950);
  moonBall.position.set(-Math.cos(sunA) * 2300, -Math.sin(sunA) * 2000 + 50, -950);
  sunBall.visible = elev > -0.12;
  moonBall.visible = elev < 0.12;
  sunBall.material.color.setHSL(0.11, duskK * 0.85, 0.62 + (1 - duskK) * 0.16);
  // 阴影光源按 0.8° 步进更新：太阳球体照常连续移动，但投影用的方向光
  // 只在天区角步进足够时刷新，避免阴影贴图逐帧重算造成地面暗纹爬行闪烁
  if (lastShadowTod < 0 || Math.abs(dayState.tod - lastShadowTod) > 1 / 450) {
    lastShadowTod = dayState.tod;
    if (elev > 0.04) sun.position.copy(sunBall.position);
    else sun.position.copy(moonBall.position);
  }
  mwMat.opacity = env.t * 0.75;
  // 流星
  if (!meteor.active) {
    meteor.next -= dt;
    if (meteor.next <= 0 && env.t > 0.55) {
      meteor.active = true; meteor.t = 0;
      meteor.pos0.set((Math.random() - 0.5) * 2600, 1400 + Math.random() * 700, (Math.random() - 0.5) * 2600);
      meteor.vel.set(-(400 + Math.random() * 350), -520 - Math.random() * 260, (Math.random() - 0.5) * 380);
      meteor.mesh.visible = true;
    }
  } else {
    meteor.t += dt;
    const k = meteor.t / meteor.life;
    meteor.mesh.position.copy(meteor.pos0).addScaledVector(meteor.vel, meteor.t);
    const dir = meteor.vel.clone().normalize();
    meteor.mesh.lookAt(meteor.mesh.position.clone().add(dir));
    meteor.mesh.material.opacity = Math.sin(Math.PI * Math.min(1, k)) * env.t;
    if (k >= 1) { meteor.active = false; meteor.mesh.visible = false; meteor.next = 6 + Math.random() * 15; }
  }
  // 灯光秀
  updateLightRunners(time, THREE.MathUtils.clamp((env.t - 0.55) * 3, 0, 1));
  if (env.t > 0.55) {
    const hue = (time * 0.02) % 1;
    bridgeLampMat.emissive.setHSL(hue, 0.9, 0.62);
    if (viaductLampMat) viaductLampMat.emissive.setHSL(hue, 0.9, 0.62);
    if (bridgeErqiLampMat) bridgeErqiLampMat.emissive.setHSL((hue + 0.5) % 1, 0.9, 0.62);
  }
  // 相机飞行
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 1.4);
    const k = camTween.t < 0.5 ? 2 * camTween.t ** 2 : 1 - (-2 * camTween.t + 2) ** 2 / 2;
    camera.position.lerpVectors(camTweenFrom.pos, camTween.to.pos, k);
    controls.target.lerpVectors(camTweenFrom.target, camTween.to.target, k);
    if (camTween.t >= 1) camTween = null;
  }
  // 桥上火车 + 炊烟
  if (bridgeGroup) {
    const L = bridgeGroup.userData.L;
    for (const tr of bridgeTrains) {
      const span = Math.max(20, L - 16 - (tr.n - 1) * tr.gap);
      const tri = Math.abs(((time * tr.speed + tr.phase) % (2 * span)) - span);
      tr.grp.children.forEach((car, i) => { car.position.x = 8 + tri + i * tr.gap; });
    }
    for (const p of trainSmokes) {
      const prog = (time * 0.45 + p.userData.phase) % 1;
      p.position.set(0.9 + prog * 0.5, 1.3 + prog * 1.8, 0);
      p.scale.setScalar(0.5 + prog * 1.6);
      p.material.opacity = 0.45 * (1 - prog);
    }
  }
  // 桥上汽车
  for (const car of bridgeCars) {
    car.position.x += car.userData.speed * car.userData.dir * dt;
    const L = bridgeGroup.userData.L;
    if (car.position.x > L - 3) car.position.x = 3;
    if (car.position.x < 3) car.position.x = L - 3;
  }
  // 游船
  if (riverCurve) for (const boat of boats) {
    const dir = boat.userData.dir || 1;
    const t = ((time * boat.userData.speed * dir + boat.userData.t0) % 1 + 1) % 1;
    const pos = riverCurve.getPointAt(t);
    // 分道：上水船沿切线左法向偏移 11u（内河各自靠右行驶）
    const tan = riverCurve.getTangentAt(t);
    const side = (dir === -1) ? 11 : 0;
    boat.position.set(pos.x - tan.z * side, 0.5 + Math.sin(time * 2 + t * 20) * 0.08, pos.z + tan.x * side);
    const ahead = riverCurve.getPointAt((t + 0.004 * dir) % 1);
    boat.rotation.y = Math.atan2(ahead.x - pos.x, ahead.z - pos.z) - Math.PI / 2;
  }
  // 欢乐谷：摩天轮 / 旋转木马 / 过山车
  if (happyValley) {
    const u = happyValley.userData;
    if (u.wheel) {
      u.wheel.rotation.z += dt * 0.12;
      for (const h of u.holders) h.rotation.z = -u.wheel.rotation.z;
    }
    if (u.carousel) u.carousel.rotation.y += dt * 0.3;
    for (let i = 0; i < u.coaster.cars.length; i++) {
      const ct = (time * 0.028 + i / u.coaster.cars.length) % 1;
      const pos = u.coaster.curve.getPointAt(ct);
      const ahead = u.coaster.curve.getPointAt((ct + 0.012) % 1);
      const car = u.coaster.cars[i];
      car.position.set(pos.x, pos.y + 0.55, pos.z);
      car.lookAt(ahead.x, ahead.y + 0.55, ahead.z);
    }
  }
  // 江滩/广场游人
  if (jtWalkerIM) {
    for (let i = 0; i < jtWalkers.length; i++) {
      const w = jtWalkers[i];
      w.i = (w.i + w.spd * dt * 0.55) % w.pts.length;
      const i0 = Math.floor(w.i), i1 = (i0 + 1) % w.pts.length;
      const f = w.i - i0;
      const a = w.pts[i0], b = w.pts[i1];
      const px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f;
      jtTmp.position.set(px, 0.95 + Math.sin(time * 9 + i * 1.7) * 0.05, pz);
      jtTmp.lookAt(b.x, jtTmp.position.y, b.z);
      jtTmp.updateMatrix();
      jtWalkerIM.setMatrixAt(i, jtTmp.matrix);
    }
    jtWalkerIM.instanceMatrix.needsUpdate = true;
  }
  // 塔吊臂缓转
  for (const cr of cranes) if (cr.userData.jib) cr.userData.jib.rotation.y += dt * cr.userData.spin;
  updateFireworks(dt);
  Snd.update(dt, camera.position, env.t);
  updateMorningFog(dt);
  updateMiniMap(dt);
  updateObstructionLights(time);
  updateTrafficLights(time);
  if (pickHL && pickHLTimer > 0) { pickHLTimer -= dt; if (pickHLTimer <= 0) { scene.remove(pickHL); pickHL = null; } }
  updateAnimals(time);
  updateLEDScreens(dt, time);
  updateFerry(dt, time);
  updatePedestrians(dt, time);
  updateTraffic(dt);
  updateAerial(dt, time);
  updateEastLake(time);
  updateCruise(time);
  // 江面波光闪烁
  if (riverGlintMat) { /* opacity 由昼夜控制 */ }
  // 法线水流动
  if (waterMat && waterMat.normalMap) {
    waterMat.normalMap.offset.x = time * 0.006;
    waterMat.normalMap.offset.y = time * 0.004;
  }
  // 活水：江面微波
  if (waterMeshRef && waterBasePos) {
    const pa = waterMeshRef.geometry.attributes.position;
    const arr = pa.array, n = pa.count;
    for (let i = 0; i < n; i++) {
      const x = waterBasePos[i * 3], z = waterBasePos[i * 3 + 2];
      arr[i * 3 + 1] = waterBasePos[i * 3 + 1]
        + Math.sin(x * 0.16 + time * 0.9) * 0.05
        + Math.sin(z * 0.21 + time * 0.6) * 0.04;
    }
    pa.needsUpdate = true;
    waterMeshRef.geometry.computeVertexNormals();
  }
  // 空中巡游
  if (tour && tourCurve) {
    tour.t = (tour.t + dt / 85) % 1;
    camera.position.copy(tourCurve.getPointAt(tour.t));
    const ahead = tourCurve.getPointAt((tour.t + 0.016) % 1);
    controls.target.lerp(ahead, 0.12);
    camera.lookAt(controls.target);
  }
  updateWalk(dt);
  // NaN 守卫
  if (!isFinite(camera.position.x + camera.position.y + camera.position.z)) {
    camera.position.set(
      (isFinite(controls.target.x) ? controls.target.x : 0) + 400,
      260,
      (isFinite(controls.target.z) ? controls.target.z : 0) + 500);
    controls.target.set(isFinite(controls.target.x) ? controls.target.x : 0, 0, isFinite(controls.target.z) ? controls.target.z : -100);
  }
  if (!isFinite(controls.target.x + controls.target.y + controls.target.z)) {
    controls.target.set(0, 0, -100);
  }
  if (!tour && !walk && !cruiseBoat) controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
  lastRenderT = time;
}
animate();

// 后台标签页兜底渲染帧（同时推进相机缓动，后台点击标签也能飞）
setInterval(() => {
  if (document.hidden || (performance.now() / 1000 - lastRenderT) > 2.5) {
    try {
      if (camTween) {
        camTween.t = Math.min(1, camTween.t + 0.5);
        const k = camTween.t < 0.5 ? 2 * camTween.t ** 2 : 1 - (-2 * camTween.t + 2) ** 2 / 2;
        camera.position.lerpVectors(camTweenFrom.pos, camTween.to.pos, k);
        controls.target.lerpVectors(camTweenFrom.target, camTween.to.target, k);
        if (camTween.t >= 1) camTween = null;
      }
      composer.render(); labelRenderer.render(scene, camera); lastRenderT = performance.now() / 1000;
    } catch (e) {}
  }
}, 2500);

// ---------- 云 ----------
function updateClouds(dt) {
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 1400) c.position.x = -1400;
  }
}
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  if (gtaoPass) gtaoPass.setSize(window.innerWidth, window.innerHeight);
  updateFXAA();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

window.__M4 = true;
boot().catch(e => {
  console.error(e);
  const el = $('err');
  el.style.display = 'grid';
  el.textContent = '场景加载失败：' + (e && e.message ? e.message : e);
});

// 云动画注入（避免重构 animate）
(function cloudLoop() {
  setTimeout(() => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * 0.016;
      if (c.position.x > 1400) c.position.x = -1400;
    }
    cloudLoop();
  }, 16);
})();
