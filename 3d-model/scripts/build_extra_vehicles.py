"""
build_extra_vehicles.py — สร้างรถเพิ่ม (รถเล็ก 5 ประตู, มอเตอร์ไซค์) เป็นไฟล์ GLB แยก โดยไม่แตะลาน

  /Applications/Blender.app/Contents/MacOS/Blender -b -P build_extra_vehicles.py -- --out ./out [--preview]

ผลลัพธ์: <out>/cars/<type>.glb (หัวรถ = -Z ใน glTF, ชื่อวัสดุสีที่เปลี่ยนได้ = <type>_paint) และ vehicles_extra.json
"""
import sys, os, json, math

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import carlib, carspecs, motolib, layout

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[argv.index('--out') + 1]) if '--out' in argv else os.path.join(HERE, 'output')
PREVIEW = '--preview' in argv
os.makedirs(os.path.join(OUT, 'cars'), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
coll = bpy.data.collections.new('CARS')
bpy.context.scene.collection.children.link(coll)

built = {}
built['hatchback'] = (carlib.build_car(carspecs.HATCHBACK, coll), carspecs.HATCHBACK)
built['motorcycle'] = (motolib.build_motorcycle(coll), motolib.MOTORCYCLE)


def export(obj, path):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_extras=True, export_yup=True, export_cameras=False, export_lights=False,
                              export_materials='EXPORT', export_image_format='AUTO')
    print('exported', path, os.path.getsize(path) // 1024, 'KB')


meta = []
for name, (obj, spec) in built.items():
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    export(obj, os.path.join(OUT, 'cars', f'{name}.glb'))
    mats = [m.name for m in obj.data.materials if m]
    meta.append(dict(id=name, label_th=spec['label_th'], glb=f'cars/{name}.glb', length_m=spec['L'], width_m=spec['W'],
                     height_m=spec['H'], park_offset_m=round(layout.park_offset(spec['L']), 3),
                     colorable_materials={'paint': f'{name}_paint'}, default_colors={'paint': spec['paint']}, materials=mats))
json.dump(meta, open(os.path.join(OUT, 'vehicles_extra.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if PREVIEW:
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48
    sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = 1000, 560
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.9, 0.95, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.2
    sc.world = w
    bpy.ops.mesh.primitive_plane_add(size=30); bpy.context.object.data.materials.append(carlib.get_mat('floor', (0.5, 0.5, 0.5, 1), 0.9))
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    for name, (obj, spec) in built.items():
        for n2, (o2, _) in built.items():
            o2.hide_render = n2 != name
        for view, (cx, cy, cz) in {'front34': (-4.6, 5.2, 2.6), 'rear34': (4.6, -5.2, 2.6), 'side': (6.5, 0.2, 1.1)}.items():
            if name == 'motorcycle':
                cx, cy, cz = cx * 0.7, cy * 0.7, cz * 0.8
            cam.location = (cx, cy, cz)
            d = obj.location.copy(); d.z = 0.6
            direction = d - cam.location
            cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = os.path.join(OUT, f'preview_{name}_{view}.png')
            bpy.ops.render.render(write_still=True)
