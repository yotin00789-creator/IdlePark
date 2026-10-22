"""
build_parking.py — สร้างโมเดล 3D ลานจอดรถทั้งหมดใน Blender

รันได้ 2 แบบ
  1) ใน Blender (ไม่ต้องเปิด GUI):
       blender -b -P build_parking.py -- --out ./output
  2) ด้วยโมดูล bpy (pip install bpy):
       python build_parking.py --out ./output

ผลลัพธ์ใน --out
  parking_lot.blend            ไฟล์ Blender (ลาน + รถ 6 แบบ + รถตัวอย่างจอดอยู่ + กล้อง)
  parking_lot.glb              ลานเปล่า + จุดยึดช่องจอด (SLOT_xxx) สำหรับเว็บ
  parking_lot_demo.glb         ลาน + รถตัวอย่าง
  cars/<type>.glb              รถ 6 แบบ แยกไฟล์ (หัวรถ = -Z ใน glTF)
  slots.json                   ข้อมูลช่องจอด 26 ช่อง / ประเภทรถ / พิกัด / ทิศ / ชื่อวัสดุสีที่เปลี่ยนได้
"""
import sys, os, json, math, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy
from mathutils import Vector

import carlib, carspecs, layout, lotlib
from carlib import srgb

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[argv.index('--out') + 1]) if '--out' in argv else os.path.join(HERE, 'output')
EXPORT = '--no-export' not in argv
os.makedirs(os.path.join(OUT, 'cars'), exist_ok=True)

# ตัวอย่างการจอด: ช่อง -> (ประเภทรถ, สีตัวถัง, สีคอก/แถบ (ถ้ามี))
DEMO = {
    'N01': ('sedan', '#b3262e'), 'N02': ('suv', '#37474f'), 'N03': ('pickup', '#e9e9e4'),
    'N05': ('van', '#c9ced4'), 'N06': ('ev', '#12a89d'),
    'E01': ('pickupcage', '#e7e3d7'), 'E02': ('sedan', '#2c5fa8'), 'E04': ('suv', '#e8e8e8'), 'E05': ('ev', '#f2f2f2'),
    'S01': ('sedan', '#bfc4ca'), 'S03': ('pickup', '#c26a24'), 'S04': ('van', '#f3f3ef'), 'S05': ('suv', '#5a3d2b'),
    'C01': ('sedan', '#e0c341'), 'C02': ('ev', '#2f7dff'),
    'W01': ('pickupcage', '#d8d6cc'), 'W03': ('sedan', '#1f2933'), 'W04': ('suv', '#8a1f2c'),
    'H01': ('ev', '#12a89d'), 'H02': ('pickup', '#2b2f33'),
}

# ทะเบียนตัวอย่าง (ข้อมูลจริงจะมาจากระบบที่กรอก)
_PL = ['กข', 'ขก', 'คน', 'จง', 'ชฮ', 'ฒพ', 'ษณ', 'ธบ', 'นก', 'ผว']
_PV = ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'ชลบุรี', 'เชียงใหม่']
DEMO_PLATES = {sid: dict(text=f"{(i % 9) + 1}{_PL[i % len(_PL)]} {1000 + (i * 733) % 9000}", province=_PV[i % len(_PV)])
               for i, sid in enumerate(DEMO)}

# ------------------------------------------------------------------ scene setup
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'ParkingLot'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0


def new_coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


C_LOT = new_coll('LOT')
C_ANCH = new_coll('SLOT_ANCHORS')
C_PADS = new_coll('SLOT_PADS')
C_LIB = new_coll('CAR_LIBRARY')
C_DEMO = new_coll('DEMO_CARS')
C_SETUP = new_coll('CAMERAS_LIGHTS')
C_LIB.hide_render = True   # ห้องสมุดรถอยู่นอกลาน ไม่เรนเดอร์ (ใช้กล้อง CAM_CarLibrary เปิดเอง)

