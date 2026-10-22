"""
layout.py — ผังลานจอดรถ ถอดจากภาพสเก็ตช์ "ที่จอดรถ.png" ตามตำแหน่งในภาพ (หน่วยเมตร)

แกน: +X = ตะวันออก (ขวาของภาพ), +Y = เหนือ (บนของภาพ). หน้าบ้านหันไปทาง +Y (ขึ้นบนของภาพ)
heading = ทิศที่ "หัวรถ" หันไป เป็นองศาตามเข็มนาฬิกาจากเหนือ (0=เหนือ 90=ตะวันออก 180=ใต้ 270=ตะวันตก)

วิธีถอด: จุดทุกจุดมาจากพิกเซลของภาพ ผ่านฟังก์ชัน m(px,py) ด้วยสเกลเดียว SCALE เมตร/พิกเซล
  - ช่องที่เส้นแบ่งในภาพตรง (แนวตั้ง/แนวนอน) = จอดตรง · ช่องที่เส้นแบ่งเฉียง "/" มุมล่างซ้าย = จอดเฉียง ~55°
  - ภาพวาดไม่ได้สเกลจริง (บางช่องกว้างแค่ 2 ม. บางช่อง 4.5 ม.) จึงปรับความกว้างช่องของแต่ละโซนให้เท่ากัน
    (จำกัด 2.6–3.9 ม.) โดยคงตำแหน่งโซน ทิศทาง และลำดับเดิมตามภาพ
แก้ตัวเลขในไฟล์นี้แล้วรัน build_parking.py ใหม่ ผังทั้งหมดจะถูกสร้างใหม่
"""
import math

SCALE = 0.03          # เมตรต่อพิกเซลของภาพสเก็ตช์
SLOT_L = 5.6          # ความยาวช่องจอด (รองรับรถตู้ 5.38 ม.)
WALL_GAP_W = 0.6      # ระยะปลายช่องแถวซ้ายถึงกำแพง (รถไม่ชิดกำแพงเกินไป)
NOSE_MARGIN = 0.45    # ระยะหัวรถถึงปลายช่อง
WALL_T = 0.2          # ความหนากำแพง
WALL_H = 2.0          # ความสูงกำแพง


def m(px, py):
    """พิกเซลภาพ -> เมตร (เหนือ = ขึ้นบน)"""
    return ((px - 760) * SCALE, (540 - py) * SCALE)


def heading_vec(h):
    r = math.radians(h)
    return (math.sin(r), math.cos(r))


def side_vec(h):
    r = math.radians(h)
    return (math.cos(r), -math.sin(r))


def corners(c, h, w, l=SLOT_L):
    d, u = heading_vec(h), side_vec(h)
    pts = []
    for sl, sw in ((1, -1), (1, 1), (-1, 1), (-1, -1)):
        pts.append((c[0] + d[0] * sl * l / 2 + u[0] * sw * w / 2,
                    c[1] + d[1] * sl * l / 2 + u[1] * sw * w / 2))
    return pts


def _slot(row, k, c, h, w, kind, zone, l=SLOT_L):
    return dict(row=row, k=k, center=c, heading=h, w=w, l=l, kind=kind, zone_th=zone,
                park_extra=(l - SLOT_L) / 2, corners=corners(c, h, w, l))


