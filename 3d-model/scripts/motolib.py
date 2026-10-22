"""motolib.py — มอเตอร์ไซค์สกูตเตอร์/ออโต้เมติกแบบทั่วไปในไทย (หัว = +Y, ล้อหน้าอยู่ +Y, ป้ายทะเบียนติดท้ายอย่างเดียว)
ใช้ CarBuilder เป็นตัวช่วย (วัสดุร่วม box / cyl_x / plate_face) แล้วประกอบชิ้นส่วนเอง"""
import math
import bmesh
import carlib
from carlib import CarBuilder

MOTORCYCLE = dict(
    name='motorcycle', label_th='มอเตอร์ไซค์', L=1.95, W=0.76, H=1.18, paint='#c0392b',
    keys=[(-1, 0, 0, 0, 0, 0), (1, 0, 0, 0, 0, 0)], front_axle=0.68, rear_axle=-0.68, wheel_r=0.28, wheel_w=0.11,
)


def build_motorcycle(collection=None):
    spec = dict(MOTORCYCLE)
    b = CarBuilder(spec)
    P = 'paint'
    r, w = 0.28, 0.11

    # ---- ล้อ
    for ay in (0.68, -0.68):
        b.cyl_x(r, w, (0, ay, r), 'car_tire', segs=36, bevel=0.03)
        b.cyl_x(r * 0.66, w + 0.012, (0, ay, r), 'car_rim', segs=32)
        b.cyl_x(r * 0.50, w + 0.016, (0, ay, r), 'car_dark', segs=28)
        b.cyl_x(r * 0.16, w + 0.03, (0, ay, r), 'car_chrome', segs=14)
    # ดิสก์เบรกหน้า
    b.cyl_x(r * 0.46, 0.012, (0.07, 0.68, r), 'car_chrome', segs=24)

    # ---- โช๊คหน้า (เอียงหลัง 15°) สองข้าง
    for sgn in (1, -1):
        b.box((0.034, 0.034, 0.70), (sgn * 0.075, 0.59, 0.63), 'car_chrome', rot=(15, 0, 0), bevel=0.008, seg=1)
        b.box((0.05, 0.05, 0.20), (sgn * 0.075, 0.52, 0.86), 'car_dark', rot=(15, 0, 0), bevel=0.01, seg=1)
    b.box((0.22, 0.05, 0.05), (0, 0.57, 0.96), 'car_dark', bevel=0.012)

    # ---- บังโคลนหน้า
    b.box((0.15, 0.46, 0.035), (0, 0.70, 0.60), P, rot=(-8, 0, 0), bevel=0.014)
    for sgn in (1, -1):
        b.box((0.012, 0.40, 0.06), (sgn * 0.075, 0.70, 0.575), P, rot=(-8, 0, 0))

    # ---- แฮนด์ + กริป + กระจก
    b.box((0.66, 0.04, 0.04), (0, 0.50, 1.02), 'car_dark', bevel=0.012)
    for sgn in (1, -1):
        b.box((0.11, 0.045, 0.045), (sgn * 0.33, 0.50, 1.02), 'car_tire', bevel=0.015)
        b.box((0.012, 0.012, 0.16), (sgn * 0.30, 0.47, 1.10), 'car_chrome')
        b.box((0.12, 0.012, 0.075), (sgn * 0.30, 0.46, 1.19), 'car_dark', rot=(0, 0, sgn * -12), bevel=0.01, seg=1)
        b.box((0.10, 0.011, 0.062), (sgn * 0.30, 0.452, 1.19), 'car_glass', rot=(0, 0, sgn * -12))

    # ---- ไฟหน้า + ฝาครอบแฮนด์
    b.box((0.30, 0.20, 0.17), (0, 0.52, 1.06), P, bevel=0.05)
    b.box((0.30, 0.17, 0.08), (0, 0.60, 0.93), P, bevel=0.03)
    b.box((0.18, 0.02, 0.085), (0, 0.628, 1.05), 'car_headlight', bevel=0.012, seg=1)
    b.box((0.06, 0.012, 0.025), (0.12, 0.628, 0.97), 'car_taillight', bevel=0.005, seg=1)
    b.box((0.06, 0.012, 0.025), (-0.12, 0.628, 0.97), 'car_taillight', bevel=0.005, seg=1)

    # ---- เกราะขา + พื้นวางเท้า
    b.box((0.36, 0.07, 0.52), (0, 0.40, 0.62), P, rot=(14, 0, 0), bevel=0.03)
    b.box((0.40, 0.62, 0.05), (0, 0.04, 0.27), P, bevel=0.02)
    b.box((0.30, 0.50, 0.012), (0, 0.04, 0.30), 'car_dark')   # พรมยาง

    # ---- ตัวถังหลัง ใต้เบาะ + เบาะ + กล่องเก็บของ
    b.box((0.34, 0.66, 0.30), (0, -0.46, 0.47), P, bevel=0.06)
    b.box((0.36, 0.72, 0.10), (0, -0.40, 0.72), 'car_dark', bevel=0.04)    # เบาะ
    b.box((0.32, 0.22, 0.07), (0, 0.00, 0.60), 'car_dark', bevel=0.03)     # เบาะหน้า
    b.box((0.30, 0.40, 0.04), (0, -0.98, 0.66), 'car_chrome', rot=(-6, 0, 0), bevel=0.01, seg=1)  # แร็คท้าย

    # ---- บังโคลนท้าย + ไฟท้าย
    b.box((0.28, 0.34, 0.07), (0, -0.92, 0.53), P, rot=(-18, 0, 0), bevel=0.025)
    b.box((0.20, 0.03, 0.065), (0, -1.065, 0.585), 'car_taillight', rot=(-18, 0, 0), bevel=0.01, seg=1)
    # ป้ายทะเบียนท้าย (กรอบดำ + แผ่นขาว + หน้าป้ายที่มี UV)
    b.box((0.25, 0.012, 0.165), (0, -1.075, 0.42), 'car_dark', bevel=0.006)
    b.box((0.22, 0.012, 0.14), (0, -1.083, 0.42), 'car_plate', bevel=0.004)
    b.plate_face(False, (0, -1.0895, 0.42), 0, w=0.22, h=0.14, t=0.0)

    # ---- เครื่อง / แขนสวิง / ท่อไอเสีย / ขาตั้ง
    b.box((0.26, 0.34, 0.26), (0, -0.14, 0.34), 'car_dark', bevel=0.03)
    b.box((0.12, 0.60, 0.10), (0.165, -0.42, 0.30), 'car_dark', bevel=0.02)
    b.box((0.085, 0.62, 0.09), (-0.19, -0.58, 0.26), 'car_chrome', rot=(4, 0, 0), bevel=0.03)
    b.box((0.10, 0.12, 0.10), (-0.19, -0.88, 0.27), 'car_dark', bevel=0.03)
    b.box((0.025, 0.28, 0.025), (-0.06, -0.12, 0.15), 'car_dark', rot=(30, 0, 0))

    b.smooth(b.bm, 40)
    obj = b.to_object(b.bm, 'CAR_motorcycle', collection)
    obj.data.name = 'CAR_motorcycle_mesh'
    obj['vehicle_type'] = 'motorcycle'
    obj['label_th'] = spec['label_th']
    obj['length_m'] = spec['L']
    obj['width_m'] = spec['W']
    obj['height_m'] = spec['H']
    return obj