# ------------------------------------------------------------------ layout
slots = layout.build_slots()
problems = layout.validate(slots)
if problems:
    raise SystemExit('ผังมีปัญหา: ' + '; '.join(problems))

# ------------------------------------------------------------------ lot geometry
lotlib.build_ground(C_LOT, slots)
lotlib.build_walls(C_LOT, slots)
lotlib.build_gate(C_LOT)
lotlib.build_house(C_LOT)
lotlib.build_shed(C_LOT)
lotlib.build_tree(C_LOT)
lotlib.build_lines(C_LOT, slots)
nums = lotlib.build_numbers(C_LOT, slots)
for c in list(nums.users_collection):
    c.objects.unlink(nums)
C_LOT.objects.link(nums)

# ------------------------------------------------------------------ car library
lib = {}
for i, spec in enumerate(carspecs.CARS):
    car = carlib.build_car(spec, C_LIB)
    car.location = (-12.5 + i * 5.0, -36.0, 0)
    lib[spec['name']] = car
    for c in list(car.users_collection):
        if c != C_LIB:
            c.objects.unlink(car)

# ------------------------------------------------------------------ anchors + pads
slot_obj = {}
assert all(s['kind'] in ('straight', 'angled') for s in slots)
for s in slots:
    e = bpy.data.objects.new(f"SLOT_{s['id']}", None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.6
    e.location = (s['center'][0], s['center'][1], 0)
    e.rotation_euler = (0, 0, -math.radians(s['heading']))
    e['slot_id'] = s['id']
    e['number'] = s['number']
    e['kind'] = s['kind']
    e['zone_th'] = s['zone_th']
    e['heading_deg'] = float(s['heading'])
    e['width_m'] = round(s['w'], 3)
    e['length_m'] = round(s['l'], 3)
    C_ANCH.objects.link(e)
    slot_obj[s['id']] = e
    # แผ่นช่อง (ใช้เลือก/ไฮไลต์ใน Blender; ไม่เรนเดอร์)
    mesh = bpy.data.meshes.new(f"PAD_{s['id']}")
    w, l = s['w'] / 2 - 0.05, s['l'] / 2 - 0.05
    mesh.from_pydata([(-w, -l, 0.02), (w, -l, 0.02), (w, l, 0.02), (-w, l, 0.02)], [], [(0, 1, 2, 3)])
    pad = bpy.data.objects.new(f"PAD_{s['id']}", mesh)
    pad.location = e.location
    pad.rotation_euler = e.rotation_euler
    pad.display_type = 'WIRE'
    pad.hide_render = True
    pad['slot_id'] = s['id']
    C_PADS.objects.link(pad)

# ------------------------------------------------------------------ parked demo cars
def recolor_instance(obj, paint=None, accent=None, cage=None):
    """ทำสำเนาวัสดุสีของรถคันนี้ (เปลี่ยนสีอิสระต่อคัน)"""
    for slot in obj.material_slots:
        m = slot.material
        if not m:
            continue
        base = m.name.split('.')[0]
        kind = None
        for k in ('paint', 'accent', 'cage'):
            if base.endswith('_' + k):
                kind = k
        if not kind:
            continue
        col = {'paint': paint, 'accent': accent, 'cage': cage}[kind]
        slot.link = 'OBJECT'
        nm = m.copy()
        nm.name = f"{base}.{obj['slot_id']}"
        slot.material = nm
        if col:
            nm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb(col)
            nm.diffuse_color = srgb(col)


parked = {}
for sid, entry in DEMO.items():
    vtype, paint = entry[0], entry[1]
    s = next(x for x in slots if x['id'] == sid)
    src = lib[vtype]
    spec = carspecs.CAR_BY_NAME[vtype]
    o = bpy.data.objects.new(f"CAR_{sid}_{vtype}", src.data)
    C_DEMO.objects.link(o)
    d = layout.heading_vec(s['heading'])
    off = layout.park_offset(spec['L']) + s['park_extra']
    o.location = (s['center'][0] + d[0] * off, s['center'][1] + d[1] * off, 0)
    o.rotation_euler = (0, 0, -math.radians(s['heading']))
    o['slot_id'] = sid
    o['vehicle_type'] = vtype
    recolor_instance(o, paint=paint)
    parked[sid] = o

# ------------------------------------------------------------------ world, light, cameras
world = bpy.data.worlds.new('Sky')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.62, 0.74, 0.9, 1)
bg.inputs[1].default_value = 1.0

