// The 3D lot: loads the Blender model and parks a car on every rented slot, in clear
// daylight with soft shadows. The class is framework-free; the React page owns the data.
import * as THREE from "three";
import { bayGrid, bayOffset } from "../../../shared/lot";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ------------------------------------------------------------------ types

export interface SlotDef {
  id: string;
  number: number;
  zone_th: string;
  kind: "straight" | "angled" | "storage";
  heading_deg: number;
  size: { width_m: number; length_m: number };
  center_gltf: { x: number; z: number };
  rotation_y_rad_threejs: number;
  park_offset_extra_m: number;
  height_m?: number; // storage shed roof height
}
export interface VehicleTypeDef {
  id: string;
  label_th: string;
  length_m: number;
  width_m: number;
  height_m: number;
  park_offset_m: number;
  colorable_materials: Record<string, string>;
  default_colors: Record<string, string>;
}
export interface SlotsFile {
  lot: { center: [number, number]; walls_polygon: [number, number][]; house: { x0: number; x1: number; y0: number; y1: number } };
  vehicle_types: VehicleTypeDef[];
  slots: SlotDef[];
}

/** Rent status of the car this month; drives the colour of the slot marking. */
export type PadTone = "empty" | "paid" | "pending" | "late" | "closed" | "private" | "owner";
export interface CarInput {
  key: string; // the slot id, or "N04#2" for the third motorcycle bay of slot N04
  slotId: string;
  bay: number | null;
  type: string;
  color: string;
  plate: string;
  province: string;
  tone: "paid" | "pending" | "late" | "owner";
}
/** iso = three-quarter view of the plate side, plate = straight at the plate, side = profile. */
export type ViewMode = "iso" | "plate" | "side";
export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}
export interface LotEvents {
  onPick: (key: string) => void;
  onHover: (key: string | null, clientX: number, clientY: number) => void;
  onLabel: (p: ScreenPoint | null) => void;
  onReady: () => void;
  onError: (message: string) => void;
}
interface Parked {
  group: THREE.Group;
  input: CarInput;
  plateTex: THREE.CanvasTexture | null;
}

// ----------------------------------------------------------------- helpers

const PAD_COLOR: Record<PadTone, [number, number]> = {
  empty: [0x94a3b8, 0.1],
  paid: [0x22c55e, 0.34],
  pending: [0xeab308, 0.42],
  closed: [0x475467, 0.55],
  private: [0x7a5af8, 0.45],
  owner: [0x2563eb, 0.4],
  late: [0xef4444, 0.48],
};
const FONT = '"IBM Plex Sans Thai","Noto Sans Thai",Tahoma,"Leelawadee UI",system-ui,sans-serif';

