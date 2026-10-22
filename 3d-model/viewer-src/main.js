import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const D = window.__DATA__;
const SLOTS = D.slots.slots;
const TYPES = D.slots.vehicle_types;
const byId = Object.fromEntries(SLOTS.map(s => [s.id, s]));
const typeById = Object.fromEntries(TYPES.map(t => [t.id, t]));

const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const loader = new GLTFLoader();
const parse = buf => new Promise((res, rej) => loader.parse(buf, '', res, rej));

// ---------------------------------------------------------------- three setup
const wrap = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
wrap.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ef);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 1.2;
controls.maxDistance = 160;
controls.zoomToCursor = true;
controls.screenSpacePanning = true;
controls.zoomSpeed = 1.2;
const _c = (D.slots.lot && D.slots.lot.center) || [0.15, 0];
const CENTER = new THREE.Vector3(_c[0], 0, -_c[1]);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(CENTER.x - 25, 40, CENTER.z + 18);
sun.target.position.copy(CENTER);
scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
scene.add(sun);

let anim = null;
let wallsObj = null, ghostManual = false, ghostAuto = false;
function applyGhost() {
  if (!wallsObj) return;
  const on = ghostManual || ghostAuto;
  wallsObj.traverse(o => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.transparent = true; m.opacity = on ? 0.16 : 1; m.depthWrite = !on; m.needsUpdate = true; }); } });
}
function flyTo(pos, target, ms = 750) {
  anim = { t0: performance.now(), ms, p0: camera.position.clone(), g0: controls.target.clone(), p1: pos.clone(), g1: target.clone() };
}
function stepAnim(now) {
  if (!anim) return;
  const k = Math.min(1, (now - anim.t0) / anim.ms);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  camera.position.lerpVectors(anim.p0, anim.p1, e);
  controls.target.lerpVectors(anim.g0, anim.g1, e);
  if (k >= 1) anim = null;
}
function setView(kind, animate) {
  const pos = kind === 'top' ? new THREE.Vector3(CENTER.x, 82, CENTER.z + 0.001)
                             : new THREE.Vector3(CENTER.x - 36, 44, CENTER.z + 46);
  ghostAuto = false; applyGhost();
  if (animate) { flyTo(pos, CENTER); return; }
  anim = null;
  camera.position.copy(pos);
  controls.target.copy(CENTER);
  controls.update();
}
setView('iso');

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- lot
const carTemplates = {};
const pads = {};          // slotId -> mesh
const parked = {};        // slotId -> {group, type, colors, plate:{text,province}, plateTex}
let selected = null;
let hover = null;

function shadowify(root) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

function makePad(s) {
  const geo = new THREE.PlaneGeometry(s.size.width_m - 0.12, s.size.length_m - 0.12);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.28, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(s.center_gltf.x, 0.03, s.center_gltf.z);
  m.rotation.y = s.rotation_y_rad_threejs;
  m.userData.slotId = s.id;
  m.renderOrder = 2;
  scene.add(m);
  pads[s.id] = m;
}

function paintPad(id) {
  const m = pads[id].material;
  const occ = !!parked[id];
  let c = occ ? 0x2563eb : 0x22c55e, o = occ ? 0.22 : 0.28;
  if (hover === id) { c = 0xf59e0b; o = 0.45; }
  if (selected === id) { c = 0xf59e0b; o = 0.6; }
  m.color.setHex(c); m.opacity = o;
}

// ---------------------------------------------------------------- cars
function instance(typeId, colors) {
  const tpl = carTemplates[typeId];
  const root = tpl.clone(true);
  root.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
  shadowify(root);
  applyColors(root, typeId, colors);
  return root;
}

