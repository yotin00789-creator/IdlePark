# โมเดล 3 มิติที่จอดรถ (Blender) + ตัวดู 3D

สร้างตามภาพร่าง `ที่จอดรถ.png` — 26 ช่อง (N01–N07 บน, E01–E05 ขวา, S01–S05 ล่าง, C01–C02 เฉียงมุมล่างซ้าย, W01–W04 ซ้าย, H01–H03 หน้าบ้าน), กำแพงล้อมรอบครบทุกด้าน, ประตูโซ่เฉียงที่มุมซ้ายบน, บ้านไม้ 2 ชั้นหลังยาว (หน้าบ้านหันเหนือ), ต้นไม้ใหญ่ข้างบ้านฝั่งซ้าย, ช่องทางเดินรถหลังบ้านกว้าง ~6 ม.

## ไฟล์
- `viewer.html` — เปิดในเบราว์เซอร์ได้เลย (ไฟล์เดียว ไม่ต้องติดตั้ง)
- `parking_lot.blend` — ไฟล์ Blender (กล้อง CAM_Top, CAM_Aerial_SW, CAM_Aerial_N, CAM_Gate, CAM_House_Tree)
- `parking_lot.glb` — ที่จอดรถเปล่า / `parking_lot_demo.glb` — มีรถตัวอย่าง
- `cars/<type>.glb` — รถ 6 แบบ: `sedan, ev, suv, pickup, pickupcage, van`
- `slots.json` — ตำแหน่ง/ทิศ/ขนาดของแต่ละช่อง, `park_offset_m`, สีเริ่มต้น, ชื่อวัสดุที่เปลี่ยนสีได้, ข้อมูลป้ายทะเบียน (`plate_spec`)
- `scripts/` — สคริปต์สร้างโมเดลด้วย Blender (`layout.py` ปรับตำแหน่งช่อง/บ้าน/ต้นไม้), `viewer-src/` — ซอร์สตัวดู (three.js)

## ตัวดู 3D (viewer.html)
- คลิกรถ (หรือช่อง/รายการด้านซ้าย) เพื่อบินกล้องไปดูรถคันนั้น — แสดงประเภทรถ ช่อง ทะเบียน สี
- ปุ่ม มุมเฉียง / ป้ายหน้า / ป้ายหลัง / ด้านข้าง, ◀ ▶ (หรือปุ่มลูกศรบนคีย์บอร์ด) สลับคัน, ภาพรวมลาน
- ซูมด้วยล้อเมาส์/บีบนิ้ว (ซูมเข้าตำแหน่งเมาส์), ลากซ้าย = หมุน, ลากขวา = เลื่อน
- ปุ่ม "กำแพงโปร่งแสง" ดูรถหลังกำแพงได้ (เปิดอัตโนมัติเมื่อดูรถใกล้ ๆ)

## ป้ายทะเบียน (หน้า–หลังทุกคัน)
- ป้ายมีมิติ (แผ่นรองดำ + แผ่นขาวนูน) ใหญ่กว่าจริงเล็กน้อย (0.46×0.22 ม.) วางบนผิวนอกสุดของรถ ไม่มีกันชนบัง
- หน้าป้ายเป็นวัสดุแยก `plate_front` / `plate_rear` มี UV 0..1 — แอปสร้าง texture จากทะเบียน+จังหวัดในระบบ (ดู `plateTexture()` ใน `viewer-src/main.js` ที่วาดลง canvas) แล้วใส่เป็น `material.map` (three.js: `flipY = false`, colorSpace sRGB)
- ใช้ผ่าน API ของตัวดู (เมื่อฝัง/ต่อระบบ):
```js
ParkingViewer.park('N01', { type: 'sedan', colors: { paint: '#b3262e' },
                            plate: { text: '1กข 1234', province: 'กรุงเทพมหานคร' } });
ParkingViewer.setPlate('N01', '2ขค 5678', 'ชลบุรี');
ParkingViewer.setColor('N01', 'paint', '#2c5fa8');
ParkingViewer.focus('N01', 'front');   // iso | front | rear | side
ParkingViewer.overview('iso');         // iso | top
ParkingViewer.clear('N01');
```

## พิกัด / การวางรถ
Blender: +X ตะวันออก, +Y เหนือ (ด้านบนของภาพร่าง), +Z ขึ้น. glTF: x=x, y=z, z=−y.
ตำแหน่งศูนย์กลางรถ = center ช่อง + heading_vector × (`park_offset_m` ของรถแต่ละแบบ + `park_offset_extra_m` ของช่อง (ตอนนี้ = 0)); หมุน three.js `rotation.y = rotation_y_rad_threejs`.

## เปลี่ยนสีรถ
วัสดุที่เปลี่ยนสีได้: `<type>_paint`, `<type>_accent`, `<type>_cage` (กระบะคอก). ถ้าใช้ซ้ำหลายคันให้ clone material ต่อคัน (ดู `instance()` ใน viewer). ใน Blender ใช้ `scripts/recolor.py`.

## สร้างใหม่
`pip install bpy` แล้วรัน `python scripts/build_parking.py --out out` (แก้ `HOUSE`, `TREE`, `AISLE_BEHIND_HOUSE`, `WALL_GAP_W` ใน `layout.py`). ตัวดู: `npx esbuild viewer-src/main.js --bundle --minify --format=iife` แล้วแทน `__DATA_JSON__` / `__BUNDLE__` ใน `template.html`.

## หมายเหตุ
- ภาพร่างไม่ได้วาดตามสัดส่วน จึงปรับความกว้างช่องให้สม่ำเสมอในแต่ละกลุ่ม โดยคงตำแหน่ง/มุมตามภาพ; ช่องเฉียง 2 ช่องกว้างเท่าแถวล่าง (3.9 ม.), ปลายเส้นขาวช่องเฉียงต่อกับมุมช่อง W01 และมุมช่อง S05
- รถทุกคันเว้นระยะจากกำแพง ~1 ม. ทุกด้าน
- เปิด/ปิดเลขช่องที่ object `LOT_SlotNumbers`
