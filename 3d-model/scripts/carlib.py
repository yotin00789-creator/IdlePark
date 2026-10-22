"""
carlib.py — ตัวสร้างรถแบบพารามิเตอร์สำหรับ Blender (bpy)
รถทุกคันถูกสร้างหันหน้าไปทางแกน +Y, จุดกำเนิดอยู่กึ่งกลางตัวรถที่พื้น (z=0), หน่วยเมตร
"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

# ---------------------------------------------------------------- materials
SHARED_MATS = {
    #  name            (rgba,                    rough, metal, emission(rgb, strength))
    'car_dark':      ((0.025, 0.027, 0.03, 1),   0.55, 0.0, None),
    'car_glass':     ((0.035, 0.06, 0.085, 1),   0.06, 0.0, None),
    'car_tire':      ((0.012, 0.012, 0.012, 1),  0.9,  0.0, None),
    'car_rim':       ((0.72, 0.74, 0.77, 1),     0.28, 1.0, None),
    'car_headlight': ((0.9, 0.93, 1.0, 1),       0.15, 0.0, ((1, 1, 0.95), 0.6)),
    'car_taillight': ((0.30, 0.01, 0.01, 1),     0.2,  0.0, ((1, 0.03, 0.02), 0.55)),
    'car_chrome':    ((0.8, 0.8, 0.82, 1),       0.18, 1.0, None),
    'car_plate':     ((0.93, 0.93, 0.9, 1),      0.5,  0.0, None),
    'plate_front':   ((0.95, 0.95, 0.92, 1),     0.45, 0.0, None),   # หน้าป้ายทะเบียนหน้า (มี UV สำหรับใส่เลขทะเบียน)
    'plate_rear':    ((0.95, 0.95, 0.92, 1),     0.45, 0.0, None),   # หน้าป้ายทะเบียนหลัง
}


def get_mat(name, rgba, rough=0.5, metal=0.0, emit=None, coat=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        col, st = emit
        bsdf.inputs['Emission Color'].default_value = (*col, 1)
        bsdf.inputs['Emission Strength'].default_value = st
    if coat and 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
    m.diffuse_color = rgba
    return m


def srgb(hexstr):
    h = hexstr.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    return (f(r), f(g), f(b), 1)


# ---------------------------------------------------------------- builder
class CarBuilder:
    # material slot order
    PLATE_W, PLATE_H = 0.46, 0.22      # ป้ายใหญ่กว่าจริงเล็กน้อย (จริง 0.34×0.17) เพื่อให้อ่านชัดในตัวดู
    SLOTS = ['paint', 'car_dark', 'car_glass', 'car_tire', 'car_rim', 'car_headlight',
             'car_taillight', 'car_chrome', 'car_plate', 'accent', 'cage', 'plate_front', 'plate_rear']

    def __init__(self, spec):
        self.s = spec
        self.name = spec['name']
        self.keys = sorted(spec['keys'], key=lambda k: k[0])
        self.bm = bmesh.new()          # ชิ้นส่วนที่ไม่ต้องตัดซุ้มล้อ
        self.body_parts = []           # (name, bmesh) ชิ้นที่ต้องตัดซุ้มล้อ
        self.tmpl = bpy.data.meshes.new('tmp')
        self.mats = {}
        for slot in self.SLOTS:
            if slot == 'paint':
                self.mats[slot] = get_mat(f"{self.name}_paint", srgb(spec['paint']), 0.32, 0.0, None, coat=1.0)
            elif slot == 'accent':
                self.mats[slot] = get_mat(f"{self.name}_accent", srgb(spec.get('accent', '#222222')), 0.4)
            elif slot == 'cage':
                self.mats[slot] = get_mat(f"{self.name}_cage", srgb(spec.get('cage', '#5f666d')), 0.45, 0.6)
            else:
                rgba, r, m, e = SHARED_MATS[slot]
                self.mats[slot] = get_mat(slot, rgba, r, m, e)
        self.mat_index = {n: i for i, n in enumerate(self.SLOTS)}
        self._stations = None
        self.plate_req = []            # (front?, z) — วางจริงตอนท้ายด้วยการยิงเรย์หาผิวนอกสุด

    # ---- profile -------------------------------------------------------
    def P(self, y):
        k = self.keys
        if y <= k[0][0]:
            r = k[0]
        elif y >= k[-1][0]:
            r = k[-1]
        else:
            for a, b in zip(k, k[1:]):
                if a[0] <= y <= b[0]:
                    t = (y - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0
                    r = [a[i] + (b[i] - a[i]) * t for i in range(6)]
                    r[0] = y
                    break
        _, zb, zt, belt, hw, hr = r
        shoulder = min(belt, zt - 0.05)
        cr = max(0.025, min(0.10, (zt - shoulder) * 0.35))
        return dict(y=y, zb=zb, zt=zt, belt=belt, shoulder=shoulder, hw=hw, hr=hr, cr=cr)

    def stations(self):
        if self._stations is None:
            ys = {round(k[0], 4) for k in self.keys}
            for a, b in zip(self.keys, self.keys[1:]):
                n = max(1, math.ceil((b[0] - a[0]) / 0.12))
                for i in range(1, n):
                    ys.add(round(a[0] + (b[0] - a[0]) * i / n, 4))
            for key in ('side', 'top'):
                for rng in self.s.get('win_' + key, []):
                    ys.add(round(rng[0], 4))
                    ys.add(round(rng[1], 4))
            self._stations = sorted(ys)
        return self._stations

    def front_y(self, z):
        st = self.stations()[::-1]
        prev = None
        for y in st:
            p = self.P(y)
            if p['zb'] - 1e-6 <= z <= p['zt'] + 1e-6:
                if prev is None:
                    return y
                # crossing between prev (outside) and y (inside)
                pp = self.P(prev)
                if z > pp['zt']:
                    t = (z - pp['zt']) / (p['zt'] - pp['zt'])
                else:
                    t = (z - pp['zb']) / (p['zb'] - pp['zb'])
                return prev + (y - prev) * t
            prev = y
        return st[-1]

    def rear_y(self, z):
        st = self.stations()
        prev = None
        for y in st:
            p = self.P(y)
            if p['zb'] - 1e-6 <= z <= p['zt'] + 1e-6:
                if prev is None:
                    return y
                pp = self.P(prev)
                if z > pp['zt']:
                    t = (z - pp['zt']) / (p['zt'] - pp['zt'])
                else:
                    t = (z - pp['zb']) / (p['zb'] - pp['zb'])
                return prev + (y - prev) * t
            prev = y
        return st[0]

    # ---- primitives ---------------------------------------------------
    def _mark(self, bm):
        lay = bm.faces.layers.int.get('mk') or bm.faces.layers.int.new('mk')
        for f in bm.faces:
            f[lay] = 1
        return lay

    def _finish_piece(self, bm, lay, slot):
        mi = self.mat_index[slot]
        for f in bm.faces:
            if f[lay] == 0:
                f.material_index = mi
                f[lay] = 1

    def box(self, size, loc, slot='paint', rot=(0, 0, 0), bevel=0.0, bm=None, seg=2):
        bm = bm or self.bm
        lay = self._mark(bm)
        ret = bmesh.ops.create_cube(bm, size=1.0)
        verts = ret['verts']
        M = (Matrix.Translation(loc) @ Euler(tuple(math.radians(a) for a in rot)).to_matrix().to_4x4()
             @ Matrix.Diagonal((size[0], size[1], size[2], 1)))
        bmesh.ops.transform(bm, matrix=M, verts=verts)
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=seg, profile=0.6, affect='EDGES')
        self._finish_piece(bm, lay, slot)

    def plate_face(self, front, loc, tilt_deg, w=0.46, h=0.22, t=0.014):
        """แผ่นหน้าป้ายทะเบียน (quad หันออกนอกตัวรถ) พร้อม UV 0..1 อ่านจากซ้ายไปขวาเมื่อมองป้ายตรง ๆ
        วัสดุ plate_front / plate_rear — แอปแทนที่ด้วยพื้นผิวที่วาดเลขทะเบียนได้"""
        bm = self.bm
        lay = self._mark(bm)
        uvl = bm.loops.layers.uv.verify()
        yo = (t / 2 + 0.0015) * (1 if front else -1)
        M = Matrix.Translation(loc) @ Euler((math.radians(tilt_deg), 0, 0)).to_matrix().to_4x4()
        hx, hz = w / 2, h / 2
        if front:   # มองจากด้านหน้า: ขวาของผู้ชม = -X
            pts = [(hx, yo, -hz, 0, 0), (-hx, yo, -hz, 1, 0), (-hx, yo, hz, 1, 1), (hx, yo, hz, 0, 1)]
        else:       # มองจากด้านหลัง: ขวาของผู้ชม = +X
            pts = [(-hx, yo, -hz, 0, 0), (hx, yo, -hz, 1, 0), (hx, yo, hz, 1, 1), (-hx, yo, hz, 0, 1)]
        vs = [bm.verts.new(M @ Vector((x, y, z))) for x, y, z, _, _ in pts]
        f = bm.faces.new(vs)
        for lp, p in zip(f.loops, pts):
            lp[uvl].uv = (p[3], p[4])
        self._finish_piece(bm, lay, 'plate_front' if front else 'plate_rear')

    def place_plates(self, objs):
        """ป้ายทะเบียนใหญ่ มีมิติ: แผ่นรองดำหนา + แผ่นป้ายขาวนูน + หน้าป้าย (UV) วางบนผิวนอกสุดของรถ
        ยิงเรย์หลายจุดตามขนาดป้ายเพื่อให้ไม่มีส่วนใดของรถ (กันชน ฯลฯ) ยื่นบังป้าย"""
        from mathutils.bvhtree import BVHTree
        dg = bpy.context.evaluated_depsgraph_get()
        bm2 = self.bm.copy()                                   # ไม่ให้เรย์ไปโดนโครงคอก (cage)
        cage_i = self.mat_index['cage']
        bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f.material_index == cage_i], context='FACES')
        trees = [BVHTree.FromBMesh(bm2)] + [BVHTree.FromObject(o, dg) for o in objs]
        PW, PH = self.PLATE_W, self.PLATE_H
        for front, z in self.plate_req:
            sgn = 1 if front else -1
            ys = []
            for dx in (-PW * 0.45, 0, PW * 0.45):
                for dz in (-PH * 0.5, 0, PH * 0.5):
                    best = None
                    for t in trees:
                        r = t.ray_cast(Vector((dx, sgn * 8.0, z + dz)), Vector((0, -sgn, 0)))
                        if r[0] is not None and (best is None or r[3] < best[3]):
                            best = r
                    if best is not None:
                        ys.append(best[0].y)
            if not ys:
                continue
            y_out = max(ys) if front else min(ys)             # ผิวนอกสุดหน้าป้าย
            y_in = min(ys) if front else max(ys)
            # แผ่นรอง (ดำ) ยื่นจากผิวในสุดจนเลยผิวนอกสุดไปเล็กน้อย
            a0, a1 = y_in - sgn * 0.012, y_out + sgn * 0.016
            self.box((PW + 0.04, abs(a1 - a0), PH + 0.04), (0, (a0 + a1) / 2, z), 'car_dark', bevel=0.007)
            # แผ่นป้ายขาวนูนขึ้นจากแผ่นรอง
            tp = 0.014
            yc = y_out + sgn * (0.016 + tp / 2)
            self.box((PW, tp, PH), (0, yc, z), 'car_plate', bevel=0.004)
            self.plate_face(front, (0, yc, z), 0, w=PW, h=PH, t=tp)

    def mirror_box(self, size, loc, **kw):
        """วางกล่องทั้งสองข้าง (x และ -x)"""
        self.box(size, loc, **kw)
        rot = kw.get('rot', (0, 0, 0))
        kw2 = dict(kw)
        kw2['rot'] = (rot[0], -rot[1], -rot[2])
        self.box(size, (-loc[0], loc[1], loc[2]), **kw2)

    def cyl_x(self, r, w, loc, slot, segs=28, bm=None, bevel=0.0, r2=None):
        bm = bm or self.bm
        lay = self._mark(bm)
        M = Matrix.Translation(loc) @ Euler((0, math.radians(90), 0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                              radius2=(r2 if r2 is not None else r), depth=w, matrix=M)
        if bevel:
            # bevel only the two rim circles
            new = [f for f in bm.faces if f[lay] == 0]
            edges = list({e for f in new for e in f.edges if len(e.link_faces) == 2 and
                          abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.9})
            if edges:
                bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, profile=0.6, affect='EDGES')
        self._finish_piece(bm, lay, slot)

    def quad_strip(self, rows, slot='car_glass', bm=None, flip=False):
        """rows: list of lists of Vector; สร้างหน้าตาราง"""
        bm = bm or self.bm
        lay = self._mark(bm)
        vs = [[bm.verts.new(p) for p in row] for row in rows]
        for i in range(len(vs) - 1):
            for j in range(len(vs[i]) - 1):
                quad = [vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j]]
                if flip:
                    quad.reverse()
                try:
                    bm.faces.new(quad)
                except ValueError:
                    pass
        self._finish_piece(bm, lay, slot)

    # ---- body loft ----------------------------------------------------
    def ring(self, p):
        zb, zt, hw, hr, cr, sh = p['zb'], p['zt'], p['hw'], p['hr'], p['cr'], p['shoulder']
        zr = min(zb + 0.12, sh - 0.05)
        half = [
            (0.0, zb),
            (hw - 0.07, zb),
            (hw, zr),
            (hw, sh),
            (hr, zt - cr),
            (max(0.05, hr - cr * 0.9), zt),
            (0.0, zt),
        ]
        pts = half + [(-x, z) for (x, z) in reversed(half[1:-1])]
        return pts  # 12 points, x,z

    def build_loft(self):
        bm = bmesh.new()
        lay = bm.faces.layers.int.new('mk')
        rings = []
        for y in self.stations():
            p = self.P(y)
            rings.append([bm.verts.new((x, y, z)) for (x, z) in self.ring(p)])
        n = len(rings[0])
        pidx = self.mat_index
        for a, b in zip(rings, rings[1:]):
            for j in range(n):
                k = (j + 1) % n
                f = bm.faces.new([a[j], a[k], b[k], b[j]])
                # dark lower valance: segments 0-1, 1-2 and mirrored 10-11, 11-0
                seg = j
                dark = seg in (0, 1, n - 1, n - 2)
                f.material_index = pidx['car_dark'] if dark else pidx['paint']
        # caps
        for r, flip in ((rings[0], True), (rings[-1], False)):
            vs = list(reversed(r)) if flip else list(r)
            f = bm.faces.new(vs)
            f.material_index = pidx['paint']
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return bm

    # ---- glass --------------------------------------------------------
    def side_window(self, y0, y1, eps=0.007):
        ys = [y for y in self.stations() if y0 - 1e-5 <= y <= y1 + 1e-5]
        for sgn in (1, -1):
            rows = []
            for y in ys:
                p = self.P(y)
                zlo = p['belt'] + 0.035
                zhi = p['zt'] - p['cr'] - 0.03
                if zhi - zlo < 0.06:
                    zhi = zlo + 0.06
                def sx(z):
                    zt2 = p['zt'] - p['cr']
                    if z <= p['shoulder'] or zt2 <= p['shoulder']:
                        x = p['hw']
                    else:
                        x = p['hw'] + (p['hr'] - p['hw']) * (z - p['shoulder']) / (zt2 - p['shoulder'])
                    return x + eps
                rows.append([Vector((sgn * sx(zlo), y, zlo)), Vector((sgn * sx(zhi), y, zhi))])
            self.quad_strip(rows, 'car_glass', flip=(sgn < 0))

    def top_glass(self, y0, y1, inset=0.04, slot='car_glass', eps=0.007, narrow=0.0):
        ys = [y for y in self.stations() if y0 - 1e-5 <= y <= y1 + 1e-5]
        rows = []
        for y in ys:
            p = self.P(y)
            x = max(0.05, p['hr'] - p['cr'] * 0.9 - inset - narrow)
            z = p['zt'] + eps
            rows.append([Vector((-x, y, z)), Vector((x, y, z))])
        self.quad_strip(rows, slot, flip=True)

    # ---- wheels -------------------------------------------------------
    def wheels(self):
        s = self.s
        r, w = s['wheel_r'], s['wheel_w']
        for ay in (s['front_axle'], s['rear_axle']):
            hw = self.P(ay)['hw']
            xc = hw - 0.035 - w / 2
            for sgn in (1, -1):
                self.wheel_at(sgn, xc, ay, r, w)

    def wheel_at(self, sgn, xc, ay, r, w):
        s = self.s
        # tire
        self.cyl_x(r, w, (sgn * xc, ay, r), 'car_tire', segs=36, bevel=0.035)
        xo = sgn * (xc + w / 2)
        style = s.get('rim_style', 'spoke')
        # dark disc
        self.cyl_x(r * 0.66, 0.02, (xo - sgn * 0.012, ay, r), 'car_dark', segs=28)
        if style == 'cover':
            self.cyl_x(r * 0.68, 0.025, (xo - sgn * 0.006, ay, r), 'car_rim', segs=36)
            self.cyl_x(r * 0.50, 0.03, (xo - sgn * 0.003, ay, r), 'accent', segs=36)
            self.cyl_x(r * 0.16, 0.035, (xo, ay, r), 'car_rim', segs=16)
        else:
            self.cyl_x(r * 0.68, 0.02, (xo - sgn * 0.004, ay, r), 'car_rim', segs=40)
            for i in range(5):
                a = math.radians(i * 72 + 54)
                py, pz = math.cos(a), math.sin(a)
                ang = math.degrees(math.atan2(pz, py))
                self.box((0.012, r * 0.30, r * 0.17), (xo + sgn * 0.004, ay + py * r * 0.40, r + pz * r * 0.40),
                         'car_dark', rot=(ang, 0, 0))
            self.cyl_x(r * 0.16, 0.035, (xo + sgn * 0.006, ay, r), 'car_chrome', segs=16)

    def arch_cutter(self):
        """ทรงกระบอกสำหรับตัดซุ้มล้อ"""
        s = self.s
        r, w = s['wheel_r'], s['wheel_w']
        bm = bmesh.new()
        lay = bm.faces.layers.int.new('mk')
        tmp = CarBuilder.__new__(CarBuilder)
        tmp.mat_index = self.mat_index
        for ay in (s['front_axle'], s['rear_axle']):
            hw = self.P(ay)['hw']
            xc = hw - 0.035 - w / 2
            for sgn in (1, -1):
                x0 = xc - w / 2 - 0.04
                x1 = hw + 0.3
                cx = (x0 + x1) / 2
                M = (Matrix.Translation((sgn * cx, ay, r)) @ Euler((0, math.radians(90), 0)).to_matrix().to_4x4())
                bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=32,
                                      radius1=r + s.get('arch_gap', 0.075), radius2=r + s.get('arch_gap', 0.075),
                                      depth=x1 - x0, matrix=M)
        for f in bm.faces:
            f.material_index = 1  # car_dark
        return bm

    # ---- finalize -----------------------------------------------------
    def to_object(self, bm, name, collection=None):
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        for slot in self.SLOTS:
            mesh.materials.append(self.mats[slot])
        obj = bpy.data.objects.new(name, mesh)
        (collection or bpy.context.scene.collection).objects.link(obj)
        return obj

    def smooth(self, bm, angle=34):
        lim = math.radians(angle)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2:
                if e.calc_face_angle(0) > lim:
                    e.smooth = False
            else:
                e.smooth = False


def apply_mod(obj, mod):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def cut_arches(b, obj, cutter_obj):
    m = obj.modifiers.new('arch', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.operand_type = 'OBJECT'
    m.object = cutter_obj
    m.solver = 'EXACT'
    try:
        m.material_mode = 'TRANSFER'
    except Exception:
        pass
    apply_mod(obj, m)


def build_car(spec, collection=None):
    """สร้างรถหนึ่งคัน คืนค่า object เดียว (join แล้ว) ชื่อ CAR_<name>"""
    b = CarBuilder(spec)
    s = spec
    # ---------- ตัวถัง (ตัดซุ้มล้อ)
    loft = b.build_loft()
    b.smooth(loft)
    body = b.to_object(loft, f"{b.name}_body", collection)
    # bevel body edges
    bev = body.modifiers.new('bevel', 'BEVEL')
    bev.width = s.get('bevel', 0.035)
    bev.segments = 2
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(28)
    apply_mod(body, bev)
    parts = [body]

    # ชิ้นส่วนเพิ่มที่ต้องตัดซุ้มล้อด้วย (กระบะ ฯลฯ)
    cut_parts = []
    if 'cut_parts' in s:
        for nm, fn in s['cut_parts'].items():
            pb = bmesh.new()
            fn(b, pb)
            b.smooth(pb)
            o = b.to_object(pb, f"{b.name}_{nm}", collection)
            cut_parts.append(o)

    cutter_bm = b.arch_cutter()
    cutter = b.to_object(cutter_bm, f"{b.name}_cutter", collection)
    for o in [body] + cut_parts:
        cut_arches(b, o, cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)

    # ---------- ส่วนประกอบอื่น
    for rng in s.get('win_side', []):
        b.side_window(*rng)
    for rng in s.get('win_top', []):
        b.top_glass(*rng)
    b.wheels()
    s['detail'](b)       # ไฟ กระจังหน้า ป้าย กระจก ฯลฯ
    b.place_plates(parts + cut_parts)

    b.smooth(b.bm, 40)
    other = b.to_object(b.bm, f"{b.name}_parts", collection)

    # ---------- รวมเป็นชิ้นเดียว
    objs = parts + cut_parts + [other]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    car = bpy.context.view_layer.objects.active
    car.name = f"CAR_{b.name}"
    car.data.name = f"CAR_{b.name}_mesh"
    # clean material slots: remove unused
    for m in list(car.data.materials):
        pass
    car['vehicle_type'] = b.name
    car['label_th'] = s['label_th']
    car['length_m'] = s['L']
    car['width_m'] = s['W']
    car['height_m'] = s['H']
    return car