// ---- ป้ายทะเบียน: วาดลง canvas แล้วใส่เป็น texture ของวัสดุ plate_front / plate_rear ของรถแต่ละคัน
function plateTexture(plate) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 490;
  const x = c.getContext('2d');
  x.fillStyle = '#fbfaf3'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#14171b'; x.lineWidth = 16;
  x.beginPath(); x.roundRect(14, 14, c.width - 28, c.height - 28, 34); x.stroke();
  x.fillStyle = '#101317'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const font = '"Noto Sans Thai","Sarabun","Tahoma","Leelawadee UI",system-ui,sans-serif';
  const text = (plate && plate.text) ? plate.text : '';
  const prov = (plate && plate.province) || '';
  // เลขทะเบียน: ตัวใหญ่หนา กินพื้นที่เกือบทั้งป้าย; จังหวัด: บรรทัดล่างตัวใหญ่ชัด
  const nFont = text.length > 9 ? 215 : 250;
  x.shadowColor = 'rgba(255,255,255,.9)'; x.shadowOffsetY = 3;
  x.font = `800 ${nFont}px ${font}`;
  x.fillText(text || '— — —', c.width / 2, prov ? 190 : 245, c.width - 90);
  if (prov) {
    x.font = `700 ${prov.length > 12 ? 100 : 118}px ${font}`;
    x.fillText(prov, c.width / 2, 385, c.width - 90);
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}
function applyPlate(p) {
  if (p.plateTex) p.plateTex.dispose();
  p.plateTex = plateTexture(p.plate);
  p.group.traverse(o => {
    if (o.isMesh && (o.material.name === 'plate_front' || o.material.name === 'plate_rear')) {
      o.material.map = p.plateTex;
      o.material.color.set('#ffffff');
      o.material.needsUpdate = true;
    }
  });
}

function applyColors(root, typeId, colors) {
  const names = typeById[typeId].colorable_materials;
  const map = {};
  for (const k of Object.keys(names)) map[names[k]] = colors[k];
  root.traverse(o => {
    if (o.isMesh && map[o.material.name]) o.material.color.set(map[o.material.name]);
  });
}

function park(slotId, typeId, colors, plate) {
  if (!plate && parked[slotId]) plate = parked[slotId].plate;
  unpark(slotId, false);
  const s = byId[slotId], t = typeById[typeId];
  const h = s.heading_deg * Math.PI / 180;
  const dx = Math.sin(h), dz = -Math.cos(h);
  const g = new THREE.Group();
  g.add(instance(typeId, colors));
  g.position.set(s.center_gltf.x + dx * (t.park_offset_m + (s.park_offset_extra_m || 0)), 0, s.center_gltf.z + dz * (t.park_offset_m + (s.park_offset_extra_m || 0)));
  g.rotation.y = s.rotation_y_rad_threejs;
  scene.add(g);
  g.traverse(o => { if (o.isMesh) o.userData.slotId = slotId; });
  parked[slotId] = { group: g, type: typeId, colors: { ...colors }, plate: plate ? { ...plate } : { text: '', province: '' } };
  applyPlate(parked[slotId]);
  paintPad(slotId);
  persist(); renderList(); renderPanel();
}

function unpark(slotId, refresh = true) {
  const p = parked[slotId];
  if (!p) return;
  scene.remove(p.group);
  if (p.plateTex) p.plateTex.dispose();
  delete parked[slotId];
  paintPad(slotId);
  if (refresh) { persist(); renderList(); renderPanel(); }
}

// ---------------------------------------------------------------- UI state
const SWATCH = ['#e9e9e4', '#c9ced4', '#1f2933', '#b3262e', '#2c5fa8', '#12a89d', '#e0c341', '#c26a24', '#5a3d2b', '#8a1f2c', '#37474f', '#d946ef'];
let cur = { type: 'sedan', colors: { ...typeDefaults('sedan') } };
function typeDefaults(id) { return { ...typeById[id].default_colors }; }

const $ = id => document.getElementById(id);

function persist() {
  try {
    const o = {};
    for (const [id, p] of Object.entries(parked)) o[id] = { type: p.type, colors: p.colors, plate: p.plate };
    localStorage.setItem('parking3d.assign.v2', JSON.stringify(o));
  } catch (e) { /* ignore */ }
}

function labelOf(k, typeId) {
  if (k === 'paint') return 'สีตัวถัง';
  if (k === 'cage') return 'สีคอก';
  return 'สีแถบ/ชิ้นตกแต่ง';
}

