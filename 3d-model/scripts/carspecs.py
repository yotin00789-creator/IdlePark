"""ข้อกำหนดรถ 6 แบบ (กระบะ เก๋ง SUV รถตู้ รถไฟฟ้า รถตู้ทึบ) — หน่วยเมตร, หน้ารถ = +Y"""
import math

# ------------------------------------------------------------------ helpers
def _tilt(b, z, front=True):
    f = b.front_y if front else b.rear_y
    d = 0.04
    dy = f(z + d) - f(z - d)
    return math.degrees(math.atan2(-dy, 2 * d))


def on_front(b, z, size, slot, x=0.0, depth=0.05, inset=0.0, bevel=0.0):
    """วางกล่องบนผิวหน้ารถที่ความสูง z (เอียงตามลาดของหน้ารถ)"""
    yf = b.front_y(z)
    b.box(size, (x, yf - depth * 0.45, z), slot, rot=(_tilt(b, z, True), 0, 0), bevel=bevel)


def on_rear(b, z, size, slot, x=0.0, depth=0.05, bevel=0.0):
    yr = b.rear_y(z)
    b.box(size, (x, yr + depth * 0.45, z), slot, rot=(_tilt(b, z, False), 0, 0), bevel=bevel)


def lamp_pair(b, z, w, h, slot, front=True, inset=0.06, depth=0.08):
    yy = b.front_y(z) if front else b.rear_y(z)
    hw = b.P(yy)['hw']
    x = hw - w / 2 - inset
    for sgn in (1, -1):
        if front:
            on_front(b, z, (w, depth, h), slot, x=sgn * x, bevel=0.012)
        else:
            on_rear(b, z, (w, depth, h), slot, x=sgn * x, bevel=0.012)


def plates(b, zf, zr, color_slot='car_plate'):
    """ป้ายทะเบียนหน้า/หลัง (ไทย 0.34×0.16 ม.) — กรอบ + หน้าป้ายที่มี UV (plate_front / plate_rear)"""
    b.plate_req.append((True, zf))
    b.plate_req.append((False, zr))


def mirrors(b, y, z, hw=None):
    hw = hw or b.P(y)['hw']
    for sgn in (1, -1):
        b.box((0.16, 0.10, 0.09), (sgn * (hw + 0.10), y, z), 'paint', bevel=0.022)
        b.box((0.07, 0.05, 0.05), (sgn * (hw + 0.03), y - 0.02, z - 0.03), 'car_dark')


def doors(b, ys, z0=0.30, z1=None, handles=(), hz=None):
    """รอยต่อประตูและมือจับ"""
    for y in ys:
        p = b.P(y)
        top = z1 if z1 is not None else p['shoulder'] + 0.02
        for sgn in (1, -1):
            b.box((0.012, 0.012, top - z0), (sgn * (p['hw'] + 0.0015), y, (z0 + top) / 2), 'car_dark')
    for y in handles:
        p = b.P(y)
        z = hz if hz is not None else p['shoulder'] - 0.07
        for sgn in (1, -1):
            b.box((0.018, 0.16, 0.025), (sgn * (p['hw'] + 0.006), y, z), 'car_chrome', bevel=0.006, seg=1)


def grille(b, z, w, h, slot='car_dark'):
    on_front(b, z, (w, 0.05, h), slot, depth=0.03, bevel=0.012)


# ------------------------------------------------------------------ SEDAN (รถเก๋ง)
def sedan_detail(b):
    lamp_pair(b, 0.66, 0.34, 0.095, 'car_headlight', True, 0.07)
    lamp_pair(b, 0.69, 0.32, 0.10, 'car_taillight', False, 0.07)
    grille(b, 0.52, 0.80, 0.10)
    on_front(b, 0.40, (1.05, 0.06, 0.08), 'car_dark', depth=0.04)
    on_rear(b, 0.42, (1.15, 0.06, 0.09), 'car_dark', depth=0.04)
    plates(b, 0.50, 0.58)
    mirrors(b, 0.98, 0.98)
    doors(b, [1.04, 0.02, -0.92], handles=(0.62, -0.30))


