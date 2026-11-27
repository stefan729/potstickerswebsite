/* =========================================================
   金煎堂｜3D 巷口街景
   黃昏的巷口：路人來來往往、客人走進店裡用餐、
   外帶窗口排隊買鍋貼，師傅在鐵板前現煎。

   - Three.js r170（CDN），捲動到區塊附近才下載，不拖慢首頁
   - 離開畫面或切換分頁時自動暫停
   - 系統設定「減少動態效果」時只顯示靜態畫面
========================================================= */

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
  'https://unpkg.com/three@0.170.0/build/three.module.min.js',
];

const rootEl = document.getElementById('street3d');
if (rootEl) lazyBoot(rootEl);

function lazyBoot(el) {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    el.dataset.state = 'loading';
    loadThree()
      .then((THREE) => createStreet(THREE, el))
      .catch((err) => {
        console.warn('[street3d] 3D 街景無法啟動：', err);
        el.dataset.state = 'error';
      });
  };
  if (!('IntersectionObserver' in window)) { start(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '400px 0px' });
  io.observe(el);
}

async function loadThree() {
  let lastErr;
  for (const url of THREE_URLS) {
    try { return await import(url); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* ---------- 小工具 ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, t, step) => (v < t ? Math.min(v + step, t) : Math.max(v - step, t));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turnToward = (a, b, step) => a + clamp(wrapAngle(b - a), -step, step);
const shadeHex = (hex, f) => {
  const ch = (s) => clamp(Math.round(((hex >> s) & 255) * f), 0, 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
};

const SERIF = '"Noto Serif TC", "Noto Serif CJK TC", "Source Han Serif TC", "PMingLiU", serif';
const SANS = '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const text = '金煎堂現煎鍋貼水餃酸辣湯今日手工包茶SINCE1995$0123456789·';
  await Promise.race([
    Promise.all([
      document.fonts.load(`900 64px ${SERIF}`, text),
      document.fonts.load(`700 32px ${SANS}`, text),
    ]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
}

/* ---------- 配色 ---------- */
const SKIN = [0xF3D2B3, 0xEBC09A, 0xD9A47A, 0xB97F55, 0x8A5A3C];
const HAIR = [0x2A1C14, 0x1F1A17, 0x3B2A22, 0x5E3B26, 0x8B5A36, 0xB9B1A8];
const TOPS = [0xD9792B, 0xB85F1A, 0x5A3F2F, 0x7D8F69, 0x4F6D7A, 0xC9A04A, 0xA4473B, 0x8E6E5A, 0x2F5D62, 0x6B5B95, 0xE0A458, 0xEDE6DA, 0x9DB4C0];
const BOTTOMS = [0x2A1C14, 0x3E2A1F, 0x34445E, 0x56483D, 0x6E655C, 0x253041, 0x7A5A43];
const SKIRTS = [0xA4473B, 0xC9A04A, 0x7D8F69, 0x34445E, 0x2A1C14];
const SHOES = [0x1E1A18, 0x3E2A1F, 0xF4EEE6, 0x8C6D5A, 0xA4473B];
const CAPS = [0xD9792B, 0x2F5D62, 0x3E2A1F, 0xA4473B, 0xEDE6DA];
const PACKS = [0x3E2A1F, 0x4F6D7A, 0xA4473B, 0xC9A04A, 0x2A1C14];
const HELMETS = [0xEDE6DA, 0xD9792B, 0x2A1C14, 0x4F6D7A, 0xA4473B];
const SCOOTER_COLORS = [0xEDE6DA, 0xD9792B, 0x7D8F69, 0x9DB4C0, 0xA4473B, 0x3E2A1F];
const LINES = ['好香！', '讚！', '再來一盒', '外酥內嫩～', '今天，貼一下！', '還是這家最好吃'];

/* ---------- 場景配置（單位：公尺） ---------- */
const SW = 0.15;                       // 人行道高度
const LANES = [1.9, 2.7, 3.5];         // 人行道上的行走線（z）
const DOOR_X = 2.27;                   // 店門口中心 x
const BACK_DOOR = { x: 3.15, z: -5.4 }; // 店內後方門簾
const QUEUE = { x0: -1.5, z: 0.85, gap: 0.8 };
const GRIDDLE = { x: -1.3, y: 1.42, z: -0.55 };
const TABLES = [{ x: 1.6, z: -1.95 }, { x: 2.9, z: -3.65 }];
const SEATS = [
  { x: 1.02, z: -1.95, yaw: Math.PI / 2 },
  { x: 2.18, z: -1.95, yaw: -Math.PI / 2 },
  { x: 2.32, z: -3.65, yaw: Math.PI / 2 },
  { x: 3.48, z: -3.65, yaw: -Math.PI / 2 },
];
const ROAD_LANES = { east: 6.3, west: 7.2 };

/* =========================================================
   建立 3D 街景
========================================================= */
async function createStreet(THREE, el) {
  const stage = el.querySelector('.st3d-stage');
  const hint = el.querySelector('.st3d-hint');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = el.clientWidth < 640;

  await loadFonts();

  /* ---------- Renderer / Scene / Camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xE39A62, 30, 80);

  const FOV = 35;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 160);
  const camTarget = new THREE.Vector3(0, 3.0, 1.2);
  const view = { dist: 18.5, pitch: 0.16, tanHalf: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) };

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* ---------- 材質 / 幾何快取 ---------- */
  const matCache = new Map();
  const M = (color) => {
    let m = matCache.get(color);
    if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(color, m); }
    return m;
  };
  const tex = (cv, { repeat } = {}) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  };
  const geoCache = new Map();
  const boxGeo = (w, h, d) => {
    const k = `${w}|${h}|${d}`;
    let g = geoCache.get(k);
    if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
    return g;
  };
  function put(mesh, x, y, z, { cast = true, receive = true, parent = scene } = {}) {
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    return mesh;
  }
  const box = (w, h, d, mat, x, y, z, o) => put(new THREE.Mesh(boxGeo(w, h, d), mat), x, y, z, o);
  const cyl = (rt, rb, h, seg, mat, x, y, z, o) => put(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), x, y, z, o);

  /* ---------- 光線（黃昏） ---------- */
  scene.add(new THREE.HemisphereLight(0xFFE0BD, 0x4A3326, 1.3));
  const sun = new THREE.DirectionalLight(0xFFC48A, 2.5);
  sun.position.set(-16, 17, 15);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 15, bottom: -12, near: 1, far: 70 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const kitchenLight = new THREE.PointLight(0xFFB466, 10, 9, 2);
  kitchenLight.position.set(-1.7, 2.9, -1.1);
  const diningLight = new THREE.PointLight(0xFFB466, 10, 10, 2);
  diningLight.position.set(2.25, 2.9, -2.3);
  scene.add(kitchenLight, diningLight);

  /* ---------- 共用貼圖 ---------- */
  const glowTex = tex(radialCanvas(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.35)'));
  const puffTex = tex(radialCanvas(64, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.5)'));
  const blobTex = tex(radialCanvas(64, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)'));
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x2A1C14, transparent: true, opacity: 0.38, depthWrite: false });

  const glow = (color, size, x, y, z, opacity = 0.75, parent = scene) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity,
    }));
    s.scale.set(size, size, 1);
    s.position.set(x, y, z);
    parent.add(s);
    return s;
  };

  /* =========================================================
     地面：馬路、人行道、路緣
  ========================================================= */
  {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshLambertMaterial({ map: tex(roadCanvas(), { repeat: [50, 15] }) }));
    road.rotation.x = -Math.PI / 2;
    put(road, 0, 0, 34.4, { cast: false });

    const walkMat = new THREE.MeshLambertMaterial({ map: tex(sidewalkCanvas(), { repeat: [100, 2.2] }) });
    box(200, SW, 4.4, walkMat, 0, SW / 2, 2.2, { cast: false });
    box(200, SW + 0.02, 0.16, M(0xBFA98C), 0, (SW + 0.02) / 2, 4.42, { cast: false });

    // 機車停車格與路邊白線
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xE9DFCF, transparent: true, opacity: 0.75 });
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(200, 0.1), lineMat);
    edge.rotation.x = -Math.PI / 2;
    put(edge, 0, 0.012, 5.95, { cast: false, receive: false });
    const stallGeo = new THREE.PlaneGeometry(0.06, 1.45);
    const stalls = new THREE.InstancedMesh(stallGeo, lineMat, 16);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    let n = 0;
    for (const [from, to] of [[-12.6, -8.8], [5.9, 9.0]]) {
      for (let x = from; x <= to + 0.01 && n < 16; x += 0.78) {
        m4.compose(new THREE.Vector3(x, 0.012, 5.22), q, new THREE.Vector3(1, 1, 1));
        stalls.setMatrixAt(n++, m4);
      }
    }
    stalls.count = n;
    scene.add(stalls);
  }

  /* =========================================================
     金煎堂店面
  ========================================================= */
  const wood = M(0x5A3F2F);
  const woodDark = M(0x3E2A1F);
  const noren = [];
  const lanterns = [];
  let griddleBits;

  {
    // 二樓牆面（含窗戶貼圖）
    const upper = shopUpperCanvas();
    const upperMat = new THREE.MeshLambertMaterial({
      map: tex(upper.color), emissive: 0xffffff, emissiveMap: tex(upper.emit), emissiveIntensity: 0.9,
    });
    const sideMat = M(0xE3CFB2);
    const roofMat = M(0x6E5444);
    put(new THREE.Mesh(boxGeo(8.3, 3.55, 6.2), [sideMat, sideMat, roofMat, sideMat, upperMat, sideMat]), 0, 3.75 + 1.775, -3.1);

    // 屋頂女兒牆與水塔
    box(8.5, 0.35, 0.45, woodDark, 0, 7.47, -0.15);
    box(8.5, 0.35, 0.3, woodDark, 0, 7.47, -6.1);
    const tank = M(0xC9C1B5);
    cyl(0.55, 0.55, 1.1, 16, tank, -2.6, 8.05, -3.4);
    cyl(0.58, 0.58, 0.08, 16, M(0x8E8579), -2.6, 8.62, -3.4);
    for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) box(0.06, 0.35, 0.06, woodDark, -2.6 + dx, 7.47, -3.4 + dz);

    // 一樓側牆與柱子
    box(0.3, 3.6, 6.2, wood, -4.0, SW + 1.8, -3.1);
    box(0.3, 3.6, 6.2, wood, 4.0, SW + 1.8, -3.1);
    box(0.35, 3.6, 0.36, woodDark, -3.93, SW + 1.8, -0.05);
    box(0.5, 3.6, 0.36, woodDark, 0.55, SW + 1.8, -0.05);
    box(0.35, 3.6, 0.36, woodDark, 3.93, SW + 1.8, -0.05);
    box(8.2, 0.5, 0.36, woodDark, 0, 3.5, -0.05);

    // 外帶窗口：檯面與前板（寫著「現煎鍋貼」）
    const panelTex = tex(counterPanelCanvas());
    const panelFront = new THREE.MeshLambertMaterial({ map: panelTex, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 0.25 });
    put(new THREE.Mesh(boxGeo(4.05, 1.1, 0.4), [wood, wood, wood, wood, panelFront, wood]), -1.72, SW + 0.55, 0.0);
    box(4.25, 0.08, 0.66, woodDark, -1.72, SW + 1.14, 0.05);

    // 廚房（窗口後方）
    const kitchenMat = new THREE.MeshLambertMaterial({ color: 0xF0C38C, emissive: 0x6B3A12, emissiveIntensity: 0.55, side: THREE.BackSide });
    put(new THREE.Mesh(boxGeo(4.24, 3.6, 2.6), kitchenMat), -1.7, SW + 1.8, -1.6, { cast: false });
    const steel = M(0xC9C2B8);
    box(4.0, 0.95, 0.5, steel, -1.7, SW + 0.47, -2.6, { cast: false });
    box(1.8, 0.42, 0.85, steel, -1.3, 3.05, -1.0, { cast: false }); // 抽油煙機
    const menuTex = tex(menuCanvas());
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.62), new THREE.MeshLambertMaterial({ map: menuTex, emissive: 0xffffff, emissiveMap: menuTex, emissiveIntensity: 0.35 }));
    put(menu, -1.75, 2.45, -2.88, { cast: false });
    // 架上的醬料罐
    for (let i = 0; i < 6; i++) cyl(0.07, 0.07, 0.2, 8, M(pick([0xA4473B, 0xD9792B, 0xEDE6DA, 0x7D8F69])), -3.3 + i * 0.32, SW + 1.05, -2.65, { cast: false });

    // 鐵板與鍋貼
    box(1.35, 0.1, 0.6, M(0x2A2522), GRIDDLE.x, GRIDDLE.y - 0.05, GRIDDLE.z, { cast: false });
    box(1.35, 0.25, 0.6, steel, GRIDDLE.x, GRIDDLE.y - 0.22, GRIDDLE.z, { cast: false });
    const dumplingGeo = new THREE.SphereGeometry(0.075, 10, 6);
    griddleBits = new THREE.InstancedMesh(dumplingGeo, M(0xE9B868), 12);
    griddleBits.userData.base = [];
    let k = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const p = new THREE.Vector3(GRIDDLE.x - 0.45 + c * 0.3, GRIDDLE.y + 0.02, GRIDDLE.z - 0.17 + r * 0.17);
        griddleBits.userData.base.push(p);
        const mm = new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(1.7, 0.6, 0.85));
        griddleBits.setMatrixAt(k++, mm);
      }
    }
    scene.add(griddleBits);

    // 內用區（大門後方）
    const diningMat = new THREE.MeshLambertMaterial({ color: 0xF3D5A8, emissive: 0x4A2A10, emissiveIntensity: 0.5, side: THREE.BackSide });
    put(new THREE.Mesh(boxGeo(3.14, 3.6, 5.3), diningMat), 2.25, SW + 1.8, -2.95, { cast: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.12, 5.28), new THREE.MeshLambertMaterial({ map: tex(floorCanvas(), { repeat: [4, 7] }) }));
    floor.rotation.x = -Math.PI / 2;
    put(floor, 2.25, SW + 0.005, -2.95, { cast: false });
    for (const t of TABLES) {
      cyl(0.44, 0.44, 0.05, 20, M(0x8C6D5A), t.x, SW + 0.75, t.z, { cast: false });
      cyl(0.05, 0.05, 0.72, 8, woodDark, t.x, SW + 0.37, t.z, { cast: false });
      cyl(0.22, 0.22, 0.03, 12, woodDark, t.x, SW + 0.02, t.z, { cast: false });
      // 桌上的鍋貼盤
      cyl(0.16, 0.13, 0.03, 14, M(0xF7F1E8), t.x, SW + 0.79, t.z, { cast: false });
    }
    for (const s of SEATS) cyl(0.17, 0.15, 0.44, 12, M(0xA4473B), s.x, SW + 0.22, s.z, { cast: false });
    // 後方門簾
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.85), M(0x7A2E22));
    put(curtain, BACK_DOOR.x, SW + 1.05, -5.58, { cast: false });
    box(1.15, 0.12, 0.08, woodDark, BACK_DOOR.x, SW + 2.0, -5.57, { cast: false });
    // 牆上的海報
    new THREE.TextureLoader().load('images/hero-poster.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.95), new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 }));
      put(poster, 1.65, SW + 1.75, -5.57, { cast: false });
      box(0.84, 1.03, 0.03, woodDark, 1.65, SW + 1.75, -5.585, { cast: false });
    }, undefined, () => {});

    // 遮雨棚（條紋）與波浪垂邊
    const awningMat = new THREE.MeshLambertMaterial({ map: tex(awningCanvas()) });
    const awning = put(new THREE.Mesh(boxGeo(8.6, 0.05, 1.6), awningMat), 0, 3.53, 0.74);
    awning.rotation.x = 0.33;
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 0.36), new THREE.MeshLambertMaterial({
      map: tex(valanceCanvas()), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
    }));
    put(valance, 0, 3.11, 1.5);

    // 招牌「金煎堂」
    const signTex = tex(signCanvas());
    const signFront = new THREE.MeshLambertMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.55 });
    put(new THREE.Mesh(boxGeo(5.6, 1.3, 0.22), [woodDark, woodDark, woodDark, woodDark, signFront, woodDark]), 0, 4.75, 0.14);
    for (const x of [-2.0, 2.0]) {
      box(0.06, 0.06, 0.5, woodDark, x, 5.5, 0.38);
      box(0.22, 0.1, 0.14, M(0x2A1C14), x, 5.47, 0.66);
      glow(0xFFD49A, 1.6, x, 5.3, 0.72, 0.55);
    }

    // 門口的布簾（暖簾）
    const norenTex = [tex(norenCanvas('鍋')), tex(norenCanvas('貼'))];
    [-0.72, 0.72].forEach((dx, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(DOOR_X + dx, 3.25, 0.16);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.78), new THREE.MeshLambertMaterial({ map: norenTex[i], side: THREE.DoubleSide }));
      cloth.position.y = -0.39;
      cloth.castShadow = true;
      pivot.add(cloth);
      scene.add(pivot);
      noren.push({ pivot, x: DOOR_X + dx, push: 0, phase: i * 0.8 });
    });
    box(3.0, 0.05, 0.05, woodDark, DOOR_X, 3.25, 0.16);

    // 紅燈籠
    for (const x of [-4.02, 4.02]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 3.2, 1.45);
      const string = new THREE.Mesh(boxGeo(0.02, 0.24, 0.02), woodDark);
      string.position.y = -0.12;
      pivot.add(string);
      const capGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12);
      const capT = new THREE.Mesh(capGeo, woodDark); capT.position.y = -0.27; pivot.add(capT);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), new THREE.MeshLambertMaterial({ color: 0xC8432F, emissive: 0xB8321F, emissiveIntensity: 0.85 }));
      body.scale.set(1, 1.18, 1);
      body.position.y = -0.62;
      body.castShadow = true;
      pivot.add(body);
      const capB = new THREE.Mesh(capGeo, woodDark); capB.position.y = -0.97; pivot.add(capB);
      const tassel = new THREE.Mesh(boxGeo(0.03, 0.26, 0.03), M(0xE0A458)); tassel.position.y = -1.13; pivot.add(tassel);
      const g = glow(0xFF7A3D, 2.2, 0, -0.62, 0, 0.6, pivot);
      scene.add(pivot);
      lanterns.push({ pivot, glow: g, phase: Math.random() * 6 });
    }

    // 門口盆栽與立牌
    for (const x of [0.62, 4.45]) {
      cyl(0.26, 0.2, 0.46, 12, M(0x8C6D5A), x, SW + 0.23, 0.42);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ color: 0x6E8B57, flatShading: true }));
      put(leaf, x, SW + 0.82, 0.42);
    }
    const boardTex = tex(aFrameCanvas());
    const boardMat = new THREE.MeshLambertMaterial({ map: boardTex });
    const aFrame = new THREE.Group();
    const face = new THREE.Mesh(boxGeo(0.62, 0.82, 0.04), [woodDark, woodDark, woodDark, woodDark, boardMat, woodDark]);
    face.position.set(0, 0.5, 0.1); face.rotation.x = -0.18; face.castShadow = true;
    const back = new THREE.Mesh(boxGeo(0.62, 0.82, 0.04), woodDark);
    back.position.set(0, 0.5, -0.1); back.rotation.x = 0.18; back.castShadow = true;
    aFrame.add(face, back);
    aFrame.position.set(4.05, SW, 1.05);
    aFrame.rotation.y = -0.35;
    scene.add(aFrame);
  }

  /* =========================================================
     左右鄰房、遠景、路燈、行道樹、停放的機車
  ========================================================= */
  const trees = [];
  {
    const neighbors = [
      { x0: -26.5, x1: -16.75, h: 9.4, wall: '#D7C2A6', trim: '#6B5B4B', ground: 'shutter', seed: 11 },
      { x0: -16.6, x1: -10.0, h: 8.6, wall: '#E5D1B5', trim: '#7D6A55', ground: 'tea', seed: 7 },
      { x0: -9.9, x1: -4.25, h: 10.6, wall: '#D9C5AE', trim: '#5A3F2F', ground: 'shutter', seed: 3 },
      { x0: 4.25, x1: 9.8, h: 7.4, wall: '#E8DAC5', trim: '#6F7F5C', ground: 'glass', seed: 5 },
      { x0: 9.95, x1: 17.2, h: 11.4, wall: '#DCC9B0', trim: '#6B5B4B', ground: 'shutter', seed: 9 },
      { x0: 17.35, x1: 27, h: 8.4, wall: '#E3CDB0', trim: '#7D6A55', ground: 'glass', seed: 13 },
    ];
    for (const b of neighbors) {
      const w = b.x1 - b.x0;
      const t = facadeCanvas({ w, h: b.h, wall: b.wall, trim: b.trim, ground: b.ground, seed: b.seed });
      const front = new THREE.MeshLambertMaterial({ map: tex(t.color), emissive: 0xffffff, emissiveMap: tex(t.emit), emissiveIntensity: 0.85 });
      const side = M(new THREE.Color(b.wall).getHex());
      put(new THREE.Mesh(boxGeo(w, b.h, 8), [side, side, M(0x6E5444), side, front, side]), (b.x0 + b.x1) / 2, SW + b.h / 2, -4);
      box(w + 0.1, 0.3, 0.3, M(0x6E5444), (b.x0 + b.x1) / 2, SW + b.h + 0.15, -0.1);
    }
    // 遠景天際線
    const far = M(0x9A6A4E);
    [[-30, 14, -16], [-17, 18, -20], [-5, 13, -24], [8, 16, -19], [21, 12, -17], [33, 17, -22], [-42, 11, -20], [44, 13, -18]].forEach(([x, h, z], i) => {
      box(9 + (i % 3) * 2, h, 6, far, x, h / 2, z, { cast: false });
    });

    // 路燈
    for (const x of [-7.2, 7.35]) {
      cyl(0.07, 0.09, 4.6, 10, woodDark, x, SW + 2.3, 4.0);
      box(0.06, 0.06, 0.95, woodDark, x, SW + 4.55, 4.42);
      box(0.32, 0.12, 0.48, M(0x2A1C14), x, SW + 4.5, 4.85);
      const bulb = new THREE.Mesh(boxGeo(0.24, 0.03, 0.36), new THREE.MeshBasicMaterial({ color: 0xFFE3B0 }));
      put(bulb, x, SW + 4.43, 4.85, { cast: false, receive: false });
      glow(0xFFC27A, 3.4, x, SW + 4.3, 4.85, 0.55);
    }

    // 行道樹
    for (const [x, z] of [[-13.4, 3.6], [12.8, 3.6], [-22, 3.6], [21.5, 3.6]]) {
      box(1.0, 0.45, 1.0, M(0x8C6D5A), x, SW + 0.22, z);
      cyl(0.1, 0.13, 2.3, 8, M(0x5A3F2F), x, SW + 1.4, z);
      const crown = new THREE.Group();
      crown.position.set(x, SW + 2.6, z);
      const leafMat = new THREE.MeshLambertMaterial({ color: 0x6F8B55, flatShading: true });
      const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x5E7B48, flatShading: true });
      [[0, 0.5, 0, 1.15, leafMat], [0.55, 0.15, 0.2, 0.8, leafMat2], [-0.5, 0.25, -0.2, 0.85, leafMat2], [0.1, 1.2, 0, 0.7, leafMat]].forEach(([dx, dy, dz, r, mat]) => {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
        m.position.set(dx, dy, dz);
        m.castShadow = true;
        crown.add(m);
      });
      scene.add(crown);
      trees.push({ crown, phase: Math.random() * 6 });
    }
  }

  /* =========================================================
     人物（低多邊形）
  ========================================================= */
  const PG = {
    leg: new THREE.CapsuleGeometry(0.068, 0.7, 3, 8),
    arm: new THREE.CapsuleGeometry(0.05, 0.5, 3, 8),
    torso: new THREE.CapsuleGeometry(0.165, 0.32, 4, 10),
    head: new THREE.SphereGeometry(0.125, 14, 12),
    hair: new THREE.SphereGeometry(0.134, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairBack: new THREE.BoxGeometry(0.25, 0.32, 0.09),
    bun: new THREE.SphereGeometry(0.06, 10, 8),
    hand: new THREE.SphereGeometry(0.052, 8, 6),
    shoe: new THREE.BoxGeometry(0.11, 0.07, 0.21),
    skirt: new THREE.CylinderGeometry(0.17, 0.27, 0.44, 12),
    bag: new THREE.BoxGeometry(0.2, 0.24, 0.12),
    handle: new THREE.TorusGeometry(0.055, 0.01, 4, 10, Math.PI),
    pack: new THREE.BoxGeometry(0.27, 0.34, 0.14),
    brim: new THREE.BoxGeometry(0.22, 0.02, 0.13),
    chefHat: new THREE.CylinderGeometry(0.12, 0.105, 0.17, 12),
    chefPuff: new THREE.SphereGeometry(0.135, 12, 8),
    eye: new THREE.SphereGeometry(0.016, 6, 4),
    phone: new THREE.BoxGeometry(0.05, 0.09, 0.012),
    blob: new THREE.PlaneGeometry(0.85, 0.85),
  };

  const people = [];

  function makePerson(opt = {}) {
    const skin = opt.skin ?? pick(SKIN);
    const top = opt.top ?? pick(TOPS);
    const bottom = opt.bottom ?? pick(BOTTOMS);
    const shoes = opt.shoes ?? pick(SHOES);
    const hair = opt.hair ?? pick(HAIR);
    const style = opt.style ?? pick(['short', 'short', 'long', 'long', 'bun', 'cap']);
    const skirt = opt.skirt ?? ((style === 'long' || style === 'bun') && Math.random() < 0.4);

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mk = (geo, color, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, M(color));
      m.position.set(x, y, z);
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    const legColor = skirt ? pick([skin, 0x2A1C14, 0x3E2A1F]) : bottom;
    const legs = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(0.085 * s, 0.86, 0);
      body.add(g);
      mk(PG.leg, legColor, g, 0, -0.418, 0);
      mk(PG.shoe, shoes, g, 0, -0.82, 0.045);
      return g;
    });
    if (skirt) mk(PG.skirt, pick(SKIRTS), body, 0, 0.8, 0);
    const torso = mk(PG.torso, top, body, 0, 1.16, 0);
    torso.scale.set(1, 1, 0.74);
    if (opt.pack ?? (!opt.chef && Math.random() < 0.18)) mk(PG.pack, pick(PACKS), body, 0, 1.2, -0.17);

    const head = mk(PG.head, skin, body, 0, 1.6, 0);
    [-1, 1].forEach((s) => mk(PG.eye, 0x2A1C14, head, 0.045 * s, 0.015, 0.115));
    if (opt.chef) {
      mk(PG.chefHat, 0xFFFFFF, head, 0, 0.17, 0);
      mk(PG.chefPuff, 0xFFFFFF, head, 0, 0.27, 0).scale.set(1, 0.6, 1);
    } else if (opt.helmet) {
      mk(PG.hair, opt.helmet, head, 0, 0.0, -0.005).scale.setScalar(1.22);
    } else if (style === 'cap') {
      const c = pick(CAPS);
      mk(PG.hair, c, head, 0, 0.012, -0.004);
      mk(PG.brim, shadeHex(c, 0.8), head, 0, 0.06, 0.13);
    } else {
      mk(PG.hair, hair, head, 0, 0.01, -0.012).rotation.x = -0.25;
      if (style === 'long') mk(PG.hairBack, hair, head, 0, -0.14, -0.075);
      if (style === 'bun') mk(PG.bun, hair, head, 0, 0.11, -0.1);
    }

    // arms[0] = 右手（面向 +z 時位於 -x）
    const arms = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(0.215 * s, 1.385, 0);
      body.add(g);
      mk(PG.arm, top, g, 0, -0.3, 0);
      mk(PG.hand, skin, g, 0, -0.6, 0);
      return g;
    });
    const bag = new THREE.Group();
    bag.position.set(0, -0.62, 0);
    arms[0].add(bag);
    mk(PG.handle, 0x8A4A14, bag, 0, -0.03, 0);
    mk(PG.bag, 0xD9792B, bag, 0, -0.16, 0);
    mk(PG.bag, 0xF7F1E8, bag, 0, -0.16, 0.001).scale.set(0.35, 0.3, 1.02);
    bag.visible = !!opt.bag;
    const phone = mk(PG.phone, 0x1E1A18, arms[0], 0, -0.66, 0.04);
    phone.visible = false;

    const blob = new THREE.Mesh(PG.blob, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.014;
    root.add(blob);

    const h = opt.h ?? rand(1.58, 1.82);
    const scale = h / 1.73;
    root.scale.setScalar(scale);
    root.position.y = opt.y ?? SW;
    scene.add(root);

    const p = {
      root, body, legs, arms, bag, phone, scale,
      pos: root.position,
      yaw: 0, targetYaw: 0,
      phase: Math.random() * Math.PI * 2,
      walk: 0, sit: 0, sitTarget: 0,
      speed: opt.speed ?? rand(1.05, 1.42),
      pose: [0, 0], swing: 1,
      path: [], onEnd: null, vz: 0,
      state: 'idle', seed: Math.random() * 10,
    };
    people.push(p);
    return p;
  }

  function removePerson(p) {
    scene.remove(p.root);
    const i = people.indexOf(p);
    if (i >= 0) people.splice(i, 1);
    passers.delete(p);
    p.state = 'gone';
  }

  function setYaw(p, yaw) { p.yaw = p.targetYaw = yaw; p.root.rotation.y = yaw; }

  function walkTo(p, pts, onEnd) {
    p.path = pts.map((q) => ({ x: q.x, z: q.z }));
    p.onEnd = onEnd || null;
  }

  function stepPerson(p, dt, t) {
    let moving = false;
    if (p.path.length && p.sit < 0.02) {
      const wp = p.path[0];
      const dx = wp.x - p.pos.x;
      const dz = wp.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const step = p.speed * dt;
      if (d > 1e-4) p.targetYaw = Math.atan2(dx, dz);
      if (d <= step) {
        p.pos.x = wp.x; p.pos.z = wp.z;
        p.path.shift();
        if (!p.path.length && p.onEnd) { const f = p.onEnd; p.onEnd = null; f(p); }
      } else {
        p.pos.x += (dx / d) * step;
        p.pos.z += (dz / d) * step;
        p.vz = dz / d;
        moving = true;
      }
    }
    if (p.state === 'gone') return;
    p.yaw = turnToward(p.yaw, p.targetYaw, dt * 7);
    p.root.rotation.y = p.yaw;
    p.walk = approach(p.walk, moving ? 1 : 0, dt * 5);
    p.sit = approach(p.sit, p.sitTarget, dt * 2.2);
    if (p.walk > 0.001) p.phase += (dt * p.speed / (0.72 * p.scale)) * Math.PI;

    const s = Math.sin(p.phase) * p.walk;
    const sitLeg = -1.02 * p.sit;
    p.legs[0].rotation.x = s * 0.5 + sitLeg;
    p.legs[1].rotation.x = -s * 0.5 + sitLeg;
    let a0 = p.pose[0], a1 = p.pose[1];
    if (p.sit > 0.5) { a0 = -1.12 + Math.sin(t * 2.6 + p.seed) * 0.22; a1 = -0.95; }
    p.arms[0].rotation.x = -s * 0.42 * p.swing + a0;
    p.arms[1].rotation.x = s * 0.42 + a1;
    p.body.position.y = Math.abs(Math.cos(p.phase)) * 0.028 * p.walk - 0.4 * p.sit + (p.idleBob ? Math.sin(t * 1.8 + p.seed) * 0.006 : 0);
  }

  /* ---------- 可視範圍（依鏡頭計算進出場的 x） ---------- */
  const edgeX = (z) => {
    const camZ = camTarget.z + view.dist * Math.cos(view.pitch);
    return (camZ - z) * view.tanHalf * camera.aspect + 3.2;
  };

  /* ---------- 排程（只在播放時前進） ---------- */
  let simT = 0;
  const timers = [];
  const after = (sec, fn) => timers.push({ at: simT + sec, fn });

  /* ---------- 師傅與內場 ---------- */
  const chef = makePerson({ chef: true, top: 0xFFFDF8, bottom: 0x3E2A1F, h: 1.74, style: 'short' });
  chef.pos.set(GRIDDLE.x + 0.05, SW, -1.12);
  setYaw(chef, 0);
  chef.pose = [-0.85, -0.75];
  chef.idleBob = true;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.02), M(0xD9792B));
  apron.position.set(0, 1.0, 0.13);
  chef.body.add(apron);
  let chefFlip = 0;

  const cook = makePerson({ chef: true, top: 0xFFFDF8, bottom: 0x3E2A1F, h: 1.62 });
  cook.pos.set(-3.0, SW, -2.12);
  setYaw(cook, Math.PI);
  cook.idleBob = true;

  /* ---------- 蒸氣 ---------- */
  const steam = [];
  let steamBurst = 0;
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xFFF6EA, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData = { life: i / 14, ox: rand(-0.5, 0.5), oz: rand(-0.15, 0.15) };
    scene.add(s);
    steam.push(s);
  }

  /* ---------- 外帶排隊 ---------- */
  const QMAX = small ? 3 : 4;
  const queue = [];
  let serving = false;
  const queueSpot = (i) => ({ x: QUEUE.x0 - i * QUEUE.gap, z: QUEUE.z + (i ? 0.06 : 0) });

  function settleInQueue(p) {
    const i = queue.indexOf(p);
    if (i < 0) return;
    const s = queueSpot(i);
    walkTo(p, [s], () => {
      const j = queue.indexOf(p);
      if (j < 0) return;
      if (j !== i) { settleInQueue(p); return; }
      p.state = 'waiting';
      p.targetYaw = j === 0 ? Math.PI : Math.PI / 2;
      const usePhone = p.phoneUser && j > 0;
      p.phone.visible = usePhone;
      p.pose = usePhone ? [-1.25, 0] : [0, 0];
      p.swing = usePhone ? 0.2 : 1;
    });
  }

  function spawnQueuer() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = pick(LANES);
    const p = makePerson();
    p.pos.set(-dir * edgeX(lane), SW, lane);
    setYaw(p, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    p.phoneUser = Math.random() < 0.35;
    p.state = 'queue';
    queue.push(p);
    const s = queueSpot(queue.length - 1);
    walkTo(p, [{ x: s.x, z: Math.min(lane, 1.9) }], () => settleInQueue(p));
  }

  function serve() {
    const p = queue[0];
    serving = true;
    p.state = 'served';
    chefFlip = 1;
    steamBurst = 1;
    after(0.9, () => {
      p.bag.visible = true;
      p.bag.scale.setScalar(0.01);
      p.bagPop = 0;
      if (Math.random() < 0.6) say(p, pick(LINES));
    });
    after(1.8, () => {
      queue.shift();
      queue.forEach((q) => {
        if (q.state === 'waiting') {
          q.phone.visible = false; q.pose = [0, 0]; q.swing = 1;
          settleInQueue(q);
        }
      });
      leaveToStreet(p, pick(LANES));
      serving = false;
      plan.serve = simT + rand(2.4, 4.4);
    });
  }

  /* ---------- 路人 / 進店 / 出店 ---------- */
  const passers = new Set();
  const PASS_TARGET = small ? 5 : 10;
  const MAX_PEOPLE = small ? 18 : 28;

  function spawnPasser(midway = false) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = pick(LANES) + rand(-0.18, 0.18);
    const e = edgeX(lane);
    const p = makePerson({ bag: Math.random() < 0.22 });
    p.pos.set(midway ? rand(-e + 1, e - 1) : -dir * e, SW, lane);
    setYaw(p, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    p.state = 'passing';
    passers.add(p);
    walkTo(p, [{ x: dir * e, z: lane }], removePerson);
    if (midway) { p.walk = 1; return; }
    // 偶爾兩人同行（情侶 / 親子）
    if (Math.random() < 0.18) {
      const child = Math.random() < 0.5;
      const c = makePerson({ h: child ? rand(1.0, 1.2) : rand(1.55, 1.78), speed: p.speed });
      const side = lane > 2.7 ? -0.42 : 0.42;
      c.pos.set(p.pos.x - dir * 0.35, SW, lane + side);
      setYaw(c, p.yaw);
      c.state = 'passing';
      passers.add(c);
      walkTo(c, [{ x: dir * e, z: lane + side }], removePerson);
    }
  }

  const freeSeat = () => {
    const free = SEATS.filter((s) => !s.taken);
    return free.length ? pick(free) : null;
  };

  function leaveToStreet(p, lane, fromInside = false) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const pts = [];
    if (fromInside) pts.push({ x: DOOR_X + rand(-0.3, 0.3), z: -0.6 }, { x: DOOR_X + rand(-0.3, 0.3), z: 0.7 });
    pts.push({ x: p.pos.x + dir * 0.9 + (fromInside ? DOOR_X - p.pos.x : 0), z: lane });
    pts.push({ x: dir * edgeX(lane), z: lane });
    p.state = 'leaving';
    walkTo(p, pts, removePerson);
  }

  function spawnEnterer() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = pick(LANES);
    const p = makePerson();
    p.pos.set(-dir * edgeX(lane), SW, lane);
    setYaw(p, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    p.state = 'entering';
    const dx = DOOR_X + rand(-0.35, 0.35);
    const pts = [{ x: dx, z: lane }, { x: dx, z: 0.5 }, { x: dx, z: -0.7 }];
    const seat = Math.random() < 0.75 ? freeSeat() : null;
    if (seat) {
      seat.taken = p;
      pts.push({ x: seat.x, z: seat.z });
      walkTo(p, pts, () => sitDown(p, seat));
    } else {
      pts.push({ x: BACK_DOOR.x, z: -4.6 }, { x: BACK_DOOR.x, z: BACK_DOOR.z });
      walkTo(p, pts, removePerson);
    }
  }

  function sitDown(p, seat, stay = rand(12, 22)) {
    p.state = 'seated';
    p.pos.set(seat.x, SW, seat.z);
    p.targetYaw = seat.yaw;
    p.sitTarget = 1;
    after(stay, () => {
      if (p.state !== 'seated') return;
      p.sitTarget = 0;
      after(0.7, () => {
        seat.taken = null;
        p.bag.visible = Math.random() < 0.5;
        leaveToStreet(p, pick(LANES), true);
      });
    });
  }

  function spawnFromBack() {
    const p = makePerson({ bag: Math.random() < 0.6 });
    p.pos.set(BACK_DOOR.x, SW, BACK_DOOR.z);
    setYaw(p, Math.PI * 0.9);
    walkTo(p, [{ x: BACK_DOOR.x, z: -4.5 }], () => leaveToStreet(p, pick(LANES), true));
  }

  /* ---------- 機車 ---------- */
  const SG = {
    wheel: new THREE.CylinderGeometry(0.24, 0.24, 0.11, 16),
    spoke: new THREE.BoxGeometry(0.115, 0.4, 0.05),
    light: new THREE.SphereGeometry(0.075, 10, 8),
  };
  const scooters = [];

  function makeScooter(color, rider) {
    const g = new THREE.Group();
    const bodyM = M(color);
    const dark = M(0x2A2522);
    const wheels = [];
    for (const z of [-0.62, 0.62]) {
      const w = new THREE.Group();
      w.position.set(0, 0.24, z);
      const tire = new THREE.Mesh(SG.wheel, dark); tire.rotation.z = Math.PI / 2; tire.castShadow = true;
      const spoke = new THREE.Mesh(SG.spoke, M(0xBDB6AC));
      w.add(tire, spoke);
      g.add(w);
      wheels.push(w);
    }
    const part = (w, h, d, m, x, y, z, rx = 0) => {
      const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
      mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    part(0.34, 0.12, 0.9, bodyM, 0, 0.36, 0.02);
    part(0.44, 0.44, 0.78, bodyM, 0, 0.6, -0.38);
    part(0.38, 0.1, 0.62, dark, 0, 0.87, -0.34);
    part(0.38, 0.72, 0.16, bodyM, 0, 0.74, 0.46, -0.28);
    part(0.66, 0.05, 0.05, dark, 0, 1.13, 0.52);
    const lamp = new THREE.Mesh(SG.light, new THREE.MeshBasicMaterial({ color: 0xFFF1D0 }));
    lamp.position.set(0, 0.98, 0.58);
    g.add(lamp);
    const tail = new THREE.Mesh(boxGeo(0.2, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0xFF4A2E }));
    tail.position.set(0, 0.72, -0.78);
    g.add(tail);
    if (rider) {
      glow(0xFFE2A8, 1.4, 0, 0.98, 0.75, 0.6, g);
      const r = makePerson({ helmet: pick(HELMETS), skirt: false, pack: Math.random() < 0.3, y: 0 });
      scene.remove(r.root);
      people.splice(people.indexOf(r), 1);
      r.root.position.set(0, 0.04, -0.3);
      r.legs.forEach((l) => { l.rotation.x = -1.05; });
      r.arms.forEach((a) => { a.rotation.x = -1.15; });
      r.root.rotation.x = 0.06;
      g.add(r.root);
    }
    g.userData.wheels = wheels;
    scene.add(g);
    return g;
  }

  function spawnScooter() {
    const east = Math.random() < 0.5;
    const z = east ? ROAD_LANES.east : ROAD_LANES.west;
    const dir = east ? 1 : -1;
    const g = makeScooter(pick(SCOOTER_COLORS), true);
    const e = edgeX(z) + 1;
    g.position.set(-dir * e, 0, z);
    g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    scooters.push({ g, dir, speed: rand(6, 8.5), end: e });
  }

  // 路邊停放的機車
  [[-12.2, 0.12], [-11.4, -0.06], [-10.6, 0.1], [-9.05, -0.08], [6.3, 0.08], [7.1, -0.1], [8.6, 0.06]].forEach(([x, yaw]) => {
    const g = makeScooter(pick(SCOOTER_COLORS), false);
    g.position.set(x, 0, 5.2);
    g.rotation.y = yaw;
  });

  /* ---------- 對話泡泡（HTML 疊在畫布上） ---------- */
  const bubbles = [];
  const tmpV = new THREE.Vector3();
  function say(p, text) {
    if (reduceMotion) return;
    const b = document.createElement('div');
    b.className = 'st3d-bubble';
    b.textContent = text;
    el.appendChild(b);
    bubbles.push({ el: b, p, t: 0 });
  }
  function updateBubbles(dt) {
    const w = el.clientWidth, h = el.clientHeight;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.t += dt;
      if (b.t > 2.4 || b.p.state === 'gone') { b.el.remove(); bubbles.splice(i, 1); continue; }
      tmpV.set(b.p.pos.x, b.p.pos.y + 2.0 * b.p.scale, b.p.pos.z).project(camera);
      b.el.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  /* =========================================================
     初始狀態：街上已經有人
  ========================================================= */
  const plan = { pass: 0.4, enter: rand(1.5, 3), back: rand(4, 7), queue: rand(2.5, 4.5), serve: 2.2, scooter: rand(1.5, 4) };

  function seed() {
    for (let i = 0; i < PASS_TARGET; i++) spawnPasser(true);
    const n = Math.min(QMAX - 1, 3);
    for (let i = 0; i < n; i++) {
      const p = makePerson();
      const s = queueSpot(i);
      p.pos.set(s.x, SW, s.z);
      p.phoneUser = Math.random() < 0.35;
      queue.push(p);
      setYaw(p, i === 0 ? Math.PI : Math.PI / 2);
      p.state = 'waiting';
      if (p.phoneUser && i > 0) { p.phone.visible = true; p.pose = [-1.25, 0]; p.swing = 0.2; }
    }
    [SEATS[0], SEATS[3], SEATS[1]].slice(0, small ? 2 : 3).forEach((seat) => {
      const p = makePerson();
      seat.taken = p;
      setYaw(p, seat.yaw);
      p.sit = 1;
      sitDown(p, seat, rand(4, 16));
    });
  }

  /* =========================================================
     每一幀
  ========================================================= */
  let elapsed = 0;
  const auto = { yaw: 0, pitch: 0 };
  const pointer = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 };

  function placeCamera() {
    const yaw = auto.yaw + pointer.yaw;
    const pitch = view.pitch + pointer.pitch;
    camera.position.set(
      camTarget.x + view.dist * Math.sin(yaw) * Math.cos(pitch),
      camTarget.y + view.dist * Math.sin(pitch),
      camTarget.z + view.dist * Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(camTarget);
  }

  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const sDump = new THREE.Vector3(1.7, 0.6, 0.85);
  const vTmp = new THREE.Vector3();

  function update(dt) {
    elapsed += dt;
    simT += dt;
    const t = elapsed;

    // 排程與生成
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= simT) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    }
    const crowded = people.length >= MAX_PEOPLE;
    if (simT >= plan.pass) {
      if (passers.size < PASS_TARGET && !crowded) spawnPasser();
      plan.pass = simT + rand(0.8, 2.2);
    }
    if (simT >= plan.enter) { if (!crowded) spawnEnterer(); plan.enter = simT + rand(4.5, 8); }
    if (simT >= plan.back) { if (!crowded) spawnFromBack(); plan.back = simT + rand(7, 12); }
    if (simT >= plan.queue) { if (queue.length < QMAX && !crowded) spawnQueuer(); plan.queue = simT + rand(4, 7); }
    if (!serving && queue[0] && queue[0].state === 'waiting' && simT >= plan.serve) serve();
    if (simT >= plan.scooter) { spawnScooter(); plan.scooter = simT + rand(5, 11); }

    // 人物
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i];
      stepPerson(p, dt, t);
      if (p.bagPop !== undefined) {
        p.bagPop = Math.min(1, p.bagPop + dt * 3);
        const k = p.bagPop;
        p.bag.scale.setScalar(Math.max(0.01, 1 + Math.sin(k * Math.PI) * 0.35 * (1 - k) + (k - 1) * 0)); // 彈出
        if (k >= 1) { p.bag.scale.setScalar(1); delete p.bagPop; }
      }
    }

    // 師傅翻鍋
    chefFlip = Math.max(0, chefFlip - dt * 1.4);
    const flip = Math.sin((1 - chefFlip) * Math.PI) * (chefFlip > 0 ? 1 : 0);
    chef.pose[0] = -0.85 - flip * 0.95;
    chef.pose[1] = -0.75 + Math.sin(t * 1.3) * 0.06;
    cook.pose = [-0.8 + Math.sin(t * 5.2) * 0.12, -0.8 + Math.sin(t * 5.2 + 1.7) * 0.12];
    for (let i = 0; i < 12; i++) {
      vTmp.copy(griddleBits.userData.base[i]);
      vTmp.y += flip * 0.12 * (0.6 + ((i * 7) % 5) / 10);
      m4.compose(vTmp, qI, sDump);
      griddleBits.setMatrixAt(i, m4);
    }
    griddleBits.instanceMatrix.needsUpdate = true;

    // 蒸氣
    for (const s of steam) {
      const d = s.userData;
      d.life += dt * (0.4 + steamBurst * 0.5);
      if (d.life >= 1) { d.life -= 1; d.ox = rand(-0.5, 0.5); d.oz = rand(-0.15, 0.15); }
      const k = d.life;
      s.position.set(GRIDDLE.x + d.ox + Math.sin(k * 6 + d.ox * 9) * 0.08, GRIDDLE.y + 0.08 + k * 1.05, GRIDDLE.z + d.oz);
      const sc = 0.2 + k * 0.55;
      s.scale.set(sc, sc, 1);
      s.material.opacity = Math.sin(Math.PI * k) * 0.38 * (1 + steamBurst * 0.8);
    }
    steamBurst = Math.max(0, steamBurst - dt * 0.7);

    // 燈籠、暖簾、樹
    lanterns.forEach((l, i) => {
      l.pivot.rotation.z = Math.sin(t * 1.1 + l.phase) * 0.08;
      l.pivot.rotation.x = Math.sin(t * 0.8 + l.phase + i) * 0.05;
      l.glow.material.opacity = 0.55 + Math.sin(t * 7 + l.phase) * 0.04 + Math.sin(t * 2.3 + i) * 0.05;
    });
    for (const n of noren) {
      let push = 0;
      for (const p of people) {
        if (Math.abs(p.pos.x - n.x) < 0.8 && p.pos.z > -0.75 && p.pos.z < 0.75 && p.walk > 0.2) push = p.vz < 0 ? 0.6 : -0.6;
      }
      n.push = approach(n.push, push, dt * 3);
      n.pivot.rotation.x = n.push + Math.sin(t * 1.6 + n.phase) * 0.06;
    }
    for (const tr of trees) tr.crown.rotation.z = Math.sin(t * 0.7 + tr.phase) * 0.025;

    // 機車
    for (let i = scooters.length - 1; i >= 0; i--) {
      const s = scooters[i];
      s.g.position.x += s.dir * s.speed * dt;
      for (const w of s.g.userData.wheels) w.rotation.x += (s.speed / 0.24) * dt;
      if (Math.abs(s.g.position.x) > s.end + 0.5) { scene.remove(s.g); scooters.splice(i, 1); }
    }

    // 鏡頭：緩慢擺動 + 滑鼠 / 手指
    auto.yaw = Math.sin(t * 0.11) * 0.09;
    auto.pitch = Math.sin(t * 0.07) * 0.012;
    pointer.yaw += (pointer.tYaw - pointer.yaw) * Math.min(1, dt * 3);
    pointer.pitch += (pointer.tPitch - pointer.pitch) * Math.min(1, dt * 3);
    if (!dragging) pointer.tYaw *= touchMode ? Math.max(0, 1 - dt * 0.35) : 1;
    placeCamera();
    updateBubbles(dt);
  }

  /* =========================================================
     互動：滑鼠視差 / 手指左右滑動
  ========================================================= */
  const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let touchMode = !fineHover;
  let dragging = false;
  let dragX = 0;
  let dragYaw0 = 0;
  if (hint) hint.textContent = fineHover ? '移動滑鼠，換個角度看看' : '左右滑動，換個角度看看';
  const interacted = () => el.classList.add('is-interacted');

  if (!reduceMotion) {
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        const r = canvas.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
        pointer.tYaw = nx * 0.17;
        pointer.tPitch = ny * 0.045;
        interacted();
      } else if (dragging) {
        pointer.tYaw = clamp(dragYaw0 - ((e.clientX - dragX) / canvas.clientWidth) * 0.9, -0.35, 0.35);
        interacted();
      }
    });
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') { pointer.tYaw = 0; pointer.tPitch = 0; }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      touchMode = true;
      dragging = true;
      dragX = e.clientX;
      dragYaw0 = pointer.tYaw;
    });
    const endDrag = () => { dragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }

  /* =========================================================
     尺寸、播放 / 暫停
  ========================================================= */
  function resize() {
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 窄螢幕時拉遠鏡頭，確保店面完整入鏡
    view.dist = Math.max(18.5, 6.4 / (view.tanHalf * camera.aspect));
    camera.updateProjectionMatrix();
    placeCamera();
    if (!running) renderer.render(scene, camera);
  }

  let running = false;
  let raf = 0;
  let inView = false;
  const clock = new THREE.Clock(false);

  function frame() {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(frame);
    update(Math.min(clock.getDelta(), 1 / 20));
    renderer.render(scene, camera);
  }
  function setRunning(on) {
    if (reduceMotion || on === running) return;
    running = on;
    if (on) {
      clock.start();
      raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  // 開始
  seed();
  if (reduceMotion) {
    // 靜態畫面：讓路人停在跨步的姿勢
    people.forEach((p) => {
      if (p.state === 'passing') { p.walk = 0.8; p.phase = rand(0.6, 1.2); }
      stepPerson(p, 0, 0);
    });
    for (const s of steam) { s.material.opacity = 0.25; s.position.set(GRIDDLE.x + s.userData.ox, GRIDDLE.y + 0.1 + s.userData.life, GRIDDLE.z); }
  } else {
    update(0.016);
  }
  resize();
  new ResizeObserver(() => resize()).observe(el);
  renderer.render(scene, camera);
  el.dataset.state = 'ready';

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    setRunning(inView && !document.hidden);
  }).observe(el);
  document.addEventListener('visibilitychange', () => setRunning(inView && !document.hidden));

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setRunning(false);
    el.dataset.state = 'error';
  });
}