function renderPanel() {
  const box = $('panel');
  const s = selected ? byId[selected] : null;
  const p = s ? parked[selected] : null;
  const showType = p ? p.type : cur.type;
  const colors = p ? p.colors : cur.colors;
  let h = '';
  h += s ? `<div class="sel"><b>ช่อง ${s.id}</b><span>หมายเลข ${s.number} · ${s.zone_th}</span><span>${s.size.width_m.toFixed(1)} × ${s.size.length_m.toFixed(1)} ม. · หัวรถหัน ${s.heading_deg}°</span><span class="${p ? 'occ' : 'free'}">${p ? 'มีรถจอดอยู่: ' + typeById[p.type].label_th : 'ว่าง'}</span></div>`
          : `<div class="sel"><b>คลิกช่องจอดในภาพ หรือเลือกจากรายการด้านล่าง</b><span>แล้วเลือกประเภทรถและสีได้อย่างอิสระ</span></div>`;
  if (p) {
    const t = typeById[p.type];
    h += `<div class="carcard"><div class="ch"><b>${t.label_th}</b><span>ช่อง ${s.id} · หมายเลข ${s.number}</span></div>
      <label>ทะเบียน (ป้ายหน้า-หลังคันนี้)</label>
      <input id="plateText" data-plate="text" value="${(p.plate.text || '').replace(/"/g, '&quot;')}" placeholder="เช่น 1กข 1234" maxlength="14">
      <input id="plateProv" data-plate="province" value="${(p.plate.province || '').replace(/"/g, '&quot;')}" placeholder="จังหวัด" maxlength="30">
      <div class="views"><button data-view="iso">มุมเฉียง</button><button data-view="front">ป้ายหน้า</button><button data-view="rear">ป้ายหลัง</button><button data-view="side">ด้านข้าง</button></div>
      <div class="nav"><button data-step="-1">◀ คันก่อนหน้า</button><button data-step="1">คันถัดไป ▶</button><button data-view="all">ภาพรวมลาน</button></div></div>`;
  }
  h += '<h3>ประเภทรถ</h3><div class="types">';
  for (const t of TYPES) h += `<button class="type ${t.id === showType ? 'on' : ''}" data-type="${t.id}">${t.label_th}<small>${t.length_m.toFixed(1)}×${t.width_m.toFixed(1)} ม.</small></button>`;
  h += '</div><h3>สี</h3>';
  for (const k of Object.keys(typeById[showType].colorable_materials)) {
    h += `<div class="color"><label>${labelOf(k)}</label><input type="color" data-k="${k}" value="${colors[k] || '#888888'}"><div class="sw">`;
    for (const c of SWATCH) h += `<i data-k="${k}" data-c="${c}" style="background:${c}"></i>`;
    h += '</div></div>';
  }
  h += `<div class="actions"><button id="btnPark" ${s ? '' : 'disabled'}>${p ? 'อัปเดตรถในช่อง ' + selected : 'จอดรถที่ช่อง ' + (selected || '–')}</button><button id="btnClear" class="ghost" ${p ? '' : 'disabled'}>เอารถออก</button></div>`;
  box.innerHTML = h;
}

function renderList() {
  const el = $('list');
  let h = '';
  for (const s of SLOTS) {
    const p = parked[s.id];
    h += `<li data-id="${s.id}" class="${selected === s.id ? 'on' : ''}"><b>${s.number}</b><span>${s.id}</span><em>${s.kind === 'angled' ? 'เฉียง' : 'ตรง'}</em><span class="car">${p ? typeById[p.type].label_th + (p.plate && p.plate.text ? ' · ' + p.plate.text : '') : '—'}</span>${p ? `<i class="dot" style="background:${p.colors.paint}"></i>` : ''}</li>`;
  }
  el.innerHTML = h;
  $('count').textContent = `${Object.keys(parked).length} / ${SLOTS.length} ช่อง`;
}

function select(id, fly = true) {
  const prev = selected;
  selected = id;
  if (prev) paintPad(prev);
  if (id) paintPad(id);
  if (id && parked[id]) { cur.type = parked[id].type; cur.colors = { ...parked[id].colors }; if (fly) flyToCar(id, 'iso'); }
  renderList(); renderPanel();
}