SEDAN = dict(
    name='sedan', label_th='รถเก๋ง', L=4.70, W=1.82, H=1.45, paint='#b3262e',
    front_axle=1.42, rear_axle=-1.30, wheel_r=0.335, wheel_w=0.22,
    keys=[
        (-2.35, .40, .78, .70, .66, .58),
        (-2.30, .32, .90, .78, .80, .70),
        (-2.20, .27, .98, .84, .88, .78),
        (-1.90, .26, 1.02, .88, .905, .80),
        (-1.20, .26, 1.03, .90, .91, .80),
        (-1.05, .26, 1.04, .90, .91, .76),
        (-0.80, .26, 1.24, .90, .91, .72),
        (-0.55, .26, 1.38, .90, .91, .70),
        (-0.30, .26, 1.44, .90, .91, .69),
        (0.55, .26, 1.45, .90, .91, .69),
        (0.70, .26, 1.43, .90, .91, .69),
        (1.25, .26, 1.07, .90, .91, .76),
        (1.70, .26, 1.01, .90, .91, .80),
        (2.10, .26, .94, .86, .90, .80),
        (2.28, .30, .88, .82, .84, .74),
        (2.35, .40, .76, .70, .70, .62),
    ],
    win_side=[(0.10, 0.98), (-0.84, -0.06)],
    win_top=[(0.66, 1.20), (-1.02, -0.42)],
    detail=sedan_detail,
)


# ------------------------------------------------------------------ SUV
def suv_detail(b):
    lamp_pair(b, 0.78, 0.36, 0.10, 'car_headlight', True, 0.08)
    lamp_pair(b, 0.90, 0.12, 0.40, 'car_taillight', False, 0.04)
    grille(b, 0.66, 0.86, 0.17)
    on_front(b, 0.46, (1.10, 0.06, 0.10), 'car_dark', depth=0.04)
    on_rear(b, 0.46, (1.30, 0.06, 0.12), 'car_dark', depth=0.04)
    plates(b, 0.60, 0.80)
    mirrors(b, 1.10, 1.14)
    doors(b, [1.14, 0.08, -0.92, -1.75], handles=(0.70, -0.30))
    # roof rails
    p = b.P(-0.5)
    zt = p['zt']
    for sgn in (1, -1):
        b.box((0.04, 2.55, 0.035), (sgn * 0.75, -0.75, zt + 0.055), 'car_dark', bevel=0.01)
        for y in (0.42, -0.45, -1.35, -1.95):
            b.box((0.04, 0.07, 0.05), (sgn * 0.75, y, zt + 0.025), 'car_dark')
    # skid plates
    on_front(b, 0.30, (0.9, 0.05, 0.05), 'car_chrome', depth=0.03)


SUV = dict(
    name='suv', label_th='รถ SUV', L=4.85, W=1.95, H=1.82, paint='#37474f',
    front_axle=1.50, rear_axle=-1.35, wheel_r=0.37, wheel_w=0.25, arch_gap=0.08,
    keys=[
        (-2.425, .52, 1.12, .95, .80, .74),
        (-2.40, .36, 1.30, 1.05, .91, .82),
        (-2.30, .28, 1.58, 1.08, .955, .84),
        (-2.00, .24, 1.80, 1.10, .975, .86),
        (-1.85, .24, 1.82, 1.10, .975, .86),
        (0.50, .24, 1.82, 1.10, .975, .86),
        (0.70, .24, 1.80, 1.10, .975, .86),
        (1.30, .24, 1.30, 1.10, .975, .90),
        (1.46, .24, 1.22, 1.08, .975, .92),
        (2.20, .24, 1.12, 1.02, .975, .88),
        (2.37, .30, 1.04, .98, .93, .82),
        (2.425, .44, .90, .86, .80, .72),
    ],
    win_side=[(0.10, 1.10), (-0.86, 0.02), (-1.82, -0.96)],
    win_top=[(0.72, 1.28), (-2.28, -2.02)],
    detail=suv_detail,
)


# ------------------------------------------------------------------ PICKUP (รถกระบะ)
def pickup_bed(b, pb):
    zf = 0.89
    ylo, yhi = -2.66, -0.66
    for sgn in (1, -1):
        b.box((0.08, yhi - ylo, 0.52), (sgn * 0.91, (ylo + yhi) / 2, zf + 0.26), 'paint', bm=pb, bevel=0.018)
    b.box((1.74, 0.08, 0.50), (0, ylo + 0.02, zf + 0.25), 'paint', bm=pb, bevel=0.018)  # tailgate
    b.box((1.74, 0.07, 0.50), (0, yhi - 0.01, zf + 0.25), 'paint', bm=pb, bevel=0.018)  # headboard


