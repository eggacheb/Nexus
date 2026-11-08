"""
精确修正：
1. 真正中空的窗框架构 (四边木条 + 十字窗棂 + 发光暖玻璃)
2. 通过相机反投影精确放置左上角大月亮与远景星辰
3. 精确相机机位，完整包容悬浮浮岛地台 (顶部草坪、泥土、倒锥岩石与悬浮碎石)
"""
import bpy
import math
from mathutils import Vector, Matrix, Euler
import bpy_extras

def setup_hollow_window(name_prefix, parent_obj, loc_local, rot_local, width=0.7, height=0.8, is_side=False):
    """构建精致的中空木窗 (四边框 + 十字窗棂 + 暖光玻璃)"""
    mat_trim = bpy.data.materials["Mat_WoodTrim"]
    mat_window = bpy.data.materials["Mat_WindowEmission"]
    
    # 删除旧的窗框、玻璃、网格
    for obj in list(bpy.data.objects):
        if obj.name.startswith(name_prefix):
            bpy.data.objects.remove(obj, do_unlink=True)
            
    # 建立窗户根节点
    w_root = bpy.data.objects.new(f"{name_prefix}_Root", None)
    w_root.location = loc_local
    w_root.rotation_euler = rot_local
    w_root.parent = parent_obj
    bpy.context.scene.collection.objects.link(w_root)
    bpy.data.collections["House"].objects.link(w_root)
    
    # 1. 暖光玻璃 (薄片)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    glass = bpy.context.active_object
    glass.name = f"{name_prefix}_Glass"
    glass.scale = (width * 0.92, 0.02, height * 0.92)
    glass.parent = w_root
    glass.data.materials.append(mat_window)
    bpy.data.collections["House"].objects.link(glass)
    
    # 2. 四边木窗框 (厚度 0.06m)
    frame_t = 0.06
    frame_d = 0.08
    
    # 上框
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, height * 0.5))
    top = bpy.context.active_object
    top.name = f"{name_prefix}_Top"
    top.scale = (width + frame_t, frame_d, frame_t)
    top.parent = w_root
    top.data.materials.append(mat_trim)
    bpy.data.collections["House"].objects.link(top)
    
    # 下框
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, -height * 0.5))
    bot = bpy.context.active_object
    bot.name = f"{name_prefix}_Bot"
    bot.scale = (width + frame_t, frame_d, frame_t)
    bot.parent = w_root
    bot.data.materials.append(mat_trim)
    bpy.data.collections["House"].objects.link(bot)
    
    # 左框
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-width * 0.5, -0.02, 0))
    left = bpy.context.active_object
    left.name = f"{name_prefix}_Left"
    left.scale = (frame_t, frame_d, height)
    left.parent = w_root
    left.data.materials.append(mat_trim)
    bpy.data.collections["House"].objects.link(left)
    
    # 右框
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(width * 0.5, -0.02, 0))
    right = bpy.context.active_object
    right.name = f"{name_prefix}_Right"
    right.scale = (frame_t, frame_d, height)
    right.parent = w_root
    right.data.materials.append(mat_trim)
    bpy.data.collections["House"].objects.link(right)
    
    # 十字窗棂 (十字格)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.025, 0))
    grid_h = bpy.context.active_object
    grid_h.name = f"{name_prefix}_GridH"
    grid_h.scale = (width * 0.9, 0.025, 0.03)
    grid_h.parent = w_root
    grid_h.data.materials.append(mat_trim)
    bpy.data.collections["House"].objects.link(grid_h)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.025, 0))
    grid_v = bpy.context.active_object
    grid_v.name = f"{name_prefix}_GridV"
    grid_v.scale = (0.03, 0.025, height * 0.9)
    grid_v.parent = w_root
    grid_v.data.materials.append(mat_trim)
    bpy.data.collections["House"].objects.link(grid_v)