// ---- มุมกล้องดูรถรายคัน
function flyToCar(id, mode = 'iso') {
  const p = parked[id]; if (!p) return;
  ghostAuto = true; applyGhost();
  const t = typeById[p.type];
  const g = p.group.position;
  const h = byId[id].heading_deg * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));      // ทิศหัวรถ
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const c = new THREE.Vector3(g.x, 0, g.z);
  const L = t.length_m, W = t.width_m;
  const up = y => new THREE.Vector3(0, y, 0);
  let pos, tgt;
  if (mode === 'front') {
    tgt = c.clone().addScaledVector(dir, L / 2).add(up(0.55));
    pos = tgt.clone().addScaledVector(dir, 1.6).addScaledVector(right, -0.35).add(up(0.12));
  } else if (mode === 'rear') {
    tgt = c.clone().addScaledVector(dir, -L / 2).add(up(0.6));
    pos = tgt.clone().addScaledVector(dir, -1.6).addScaledVector(right, 0.35).add(up(0.12));
  } else if (mode === 'side') {
    tgt = c.clone().add(up(0.75));
    pos = tgt.clone().addScaledVector(right, W / 2 + 5.2).add(up(1.0));
  } else {
    tgt = c.clone().add(up(0.7));
    pos = tgt.clone().addScaledVector(dir, L * 0.55).addScaledVector(right, -(W / 2 + 3.4)).add(up(2.9));
  }
  flyTo(pos, tgt);
}
function stepCar(d) {
  const ids = SLOTS.filter(s => parked[s.id]).map(s => s.id);
  if (!ids.length) return;
  let i = ids.indexOf(selected);
  i = i < 0 ? (d > 0 ? 0 : ids.length - 1) : (i + d + ids.length) % ids.length;
  select(ids[i]);
}

$('panel').addEventListener('click', e => {
  const vb = e.target.closest('[data-view]');
  const sb = e.target.closest('[data-step]');
  if (vb) { if (vb.dataset.view === 'all') setView('iso', true); else if (selected) flyToCar(selected, vb.dataset.view); return; }
  if (sb) { stepCar(+sb.dataset.step); return; }
  const tb = e.target.closest('[data-type]');
  const sw = e.target.closest('i[data-c]');
  if (tb) {
    const t = tb.dataset.type;
    const keep = parked[selected] ? parked[selected].colors : cur.colors;
    cur.type = t;
    cur.colors = { ...typeDefaults(t), paint: keep.paint || typeById[t].default_colors.paint };
    if (selected) park(selected, t, cur.colors); else renderPanel();
  } else if (sw) {
    setColor(sw.dataset.k, sw.dataset.c);
  } else if (e.target.id === 'btnPark' && selected) {
    park(selected, cur.type, cur.colors);
  } else if (e.target.id === 'btnClear' && selected) {
    unpark(selected);
  }
});
$('panel').addEventListener('input', e => {
  if (e.target.dataset.plate && selected && parked[selected]) {
    const p = parked[selected];
    p.plate[e.target.dataset.plate] = e.target.value;
    applyPlate(p); persist(); renderList();
    return;
  }
  if (e.target.type === 'color') setColor(e.target.dataset.k, e.target.value, true);
});
function setColor(k, c, live) {
  const p = selected && parked[selected];
  if (p) {
    p.colors[k] = c;
    applyColors(p.group, p.type, p.colors);
    cur.colors = { ...p.colors };
    persist();
    renderList();
    if (!live) renderPanel();
  } else {
    cur.colors[k] = c;
    if (!live) renderPanel();
  }
}
$('list').addEventListener('click', e => { const li = e.target.closest('li'); if (li) select(li.dataset.id); });

$('vIso').onclick = () => setView('iso', true);
$('vTop').onclick = () => setView('top', true);
$('btnDemo').onclick = () => loadAssignment(D.slots.demo_assignment, true);
$('btnClearAll').onclick = () => { Object.keys(parked).forEach(id => unpark(id, false)); persist(); renderList(); renderPanel(); };
$('btnWall').onclick = () => { ghostManual = !ghostManual; applyGhost(); };
$('btnNum').onclick = () => { numbersObj && (numbersObj.visible = !numbersObj.visible); };
let padsVisible = true;
$('btnPads').onclick = () => { padsVisible = !padsVisible; Object.values(pads).forEach(m => m.visible = padsVisible); };