sun_d = bpy.data.lights.new('Sun', 'SUN')
sun_d.energy = 4.2
sun_d.angle = math.radians(2.5)
sun = bpy.data.objects.new('Sun', sun_d)
sun.rotation_euler = (math.radians(48), math.radians(8), math.radians(-30))
C_SETUP.objects.link(sun)


def add_cam(name, loc, target, lens=35, ortho=None):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_end = 500
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    co = bpy.data.objects.new(name, cd)
    C_SETUP.objects.link(co)
    co.location = loc
    d = Vector(target) - Vector(loc)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return co


_poly = layout.lot_polygon(slots)
LCX = (min(p[0] for p in _poly) + max(p[0] for p in _poly)) / 2
LCY = (min(p[1] for p in _poly) + max(p[1] for p in _poly)) / 2
add_cam('CAM_CarLibrary', (0, -70, 4.5), (0, -36, 1.0), lens=50)
_ext_w = max(p[0] for p in _poly) - min(p[0] for p in _poly)
_ext_h = max(p[1] for p in _poly) - min(p[1] for p in _poly)
add_cam('CAM_Top', (LCX, LCY, 90), (LCX, LCY, 0), ortho=round(max(_ext_w, _ext_h * 1.6) + 4, 1))
cam_aerial = add_cam('CAM_Aerial_SW', (LCX - 40, LCY - 52, 40), (LCX, LCY + 1, 0), lens=36)
add_cam('CAM_Aerial_N', (LCX + 4, LCY + 56, 32), (LCX, LCY - 3, 0), lens=38)
add_cam('CAM_Gate', (-27, 17, 6), (-16.5, 8.7, 1.0), lens=30)
add_cam('CAM_House_Tree', (LCX + 4, -30, 14), (4.5, -6.5, 2.5), lens=34)
scene.camera = cam_aerial

scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.device = 'CPU'
try:
    scene.cycles.use_denoising = True
except Exception:
    pass
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000
scene.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'

