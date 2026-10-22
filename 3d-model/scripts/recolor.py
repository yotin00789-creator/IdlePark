"""
recolor.py — เปลี่ยนสีรถใน Blender แบบอิสระต่อคัน (ตัวถัง / แถบสี-ชิ้นตกแต่ง / คอกรถกระบะคอก)

วิธีใช้ใน Blender (Scripting > เปิดไฟล์นี้ > Run Script) แล้วเรียกในคอนโซล:
    import recolor
    recolor.set_car_color(bpy.data.objects['CAR_N01_sedan'], paint='#ff6600')
    recolor.set_car_color(bpy.data.objects['CAR_E01_pickupcage'], paint='#ffffff', cage='#222222')
    recolor.list_cars()          # ดูรายชื่อรถที่จอดอยู่ทั้งหมด

หรือเปลี่ยนมือใน Blender: เลือกรถ > แท็บ Material > ช่อง  <type>_paint.<slot>  > Base Color
(แต่ละคันมีวัสดุสีของตัวเอง ชื่อลงท้าย .N01, .E03 ฯลฯ จึงไม่กระทบคันอื่น)
"""
import bpy


def _hex_to_linear(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda v: ((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def set_car_color(obj, paint=None, accent=None, cage=None):
    """ตั้งสีให้รถคันเดียว (obj) — ส่งสีเป็น '#rrggbb'. ถ้าวัสดุยังใช้ร่วมกับคันอื่น จะทำสำเนาให้อัตโนมัติ"""
    want = {'paint': paint, 'accent': accent, 'cage': cage}
    tag = obj.get('slot_id', obj.name)
    for slot in obj.material_slots:
        m = slot.material
        if not m:
            continue
        base = m.name.split('.')[0]
        for kind, col in want.items():
            if col and base.endswith('_' + kind):
                if m.users > 1 or slot.link != 'OBJECT':
                    slot.link = 'OBJECT'
                    m = m.copy()
                    m.name = f"{base}.{tag}"
                    slot.material = m
                rgba = _hex_to_linear(col)
                m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = rgba
                m.diffuse_color = rgba


def list_cars():
    for o in bpy.data.collections['DEMO_CARS'].objects:
        print(o.name, '→ ช่อง', o.get('slot_id'), '| ประเภท', o.get('vehicle_type'))