function loadAssignment(a, demo) {
  Object.keys(parked).forEach(id => unpark(id, false));
  for (const [id, v] of Object.entries(a)) {
    const t = v.type || v.vehicle;
    if (!byId[id] || !typeById[t]) continue;
    const colors = v.colors ? { ...v.colors } : { ...typeDefaults(t), paint: v.paint || typeById[t].default_colors.paint };
    park(id, t, colors, v.plate);
  }
  renderList(); renderPanel();
}

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const cars = Object.values(parked).map(p => p.group);
  const hits = ray.intersectObjects([...cars, ...Object.values(pads)], true);
  for (const h of hits) { if (h.object.userData.slotId) return h.object.userData.slotId; }
  return null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; anim = null; });
renderer.domElement.addEventListener('wheel', () => { anim = null; }, { passive: true });
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA/.test((e.target.tagName || ''))) return;
  if (e.key === 'ArrowRight') stepCar(1); else if (e.key === 'ArrowLeft') stepCar(-1);
});
renderer.domElement.addEventListener('pointerup', e => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) { const id = pick(e); if (id) select(id); }
  down = null;
});
renderer.domElement.addEventListener('pointermove', e => {
  const id = pick(e);
  if (id !== hover) { const old = hover; hover = id; if (old) paintPad(old); if (id) paintPad(id); renderer.domElement.style.cursor = id ? 'pointer' : 'grab'; }
});

// ---------------------------------------------------------------- boot
let numbersObj = null;
(async () => {
  const lot = await parse(b64(D.lot));
  shadowify(lot.scene);
  lot.scene.traverse(o => { if (o.name === 'LOT_SlotNumbers') numbersObj = o; if (o.name === 'LOT_Walls') wallsObj = o; });
  scene.add(lot.scene);
  for (const t of TYPES) {
    const g = await parse(b64(D.cars[t.id]));
    carTemplates[t.id] = g.scene;
  }
  SLOTS.forEach(makePad);
  resize();
  let restored = false;
  try {
    const raw = localStorage.getItem('parking3d.assign.v2');
    if (raw) { loadAssignment(JSON.parse(raw)); restored = Object.keys(parked).length > 0; }
  } catch (e) { /* ignore */ }
  if (!restored) loadAssignment(D.slots.demo_assignment, true);
  SLOTS.forEach(s => paintPad(s.id));
  renderList(); renderPanel();
  $('loading').remove();
  renderer.setAnimationLoop(now => { stepAnim(now); controls.update(); renderer.render(scene, camera); });
})();


// ---------------------------------------------------------------- API สำหรับต่อกับระบบจริง
// เรียกใช้จากภายนอก: window.ParkingViewer.park('N01', { type:'sedan', colors:{paint:'#b3262e'}, plate:{text:'1กข 1234', province:'กรุงเทพมหานคร'} })
window.ParkingViewer = {
  park: (slotId, o) => {
    const t = o.type || o.vehicle;
    const colors = o.colors ? { ...o.colors } : { ...typeDefaults(t), paint: o.paint || typeById[t].default_colors.paint };
    park(slotId, t, colors, o.plate);
  },
  clear: id => unpark(id),
  setPlate: (id, text, province) => { const p = parked[id]; if (!p) return; p.plate = { text, province: province ?? p.plate.province }; applyPlate(p); persist(); renderList(); },
  setColor: (id, key, color) => { const p = parked[id]; if (!p) return; p.colors[key] = color; applyColors(p.group, p.type, p.colors); persist(); renderList(); },
  focus: (id, mode = 'iso') => { select(id, false); flyToCar(id, mode); },
  overview: kind => setView(kind || 'iso', true),
  slots: () => SLOTS.map(s => ({ id: s.id, number: s.number, occupied: !!parked[s.id] })),
  state: () => Object.fromEntries(Object.entries(parked).map(([id, p]) => [id, { type: p.type, colors: p.colors, plate: p.plate }])),
};
