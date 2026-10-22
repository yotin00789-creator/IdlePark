"""render_view.py — เรนเดอร์ภาพจากกล้องใน parking_lot.blend
   python render_view.py <blend> <กล้อง> <ไฟล์ออก.png> [samples] [width] [height] [hide_cars]"""
import sys, bpy
a = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
blend, cam, out = a[0], a[1], a[2]
samples = int(a[3]) if len(a) > 3 else 64
w = int(a[4]) if len(a) > 4 else 1600
h = int(a[5]) if len(a) > 5 else 1000
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.camera = bpy.data.objects[cam]
sc.cycles.samples = samples
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.render.filepath = out
if cam == 'CAM_CarLibrary':
    bpy.data.collections['CAR_LIBRARY'].hide_render = False
    for o in bpy.data.collections['DEMO_CARS'].objects: o.hide_render = True
if len(a) > 6 and a[6] == 'hide_cars':
    for o in bpy.data.collections['DEMO_CARS'].objects: o.hide_render = True
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
