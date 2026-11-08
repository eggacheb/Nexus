"""
阶段一与阶段二：地台底座与精致童话小木屋构建
- 完善微缩地台（带材质槽索引：草地、泥土、岩石倒锥）
- 小木屋精细化（主体木板梁、双坡屋顶、苔藓层、木门台阶、双发光窗、烟囱轻烟、门侧提灯）
"""

import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, noise

def reset_scene():
    """清空场景中的全部物体与无用数据块"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

def setup_collections():
    """建立标准层级集合"""
    coll_names = ["Terrain", "House", "Trees", "Props", "Lights", "FX", "Camera"]
    scene_coll = bpy.context.scene.collection
    colls = {}
    for name in coll_names:
        c = bpy.data.collections.get(name)
        if not c:
            c = bpy.data.collections.new(name)
            scene_coll.children.link(c)
        colls[name] = c
    return colls

def link_to_collection(obj, coll_name):
    """确保物体只位于目标集合"""
    target = bpy.data.collections.get(coll_name)
    if not target:
        return
    for c in list(obj.users_collection):
        if c != target:
            c.objects.unlink(obj)
    if obj.name not in target.objects:
        target.objects.link(obj)

def apply_smooth_and_bevel(obj, bevel_width=0.03, segments=2, angle_deg=35):
    """为模型赋予平滑着色并添加精密倒角修饰器以展现微缩边缘高光"""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(angle_deg)
    bev = obj.modifiers.new(name="Bevel", type='BEVEL')
    bev.width = bevel_width
    bev.segments = segments
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(angle_deg)
    obj.select_set(False)

# ----------------- 材质预定义 -----------------
def get_or_create_material(name, base_color=(0.8, 0.8, 0.8, 1.0), roughness=0.5, emission_color=(0,0,0,1), emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name)
    if not mat:
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    
    node_out = nodes.new(type='ShaderNodeOutputMaterial')
    node_bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    node_bsdf.inputs['Base Color'].default_value = base_color
    node_bsdf.inputs['Roughness'].default_value = roughness
    
    # 兼容 Blender 3.6 与 4.x 的 Emission 接口
    if 'Emission Strength' in node_bsdf.inputs:
        node_bsdf.inputs['Emission'].default_value = emission_color
        node_bsdf.inputs['Emission Strength'].default_value = emission_strength
    elif 'Emission Color' in node_bsdf.inputs:
        node_bsdf.inputs['Emission Color'].default_value = emission_color
        node_bsdf.inputs['Emission Strength'].default_value = emission_strength
        
    if 'Alpha' in node_bsdf.inputs:
        node_bsdf.inputs['Alpha'].default_value = alpha
        if alpha < 0.99:
            mat.blend_method = 'BLEND'
            mat.shadow_method = 'NONE'
            
    mat.node_tree.links.new(node_bsdf.outputs['BSDF'], node_out.inputs['Surface'])
    return mat

def hex_to_rgba(hex_str, alpha=1.0):
    hex_str = hex_str.lstrip('#')
    lv = len(hex_str)
    rgb = [int(hex_str[i:i + lv // 3], 16) / 255.0 for i in range(0, lv, lv // 3)]
    # Gamma 矫正至线性色彩空间 (sRGB -> Linear)
    linear_rgb = [math.pow(c, 2.2) for c in rgb]
    return (linear_rgb[0], linear_rgb[1], linear_rgb[2], alpha)

# ----------------- 阶段一：地台生成 -----------------
def create_floating_island():
    mesh = bpy.data.meshes.new("Terrain_Base_Mesh")
    bm = bmesh.new()
    
    random.seed(42)
    radius = 5.0
    segments = 36
    rings = 8
    
    # 构建顶部草坪网格
    vert_rings = []
    for r_idx in range(rings + 1):
        r_frac = r_idx / rings
        cur_r = radius * r_frac
        ring_verts = []
        for s_idx in range(segments):
            angle = (s_idx / segments) * 2 * math.pi
            x = math.cos(angle) * cur_r
            y = math.sin(angle) * cur_r
            
            # 顶部微起伏缓坡
            wobble = noise.noise(Vector((x * 0.4, y * 0.4, 0.7))) * 0.28
            z_top = 0.2 * (1.0 - (r_frac ** 2)) + wobble
            
            # 边缘自然波动
            if r_idx == rings:
                w_edge = 1.0 + (noise.noise(Vector((x * 0.9, y * 0.9, 1.5))) - 0.5) * 0.08
                x *= w_edge
                y *= w_edge
                
            v = bm.verts.new((x, y, z_top))
            ring_verts.append(v)
        vert_rings.append(ring_verts)
        
    # 面槽 0: 草地
    for r_idx in range(rings):
        for s_idx in range(segments):
            next_s = (s_idx + 1) % segments
            v1 = vert_rings[r_idx][s_idx]
            v2 = vert_rings[r_idx][next_s]
            v3 = vert_rings[r_idx + 1][next_s]
            v4 = vert_rings[r_idx + 1][s_idx]
            if r_idx == 0:
                f = bm.faces.new((v1, v3, v4))
            else:
                f = bm.faces.new((v1, v2, v3, v4))
            f.material_index = 0
            
    # 面槽 1: 泥土环带 (垂落 0.5m)
    dirt_ring = []
    top_rim = vert_rings[-1]
    for s_idx in range(segments):
        top_v = top_rim[s_idx]
        dirt_z = top_v.co.z - 0.5
        d_noise = noise.noise(Vector((top_v.co.x * 0.7, top_v.co.y * 0.7, 2.2))) * 0.12
        v = bm.verts.new((top_v.co.x * (1.02 + d_noise), top_v.co.y * (1.02 + d_noise), dirt_z))
        dirt_ring.append(v)
        
    for s_idx in range(segments):
        next_s = (s_idx + 1) % segments
        f = bm.faces.new((top_rim[s_idx], top_rim[next_s], dirt_ring[next_s], dirt_ring[s_idx]))
        f.material_index = 1
        
    # 面槽 2: 岩石倒锥 (向下延伸 3.2m，分成 4 个刻面环)
    rock_layers = 4
    prev_ring = dirt_ring
    rock_depths = [-1.3, -2.1, -2.8, -3.3]
    rock_radii = [0.75, 0.48, 0.25, 0.08]
    
    for l_idx in range(rock_layers):
        curr_ring = []
        target_z = rock_depths[l_idx]
        r_scale = rock_radii[l_idx]
        for s_idx in range(segments):
            angle = (s_idx / segments) * 2 * math.pi
            wobble = noise.noise(Vector((math.cos(angle) * 1.6, math.sin(angle) * 1.6, l_idx * 1.5))) * 0.32
            rx = math.cos(angle) * radius * (r_scale + wobble) + 0.12 * l_idx
            ry = math.sin(angle) * radius * (r_scale + wobble) - 0.08 * l_idx
            rz = target_z + noise.noise(Vector((rx * 0.5, ry * 0.5, 4.0))) * 0.25
            v = bm.verts.new((rx, ry, rz))
            curr_ring.append(v)
            
        for s_idx in range(segments):
            next_s = (s_idx + 1) % segments
            f = bm.faces.new((prev_ring[s_idx], prev_ring[next_s], curr_ring[next_s], curr_ring[s_idx]))
            f.material_index = 2
        prev_ring = curr_ring
        
    # 封底锥尖
    tip_vert = bm.verts.new((0.25, -0.15, -3.5))
    for s_idx in range(segments):
        next_s = (s_idx + 1) % segments
        f = bm.faces.new((prev_ring[s_idx], prev_ring[next_s], tip_vert))
        f.material_index = 2
        
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    
    island_obj = bpy.data.objects.new("Terrain_Island_Base", mesh)
    bpy.context.scene.collection.objects.link(island_obj)
    link_to_collection(island_obj, "Terrain")
    
    # 赋予材质槽
    mat_grass = get_or_create_material("Mat_Grass", base_color=hex_to_rgba("#3F7D4E"), roughness=0.9)
    mat_dirt = get_or_create_material("Mat_Dirt", base_color=hex_to_rgba("#5A3E2B"), roughness=1.0)
    mat_rock = get_or_create_material("Mat_Rock", base_color=hex_to_rgba("#6B6F7A"), roughness=0.85)
    
    island_obj.data.materials.append(mat_grass)
    island_obj.data.materials.append(mat_dirt)
    island_obj.data.materials.append(mat_rock)
    
    apply_smooth_and_bevel(island_obj, bevel_width=0.04, segments=2, angle_deg=35)
    return island_obj

def create_grass_overhangs():
    random.seed(101)
    mat_grass = bpy.data.materials.get("Mat_Grass")
    for i in range(8):
        angle = (i / 8) * 2 * math.pi + random.uniform(-0.15, 0.15)
        r = 5.0 + random.uniform(0.02, 0.15)
        x = math.cos(angle) * r
        y = math.sin(angle) * r
        z = -0.05 + random.uniform(-0.08, 0.05)
        
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.25, depth=0.18, location=(x, y, z))
        lump = bpy.context.active_object
        lump.name = f"Grass_Overhang_{i+1:02d}"
        lump.scale = (random.uniform(0.9, 1.4), random.uniform(0.8, 1.2), random.uniform(0.7, 1.1))
        lump.rotation_euler = (random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), angle)
        lump.data.materials.append(mat_grass)
        apply_smooth_and_bevel(lump, bevel_width=0.03, segments=2)
        link_to_collection(lump, "Terrain")

def create_floating_rocks():
    random.seed(202)
    mat_rock = bpy.data.materials.get("Mat_Rock")
    rock_configs = [
        {"loc": (-1.1, 1.4, -4.0), "scale": (0.45, 0.38, 0.52), "rot": (0.3, 0.5, 1.1)},
        {"loc": (1.3, -0.9, -4.4), "scale": (0.35, 0.42, 0.38), "rot": (-0.4, 0.2, 2.3)},
        {"loc": (0.2, 1.8, -4.7), "scale": (0.28, 0.31, 0.35), "rot": (0.6, -0.3, 0.7)},
    ]
    for idx, cfg in enumerate(rock_configs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.55, location=cfg["loc"])
        rock = bpy.context.active_object
        rock.name = f"Floating_Rock_{idx+1:02d}"
        rock.scale = cfg["scale"]
        rock.rotation_euler = cfg["rot"]
        rock.data.materials.append(mat_rock)
        apply_smooth_and_bevel(rock, bevel_width=0.04, segments=2, angle_deg=35)
        link_to_collection(rock, "Terrain")

# ----------------- 阶段二：小木屋生成 -----------------
def create_cabin():
    # 木屋定位参数：位于地台中后偏右位置 (X=0.7m, Y=0.8m)
    # 旋转约 15 度，使正面朝向镜头前侧偏左 (面向小路)
    cabin_pos = Vector((0.7, 0.8, 0.18))
    cabin_rot_z = math.radians(-18)
    
    # 准备材质
    mat_wood = get_or_create_material("Mat_WoodWall", base_color=hex_to_rgba("#8B5A33"), roughness=0.8)
    mat_trim = get_or_create_material("Mat_WoodTrim", base_color=hex_to_rgba("#5C381E"), roughness=0.85)
    mat_roof = get_or_create_material("Mat_Roof", base_color=hex_to_rgba("#7A2E2E"), roughness=0.7)
    mat_moss = get_or_create_material("Mat_RoofMoss", base_color=hex_to_rgba("#385E42"), roughness=0.85)
    mat_door = get_or_create_material("Mat_Door", base_color=hex_to_rgba("#684025"), roughness=0.8)
    mat_step = get_or_create_material("Mat_StepStone", base_color=hex_to_rgba("#787C85"), roughness=0.9)
    mat_window = get_or_create_material("Mat_WindowEmission", 
                                        base_color=hex_to_rgba("#FFB347"), 
                                        emission_color=hex_to_rgba("#FFB347"), 
                                        emission_strength=10.0)
    mat_chimney = get_or_create_material("Mat_ChimneyStone", base_color=hex_to_rgba("#5F6166"), roughness=0.9)
    mat_smoke = get_or_create_material("Mat_Smoke", base_color=hex_to_rgba("#E8EDF2"), roughness=0.6, alpha=0.4)
    mat_lantern = get_or_create_material("Mat_LanternEmission", 
                                         base_color=hex_to_rgba("#FFC070"), 
                                         emission_color=hex_to_rgba("#FFC070"), 
                                         emission_strength=12.0)
    
    # 1. 木屋主体墙面 (2.4m 宽 x 1.9m 深 x 1.7m 高)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.85))
    cabin_body = bpy.context.active_object
    cabin_body.name = "House_Body"
    cabin_body.scale = (2.4, 1.9, 1.7)
    cabin_body.data.materials.append(mat_wood)
    apply_smooth_and_bevel(cabin_body, bevel_width=0.03, segments=2)
    
    # 2. 四角实木立柱与基底支撑梁 (增添建筑精致细节)
    posts = []
    offsets = [(-1.2, -0.95), (1.2, -0.95), (-1.2, 0.95), (1.2, 0.95)]
    for idx, (px, py) in enumerate(offsets):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, 0.85))
        p = bpy.context.active_object
        p.name = f"House_Post_{idx+1:02d}"
        p.scale = (0.16, 0.16, 1.76)
        p.data.materials.append(mat_trim)
        apply_smooth_and_bevel(p, bevel_width=0.02, segments=2)
        posts.append(p)
        
    # 3. 双坡屋顶 (人字形结构)
    # 用 BMesh 构建精确的双坡斜屋顶，两侧悬挑 (Overhang 0.25m)
    roof_mesh = bpy.data.meshes.new("House_Roof_Mesh")
    bm = bmesh.new()
    
    # 屋顶尺寸：宽 (左右跨度) 2.9m，深 (前后山墙) 2.4m，脊高 1.1m
    rx = 1.45  # 半宽
    ry = 1.20  # 半深
    wall_top = 1.7
    ridge_h = 2.75 # 脊高
    thickness = 0.14
    
    # 左坡下边缘、脊顶、右坡下边缘
    # 构建外表面与内表面
    v_left_front = bm.verts.new((-rx, -ry, wall_top - 0.05))
    v_left_back  = bm.verts.new((-rx,  ry, wall_top - 0.05))
    v_ridge_front = bm.verts.new((0.0, -ry, ridge_h))
    v_ridge_back  = bm.verts.new((0.0,  ry, ridge_h))
    v_right_front = bm.verts.new(( rx, -ry, wall_top - 0.05))
    v_right_back  = bm.verts.new(( rx,  ry, wall_top - 0.05))
    
    # 顶面厚度顶点 (沿法线稍外凸)
    v_lf_t = bm.verts.new((-rx - 0.04, -ry - 0.05, wall_top + thickness - 0.05))
    v_lb_t = bm.verts.new((-rx - 0.04,  ry + 0.05, wall_top + thickness - 0.05))
    v_rf_t = bm.verts.new((0.0, -ry - 0.05, ridge_h + thickness))
    v_rb_t = bm.verts.new((0.0,  ry + 0.05, ridge_h + thickness))
    v_rtf_t = bm.verts.new(( rx + 0.04, -ry - 0.05, wall_top + thickness - 0.05))
    v_rtb_t = bm.verts.new(( rx + 0.04,  ry + 0.05, wall_top + thickness - 0.05))
    
    # 左坡面
    bm.faces.new((v_lf_t, v_rf_t, v_rb_t, v_lb_t))
    # 右坡面
    bm.faces.new((v_rf_t, v_rtf_t, v_rtb_t, v_rb_t))
    # 前后封檐山墙三角面
    bm.faces.new((v_lf_t, v_rtf_t, v_rf_t))
    bm.faces.new((v_lb_t, v_rb_t, v_rtb_t))
    # 底面封口
    bm.faces.new((v_left_front, v_left_back, v_right_back, v_right_front))
    
    bm.normal_update()
    bm.to_mesh(roof_mesh)
    bm.free()
    
    roof_obj = bpy.data.objects.new("House_Roof", roof_mesh)
    bpy.context.scene.collection.objects.link(roof_obj)
    roof_obj.data.materials.append(mat_roof)
    apply_smooth_and_bevel(roof_obj, bevel_width=0.03, segments=2)
    
    # 4. 屋顶薄苔藓/积雪层 (贴合在屋顶上)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, ridge_h + thickness * 0.5 + 0.02))
    roof_moss = bpy.context.active_object
    roof_moss.name = "House_Roof_Moss"
    roof_moss.scale = (2.2, 2.1, 0.05)
    roof_moss.rotation_euler = (0, 0, 0)
    roof_moss.data.materials.append(mat_moss)
    apply_smooth_and_bevel(roof_moss, bevel_width=0.02, segments=2)
    
    # 5. 木门与两级台阶 (位于正面 Y = -0.95m 处)
    # 木门框
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -0.96, 0.65))
    door_frame = bpy.context.active_object
    door_frame.name = "House_Door_Frame"
    door_frame.scale = (0.75, 0.12, 1.35)
    door_frame.data.materials.append(mat_trim)
    apply_smooth_and_bevel(door_frame, bevel_width=0.02, segments=2)
    
    # 木门板
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -0.97, 0.63))
    door_leaf = bpy.context.active_object
    door_leaf.name = "House_Door_Leaf"
    door_leaf.scale = (0.62, 0.06, 1.25)
    door_leaf.data.materials.append(mat_door)
    apply_smooth_and_bevel(door_leaf, bevel_width=0.015, segments=2)
    
    # 铜制小门把手
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(-0.12, -1.02, 0.65))
    door_knob = bpy.context.active_object
    door_knob.name = "House_Door_Knob"
    door_knob.data.materials.append(mat_trim)
    
    # 两级前门台阶
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -1.12, 0.18))
    step1 = bpy.context.active_object
    step1.name = "House_Step_01"
    step1.scale = (0.95, 0.35, 0.16)
    step1.data.materials.append(mat_step)
    apply_smooth_and_bevel(step1, bevel_width=0.03, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -1.35, 0.08))
    step2 = bpy.context.active_object
    step2.name = "House_Step_02"
    step2.scale = (1.1, 0.35, 0.14)
    step2.data.materials.append(mat_step)
    apply_smooth_and_bevel(step2, bevel_width=0.03, segments=2)
    
    # 6. 两扇发光暖色窗户
    # 窗户 1：正面门右侧 (Front Window)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.55, -0.96, 0.95))
    win1_frame = bpy.context.active_object
    win1_frame.name = "House_Window_Front_Frame"
    win1_frame.scale = (0.65, 0.12, 0.75)
    win1_frame.data.materials.append(mat_trim)
    apply_smooth_and_bevel(win1_frame, bevel_width=0.02, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.55, -0.97, 0.95))
    win1_glass = bpy.context.active_object
    win1_glass.name = "House_Window_Front_Glass"
    win1_glass.scale = (0.52, 0.04, 0.62)
    win1_glass.data.materials.append(mat_window)
    
    # 十字木窗格
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.55, -0.98, 0.95))
    win1_grid = bpy.context.active_object
    win1_grid.name = "House_Window_Front_Grid"
    win1_grid.scale = (0.52, 0.02, 0.05)
    win1_grid.data.materials.append(mat_trim)
    
    # 窗户 2：侧面左墙 (Side Window)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.21, 0.1, 0.95))
    win2_frame = bpy.context.active_object
    win2_frame.name = "House_Window_Side_Frame"
    win2_frame.scale = (0.12, 0.65, 0.75)
    win2_frame.data.materials.append(mat_trim)
    apply_smooth_and_bevel(win2_frame, bevel_width=0.02, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.22, 0.1, 0.95))
    win2_glass = bpy.context.active_object
    win2_glass.name = "House_Window_Side_Glass"
    win2_glass.scale = (0.04, 0.52, 0.62)
    win2_glass.data.materials.append(mat_window)
    
    # 7. 石头烟囱与袅袅轻烟
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.85, 0.55, 2.35))
    chimney = bpy.context.active_object
    chimney.name = "House_Chimney"
    chimney.scale = (0.45, 0.45, 1.4)
    chimney.data.materials.append(mat_chimney)
    apply_smooth_and_bevel(chimney, bevel_width=0.03, segments=2)
    
    # 烟囱顶盖石板
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.85, 0.55, 3.1))
    chimney_cap = bpy.context.active_object
    chimney_cap.name = "House_Chimney_Cap"
    chimney_cap.scale = (0.58, 0.58, 0.1)
    chimney_cap.data.materials.append(mat_chimney)
    apply_smooth_and_bevel(chimney_cap, bevel_width=0.02, segments=2)
    
    # 袅袅飘起的半透明烟雾 (3 颗渐变微球)
    smoke_parts = []
    smoke_cfgs = [
        {"loc": (0.85, 0.55, 3.35), "radius": 0.14},
        {"loc": (0.92, 0.62, 3.65), "radius": 0.22},
        {"loc": (1.05, 0.75, 4.05), "radius": 0.32},
        {"loc": (1.20, 0.90, 4.55), "radius": 0.44},
    ]
    for idx, sc in enumerate(smoke_cfgs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=sc["radius"], location=sc["loc"])
        sm = bpy.context.active_object
        sm.name = f"House_Smoke_{idx+1:02d}"
        sm.data.materials.append(mat_smoke)
        apply_smooth_and_bevel(sm, bevel_width=0.02, segments=2)
        smoke_parts.append(sm)
        
    # 8. 门侧挂灯 (铁艺支架 + 发光提灯)
    # 支架
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.02, depth=0.25, location=(0.15, -1.05, 1.15))
    bracket = bpy.context.active_object
    bracket.name = "House_Lantern_Bracket"
    bracket.rotation_euler = (math.radians(90), 0, 0)
    bracket.data.materials.append(mat_trim)
    
    # 提灯主体
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.07, depth=0.18, location=(0.15, -1.15, 1.05))
    lantern = bpy.context.active_object
    lantern.name = "House_Lantern"
    lantern.data.materials.append(mat_lantern)
    apply_smooth_and_bevel(lantern, bevel_width=0.015, segments=2)
    
    # 提灯顶盖
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.10, depth=0.08, location=(0.15, -1.15, 1.16))
    l_cap = bpy.context.active_object
    l_cap.name = "House_Lantern_Cap"
    l_cap.data.materials.append(mat_trim)
    
    # 将小木屋所有组件组合到父级空物体并进行位姿变换
    house_parts = [
        cabin_body, roof_obj, roof_moss, 
        door_frame, door_leaf, door_knob, step1, step2,
        win1_frame, win1_glass, win1_grid, win2_frame, win2_glass,
        chimney, chimney_cap, bracket, lantern, l_cap
    ] + posts + smoke_parts
    
    # 创建父物体
    house_root = bpy.data.objects.new("House_Root", None)
    house_root.location = cabin_pos
    house_root.rotation_euler = (0, 0, cabin_rot_z)
    bpy.context.scene.collection.objects.link(house_root)
    link_to_collection(house_root, "House")
    
    for part in house_parts:
        part.parent = house_root
        link_to_collection(part, "House")
        
    return house_root

def main():
    print(">>> [Stage 1 & 2] 开始初始化场景...")
    reset_scene()
    colls = setup_collections()
    
    print(">>> [Stage 1] 生成微缩悬浮地台...")
    create_floating_island()
    create_grass_overhangs()
    create_floating_rocks()
    
    print(">>> [Stage 2] 生成精致童话小木屋...")
    cabin = create_cabin()
    
    print(">>> [Stage 1 & 2] 阶段一与阶段二构建成功！")

main()