function plateTexture(text: string, province: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 490;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fbfaf3";
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = "#14171b";
  x.lineWidth = 16;
  x.beginPath();
  x.roundRect(14, 14, c.width - 28, c.height - 28, 34);
  x.stroke();
  x.fillStyle = "#101317";
  x.textAlign = "center";
  x.textBaseline = "middle";
  const nFont = text.length > 9 ? 215 : 250;
  x.font = `700 ${nFont}px ${FONT}`;
  x.fillText(text || "— — —", c.width / 2, province ? 190 : 245, c.width - 90);
  if (province) {
    x.font = `600 ${province.length > 12 ? 100 : 118}px ${FONT}`;
    x.fillText(province, c.width / 2, 385, c.width - 90);
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

// ------------------------------------------------------------------ scene

export class LotScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private controls: OrbitControls;
  private center: THREE.Vector3;
  private slots: SlotDef[];
  private slotById: Record<string, SlotDef>;
  private typeById: Record<string, VehicleTypeDef>;
  private templates: Record<string, THREE.Object3D> = {};
  private parked = new Map<string, Parked>();
  private pads = new Map<string, THREE.Mesh>();
  private tones = new Map<string, PadTone>();
  private outline: THREE.LineLoop;
  private walls: THREE.Object3D | null = null;
  private shed: THREE.Object3D | null = null;
  private shedRoof: number | null = null; // measured roof height of the built-in shed (the status plane sits just above it)
  private storageIds = new Set<string>(); // slots that are storage sheds (from the zones)
  private extraSheds = new Map<string, { group: THREE.Group; height: number }>(); // a copy of the shed model on every other storage slot
  private numbers: THREE.Object3D | null = null;
  private sun = new THREE.DirectionalLight(0xfff4e5, 2.4);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.55);
  private ray = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hover: string | null = null;
  private selected: string | null = null; // a car key, or a slot id for an empty slot
  private zoneTone = new Map<string, PadTone>(); // empty-slot look from its zone (closed / private)
  private bayFrames: THREE.Object3D | null = null;
  private hoverQueued = false;
  private lastPointer = { x: 0, y: 0 };
  private down: { x: number; y: number } | null = null;
  private anim: { t0: number; ms: number; p0: THREE.Vector3; g0: THREE.Vector3; p1: THREE.Vector3; g1: THREE.Vector3 } | null = null;
  private inset = { x: 0, y: 0 };
  private insetTarget = { x: 0, y: 0 };
  private wallsManual = false;
  private wallsAuto = false;
  private padsVisible = true;
  private dirty = true;
  private disposed = false;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;
  private edges: [number, number, number, number][] = [];
  private outline3d: [number, number, number][] = []; // glTF x, z, height of the lot outline
  private overviewKind: "iso" | "top" = "iso";
  private autoFit = true;
  private events: LotEvents;
  private container: HTMLElement;
  private baseUrl: string;
  private withCars = true; // the zone picker leaves the car models out: it only needs the lot
  private padOverride: Record<string, [number, number]> | null = null;

  constructor(container: HTMLElement, data: SlotsFile, events: LotEvents, baseUrl = "/3d", opts: { cars?: boolean } = {}) {
    this.withCars = opts.cars !== false;
    this.container = container;
    this.events = events;
    this.baseUrl = baseUrl;
    this.slots = data.slots;
    this.slotById = Object.fromEntries(data.slots.map((s) => [s.id, s]));
    this.typeById = Object.fromEntries(data.vehicle_types.map((t) => [t.id, t]));
    this.center = new THREE.Vector3(data.lot.center[0], 0, -data.lot.center[1]);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
    this.renderer.domElement.setAttribute("aria-label", "ผังที่จอดรถ 3 มิติ ลากเพื่อหมุน ซูมด้วยล้อเมาส์หรือบีบนิ้ว");
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.09,
      maxPolarAngle: Math.PI / 2 - 0.02,
      minDistance: 1.5,
      maxDistance: 240,
      zoomToCursor: true,
      screenSpacePanning: true,
      zoomSpeed: 1.1,
    });
    this.controls.addEventListener("change", () => (this.dirty = true));
    this.controls.addEventListener("start", () => {
      this.anim = null;
      this.autoFit = false;
    });

    this.scene.background = new THREE.Color(0xe9e6df);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.position.set(this.center.x - 25, 40, this.center.z + 18);
    this.sun.target.position.copy(this.center);
    this.sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.sun.shadow.mapSize.set(small ? 1536 : 2048, small ? 1536 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;

    const ol = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 0, -1), new THREE.Vector3(1, 0, 1), new THREE.Vector3(-1, 0, 1)]);
    this.outline = new THREE.LineLoop(ol, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
    this.outline.renderOrder = 5;
    this.outline.visible = false;
    this.scene.add(this.outline);

    this.slots.forEach((s) => this.makePad(s));
    const poly = data.lot.walls_polygon;
    for (const [x, y] of poly) this.outline3d.push([x, -y, 0], [x, -y, 3]);
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      this.edges.push([a[0], a[1], b[0], b[1]]);
    });
    const hs = data.lot.house;
    this.edges.push([hs.x0, hs.y0, hs.x1, hs.y0], [hs.x1, hs.y0, hs.x1, hs.y1], [hs.x1, hs.y1, hs.x0, hs.y1], [hs.x0, hs.y1, hs.x0, hs.y0]);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("wheel", this.onWheel, { passive: true });
    el.addEventListener("webglcontextlost", this.onContextLost);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.setOverview("iso", false);
    this.renderer.setAnimationLoop(this.frame);
  }

  // ----------------------------------------------------------------- loading

  async load() {
    try {
      const loader = new GLTFLoader();
      const get = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`โหลดโมเดลไม่สำเร็จ (${res.status})`);
        return res.arrayBuffer();
      };
      const parse = (buf: ArrayBuffer) => new Promise<THREE.Object3D>((res, rej) => loader.parse(buf, "", (g) => res(g.scene), rej));
      const types = this.withCars ? Object.keys(this.typeById) : [];
      const [lot, ...cars] = await Promise.all([
        get(`${this.baseUrl}/lot.glb`).then(parse),
        ...types.map((t) => get(`${this.baseUrl}/cars/${t}.glb`).then(parse)),
      ]);
      if (this.disposed) return;
      lot.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
        if (o.name === "LOT_Walls") this.walls = o;
        if (o.name === "LOT_Shed") this.shed = o;
        if (o.name === "LOT_SlotNumbers") this.numbers = o;
      });
      this.scene.add(lot);
      if (this.shed) {
        lot.updateMatrixWorld(true);
        this.shedRoof = new THREE.Box3().setFromObject(this.shed).max.y;
      }
      // the storage shed is rentable like a parking space: clicking it picks its slot
      const storage = this.slots.find((sl) => sl.kind === "storage");
      if (storage && this.shed) this.shed.traverse((o) => (o.userData.slotId = storage.id));
      this.syncSheds();
      types.forEach((t, i) => (this.templates[t] = cars[i]));
      this.flushParked();
      this.dirty = true;
      this.events.onReady();
    } catch (e) {
      this.events.onError(e instanceof Error ? e.message : "โหลดโมเดล 3 มิติไม่สำเร็จ");
    }
  }

  // -------------------------------------------------------------------- pads

  private makePad(s: SlotDef) {
    const grow = this.padGrow(s);
    const geo = new THREE.PlaneGeometry(s.size.width_m - 0.12 + grow, s.size.length_m - 0.12 + grow);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.1, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(s.center_gltf.x, this.padY(), s.center_gltf.z);
    m.rotation.y = s.rotation_y_rad_threejs;
    m.userData.slotId = s.id;
    m.renderOrder = 2;
    this.scene.add(m);
    this.pads.set(s.id, m);
    this.tones.set(s.id, "empty");
  }

  private slotOf = (key: string) => key.split("#")[0];

  /** Roof height of the storage shed on this slot (0 when the slot is a parking space). */
  private shedHeight(s: SlotDef): number {
    if (s.kind === "storage") return this.shedRoof ?? s.height_m ?? 2.5;
    return this.extraSheds.get(s.id)?.height ?? 0;
  }
  private isShed = (id: string) => this.slotById[id]?.kind === "storage" || this.extraSheds.has(id);
  // the status colour always lies on the ground. The built-in shed fills its slot, so its plane is made wider than the
  // slot to leave a green/red/amber border visible all around the shed; a copied shed is smaller than its slot anyway
  private padGrow = (s: SlotDef) => (s.kind === "storage" ? 1.4 : 0);
  private padY = () => 0.03;

  /**
   * Every slot of a storage zone shows the storage shed: the model that is built into the lot (the dark grey box) is
   * copied onto the slot, turned along its length and kept inside its lines. Slots that stop being storage lose their copy.
   */
  private syncSheds() {
    if (!this.shed) return;
    for (const [id, e] of [...this.extraSheds]) {
      if (this.storageIds.has(id) && this.slotById[id]) continue;
      this.scene.remove(e.group);
      this.extraSheds.delete(id);
    }
    for (const id of this.storageIds) {
      const s = this.slotById[id];
      if (!s || s.kind === "storage" || this.extraSheds.has(id)) continue;
      const group = new THREE.Group();
      const copy = this.shed.clone(true);
      group.add(copy);
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      copy.position.set(copy.position.x - c.x, copy.position.y - box.min.y, copy.position.z - c.z);
      // the long side runs along the slot; never bigger than the real shed, shrunk only when the slot is narrower
      const k = Math.min(1, (s.size.length_m - 0.5) / Math.max(size.x, size.z), (s.size.width_m - 0.3) / Math.min(size.x, size.z));
      group.scale.setScalar(k);
      group.position.set(s.center_gltf.x, 0, s.center_gltf.z);
      group.rotation.y = s.rotation_y_rad_threejs + (size.x >= size.z ? Math.PI / 2 : 0);
      group.traverse((o) => (o.userData.slotId = id));
      this.scene.add(group);
      this.extraSheds.set(id, { group, height: size.y * k });
    }
    for (const s of this.slots) {
      const pad = this.pads.get(s.id);
      if (pad) pad.position.y = this.padY();
    }
    this.placeOutline();
    this.dirty = true;
  }

  private paintPad(id: string) {
    const pad = this.pads.get(id);
    if (!pad) return;
    const mat = pad.material as THREE.MeshBasicMaterial;
    const tone = this.tones.get(id) ?? "empty";
    const [color, opacity] = this.padOverride?.[id] ?? PAD_COLOR[tone === "empty" ? (this.zoneTone.get(id) ?? "empty") : tone];
    mat.color.setHex(color);
    mat.opacity = opacity;
    if (this.hover && this.slotOf(this.hover) === id) mat.opacity = Math.min(0.75, opacity + 0.25);
    if (this.selected && this.slotOf(this.selected) === id) mat.opacity = Math.min(0.8, opacity + 0.3);
    this.dirty = true;
  }

  private placeOutline() {
    const s = this.selected ? this.slotById[this.slotOf(this.selected)] : null;
    const pad = s ? this.pads.get(s.id) : null;
    if (!s || !pad) {
      this.outline.visible = false;
      return;
    }
    this.outline.visible = true;
    this.outline.position.set(s.center_gltf.x, this.padY() + 0.02, s.center_gltf.z);
    this.outline.rotation.y = s.rotation_y_rad_threejs;
    const grow = this.padGrow(s);
    this.outline.scale.set((s.size.width_m - 0.12 + grow) / 2, 1, (s.size.length_m - 0.12 + grow) / 2);
  }

  // -------------------------------------------------------------------- cars

  private pendingCars: CarInput[] = [];

  /** Replace the parked cars with exactly this list (cars that did not change are kept). */
  setCars(list: CarInput[]) {
    this.pendingCars = list;
    if (Object.keys(this.templates).length) this.flushParked();
  }

  slotIds(): string[] {
    return this.slots.map((sl) => sl.id);
  }

  /** Paint chosen slots in your own colour: { N01: [0xf2c200, 0.6] } (colour, opacity). null = back to the normal look. */
  setPadOverride(map: Record<string, [number, number]> | null) {
    this.padOverride = map;
    for (const s of this.slots) this.paintPad(s.id);
  }

  /** Zones decide how an empty slot looks: closed (grey) or private (violet). */
  setZones(zones: { slotIds: string[]; access: "public" | "private"; isActive: boolean; kind?: "parking" | "storage" }[]) {
    this.zoneTone.clear();
    this.storageIds = new Set(zones.filter((z) => z.kind === "storage").flatMap((z) => z.slotIds));
    for (const z of zones) for (const id of z.slotIds) this.zoneTone.set(id, !z.isActive ? "closed" : z.access === "private" ? "private" : "empty");
    this.syncSheds();
    for (const s of this.slots) this.paintPad(s.id);
  }

  /** Draw the marked bays of motorcycle zones so every bike visibly sits inside its own frame. */
  setBays(bays: { slotId: string; bay: number }[]) {
    if (this.bayFrames) {
      this.scene.remove(this.bayFrames);
      this.bayFrames.traverse((o) => {
        if (o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.bayFrames = null;
    }
    if (!bays.length) {
      this.dirty = true;
      return;
    }
    const pts: number[] = [];
    const hw = 0.46;
    const hl = 1.1;
    for (const { slotId, bay } of bays) {
      const s = this.slotById[slotId];
      if (!s) continue;
      const h = (s.heading_deg * Math.PI) / 180;
      const dir = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
      const right = new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
      const o = bayOffset(slotId, bay);
      const c = new THREE.Vector3(s.center_gltf.x, 0.06, s.center_gltf.z).addScaledVector(right, o.x).addScaledVector(dir, o.z);
      const corner = (a: number, b: number) => c.clone().addScaledVector(right, a * hw).addScaledVector(dir, b * hl);
      const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      for (let i = 0; i < 4; i++) pts.push(q[i].x, q[i].y, q[i].z, q[(i + 1) % 4].x, q[(i + 1) % 4].y, q[(i + 1) % 4].z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    lines.renderOrder = 3;
    this.bayFrames = lines;
    this.scene.add(lines);
    this.dirty = true;
  }

  private flushParked() {
    const valid = this.pendingCars.filter((c) => this.slotById[c.slotId]);
    const want = new Map(valid.filter((c) => this.typeById[c.type]).map((c) => [c.key, c]));
    for (const key of [...this.parked.keys()]) if (!want.has(key)) this.unpark(key);
    for (const [key, input] of want) {
      const cur = this.parked.get(key);
      if (cur && cur.input.type === input.type) {
        if (cur.input.color !== input.color) this.applyColors(cur.group, input);
        if (cur.input.plate !== input.plate || cur.input.province !== input.province) this.applyPlate(cur, input);
        cur.input = input;
      } else {
        this.park(input);
      }
    }
    // a slot's marking follows the worst rent status of whoever is in it (storage has no car model)
    const rank: Record<string, number> = { owner: 0, paid: 1, pending: 2, late: 3 };
    const toneOf = new Map<string, PadTone>();
    for (const c of valid) {
      const prev = toneOf.get(c.slotId);
      if (!prev || (rank[c.tone] ?? 0) > (rank[prev] ?? 0)) toneOf.set(c.slotId, c.tone);
    }
    for (const s of this.slots) {
      this.tones.set(s.id, toneOf.get(s.id) ?? "empty");
      this.paintPad(s.id);
    }
    this.dirty = true;
  }

  private park(input: CarInput) {
    this.unpark(input.key); // a different model for the same place replaces the old one: never two cars on top of each other
    const s = this.slotById[input.slotId];
    const t = this.typeById[input.type];
    const root = this.templates[input.type].clone(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = (o.material as THREE.Material).clone();
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.applyColors(root, input);
    const h = (s.heading_deg * Math.PI) / 180;
    const g = new THREE.Group();
    g.add(root);
    if (input.bay != null && bayGrid(s.id).count > 0) {
      // a motorcycle stands in its own bay of the slot, facing the slot's heading
      const o = bayOffset(s.id, input.bay);
      g.position.set(s.center_gltf.x + Math.cos(h) * o.x + Math.sin(h) * o.z, 0, s.center_gltf.z + Math.sin(h) * o.x - Math.cos(h) * o.z);
    } else {
      const off = t.park_offset_m + (s.park_offset_extra_m || 0);
      g.position.set(s.center_gltf.x + Math.sin(h) * off, 0, s.center_gltf.z - Math.cos(h) * off);
    }
    g.rotation.y = s.rotation_y_rad_threejs;
    g.traverse((o) => {
      o.userData.slotId = s.id;
      o.userData.carKey = input.key;
    });
    this.scene.add(g);
    const p: Parked = { group: g, input, plateTex: null };
    this.parked.set(input.key, p);
    this.applyPlate(p, input);
  }

  private unpark(id: string) {
    const p = this.parked.get(id);
    if (!p) return;
    this.scene.remove(p.group);
    p.plateTex?.dispose();
    p.group.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    });
    this.parked.delete(id);
  }

  private applyColors(root: THREE.Object3D, input: CarInput) {
    const names = this.typeById[input.type].colorable_materials;
    const paint = names.paint;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === paint) (o.material as THREE.MeshStandardMaterial).color.set(input.color);
    });
  }

  private applyPlate(p: Parked, input: CarInput) {
    p.plateTex?.dispose();
    p.plateTex = plateTexture(input.plate, input.province);
    p.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.MeshStandardMaterial;
      if (m.name === "plate_front" || m.name === "plate_rear") {
        m.map = p.plateTex;
        m.color.set("#ffffff");
        m.needsUpdate = true;
      }
    });
    this.dirty = true;
  }

  /** Re-draw plates once the web font has loaded (canvas text uses the font at draw time). */
  redrawPlates() {
    for (const p of this.parked.values()) this.applyPlate(p, p.input);
  }

  // ------------------------------------------------------------------ camera

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, ms = 800) {
    this.anim = { t0: performance.now(), ms, p0: this.camera.position.clone(), g0: this.controls.target.clone(), p1: pos.clone(), g1: target.clone() };
    this.dirty = true;
  }

  /**
   * Camera position from which the whole lot just fills the free part of the view
   * (the canvas minus the side panel / bottom card). The distance is found by projecting
   * the outline of the lot, so it fits at any window shape and either view angle.
   */
  private overviewPose(kind: "iso" | "top") {
    const elev = THREE.MathUtils.degToRad(kind === "top" ? 89.5 : 57);
    // top view looks straight north-up; the oblique view comes from the south-west
    const flat = kind === "top" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-0.62, 0, 0.78).normalize();
    const dir = flat.multiplyScalar(Math.cos(elev));
    dir.y = Math.sin(elev);
    const w = Math.max(1, this.w);
    const h = Math.max(1, this.h);
    const limX = (0.97 * Math.max(0.2, w - 2 * Math.abs(this.insetTarget.x))) / w;
    const limY = (0.96 * Math.max(0.2, h - 2 * Math.abs(this.insetTarget.y))) / h;
    const cam = new THREE.PerspectiveCamera(this.camera.fov, w / h, 1, 1000);
    const v = new THREE.Vector3();
    const fits = (d: number) => {
      cam.position.copy(this.center).addScaledVector(dir, d);
      cam.lookAt(this.center);
      cam.updateMatrixWorld(true);
      for (const [x, z, y] of this.outline3d) {
        v.set(x, y, z).project(cam);
        if (Math.abs(v.x) > limX || Math.abs(v.y) > limY) return false;
      }
      return true;
    };
    let lo = 10;
    let hi = 300;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return this.center.clone().addScaledVector(dir, hi);
  }

  /** Keep the overview framed while nothing has been touched (window resized, panel opened). */
  private refit() {
    if (!this.autoFit || this.selected || this.anim) return;
    this.camera.position.copy(this.overviewPose(this.overviewKind));
    this.controls.target.copy(this.center);
    this.dirty = true;
  }

  /** The aerial view the page starts in and returns to when a car is closed. */
  setOverview(kind: "iso" | "top", animate = true) {
    this.setSelected(null);
    this.overviewKind = kind;
    this.autoFit = true;
    const pos = this.overviewPose(kind);
    this.wallsAuto = false;
    this.applyWalls();
    if (animate) this.flyTo(pos, this.center, 900);
    else {
      this.anim = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(this.center);
      this.controls.update();
    }
  }

  /** Distance from a point on the ground (glTF x, z) to the nearest wall or the house. */
  private wallDistance(x: number, z: number) {
    const px = x;
    const py = -z; // model plan coordinates
    let best = Infinity;
    for (const [ax, ay, bx, by] of this.edges) {
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
    return best;
  }

  /** Select a slot (or null). Flies to the car; keeps the car clear of the page's side card via `inset`. */
  setSelected(id: string | null) {
    const prev = this.selected;
    this.selected = id;
    if (prev) this.paintPad(this.slotOf(prev));
    if (id) this.paintPad(this.slotOf(id));
    this.placeOutline();
    if (!id) this.events.onLabel(null);
    this.container.dataset.selected = id ?? "";
    this.dirty = true;
  }

  /** Pixel offset of the free area's centre from the canvas centre (negative x = free area on the left). */
  setInset(x: number, y: number) {
    this.insetTarget = { x, y };
    this.refit();
    this.dirty = true;
  }

  /**
   * Fly to a car. The camera always goes to the end of the car that is away from the
   * wall (a car nosed into a wall is seen from behind), so the plate is what you see.
   */
  focus(key: string, mode: ViewMode = "iso") {
    const s = this.slotById[this.slotOf(key)];
    if (!s) return;
    const car = this.parked.get(key);
    this.autoFit = false;
    if (this.isShed(s.id)) {
      // look at the shed from the yard side (towards the middle of the lot)
      const c = new THREE.Vector3(s.center_gltf.x, 0, s.center_gltf.z);
      const toYard = this.center.clone().sub(c).setY(0).normalize();
      const right = new THREE.Vector3(-toYard.z, 0, toYard.x);
      const tgt = c.clone().add(new THREE.Vector3(0, (this.shedHeight(s) || 2.5) * 0.45, 0));
      const pos = c.clone().addScaledVector(toYard, mode === "side" ? 6 : 9.5).addScaledVector(right, mode === "side" ? 8 : 3.5).add(new THREE.Vector3(0, mode === "side" ? 2.2 : 5.5, 0));
      this.wallsAuto = false;
      this.applyWalls();
      this.flyTo(pos, tgt);
      return;
    }
    this.wallsAuto = true;
    this.applyWalls();
    const h = (s.heading_deg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const up = (y: number) => new THREE.Vector3(0, y, 0);
    let c: THREE.Vector3;
    let L = 4.8;
    let W = 1.9;
    if (car) {
      c = new THREE.Vector3(car.group.position.x, 0, car.group.position.z);
      const t = this.typeById[car.input.type];
      L = t.length_m;
      W = t.width_m;
    } else {
      c = new THREE.Vector3(s.center_gltf.x, 0, s.center_gltf.z);
    }
    const end = (k: number) => c.clone().addScaledVector(dir, (k * L) / 2);
    const front = end(1);
    const rear = end(-1);
    const k = this.wallDistance(front.x, front.z) >= this.wallDistance(rear.x, rear.z) ? 1 : -1; // plate end facing the open side
    const pd = dir.clone().multiplyScalar(k);
    const probe = (side: number) => c.clone().addScaledVector(right, side * 5).addScaledVector(pd, 2);
    const a = probe(1);
    const b = probe(-1);
    const sd = this.wallDistance(a.x, a.z) >= this.wallDistance(b.x, b.z) ? 1 : -1; // roomier side for the camera
    let pos: THREE.Vector3;
    let tgt: THREE.Vector3;
    if (mode === "plate") {
      tgt = c.clone().addScaledVector(pd, L / 2).add(up(0.6));
      pos = tgt.clone().addScaledVector(pd, 2.6).addScaledVector(right, sd * 0.35).add(up(0.35));
    } else if (mode === "side") {
      tgt = c.clone().add(up(0.75));
      pos = tgt.clone().addScaledVector(right, sd * (W / 2 + 6.5)).addScaledVector(pd, 0.6).add(up(1.2));
    } else {
      tgt = c.clone().addScaledVector(pd, L * 0.12).add(up(0.65));
      pos = c.clone().addScaledVector(pd, L / 2 + 4.4).addScaledVector(right, sd * (W / 2 + 3)).add(up(3));
    }
    this.flyTo(pos, tgt);
  }

  setWalls(transparent: boolean) {
    this.wallsManual = transparent;
    this.applyWalls();
  }
  setPads(visible: boolean) {
    this.padsVisible = visible;
    this.pads.forEach((p) => (p.visible = visible));
    this.dirty = true;
  }
  setNumbers(visible: boolean) {
    if (this.numbers) this.numbers.visible = visible;
    this.dirty = true;
  }

  private applyWalls() {
    if (!this.walls) return;
    const on = this.wallsManual || this.wallsAuto;
    this.walls.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.transparent = true;
        m.opacity = on ? 0.16 : 1;
        m.depthWrite = !on;
        m.needsUpdate = true;
      }
    });
    this.dirty = true;
  }

  // ------------------------------------------------------------- interaction

  private pick(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const targets: THREE.Object3D[] = [...[...this.parked.values()].map((p) => p.group)];
    if (this.shed) targets.push(this.shed);
    for (const e of this.extraSheds.values()) targets.push(e.group);
    if (this.padsVisible) targets.push(...this.pads.values());
    for (const hit of this.ray.intersectObjects(targets, true)) {
      const key = (hit.object.userData.carKey ?? hit.object.userData.slotId) as string | undefined;
      if (key) return key;
    }
    return null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
    this.anim = null;
  };
  private onUp = (e: PointerEvent) => {
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 6) {
      const id = this.pick(e.clientX, e.clientY);
      if (id) this.events.onPick(id);
    }
    this.down = null;
  };
  private onMove = (e: PointerEvent) => {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (e.pointerType === "touch" || this.down || this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      if (this.disposed) return;
      const id = this.pick(this.lastPointer.x, this.lastPointer.y);
      if (id !== this.hover) {
        const old = this.hover;
        this.hover = id;
        if (old) this.paintPad(old);
        if (id) this.paintPad(id);
        this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
      }
      this.events.onHover(id, this.lastPointer.x, this.lastPointer.y);
    });
  };
  private onLeave = () => {
    if (this.hover) {
      const old = this.hover;
      this.hover = null;
      this.paintPad(old);
    }
    this.events.onHover(null, 0, 0);
  };
  private onWheel = () => {
    this.anim = null;
  };
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.events.onError("การแสดงผล 3 มิติหยุดทำงาน (หน่วยความจำกราฟิกไม่พอ) ลองรีเฟรชหน้านี้");
  };

  // ------------------------------------------------------------------- frame

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyInset(true);
    this.refit();
    // setSize clears the canvas: draw again right away so a resize never flashes blank
    this.renderer.render(this.scene, this.camera);
    this.dirty = true;
  }

  private applyInset(force = false) {
    const k = force ? 1 : 0.14;
    const nx = this.inset.x + (this.insetTarget.x - this.inset.x) * k;
    const ny = this.inset.y + (this.insetTarget.y - this.inset.y) * k;
    const moved = Math.abs(nx - this.inset.x) > 0.05 || Math.abs(ny - this.inset.y) > 0.05;
    if (!moved && !force) return;
    this.inset.x = Math.abs(nx - this.insetTarget.x) < 0.5 ? this.insetTarget.x : nx;
    this.inset.y = Math.abs(ny - this.insetTarget.y) < 0.5 ? this.insetTarget.y : ny;
    if (Math.abs(this.inset.x) < 0.5 && Math.abs(this.inset.y) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.w, this.h, -this.inset.x, -this.inset.y, this.w, this.h);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    if (this.anim) {
      const k = Math.min(1, (now - this.anim.t0) / this.anim.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.camera.position.lerpVectors(this.anim.p0, this.anim.p1, e);
      this.controls.target.lerpVectors(this.anim.g0, this.anim.g1, e);
      if (k >= 1) this.anim = null;
      this.dirty = true;
    }
    this.applyInset();
    this.controls.update();

    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.emitLabel();
  };

  private emitLabel() {
    const car = this.selected ? this.parked.get(this.selected) : null;
    if (!car) {
      this.events.onLabel(null);
      return;
    }
    const t = this.typeById[car.input.type];
    const p = car.group.position.clone();
    p.y = t.height_m + 0.35;
    p.project(this.camera);
    this.events.onLabel({
      x: (p.x * 0.5 + 0.5) * this.w,
      y: (-p.y * 0.5 + 0.5) * this.h,
      visible: p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15,
    });
  }

  // ---------------------------------------------------------------- teardown

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("wheel", this.onWheel);
    el.removeEventListener("webglcontextlost", this.onContextLost);
    this.controls.dispose();
    for (const id of [...this.parked.keys()]) this.unpark(id);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}