def build_slots():
    # เลื่อนกลุ่มล่าง (แถวตรง + ช่องเฉียง) ลงใต้ เพื่อให้มีช่องทางเดินรถหลังบ้าน
    old_open_end = m(0, 1040)[1] + SLOT_L
    BOTTOM_SHIFT = (HOUSE['y0'] - AISLE_BEHIND_HOUSE) - old_open_end
    out = []   # ลำดับเลขช่อง: เริ่มบนซ้าย ตามเข็มนาฬิกา แล้วจบที่ช่องหน้าบ้าน

    # --- แถวบน: จอดตรง 7 ช่อง หัวรถชนทิศเหนือ -----------------------------------
    n = 7
    x0, x1 = m(454, 0)[0], m(1169, 0)[0]
    w = (x1 - x0) / n
    cy = m(0, 5)[1] - SLOT_L / 2
    N = [_slot('N', i + 1, (x0 + w * (i + .5), cy), 0, w, 'straight', 'แถวบน (จอดตรง)') for i in range(n)]

    # --- แถวขวา: จอดตรง 5 ช่อง หัวรถหันทิศตะวันออก -----------------------------
    n = 5
    y0, y1 = m(0, 118)[1], m(0, 651)[1]
    w = (y0 - y1) / n
    cx = m(1490, 0)[0] - SLOT_L / 2
    E = [_slot('E', i + 1, (cx, y0 - w * (i + .5)), 90, w, 'straight', 'แถวขวา (จอดตรง)') for i in range(n)]

    # --- หน้าบ้าน: จอดตรง 3 ช่อง หัวรถหันเข้าบ้าน (ทิศใต้) ---------------------
    n, w = 3, 3.9
    xc = m(965.5, 0)[0]
    cy = m(0, 660)[1] + SLOT_L / 2
    H = [_slot('H', i + 1, (xc + w * (i - 1), cy), 180, w, 'straight', 'หน้าบ้าน (จอดตรง)') for i in range(n)]

    # --- มุมล่างซ้าย: จอดเฉียง 2 ช่อง (~55° จากแนวนอน) หัวรถหันลงซ้าย กว้างเท่าช่องแถวล่าง -----
    # เส้นเฉียงซ้ายสุดเริ่มที่ "ปลายเส้นขาว" T = มุมขวาล่างของ W01 (ตามเส้นแดงที่ผู้ใช้วาด)
    hC = 215.0
    wC = 3.9                                       # กว้างเท่าช่องแถวล่าง (สมส่วนกัน)
    nC = 2
    dC, uC = heading_vec(hC), side_vec(hC)
    step = (-uC[0] * wC, -uC[1] * wC)              # ระยะระหว่างเส้นเฉียงแต่ละเส้น (ไปทางขวา/ลง)
    s_open_end = m(0, 1040)[1] + SLOT_L + BOTTOM_SHIFT     # ปากช่องแถวล่าง
    rr_y = s_open_end                              # ปลายท้ายขวาของช่องเฉียงขวาสุด = มุมซ้ายบนช่องแถวล่าง (รอยต่อ V)
    wall_in = m(40, 0)[0] - 0.10                   # ผิวในของกำแพงซ้าย
    T = (wall_in + WALL_GAP_W + SLOT_L, rr_y - nC * step[1])
    C = []
    for i in range(nC):
        rear_mid = (T[0] + step[0] * (i + .5), T[1] + step[1] * (i + .5))
        c = (rear_mid[0] + dC[0] * SLOT_L / 2, rear_mid[1] + dC[1] * SLOT_L / 2)
        C.append(_slot('C', i + 1, c, hC, wC, 'angled', 'มุมล่างซ้าย (จอดเฉียง ~55°)'))
    # C01 = ช่องขวา (ติดแถวล่าง), C02 = ช่องซ้ายสุด (เรียงเลขจากขวาไปซ้าย)
    C = C[::-1]
    for i, s_ in enumerate(C):
        s_['k'] = i + 1

    # --- แถวซ้าย: จอดตรง 4 ช่อง หัวรถหันทิศตะวันตก (ชิดกำแพงแต่เว้นระยะ) -----------
    # มุมขวาล่างของ W01 = ปลายเส้นขาวด้านบนของช่องเฉียงซ้ายสุด
    n, w = 4, 2.6
    cx = (T[0] - 0.03) - SLOT_L / 2
    y_bot = T[1] + 0.03
    W_ = [_slot('W', i + 1, (cx, y_bot + w * (i + .5)), 270, w, 'straight', 'แถวซ้าย (จอดตรง)') for i in range(n)]
    for i, s_ in enumerate(W_):
        s_['k'] = i + 1

    # --- แถวล่าง: จอดตรง 5 ช่อง หัวรถหันทิศใต้ ติดกับช่องเฉียงที่ปลายซ้าย --------
    n, w = 5, 3.9
    left = max(p[0] for p in C[0]['corners']) + 0.04   # ชิดขอบช่องเฉียง (รอยต่อรูปตัว V ในภาพ)
    cy = m(0, 1040)[1] + SLOT_L / 2 + BOTTOM_SHIFT
    S = [_slot('S', i + 1, (left + w * (i + .5), cy), 180, w, 'straight', 'แถวล่าง (จอดตรง)') for i in range(n)]
    S = S[::-1]       # S01 = ขวาสุด (ตามเข็มนาฬิกา ขวา->ซ้าย)
    for i, s in enumerate(S):
        s['k'] = i + 1

    # ลำดับเลข: บน(ซ้าย->ขวา) ขวา(บน->ล่าง) ล่าง(ขวา->ซ้าย) เฉียง(ขวา->ซ้าย) ซ้าย(ล่าง->บน) หน้าบ้าน(ซ้าย->ขวา)
    for grp in (N, E, S, C, W_, H):
        out.extend(grp)
    for n_, s in enumerate(out, 1):
        s['id'] = f"{s['row']}{s['k']:02d}"
        s['number'] = n_
    return out


# --- สิ่งก่อสร้างอื่นตามภาพ -------------------------------------------------------
# บ้านไม้ 2 ชั้นหลังยาว (ตามกรอบแดงที่ผู้ใช้วงในภาพ) หน้าบ้านหันเหนือ; ต้นไม้ใหญ่อยู่ข้างบ้านทางทิศตะวันออก
HOUSE = dict(x0=-1.15, x1=9.35, y1=-4.10, y0=-9.20)
TREE = dict(x=-4.2, y=-6.8, crown_r=2.7, crown_z=5.8, trunk_h=4.0)
AISLE_BEHIND_HOUSE = 6.0       # ช่องทางเดินรถหลังบ้าน (กว้างระหว่างหลังบ้านกับปากช่องจอดแถวล่าง)