# ------------------------------------------------------------------ save .blend
blend_path = os.path.join(OUT, 'parking_lot.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
print('saved', blend_path)

# ------------------------------------------------------------------ export
def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def export_glb(path, objs):
    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_extras=True, export_yup=True, export_cameras=False, export_lights=False,
        export_materials='EXPORT', export_image_format='AUTO')
    print('exported', path, os.path.getsize(path) // 1024, 'KB')


if EXPORT:
    lot_objs = list(C_LOT.objects) + list(C_ANCH.objects)
    export_glb(os.path.join(OUT, 'parking_lot.glb'), lot_objs)
    export_glb(os.path.join(OUT, 'parking_lot_demo.glb'), lot_objs + list(C_DEMO.objects))
    for name, car in lib.items():
        loc = car.location.copy()
        car.location = (0, 0, 0)
        bpy.context.view_layer.update()
        export_glb(os.path.join(OUT, 'cars', f'{name}.glb'), [car])
        car.location = loc

# ------------------------------------------------------------------ slots.json
def paint_default(spec):
    return spec['paint']


def _glb_materials(path):
    import struct
    d = open(path, 'rb').read()
    n = struct.unpack('<I', d[12:16])[0]
    return [m['name'] for m in json.loads(d[20:20 + n])['materials']]


def _colorable(n):
    """ชื่อวัสดุสีที่เปลี่ยนได้ (มีเฉพาะที่รถรุ่นนั้นใช้จริง) อ่านจากไฟล์ .glb ที่ส่งออก"""
    p = os.path.join(OUT, 'cars', f'{n}.glb')
    names = _glb_materials(p) if os.path.exists(p) else []
    out = {}
    for k in ('paint', 'accent', 'cage'):
        if f'{n}_{k}' in names:
            out[k] = f'{n}_{k}'
    return out or {'paint': f'{n}_paint'}


def _defaults(spec, col):
    d = {'paint': spec['paint']}
    if 'accent' in col:
        d['accent'] = spec.get('accent', '#222222')
    if 'cage' in col:
        d['cage'] = spec['cage']
    return d

vehicle_types = []
for spec in carspecs.CARS:
    n = spec['name']
    vehicle_types.append(dict(
        id=n, label_th=spec['label_th'], glb=f'cars/{n}.glb',
        length_m=spec['L'], width_m=spec['W'], height_m=spec['H'],
        park_offset_m=round(layout.park_offset(spec['L']), 3),
        colorable_materials=_colorable(n),
        default_colors=_defaults(spec, _colorable(n)),
    ))

slot_json = []
for s in slots:
    x, y = s['center']
    h = s['heading']
    slot_json.append(dict(
        id=s['id'], number=s['number'], zone_th=s['zone_th'], kind=s['kind'],
        heading_deg=h,
        center_blender=dict(x=round(x, 3), y=round(y, 3), z=0),
        center_gltf=dict(x=round(x, 3), y=0, z=round(-y, 3)),
        rotation_y_rad_threejs=round(-math.radians(h), 5),
        size=dict(width_m=round(s['w'], 3), length_m=round(s['l'], 3)),
        park_offset_extra_m=round(s['park_extra'], 3),
        corners_blender=[[round(px, 3), round(py, 3)] for px, py in s['corners']],
        anchor_node=f"SLOT_{s['id']}",
    ))

doc = dict(
    version=1,
    units='meters',
    coordinate_note=('Blender: +X ตะวันออก, +Y เหนือ (บนของภาพ), +Z ขึ้น. glTF/three.js: x=x, y=z, z=-y (เหนือ = -Z). '
                     'heading_deg = ทิศหัวรถ ตามเข็มนาฬิกาจากเหนือ. ตำแหน่งศูนย์กลางรถ = center + heading_vector * (park_offset_m + park_offset_extra_m ของช่อง) '
                     '(heading_vector Blender = (sin h, cos h)). รถทุกคันถูกสร้างหัวรถ +Y (Blender) = -Z (glTF).'),
    lot=dict(walls_polygon=[[round(x, 3), round(y, 3)] for x, y in layout.lot_polygon(slots)],
             gate=dict(a=[round(v, 3) for v in layout.G2], b=[round(v, 3) for v in layout.G1]),
             house={k: round(v, 3) for k, v in layout.HOUSE.items()},
             shed={k: round(v, 3) for k, v in layout.SHED.items()},
             tree={k: round(v, 3) for k, v in layout.TREE.items()},
             center=[round(LCX, 3), round(LCY, 3)],
             aisle_behind_house_m=layout.AISLE_BEHIND_HOUSE,
             house_front_faces='north', source_scale_m_per_px=layout.SCALE),
    slot_count=len(slots),
    vehicle_types=vehicle_types,
    slots=slot_json,
    demo_assignment={sid: dict(vehicle=v[0], paint=v[1], plate=DEMO_PLATES[sid]) for sid, v in DEMO.items()},
    plate_spec=dict(size_m=[0.34, 0.16], front_material='plate_front', rear_material='plate_rear',
                    note='ทุกคันมีป้ายหน้า-หลัง. หน้าป้ายเป็น quad แยกวัสดุ plate_front/plate_rear มี UV 0..1 (ซ้าย->ขวา เมื่อมองป้ายตรง ๆ) '
                         'ให้แอปสร้าง texture (canvas) จากทะเบียนในระบบแล้วใส่ที่วัสดุสองตัวนี้ ดูตัวอย่างใน viewer.html'),
)
with open(os.path.join(OUT, 'slots.json'), 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
print('wrote slots.json', len(slot_json), 'slots')