/* =========================================================
   Canvas 貼圖
========================================================= */
function radialCanvas(size, inner, outer, mid) {
  const [c, g] = makeCanvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  if (mid) gr.addColorStop(0.4, mid);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

function speckle(g, w, h, n, colors, rnd = Math.random) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function roadCanvas() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#56473D';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1400, ['rgba(255,236,210,0.06)', 'rgba(0,0,0,0.12)', 'rgba(120,96,80,0.25)'], mulberry32(4));
  return c;
}

function sidewalkCanvas() {
  const [c, g] = makeCanvas(256, 256);
  const rnd = mulberry32(8);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 214 + Math.floor(rnd() * 12);
      g.fillStyle = `rgb(${v}, ${v - 17}, ${v - 45})`;
      g.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  speckle(g, 256, 256, 900, ['rgba(90,63,47,0.08)', 'rgba(255,255,255,0.12)'], rnd);
  g.strokeStyle = 'rgba(120,92,66,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  return c;
}

function floorCanvas() {
  const [c, g] = makeCanvas(128, 128);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#C9A882' : '#EBDCC2';
      g.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  return c;
}

function drawSpaced(g, text, cx, cy, gap) {
  const chars = [...text];
  chars.forEach((ch, i) => g.fillText(ch, cx + (i - (chars.length - 1) / 2) * gap, cy));
}