_sx0, _sy1 = m(1315, 13)
_sx1, _sy0 = m(1461, 100)
SHED = dict(x0=_sx0, x1=_sx1, y0=_sy0, y1=_sy1, h=2.5)    # ที่เก็บของ มุมขวาบน

# ประตูทางเข้า-ออก: เอียงเฉียงตัดมุมซ้ายบน (เส้นโค้งในภาพจาก (135,298) ไป (240,200))
G1 = m(240, 200)     # ปลายบนขวาของประตู
G2 = m(135, 298)     # ปลายล่างซ้ายของประตู


def lot_polygon(slots):
    """เส้นรอบลาน (ตามเข็มนาฬิกา) — กำแพงล้อมรอบตามจริง; ช่วง V5->V6 คือบานประตู"""
    north = m(0, 5)[1] + WALL_GAP_W                 # รถทุกแถวเว้นระยะจากกำแพงเท่ากัน (ปลายช่อง→กำแพง)
    east = m(1490, 0)[0] + WALL_GAP_W
    west = m(40, 0)[0] - 0.10
    south = min(p[1] for s in slots for p in s['corners']) - WALL_GAP_W
    wallx = m(290, 0)[0]            # กำแพงแนวตั้งข้างซอย (เส้นดำแนวตั้งในภาพ x≈290)
    return [
        (wallx, north),             # V0
        (east, north),              # V1
        (east, south),              # V2
        (west, south),              # V3
        (west, G2[1]),              # V4
        G2,                         # V5  ปลายประตู (ล่างซ้าย)
        G1,                         # V6  ปลายประตู (บนขวา)
        (wallx, G1[1]),             # V7
    ]


# ---------- ตรวจสอบ ------------------------------------------------------------------
def _axes(poly):
    ax = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        ax.append((-(q[1] - p[1]), q[0] - p[0]))
    return ax


def overlap(a, b, eps=1e-6):
    for ax in _axes(a) + _axes(b):
        pa = [p[0] * ax[0] + p[1] * ax[1] for p in a]
        pb = [p[0] * ax[0] + p[1] * ax[1] for p in b]
        if max(pa) <= min(pb) + eps or max(pb) <= min(pa) + eps:
            return False
    return True


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def inside(poly, pt):
    x, y = pt
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def validate(slots):
    problems = []
    poly = lot_polygon(slots)
    for i, a in enumerate(slots):
        for b in slots[i + 1:]:
            if overlap(a['corners'], b['corners']):
                problems.append(f"ซ้อนกัน: {a['id']} / {b['id']}")
    obs = {'house': rect(HOUSE['x0'], HOUSE['y0'], HOUSE['x1'], HOUSE['y1']),
           'shed': rect(SHED['x0'], SHED['y0'], SHED['x1'], SHED['y1'])}
    for s in slots:
        for nm, ob in obs.items():
            if overlap(s['corners'], ob):
                problems.append(f"{s['id']} ชน {nm}")
        for p in s['corners']:
            if not inside(poly, p):
                problems.append(f"{s['id']} ออกนอกกำแพง {p}")
    tr = rect(TREE['x'] - 0.4, TREE['y'] - 0.4, TREE['x'] + 0.4, TREE['y'] + 0.4)
    for s_ in slots:
        if overlap(s_['corners'], tr):
            problems.append(f"{s_['id']} ชนต้นไม้")
    for nm, ob in obs.items():
        for p in ob:
            if not inside(poly, p):
                problems.append(f"{nm} ออกนอกกำแพง {p}")
    return problems


def park_offset(car_length):
    """ระยะเลื่อนศูนย์กลางรถตามแนวหัวรถ จากกึ่งกลางช่อง (หัวรถห่างปลายช่อง NOSE_MARGIN; รถยาวจะชิดเข้าไปไม่ล้นช่อง)"""
    nm = min(NOSE_MARGIN, (SLOT_L - car_length) / 2)
    return SLOT_L / 2 - nm - car_length / 2


if __name__ == '__main__':
    sl = build_slots()
    print(len(sl), 'slots')
    for p in validate(sl):
        print('PROBLEM', p)
    for s in sl:
        print(s['number'], s['id'], s['kind'], s['heading'], round(s['w'], 2), [round(v, 2) for v in s['center']])
    print('house', {k: round(v, 2) for k, v in HOUSE.items()})
    print('shed', {k: round(v, 2) for k, v in SHED.items()})
    print('poly', [(round(x, 2), round(y, 2)) for x, y in lot_polygon(sl)])