# 执行窗户重建
house_root = bpy.data.objects.get("House_Root")
if house_root:
    # 正面窗户 (局部 Y = -0.98m, Z = 0.95m)
    setup_hollow_window("House_Window_Front", house_root, Vector((0.55, -0.98, 0.95)), Euler((0, 0, 0)), width=0.65, height=0.75)
    # 侧面窗户 (局部 X = -1.22m, Z = 0.95m)
    setup_hollow_window("House_Window_Side", house_root, Vector((-1.22, 0.1, 0.95)), Euler((0, 0, math.radians(90))), width=0.65, height=0.75)

# 确保木屋正面木梁完全不遮挡正面窗户
for obj in bpy.data.objects:
    if "House_Plank_F" in obj.name:
        if 0.5 < obj.location.z < 1.4:
            # 缩短至门左侧
            obj.location.x = -0.85
            obj.scale.x = 0.7

# 调整相机机位：
# 目标：完整呈现悬浮地台微缩模型、左上角大月亮、右侧小木屋
cam = bpy.data.objects.get("Camera_Main")
if cam:
    cam.data.lens = 52.0
    # 相机后退并微调俯视角 (18度俯视)
    cam.location = (-6.5, -15.5, 4.6)
    cam.rotation_euler = (math.radians(74.0), 0, math.radians(-23.0))
    
    cabin_body = bpy.data.objects.get("House_Body")
    if cabin_body:
        cam.data.dof.focus_object = cabin_body
        cam.data.dof.aperture_fstop = 2.8

# 利用相机反投影计算月亮的绝对三维坐标，使其稳定位于画面 NDC (X=0.20, Y=0.82)
if cam:
    scene = bpy.context.scene
    # 构造相机空间中的点
    # 期望深度 depth = 14.0m
    # 相机坐标系中：-Z 为镜头前方，+X 为右侧，+Y 为上方
    sensor_w = cam.data.sensor_width
    focal = cam.data.lens
    aspect = scene.render.resolution_x / scene.render.resolution_y
    # 计算相机的视野半角
    fov_x = 2 * math.atan((sensor_w / 2) / focal)
    fov_y = 2 * math.atan(((sensor_w / aspect) / 2) / focal)
    
    # 目标屏幕归一化坐标：u=0.18 (偏左), v=0.82 (偏上)
    # 对应在相机局部归一化平面：
    u = 0.18
    v = 0.82
    depth = 15.0
    local_x = (u - 0.5) * 2.0 * math.tan(fov_x / 2) * depth
    local_y = (v - 0.5) * 2.0 * math.tan(fov_y / 2) * depth
    local_z = -depth
    
    moon_world = cam.matrix_world @ Vector((local_x, local_y, local_z))
    
    moon = bpy.data.objects.get("Moon_Celestial")
    if moon:
        moon.location = moon_world
        moon.scale = (1.6, 1.6, 1.6)
        
    # 同样在相机视野上半部分分布星星
    import random
    random.seed(333)
    for s_idx in range(25):
        su = random.uniform(0.05, 0.95)
        sv = random.uniform(0.55, 0.95)
        s_depth = random.uniform(16.0, 22.0)
        s_lx = (su - 0.5) * 2.0 * math.tan(fov_x / 2) * s_depth
        s_ly = (sv - 0.5) * 2.0 * math.tan(fov_y / 2) * s_depth
        s_lz = -s_depth
        s_world = cam.matrix_world @ Vector((s_lx, s_ly, s_lz))
        
        star = bpy.data.objects.get(f"Star_{s_idx+1:02d}")
        if star:
            star.location = s_world
            star.scale = (0.06, 0.06, 0.06)

# 渲染测试预览 v3
scene = bpy.context.scene
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.filepath = "E:/workspace/cod/render/test_camera_preview_v3.png"
if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
    scene.eevee.taa_render_samples = 48

bpy.ops.render.render(write_still=True)
print("Preview v3 rendered successfully!")