function signCanvas() {
  const [c, g] = makeCanvas(1024, 238);
  const bg = g.createLinearGradient(0, 0, 0, 238);
  bg.addColorStop(0, '#3E2A1F');
  bg.addColorStop(1, '#2A1C14');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 238);
  g.strokeStyle = '#D9792B';
  g.lineWidth = 7;
  g.strokeRect(16, 16, 992, 206);
  g.strokeStyle = 'rgba(217,121,43,0.45)';
  g.lineWidth = 2;
  g.strokeRect(30, 30, 964, 178);
  const tg = g.createLinearGradient(0, 40, 0, 170);
  tg.addColorStop(0, '#FCE6BE');
  tg.addColorStop(1, '#E9A65A');
  g.fillStyle = tg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 118px ${SERIF}`;
  drawSpaced(g, '金煎堂', 512, 104, 178);
  g.fillStyle = '#F3D3B0';
  g.font = `700 28px ${SANS}`;
  g.fillText('SINCE 1995  ·  手工現包鍋貼', 512, 188);
  return c;
}

function counterPanelCanvas() {
  const [c, g] = makeCanvas(512, 140);
  g.fillStyle = '#5A3F2F';
  g.fillRect(0, 0, 512, 140);
  const rnd = mulberry32(21);
  g.strokeStyle = 'rgba(42,28,20,0.35)';
  for (let x = 0; x < 512; x += 16 + rnd() * 10) {
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rnd() * 6, 140); g.stroke();
  }
  g.strokeStyle = '#D9792B';
  g.lineWidth = 4;
  g.strokeRect(14, 14, 484, 112);
  g.fillStyle = '#F3D3B0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 64px ${SERIF}`;
  drawSpaced(g, '現煎鍋貼', 256, 72, 92);
  return c;
}