def pickup_detail(b):
    lamp_pair(b, 0.92, 0.38, 0.11, 'car_headlight', True, 0.07)
    lamp_pair(b, 1.12, 0.12, 0.26, 'car_taillight', False, 0.04)
    grille(b, 0.76, 0.96, 0.22)
    on_front(b, 0.46, (1.30, 0.07, 0.16), 'car_dark', depth=0.05)       # front bumper
    on_front(b, 0.46, (0.70, 0.06, 0.07), 'car_chrome', depth=0.03, bevel=0.01)
    on_rear(b, 0.52, (1.84, 0.12, 0.20), 'car_chrome', depth=0.09, bevel=0.015)   # rear step bumper
    plates(b, 0.58, 0.52)
    mirrors(b, 0.78, 1.18)
    doors(b, [0.90, 0.02, -0.58], z0=0.32, handles=(0.52, -0.30), hz=1.08)
    # bed liner + cab rear glass
    b.box((1.66, 1.94, 0.02), (0, -1.65, 0.905), 'car_dark')
    b.box((1.10, 0.012, 0.36), (0, -0.592, 1.50), 'car_glass')
    # sport bar / tailgate handle
    b.box((0.22, 0.02, 0.04), (0, -2.715, 1.28), 'car_dark')
    # wheel flares
    for sgn in (1, -1):
        for ay in (1.80, -1.30):
            pass


PICKUP = dict(
    name='pickup', label_th='รถกระบะ', L=5.32, W=1.90, H=1.80, paint='#d9d8d2',
    front_axle=1.80, rear_axle=-1.30, wheel_r=0.385, wheel_w=0.27, arch_gap=0.08,
    keys=[
        (-2.66, .50, .86, .80, .80, .74),
        (-2.62, .38, .90, .86, .93, .88),
        (-2.40, .32, .90, .86, .95, .90),
        (-0.70, .32, .90, .86, .95, .90),
        (-0.62, .32, .92, .88, .95, .90),
        (-0.61, .32, 1.80, 1.12, .95, .82),
        (-0.55, .32, 1.80, 1.12, .95, .82),
        (0.55, .32, 1.80, 1.12, .95, .82),
        (0.68, .32, 1.77, 1.12, .95, .83),
        (1.18, .32, 1.30, 1.12, .95, .88),
        (1.40, .32, 1.26, 1.10, .95, .88),
        (2.00, .32, 1.22, 1.04, .95, .86),
        (2.50, .33, 1.16, 1.00, .93, .83),
        (2.60, .40, 1.08, .96, .87, .77),
        (2.66, .58, .92, .84, .78, .70),
    ],
    win_side=[(0.04, 0.88), (-0.50, -0.04)],
    win_top=[(0.70, 1.16)],
    detail=pickup_detail,
    cut_parts={'bed': pickup_bed},
)


# ------------------------------------------------------------------ VAN (รถตู้โดยสาร)
def van_common(b, panel=False):
    lamp_pair(b, 0.86, 0.34, 0.11, 'car_headlight', True, 0.05)
    lamp_pair(b, 1.05, 0.10, 0.42, 'car_taillight', False, 0.03)
    grille(b, 0.64, 0.84, 0.16)
    on_front(b, 0.42, (1.20, 0.07, 0.12), 'car_dark', depth=0.05)
    on_rear(b, 0.44, (1.40, 0.07, 0.14), 'car_dark', depth=0.05)
    plates(b, 0.58, 0.64)
    mirrors(b, 1.88, 1.42)


def van_detail(b):
    van_common(b)
    doors(b, [1.12, 0.14, -2.45], z0=0.34, handles=(1.50, 0.72), hz=1.00)
    # sliding door seam
    for sgn in (1, -1):
        b.box((0.012, 0.012, 1.40), (sgn * (b.P(0.14)['hw'] + 0.0015), -0.80, 0.34 + 0.70), 'car_dark')
    b.box((0.7, 0.55, 0.10), (0, -0.4, 2.31), 'paint', bevel=0.03)   # roof vent
    b.box((1.20, 0.012, 0.55), (0, -2.698, 1.62), 'car_glass')        # rear window


