"""lotlib.py — ฉากลานจอดรถตามภาพสเก็ตช์: พื้น กำแพงล้อมรอบ ประตูเฉียงที่มุม บ้าน ที่เก็บของ เส้นจอด เลขช่อง
ไม่มีสิ่งตกแต่งนอกเหนือจากที่อยู่ในภาพ (ไม่มีต้นไม้ ถนน เสาไฟ ฯลฯ)"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

import layout as L
from carlib import get_mat, srgb

# name: (hex, rough, metal)
LOT_MATS = {
    'ground':     ('#8f8d88', 0.95, 0.0),
    'line_white': ('#f2f2ee', 0.6, 0.0),
    'wall':       ('#cfc9bd', 0.9, 0.0),
    'wall_cap':   ('#8b867b', 0.9, 0.0),
    'pier':       ('#b9b3a7', 0.9, 0.0),
    'gate':       ('#6d7882', 0.5, 0.6),
    'gate_mesh':  ('#9aa5ae', 0.5, 0.6),
    'house_wall': ('#ece6d9', 0.9, 0.0),
    'roof':       ('#7a4a3a', 0.8, 0.0),
    'wood_wall':  ('#6a4733', 0.85, 0.0),
    'glass':      ('#2b4252', 0.1, 0.0),
    'trunk':      ('#5c4330', 0.9, 0.0),
    'leaf':       ('#2f6b32', 0.9, 0.0),
    'leaf2':      ('#437f3a', 0.9, 0.0),
    'wood':       ('#6a4a2f', 0.7, 0.0),
    'shed_wall':  ('#8697a6', 0.6, 0.3),
    'shed_roof':  ('#59626a', 0.5, 0.5),
    'shutter':    ('#aab4bd', 0.4, 0.6),
}


def lot_mat(name):
    hexs, r, mt = LOT_MATS[name]
    return get_mat('lot_' + name, srgb(hexs), r, mt, None)


class G:
    """กลุ่มเมชเดียว (หลายวัสดุ) สร้างด้วย bmesh"""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _setmat(self, faces, m):
        i = self.mi(m)
        for f in faces:
            f.material_index = i

    def box(self, size, center, mat, rotz=0.0):
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret['verts']
        M = (Matrix.Translation(center) @ Euler((0, 0, math.radians(rotz))).to_matrix().to_4x4()
             @ Matrix.Diagonal((size[0], size[1], size[2], 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=verts)
        self._setmat({f for v in verts for f in v.link_faces}, mat)

    def cyl(self, r, h, center, mat, segs=16, r2=None):
        n0 = len(self.bm.faces)
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                              radius2=(r if r2 is None else r2), depth=h, matrix=Matrix.Translation(center))
        self.bm.faces.ensure_lookup_table()
        self._setmat(self.bm.faces[n0:], mat)

    def sphere(self, r, center, mat, sub=2):
        n0 = len(self.bm.faces)
        bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=Matrix.Translation(center))
        self.bm.faces.ensure_lookup_table()
        self._setmat(self.bm.faces[n0:], mat)

    def poly(self, pts, mat, flip=False):
        vs = [self.bm.verts.new(p) for p in pts]
        if flip:
            vs.reverse()
        f = self.bm.faces.new(vs)
        self._setmat([f], mat)
        return f

    def finish(self, coll, smooth=False, recalc=True, location=None, rotz=None):
        if recalc:
            bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        for m in self.mats:
            mesh.materials.append(lot_mat(m))
        for p in mesh.polygons:
            p.use_smooth = smooth
        obj = bpy.data.objects.new(self.name, mesh)
        if location is not None:
            obj.location = location
        if rotz is not None:
            obj.rotation_euler = (0, 0, rotz)
        coll.objects.link(obj)
        self.bm.free()
        return obj


def _signed_area(poly):
    a = 0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return a / 2


# --------------------------------------------------------------------- ground
def build_ground(coll, slots):
    poly = L.lot_polygon(slots)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0.0)) for x, y in poly]
    f = bm.faces.new(vs[::-1] if _signed_area(poly) < 0 else vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    vv = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, -0.06), verts=vv)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new('LOT_Ground')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(lot_mat('ground'))
    obj = bpy.data.objects.new('LOT_Ground', mesh)
    coll.objects.link(obj)
    return obj


# --------------------------------------------------------------------- walls (ล้อมรอบ) + gate
def build_walls(coll, slots):
    g = G('LOT_Walls')
    poly = L.lot_polygon(slots)
    assert _signed_area(poly) < 0, 'polygon ต้องเรียงตามเข็มนาฬิกา'
    t, H = L.WALL_T, L.WALL_H
    GATE_EDGE = 5       # V5 -> V6 คือบานประตู ไม่สร้างกำแพง
    n = len(poly)
    for i in range(n):
        if i == GATE_EDGE:
            continue
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        ln = math.hypot(dx, dy)
        nx, ny = -dy / ln, dx / ln                 # ตั้งฉากชี้ออกนอก (polygon ตามเข็มนาฬิกา)
        cx, cy = (x0 + x1) / 2 + nx * t / 2, (y0 + y1) / 2 + ny * t / 2
        ang = math.degrees(math.atan2(dy, dx))
        g.box((ln + t, t, H), (cx, cy, H / 2), 'wall', rotz=ang)
        g.box((ln + t + 0.06, t + 0.06, 0.08), (cx, cy, H + 0.04), 'wall_cap', rotz=ang)
    # เสาประตู 2 ต้น ที่ปลายบานประตู
    for (px, py) in (L.G1, L.G2):
        g.box((0.5, 0.5, 2.2), (px, py, 1.1), 'pier')
        g.box((0.6, 0.6, 0.08), (px, py, 2.24), 'wall_cap')
    return g.finish(coll, recalc=False)


def build_gate(coll):
    """บานประตูตาข่ายเหล็ก 2 บาน วางเฉียงตัดมุมตามภาพ — แยกเป็น 2 ชิ้น หมุนเปิดได้ที่บานพับ (origin)"""
    G1, G2 = Vector((*L.G1, 0)), Vector((*L.G2, 0))
    gv = G1 - G2
    length = gv.length
    ang = math.atan2(gv.y, gv.x)
    la = length / 2 - 0.3            # เว้นเสาและช่องกลาง
    h = 1.8
    leaves = []
    for name, hinge, a in (('GATE_LEAF_A', G2 + gv.normalized() * 0.3, ang),
                           ('GATE_LEAF_B', G1 - gv.normalized() * 0.3, ang + math.pi)):
        g = G(name)
        g.box((la, 0.05, 0.05), (la / 2, 0, 0.15), 'gate')
        g.box((la, 0.05, 0.05), (la / 2, 0, h), 'gate')
        g.box((la, 0.04, 0.04), (la / 2, 0, h / 2 + 0.1), 'gate')
        g.box((0.05, 0.05, h - 0.1), (0.025, 0, (h + 0.15) / 2), 'gate')
        g.box((0.05, 0.05, h - 0.1), (la - 0.025, 0, (h + 0.15) / 2), 'gate')
        nv = int(la / 0.14)
        for i in range(1, nv):
            g.box((0.012, 0.012, h - 0.2), (la * i / nv, 0, (h + 0.15) / 2), 'gate_mesh')
        nh = int((h - 0.2) / 0.14)
        for j in range(1, nh):
            g.box((la - 0.1, 0.012, 0.012), (la / 2, 0, 0.15 + (h - 0.15) * j / nh), 'gate_mesh')
        leaves.append(g.finish(coll, recalc=False, location=(hinge.x, hinge.y, 0), rotz=a))
    return leaves


# --------------------------------------------------------------------- slot paint + numbers
def build_lines(coll, slots):
    g = G('LOT_SlotLines')
    seen = set()
    for s in slots:
        h = s['heading']
        u = L.side_vec(h)
        for sw in (-1, 1):
            cx = s['center'][0] + u[0] * sw * s['w'] / 2
            cy = s['center'][1] + u[1] * sw * s['w'] / 2
            key = (round(cx, 1), round(cy, 1), round(h) % 180)
            if key in seen:
                continue
            seen.add(key)
            g.box((0.1, s['l'], 0.012), (cx, cy, 0.006), 'line_white', rotz=-h)
    return g.finish(coll, recalc=False)


def build_numbers(coll, slots):
    objs = []
    for s in slots:
        cu = bpy.data.curves.new(f"txt_{s['id']}", 'FONT')
        cu.body = str(s['number'])
        cu.size = 0.85
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        cu.extrude = 0.004
        o = bpy.data.objects.new(f"NUM_{s['id']}", cu)
        coll.objects.link(o)
        hv = L.heading_vec(s['heading'])
        sh = (s['l'] / 2 - 1.5) if s['l'] > L.SLOT_L + 0.5 else 0.0   # ช่องยาว: เลขอยู่ปลายท้ายช่อง
        o.location = (s['center'][0] - hv[0] * sh, s['center'][1] - hv[1] * sh, 0.012)
        o.data.materials.append(lot_mat('line_white'))
        objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = 'LOT_SlotNumbers'
    o.data.name = 'LOT_SlotNumbers'
    return o


# --------------------------------------------------------------------- house (บ้านไม้ 2 ชั้นหลังยาว หน้าบ้านหันเหนือ)
def build_house(coll):
    g = G('LOT_House')
    H = L.HOUSE
    w, d = H['x1'] - H['x0'], H['y1'] - H['y0']
    cx, cy = (H['x0'] + H['x1']) / 2, (H['y0'] + H['y1']) / 2
    f1, f2 = 2.7, 2.6
    g.box((w, d, f1), (cx, cy, f1 / 2), 'house_wall')                     # ชั้นล่าง ปูนฉาบสีอ่อน
    g.box((w + 0.1, d + 0.1, 0.12), (cx, cy, f1 + 0.06), 'wall_cap')       # คานคั่นชั้น
    g.box((w - 0.1, d - 0.1, f2), (cx, cy, f1 + 0.12 + f2 / 2), 'wood_wall')   # ชั้นบน ไม้
    zr = f1 + 0.12 + f2
    # หลังคาจั่วยาว สันหลังคาขนานแกน X (จั่วหันตะวันออก/ตะวันตก)
    ov, rh = 0.35, 1.7
    x0, x1 = H['x0'] - ov, H['x1'] + ov
    y0, y1 = H['y0'] - ov, H['y1'] + ov
    ym = (y0 + y1) / 2
    A = (x0, y0, zr); B = (x1, y0, zr); C = (x1, y1, zr); D = (x0, y1, zr)
    R0 = (x0, ym, zr + rh); R1 = (x1, ym, zr + rh)
    g.poly([A, B, R1, R0], 'roof')              # ด้านหลัง (ใต้)
    g.poly([D, R0, R1, C], 'roof')              # ด้านหน้า (เหนือ)
    g.poly([A, R0, D], 'roof')
    g.poly([B, C, R1], 'roof')
    g.poly([A, D, C, B], 'roof')
    # ประตูและหน้าต่างด้านหน้า (เหนือ) — เรียบง่าย
    yf = H['y1']
    g.box((1.1, 0.1, 2.1), (cx, yf + 0.01, 1.05), 'wood')
    for dx in (-3.6, -1.9, 1.9, 3.6):
        g.box((1.3, 0.1, 1.2), (cx + dx, yf + 0.01, 1.5), 'glass')
    for dx in (-4.0, -2.0, 0.0, 2.0, 4.0):
        g.box((1.1, 0.1, 1.1), (cx + dx, yf - 0.04, f1 + 0.12 + 1.4), 'glass')
    return g.finish(coll)


# --------------------------------------------------------------------- big tree ข้างบ้าน
def build_tree(coll):
    T = L.TREE
    g = G('LOT_BigTree')
    g.cyl(0.32, T['trunk_h'] + 0.4, (T['x'], T['y'], (T['trunk_h'] + 0.4) / 2), 'trunk', 14, r2=0.22)
    # กิ่งใหญ่
    for ang, dz in ((20, 0.6), (140, 0.4), (250, 0.7)):
        a = math.radians(ang)
        g.box((0.18, 1.8, 0.18), (T['x'] + math.cos(a) * 0.7, T['y'] + math.sin(a) * 0.7, T['trunk_h'] + dz), 'trunk', rotz=ang - 90)
    # พุ่มใบ: ก้อนกลมซ้อนกันหลายก้อน
    cz, R = T['crown_z'], T['crown_r']
    lumps = [(0, 0, 0, 1.0), (1.8, 0.6, -0.4, 0.72), (-1.7, 0.9, -0.2, 0.72), (0.4, -1.8, -0.3, 0.7),
             (0.8, 1.6, 0.5, 0.66), (-0.9, -1.0, 0.7, 0.62), (2.1, -1.2, -0.7, 0.55)]
    for i, (dx, dy, dz, k) in enumerate(lumps):
        g.sphere(R * k, (T['x'] + dx, T['y'] + dy, cz + dz), 'leaf' if i % 2 == 0 else 'leaf2', 2)
    return g.finish(coll, smooth=True, recalc=False)


# --------------------------------------------------------------------- shed (ที่เก็บของ)
def build_shed(coll):
    g = G('LOT_Shed')
    S = L.SHED
    w, d, h = S['x1'] - S['x0'], S['y1'] - S['y0'], S['h']
    cx, cy = (S['x0'] + S['x1']) / 2, (S['y0'] + S['y1']) / 2
    g.box((w, d, h), (cx, cy, h / 2), 'shed_wall')
    g.box((w + 0.3, d + 0.3, 0.1), (cx, cy, h + 0.05), 'shed_roof')
    g.box((min(2.4, w - 0.6), 0.08, 2.0), (cx, S['y0'] - 0.02, 1.0), 'shutter')   # ประตูหันเข้าลาน (ทิศใต้)
    return g.finish(coll, recalc=False)