function norenCanvas(ch) {
  const [c, g] = makeCanvas(240, 134);
  const bg = g.createLinearGradient(0, 0, 0, 134);
  bg.addColorStop(0, '#C8651F');
  bg.addColorStop(1, '#D9792B');
  g.fillStyle = bg;
  g.fillRect(0, 0, 240, 134);
  g.fillStyle = 'rgba(42,28,20,0.35)';
  g.fillRect(0, 0, 240, 12);
  g.fillStyle = '#FBF3E6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 84px ${SERIF}`;
  g.fillText(ch, 120, 76);
  return c;
}

function menuCanvas() {
  const [c, g] = makeCanvas(768, 160);
  const items = [['鍋貼', '$80'], ['水餃', '$70'], ['酸辣湯', '$45']];
  items.forEach(([name, price], i) => {
    const x = i * 256 + 8;
    g.fillStyle = '#3E2A1F';
    g.fillRect(x, 8, 240, 144);
    g.strokeStyle = '#D9792B';
    g.lineWidth = 3;
    g.strokeRect(x + 8, 16, 224, 128);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#F7F1E8';
    g.font = `700 48px ${SANS}`;
    g.fillText(name, x + 120, 62);
    g.fillStyle = '#F3B46B';
    g.font = `700 36px ${SANS}`;
    g.fillText(price, x + 120, 114);
  });
  return c;
}