VAN = dict(
    name='van', label_th='รถตู้', L=5.38, W=1.95, H=2.30, paint='#c9ced4',
    front_axle=1.80, rear_axle=-1.41, wheel_r=0.345, wheel_w=0.22, arch_gap=0.07,
    keys=[
        (-2.69, .50, 2.12, 1.30, .88, .84),
        (-2.66, .36, 2.24, 1.30, .955, .90),
        (-2.58, .30, 2.28, 1.20, .975, .91),
        (-2.45, .30, 2.30, 1.18, .975, .92),
        (1.30, .30, 2.30, 1.18, .975, .92),
        (1.42, .30, 2.27, 1.18, .975, .92),
        (2.08, .30, 1.30, 1.15, .975, .94),
        (2.30, .30, 1.22, 1.10, .975, .93),
        (2.60, .30, 1.12, 1.02, .94, .88),
        (2.66, .38, 1.02, .96, .90, .82),
        (2.69, .50, .88, .86, .82, .74),
    ],
    win_side=[(1.14, 1.88), (0.18, 0.96), (-0.58, 0.08), (-1.34, -0.68), (-2.10, -1.44)],
    win_top=[(1.44, 2.06)],
    detail=van_detail,
)


# ------------------------------------------------------------------ PICKUP CAGE (รถกระบะคอก)
def cage_detail(b):
    pickup_detail(b)
    zt_, zm, zl = 1.79, 1.60, 1.43
    y0, y1 = -0.70, -2.64
    for sgn in (1, -1):
        x = sgn * 0.915
        # รางตามยาวด้านข้าง
        for z in (zt_, zm, zl):
            b.box((0.045, y0 - y1, 0.04), (x, (y0 + y1) / 2, z), 'cage', bevel=0.012)
        # เสา
        n = 7
        for i in range(n):
            y = y0 - 0.04 - i * (y0 - y1 - 0.08) / (n - 1)
            b.box((0.05, 0.05, zt_ - 1.40 + 0.04), (x, y, (zt_ + 1.40) / 2 - 0.0), 'cage', bevel=0.012)
    # คอกด้านท้าย
    for z in (zt_, zm, zl):
        b.box((1.86, 0.045, 0.04), (0, y1 + 0.02, z), 'cage', bevel=0.012)
    for x in (-0.9, -0.45, 0.0, 0.45, 0.9):
        b.box((0.05, 0.05, zt_ - 1.40 + 0.04), (x, y1 + 0.02, (zt_ + 1.40) / 2), 'cage', bevel=0.012)
    # ราวหน้า (ชิดหลังห้องโดยสาร)
    for z in (zm,):
        b.box((1.86, 0.045, 0.04), (0, y0 - 0.0, z), 'cage', bevel=0.012)


PICKUPCAGE = dict(PICKUP)
PICKUPCAGE.update(
    name='pickupcage', label_th='รถกระบะคอก', H=1.80, paint='#e7e3d7', cage='#4a5159', accent='#c6a14a',
    detail=cage_detail,
)


# ------------------------------------------------------------------ EV (รถไฟฟ้า)
def ev_detail(b):
    # light bars
    lamp_pair(b, 0.64, 0.46, 0.055, 'car_headlight', True, 0.06)
    for z in (0.76,):
        on_rear(b, 0.76, (1.62, 0.06, 0.05), 'car_taillight', depth=0.04, bevel=0.01)
    on_front(b, 0.40, (1.00, 0.06, 0.06), 'car_dark', depth=0.04)
    on_front(b, 0.52, (0.50, 0.04, 0.05), 'accent', depth=0.03, bevel=0.01)   # ป้ายสัญลักษณ์ EV (แถบสี)
    on_rear(b, 0.44, (1.20, 0.06, 0.10), 'car_dark', depth=0.04)
    plates(b, 0.54, 0.58)
    mirrors(b, 0.92, 1.02)
    doors(b, [1.04, 0.04, -0.94], handles=())
    # ช่องชาร์จ (ด้านซ้ายหลัง) + ร่องมือจับแบบเรียบ
    p = b.P(-1.85)
    b.box((0.012, 0.16, 0.12), (-(p['hw'] + 0.004), -1.85, 0.80), 'accent', bevel=0.012)
    b.box((0.012, 0.05, 0.05), (-(p['hw'] + 0.009), -1.85, 0.80), 'car_chrome', bevel=0.006, seg=1)