function aFrameCanvas() {
  const [c, g] = makeCanvas(160, 212);
  g.fillStyle = '#2A1C14';
  g.fillRect(0, 0, 160, 212);
  g.strokeStyle = '#8C6D5A';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 150, 202);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#F3D3B0';
  g.font = `900 38px ${SERIF}`;
  g.fillText('今日', 80, 52);
  g.fillStyle = '#F7F1E8';
  g.fillText('現煎', 80, 100);
  g.fillStyle = '#E9A65A';
  g.font = `700 26px ${SANS}`;
  g.fillText('鍋貼 $80', 80, 158);
  return c;
}

function awningCanvas() {
  const [c, g] = makeCanvas(512, 64);
  const n = 12;
  const w = 512 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#FBF3E6' : '#D9792B';
    g.fillRect(i * w, 0, w + 1, 64);
  }
  const sh = g.createLinearGradient(0, 0, 0, 64);
  sh.addColorStop(0, 'rgba(42,28,20,0.18)');
  sh.addColorStop(1, 'rgba(42,28,20,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 512, 64);
  return c;
}

function valanceCanvas() {
  const [c, g] = makeCanvas(512, 48);
  const n = 12;
  const w = 512 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#FBF3E6' : '#D9792B';
    g.fillRect(i * w, 0, w + 0.5, 24);
    g.beginPath();
    g.arc(i * w + w / 2, 24, w / 2, 0, Math.PI);
    g.fill();
  }
  return c;
}