EV = dict(
    name='ev', label_th='รถไฟฟ้า (EV)', L=4.75, W=1.92, H=1.52, paint='#12a89d', accent='#2f7dff',
    front_axle=1.45, rear_axle=-1.42, wheel_r=0.35, wheel_w=0.235, arch_gap=0.07, rim_style='cover',
    keys=[
        (-2.375, .40, .92, .84, .70, .62),
        (-2.33, .30, 1.04, .90, .85, .76),
        (-2.15, .20, 1.07, .92, .93, .82),
        (-1.80, .18, 1.08, .94, .955, .82),
        (-1.45, .18, 1.13, .95, .96, .80),
        (-1.10, .18, 1.28, .95, .96, .76),
        (-0.70, .18, 1.43, .96, .96, .73),
        (-0.20, .18, 1.52, .98, .96, .70),
        (0.35, .18, 1.51, .98, .96, .70),
        (0.80, .18, 1.40, .98, .96, .73),
        (1.25, .18, 1.14, .96, .96, .80),
        (1.55, .18, .99, .94, .96, .86),
        (2.05, .18, .90, .88, .95, .86),
        (2.30, .22, .84, .82, .90, .80),
        (2.375, .34, .72, .70, .78, .70),
    ],
    win_side=[(0.10, 1.04), (-0.92, 0.0)],
    win_top=[(-0.95, 1.20), (-1.40, -1.02)],
    detail=ev_detail,
)

# ------------------------------------------------------------------ HATCHBACK (รถเล็ก 5 ประตู เช่น March / Yaris / Jazz)
def hatch_detail(b):
    lamp_pair(b, 0.62, 0.30, 0.10, 'car_headlight', True, 0.06)
    lamp_pair(b, 0.78, 0.10, 0.30, 'car_taillight', False, 0.04)
    grille(b, 0.50, 0.66, 0.09)
    on_front(b, 0.38, (0.90, 0.06, 0.07), 'car_dark', depth=0.04)
    on_rear(b, 0.40, (1.00, 0.06, 0.08), 'car_dark', depth=0.04)
    plates(b, 0.48, 0.60)
    mirrors(b, 0.80, 0.97, hw=0.82)
    doors(b, [0.86, 0.02, -0.80], handles=(0.52, -0.38))


HATCHBACK = dict(
    name='hatchback', label_th='รถเล็ก 5 ประตู', L=3.85, W=1.68, H=1.52, paint='#e9e9e4',
    front_axle=1.18, rear_axle=-1.20, wheel_r=0.29, wheel_w=0.185, arch_gap=0.06, rim_style='cover',
    keys=[
        (-1.925, .38, .80, .72, .66, .58),
        (-1.89, .30, 1.00, .82, .78, .68),
        (-1.84, .27, 1.10, .86, .835, .74),
        (-1.70, .26, 1.28, .88, .84, .72),
        (-1.50, .26, 1.44, .88, .84, .70),
        (-1.20, .26, 1.50, .88, .84, .68),
        (-0.70, .26, 1.52, .88, .84, .68),
        (0.25, .26, 1.52, .88, .84, .68),
        (0.50, .26, 1.49, .88, .84, .68),
        (0.95, .26, 1.08, .88, .84, .74),
        (1.35, .26, 1.00, .86, .835, .76),
        (1.72, .27, .92, .82, .80, .74),
        (1.88, .30, .86, .76, .74, .66),
        (1.925, .38, .74, .68, .66, .58),
    ],
    win_side=[(0.10, 0.92), (-1.30, 0.0)],
    win_top=[(0.55, 1.00), (-1.68, -1.26)],
    detail=hatch_detail,
)


CARS = [SEDAN, EV, SUV, PICKUP, PICKUPCAGE, VAN, HATCHBACK]
CAR_BY_NAME = {c['name']: c for c in CARS}