function shopUpperCanvas() {
  const ppm = 64;
  const W = Math.round(8.3 * ppm);
  const H = Math.round(3.55 * ppm);
  const [c, g] = makeCanvas(W, H);
  const [e, ge] = makeCanvas(W, H);
  g.fillStyle = '#EEDDC4';
  g.fillRect(0, 0, W, H);
  speckle(g, W, H, 1200, ['rgba(90,63,47,0.05)', 'rgba(255,255,255,0.1)'], mulberry32(31));
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  g.fillStyle = '#5A3F2F';
  g.fillRect(0, H - 10, W, 10);
  const toX = (wx) => (wx + 4.15) * ppm;
  const toY = (wy) => (7.3 - wy) * ppm;
  for (const [x0, x1] of [[-3.45, -1.05], [1.05, 3.45]]) {
    const x = toX(x0), y = toY(6.95), ww = (x1 - x0) * ppm, wh = 1.2 * ppm;
    g.fillStyle = '#5A3F2F';
    g.fillRect(x - 5, y - 5, ww + 10, wh + 10);
    const gl = g.createLinearGradient(0, y, 0, y + wh);
    gl.addColorStop(0, '#FFE6BC');
    gl.addColorStop(1, '#F2B064');
    g.fillStyle = gl;
    g.fillRect(x, y, ww, wh);
    ge.fillStyle = '#FFD7A0';
    ge.fillRect(x, y, ww, wh);
    // 窗簾
    g.fillStyle = 'rgba(217,121,43,0.55)';
    g.fillRect(x, y, ww * 0.22, wh);
    g.fillRect(x + ww * 0.78, y, ww * 0.22, wh);
    ge.fillStyle = 'rgba(0,0,0,0.55)';
    ge.fillRect(x, y, ww * 0.22, wh);
    ge.fillRect(x + ww * 0.78, y, ww * 0.22, wh);
    // 鐵窗
    g.strokeStyle = 'rgba(42,28,20,0.6)';
    ge.strokeStyle = '#000';
    g.lineWidth = ge.lineWidth = 2;
    for (let k = 1; k < 8; k++) {
      const gx = x + (ww * k) / 8;
      [g, ge].forEach((cx) => { cx.beginPath(); cx.moveTo(gx, y - 3); cx.lineTo(gx, y + wh + 3); cx.stroke(); });
    }
    // 窗台盆栽
    g.fillStyle = '#8C6D5A';
    g.fillRect(x + 6, y + wh + 4, ww - 12, 9);
    g.fillStyle = '#6E8B57';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(x + 16 + k * ((ww - 32) / 5), y + wh + 1, 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  return { color: c, emit: e };
}

function facadeCanvas({ w, h, wall, trim, ground, seed }) {
  const ppm = 52;
  const W = Math.round(w * ppm);
  const H = Math.round(h * ppm);
  const [c, g] = makeCanvas(W, H);
  const [e, ge] = makeCanvas(W, H);
  const rnd = mulberry32(seed);
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  speckle(g, W, H, Math.round(W * H / 90), ['rgba(90,63,47,0.06)', 'rgba(255,255,255,0.1)'], rnd);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);

  const groundH = 3.6 * ppm;
  const floorH = 3.0 * ppm;
  const cols = Math.max(2, Math.round(w / 1.9));
  const cellW = W / cols;
  for (let fy = H - groundH - floorH; fy > -floorH * 0.2; fy -= floorH) {
    g.fillStyle = trim;
    g.globalAlpha = 0.35;
    g.fillRect(0, fy + floorH - 5, W, 5);
    g.globalAlpha = 1;
    for (let i = 0; i < cols; i++) {
      const ww = cellW * 0.58;
      const wh = floorH * 0.5;
      const x = i * cellW + (cellW - ww) / 2;
      const y = fy + floorH * 0.2;
      if (y < 6) continue;
      const lit = rnd() < 0.55;
      g.fillStyle = trim;
      g.fillRect(x - 4, y - 4, ww + 8, wh + 8);
      const gl = g.createLinearGradient(0, y, 0, y + wh);
      if (lit) { gl.addColorStop(0, '#FFE2B0'); gl.addColorStop(1, '#F0AE62'); } else { gl.addColorStop(0, '#6A6070'); gl.addColorStop(1, '#433D48'); }
      g.fillStyle = gl;
      g.fillRect(x, y, ww, wh);
      if (lit) {
        ge.fillStyle = rnd() < 0.5 ? '#FFD49A' : '#FFC27A';
        ge.fillRect(x, y, ww, wh);
      }
      if (rnd() < 0.45) {
        g.fillStyle = lit ? 'rgba(164,71,59,0.45)' : 'rgba(90,63,47,0.5)';
        g.fillRect(x, y, ww * 0.42, wh);
        ge.fillStyle = 'rgba(0,0,0,0.5)';
        ge.fillRect(x, y, ww * 0.42, wh);
      }
      if (rnd() < 0.6) {
        // 鐵窗
        g.strokeStyle = 'rgba(42,28,20,0.55)';
        ge.strokeStyle = '#000';
        g.lineWidth = ge.lineWidth = 2;
        for (let k = 1; k < 6; k++) {
          const gx = x + (ww * k) / 6;
          [g, ge].forEach((cx) => { cx.beginPath(); cx.moveTo(gx, y - 6); cx.lineTo(gx, y + wh + 6); cx.stroke(); });
        }
        g.strokeRect(x - 7, y - 7, ww + 14, wh + 14);
      }
      if (rnd() < 0.4) {
        // 冷氣機
        g.fillStyle = '#D8D3CA';
        g.fillRect(x + ww * 0.1, y + wh + 10, ww * 0.55, floorH * 0.15);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let k = 0; k < 4; k++) g.fillRect(x + ww * 0.14, y + wh + 14 + k * 5, ww * 0.47, 2);
      }
    }
  }

  // 一樓店面
  const gy = H - groundH;
  g.fillStyle = trim;
  g.fillRect(0, gy, W, 12);
  const sx = W * 0.08;
  const sw = W * 0.84;
  const top = gy + groundH * 0.2;
  const sh = groundH * 0.8;
  if (ground === 'shutter') {
    g.fillStyle = '#B7B0A6';
    g.fillRect(sx, top, sw, sh);
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let y = top; y < top + sh; y += 7) g.fillRect(sx, y, sw, 2);
    // 半開的鐵捲門透出光
    const open = sh * 0.22;
    g.fillStyle = '#F2B46B';
    g.fillRect(sx, top + sh - open, sw, open);
    ge.fillStyle = '#C98A45';
    ge.fillRect(sx, top + sh - open, sw, open);
    g.fillStyle = '#6E5444';
    g.fillRect(sx - 6, top - 8, sw + 12, 10);
  } else {
    const glow = g.createLinearGradient(0, top, 0, top + sh);
    glow.addColorStop(0, '#FFE3B8');
    glow.addColorStop(1, '#EFA963');
    g.fillStyle = glow;
    g.fillRect(sx, top, sw, sh);
    ge.fillStyle = '#E8B070';
    ge.fillRect(sx, top, sw, sh);
    // 店內層架剪影
    g.fillStyle = 'rgba(90,63,47,0.35)';
    for (let k = 0; k < 3; k++) g.fillRect(sx + sw * 0.1, top + sh * (0.25 + k * 0.22), sw * 0.8, 5);
    // 窗框
    g.strokeStyle = trim;
    ge.strokeStyle = '#000';
    g.lineWidth = ge.lineWidth = 6;
    [g, ge].forEach((cx) => {
      cx.strokeRect(sx, top, sw, sh);
      cx.beginPath(); cx.moveTo(sx + sw / 2, top); cx.lineTo(sx + sw / 2, top + sh); cx.stroke();
    });
    // 招牌色塊
    g.fillStyle = ground === 'tea' ? '#6F8B57' : '#4F6D7A';
    g.fillRect(sx, gy + 16, sw, groundH * 0.14);
    g.fillStyle = '#F7F1E8';
    g.beginPath();
    g.arc(sx + sw / 2, gy + 16 + groundH * 0.07, groundH * 0.05, 0, Math.PI * 2);
    g.fill();
    if (ground === 'tea') {
      g.fillStyle = '#6F8B57';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 ${Math.round(groundH * 0.07)}px ${SANS}`;
      g.fillText('茶', sx + sw / 2, gy + 17 + groundH * 0.07);
    }
  }
  return { color: c, emit: e };
}
