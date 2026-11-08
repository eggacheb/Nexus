"""
夜晚森林小木屋微缩场景 (Night Cabin Forest Diorama)
- 全自动 Blender Python (bpy) 程序化生成与高品质渲染终极脚本
- 支持 Blender 3.6 / 4.x (EEVEE)
- 包含全部规范：
  1. 悬浮微缩圆形地台 (草地、泥土截面、岩石倒锥、漂浮碎石)
  2. 精致童话小木屋 (双坡斜屋顶、贴合苔藓、木门台阶、中空中空十字窗、暖黄自发光、烟囱轻烟、提灯)
  3. 11 棵分层低多边形松树 (深绿至蓝绿渐变，木屋后方环抱)
  4. 细节道具 (石板引路、乡村栅栏、大石、童话蘑菇、36颗散落发光萤火虫)
  5. 皎洁大月亮 (左上方黄金分割点，完整圆轮，柔和月晕) 与夜空星辰
  6. 冷蓝月光 vs 暖黄窗光冷暖对比，补光提亮暗部层次，体积雾光柱空气感
  7. 52mm 电影级相机，轻微俯视，右三分线木屋构图，景深 f/2.8
  8. EEVEE 128采样，合成器 Glare + Vignette + ColorBalance，输出 2560x1440 PNG 并保存 .blend
"""

import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, Euler, noise

# ==============================================================================
# 0. 辅助工具与场景清理
# ==============================================================================

def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    for l in list(bpy.data.lights):
        if l.users == 0:
            bpy.data.lights.remove(l)
    for cam in list(bpy.data.cameras):
        if cam.users == 0:
            bpy.data.cameras.remove(cam)

def setup_collections():
    coll_names = ["Terrain", "House", "Trees", "Props", "Lights", "FX", "Camera"]
    scene_coll = bpy.context.scene.collection
    colls = {}
    for name in coll_names:
        c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
        if c.name not in scene_coll.children:
            scene_coll.children.link(c)
        colls[name] = c
    return colls

def link_to_collection(obj, coll_name):
    target = bpy.data.collections.get(coll_name)
    if not target:
        return
    for c in list(obj.users_collection):
        if c != target:
            c.objects.unlink(obj)
    if obj.name not in target.objects:
        target.objects.link(obj)

def hex_to_rgba(hex_str, alpha=1.0):
    hex_str = hex_str.lstrip('#')
    lv = len(hex_str)
    rgb = [int(hex_str[i:i + lv // 3], 16) / 255.0 for i in range(0, lv, lv // 3)]
    linear_rgb = [math.pow(c, 2.2) for c in rgb]
    return (linear_rgb[0], linear_rgb[1], linear_rgb[2], alpha)

def apply_smooth_and_bevel(obj, bevel_width=0.03, segments=2, angle_deg=35):
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

def get_terrain_height(x, y):
    r = math.sqrt(x * x + y * y)
    r_frac = min(r / 5.0, 1.0)
    wobble = noise.noise(Vector((x * 0.4, y * 0.4, 0.7))) * 0.28
    return 0.2 * (1.0 - (r_frac ** 2)) + wobble

# ==============================================================================
# 1. 材质着色系统 (纯 Principled BSDF，无外部贴图)
# ==============================================================================

def create_procedural_materials():
    materials = {}
    
    def make_mat(name, base_color, roughness, emission_col=(0,0,0,1), emission_str=0.0, alpha=1.0):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        node_out = nodes.new(type='ShaderNodeOutputMaterial')
        node_bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
        node_bsdf.inputs['Base Color'].default_value = base_color
        node_bsdf.inputs['Roughness'].default_value = roughness
        
        if 'Emission Strength' in node_bsdf.inputs:
            node_bsdf.inputs['Emission'].default_value = emission_col
            node_bsdf.inputs['Emission Strength'].default_value = emission_str
        elif 'Emission Color' in node_bsdf.inputs:
            node_bsdf.inputs['Emission Color'].default_value = emission_col
            node_bsdf.inputs['Emission Strength'].default_value = emission_str
            
        if 'Alpha' in node_bsdf.inputs:
            node_bsdf.inputs['Alpha'].default_value = alpha
            if alpha < 0.99:
                mat.blend_method = 'BLEND'
                mat.shadow_method = 'NONE'
                
        mat.node_tree.links.new(node_bsdf.outputs['BSDF'], node_out.inputs['Surface'])
        materials[name] = mat
        return mat

    # 规范色板
    make_mat("Mat_Grass", hex_to_rgba("#3F7D4E"), 0.9)
    make_mat("Mat_Dirt", hex_to_rgba("#5A3E2B"), 1.0)
    make_mat("Mat_Rock", hex_to_rgba("#6B6F7A"), 0.85)
    
    # 程序化木墙材质 (Noise Texture + Color Ramp)
    mat_wood = bpy.data.materials.get("Mat_WoodWall") or bpy.data.materials.new(name="Mat_WoodWall")
    mat_wood.use_nodes = True
    wnodes = mat_wood.node_tree.nodes
    wnodes.clear()
    w_out = wnodes.new(type='ShaderNodeOutputMaterial')
    w_bsdf = wnodes.new(type='ShaderNodeBsdfPrincipled')
    w_bsdf.inputs['Roughness'].default_value = 0.8
    w_coord = wnodes.new(type='ShaderNodeTexCoord')
    w_map = wnodes.new(type='ShaderNodeMapping')
    w_map.inputs['Scale'].default_value = (1.0, 1.0, 7.0)
    w_noise = wnodes.new(type='ShaderNodeTexNoise')
    w_noise.inputs['Scale'].default_value = 14.0
    w_noise.inputs['Detail'].default_value = 2.0
    w_ramp = wnodes.new(type='ShaderNodeValToRGB')
    w_ramp.color_ramp.elements[0].position = 0.3
    w_ramp.color_ramp.elements[0].color = hex_to_rgba("#7A4B27")
    w_ramp.color_ramp.elements[1].position = 0.7
    w_ramp.color_ramp.elements[1].color = hex_to_rgba("#9C683E")
    mat_wood.node_tree.links.new(w_coord.outputs['Object'], w_map.inputs['Vector'])
    mat_wood.node_tree.links.new(w_map.outputs['Vector'], w_noise.inputs['Vector'])
    mat_wood.node_tree.links.new(w_noise.outputs['Fac'], w_ramp.inputs['Fac'])
    mat_wood.node_tree.links.new(w_ramp.outputs['Color'], w_bsdf.inputs['Base Color'])
    mat_wood.node_tree.links.new(w_bsdf.outputs['BSDF'], w_out.inputs['Surface'])
    materials["Mat_WoodWall"] = mat_wood
    
    make_mat("Mat_WoodTrim", hex_to_rgba("#5C381E"), 0.85)
    make_mat("Mat_Roof", hex_to_rgba("#7A2E2E"), 0.7)
    make_mat("Mat_RoofMoss", hex_to_rgba("#385E42"), 0.85)
    make_mat("Mat_Door", hex_to_rgba("#684025"), 0.8)
    make_mat("Mat_StepStone", hex_to_rgba("#787C85"), 0.9)
    make_mat("Mat_Trunk", hex_to_rgba("#4A2E1B"), 0.95)
    
    # 松树渐变组
    make_mat("Mat_Pine_Deep", hex_to_rgba("#1F5A4A"), 0.9)
    make_mat("Mat_Pine_Mid", hex_to_rgba("#256B52"), 0.9)
    make_mat("Mat_Pine_Bright", hex_to_rgba("#2E7D5B"), 0.9)
    
    # 发光暖光材质
    make_mat("Mat_WindowEmission", hex_to_rgba("#FFB347"), 0.2, emission_col=hex_to_rgba("#FFB347"), emission_str=9.5)
    make_mat("Mat_LanternEmission", hex_to_rgba("#FFC070"), 0.2, emission_col=hex_to_rgba("#FFC070"), emission_str=11.0)
    make_mat("Mat_Firefly", hex_to_rgba("#D4FF66"), 0.2, emission_col=hex_to_rgba("#D4FF66"), emission_str=7.5)
    
    make_mat("Mat_ChimneyStone", hex_to_rgba("#5F6166"), 0.9)
    make_mat("Mat_Smoke", hex_to_rgba("#E8EDF2"), 0.6, alpha=0.45)
    make_mat("Mat_MushroomStem", hex_to_rgba("#E8E0D5"), 0.85)
    make_mat("Mat_MushroomRed", hex_to_rgba("#D94A38"), 0.7)
    make_mat("Mat_MushroomYel", hex_to_rgba("#EAA83B"), 0.7)
    
    # 皎洁柔和大月亮 (微带浅冷蓝，优雅不刺眼)
    make_mat("Mat_Moon", hex_to_rgba("#DCE8FC"), 0.1, emission_col=hex_to_rgba("#DCE8FC"), emission_str=1.8)
    make_mat("Mat_Star", hex_to_rgba("#FFFFFF"), 0.1, emission_col=hex_to_rgba("#FFFFFF"), emission_str=7.5)
    
    return materials

# ==============================================================================
# 2. 悬浮圆形地台系统
# ==============================================================================

def create_floating_island():
    mesh = bpy.data.meshes.new("Terrain_Base_Mesh")
    bm = bmesh.new()
    
    random.seed(42)
    radius = 5.0
    segments = 40
    rings = 8
    
    vert_rings = []
    for r_idx in range(rings + 1):
        r_frac = r_idx / rings
        cur_r = radius * r_frac
        ring_verts = []
        for s_idx in range(segments):
            angle = (s_idx / segments) * 2 * math.pi
            x = math.cos(angle) * cur_r
            y = math.sin(angle) * cur_r
            z_top = get_terrain_height(x, y)
            if r_idx == rings:
                w_edge = 1.0 + (noise.noise(Vector((x * 0.9, y * 0.9, 1.5))) - 0.5) * 0.08
                x *= w_edge
                y *= w_edge
            v = bm.verts.new((x, y, z_top))
            ring_verts.append(v)
        vert_rings.append(ring_verts)
        
    for r_idx in range(rings):
        for s_idx in range(segments):
            next_s = (s_idx + 1) % segments
            v1 = vert_rings[r_idx][s_idx]
            v2 = vert_rings[r_idx][next_s]
            v3 = vert_rings[r_idx + 1][next_s]
            v4 = vert_rings[r_idx + 1][s_idx]
            f = bm.faces.new((v1, v3, v4) if r_idx == 0 else (v1, v2, v3, v4))
            f.material_index = 0
            
    dirt_ring = []
    top_rim = vert_rings[-1]
    for s_idx in range(segments):
        top_v = top_rim[s_idx]
        dirt_z = top_v.co.z - 0.55
        d_noise = noise.noise(Vector((top_v.co.x * 0.7, top_v.co.y * 0.7, 2.2))) * 0.12
        v = bm.verts.new((top_v.co.x * (1.02 + d_noise), top_v.co.y * (1.02 + d_noise), dirt_z))
        dirt_ring.append(v)
        
    for s_idx in range(segments):
        next_s = (s_idx + 1) % segments
        f = bm.faces.new((top_rim[s_idx], top_rim[next_s], dirt_ring[next_s], dirt_ring[s_idx]))
        f.material_index = 1
        
    rock_layers = 5
    prev_ring = dirt_ring
    rock_depths = [-1.2, -1.9, -2.6, -3.2, -3.7]
    rock_radii = [0.78, 0.54, 0.32, 0.15, 0.05]
    
    for l_idx in range(rock_layers):
        curr_ring = []
        target_z = rock_depths[l_idx]
        r_scale = rock_radii[l_idx]
        for s_idx in range(segments):
            angle = (s_idx / segments) * 2 * math.pi
            wobble = noise.noise(Vector((math.cos(angle) * 1.8, math.sin(angle) * 1.8, l_idx * 1.6))) * 0.35
            rx = math.cos(angle) * radius * (r_scale + wobble) + 0.15 * l_idx
            ry = math.sin(angle) * radius * (r_scale + wobble) - 0.10 * l_idx
            rz = target_z + noise.noise(Vector((rx * 0.5, ry * 0.5, 4.0))) * 0.28
            v = bm.verts.new((rx, ry, rz))
            curr_ring.append(v)
            
        for s_idx in range(segments):
            next_s = (s_idx + 1) % segments
            f = bm.faces.new((prev_ring[s_idx], prev_ring[next_s], curr_ring[next_s], curr_ring[s_idx]))
            f.material_index = 2
        prev_ring = curr_ring
        
    tip_vert = bm.verts.new((0.3, -0.2, -3.9))
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
    
    island_obj.data.materials.append(bpy.data.materials["Mat_Grass"])
    island_obj.data.materials.append(bpy.data.materials["Mat_Dirt"])
    island_obj.data.materials.append(bpy.data.materials["Mat_Rock"])
    
    apply_smooth_and_bevel(island_obj, bevel_width=0.04, segments=2, angle_deg=35)
    
    # 边缘外溢草块
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
        lump.data.materials.append(bpy.data.materials["Mat_Grass"])
        apply_smooth_and_bevel(lump, bevel_width=0.03, segments=2)
        link_to_collection(lump, "Terrain")
        
    # 悬浮碎石
    rock_configs = [
        {"loc": (-1.2, 1.5, -4.2), "scale": (0.48, 0.40, 0.55), "rot": (0.3, 0.5, 1.1)},
        {"loc": (1.4, -1.0, -4.6), "scale": (0.38, 0.45, 0.40), "rot": (-0.4, 0.2, 2.3)},
        {"loc": (0.3, 1.9, -4.9), "scale": (0.30, 0.34, 0.38), "rot": (0.6, -0.3, 0.7)},
    ]
    for idx, cfg in enumerate(rock_configs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.6, location=cfg["loc"])
        f_rock = bpy.context.active_object
        f_rock.name = f"Floating_Rock_{idx+1:02d}"
        f_rock.scale = cfg["scale"]
        f_rock.rotation_euler = cfg["rot"]
        f_rock.data.materials.append(bpy.data.materials["Mat_Rock"])
        apply_smooth_and_bevel(f_rock, bevel_width=0.04, segments=2, angle_deg=35)
        link_to_collection(f_rock, "Terrain")
        
    return island_obj

# ==============================================================================
# 3. 童话小木屋系统
# ==============================================================================

def create_hollow_window(name_prefix, parent_obj, loc_local, rot_local, width=0.65, height=0.75):
    mat_trim = bpy.data.materials["Mat_WoodTrim"]
    mat_window = bpy.data.materials["Mat_WindowEmission"]
    
    w_root = bpy.data.objects.new(f"{name_prefix}_Root", None)
    w_root.location = loc_local
    w_root.rotation_euler = rot_local
    w_root.parent = parent_obj
    bpy.context.scene.collection.objects.link(w_root)
    link_to_collection(w_root, "House")
    
    # 发光玻璃
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    glass = bpy.context.active_object
    glass.name = f"{name_prefix}_Glass"
    glass.scale = (width * 0.94, 0.02, height * 0.94)
    glass.parent = w_root
    glass.data.materials.append(mat_window)
    link_to_collection(glass, "House")
    
    # 四边木框
    frame_t = 0.05
    frame_d = 0.07
    # 上
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.015, height * 0.5))
    top = bpy.context.active_object
    top.name = f"{name_prefix}_Top"
    top.scale = (width + frame_t, frame_d, frame_t)
    top.parent = w_root
    top.data.materials.append(mat_trim)
    link_to_collection(top, "House")
    # 下
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.015, -height * 0.5))
    bot = bpy.context.active_object
    bot.name = f"{name_prefix}_Bot"
    bot.scale = (width + frame_t, frame_d, frame_t)
    bot.parent = w_root
    bot.data.materials.append(mat_trim)
    link_to_collection(bot, "House")
    # 左
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-width * 0.5, -0.015, 0))
    left = bpy.context.active_object
    left.name = f"{name_prefix}_Left"
    left.scale = (frame_t, frame_d, height)
    left.parent = w_root
    left.data.materials.append(mat_trim)
    link_to_collection(left, "House")
    # 右
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(width * 0.5, -0.015, 0))
    right = bpy.context.active_object
    right.name = f"{name_prefix}_Right"
    right.scale = (frame_t, frame_d, height)
    right.parent = w_root
    right.data.materials.append(mat_trim)
    link_to_collection(right, "House")
    
    # 十字格窗棂
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, 0))
    grid_h = bpy.context.active_object
    grid_h.name = f"{name_prefix}_GridH"
    grid_h.scale = (width * 0.9, 0.02, 0.03)
    grid_h.parent = w_root
    grid_h.data.materials.append(mat_trim)
    link_to_collection(grid_h, "House")
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, 0))
    grid_v = bpy.context.active_object
    grid_v.name = f"{name_prefix}_GridV"
    grid_v.scale = (0.03, 0.02, height * 0.9)
    grid_v.parent = w_root
    grid_v.data.materials.append(mat_trim)
    link_to_collection(grid_v, "House")
    
    return w_root

def create_cabin():
    cabin_pos = Vector((0.75, 0.85, 0.18))
    cabin_rot_z = math.radians(-18)
    
    # 主体
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.85))
    cabin_body = bpy.context.active_object
    cabin_body.name = "House_Body"
    cabin_body.scale = (2.4, 1.9, 1.7)
    cabin_body.data.materials.append(bpy.data.materials["Mat_WoodWall"])
    apply_smooth_and_bevel(cabin_body, bevel_width=0.03, segments=2)
    
    # 墙面实木横条
    wall_planks = []
    for h_step in range(4):
        h_z = 0.35 + h_step * 0.40
        if 0.55 < h_z < 1.35:
            px = -0.85
            sx = 0.70
        else:
            px = 0.0
            sx = 2.42
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, -0.96, h_z))
        pl = bpy.context.active_object
        pl.name = f"House_Plank_F_{h_step+1}"
        pl.scale = (sx, 0.04, 0.12)
        pl.data.materials.append(bpy.data.materials["Mat_WoodWall"])
        apply_smooth_and_bevel(pl, bevel_width=0.015, segments=2)
        wall_planks.append(pl)
    
    posts = []
    offsets = [(-1.2, -0.95), (1.2, -0.95), (-1.2, 0.95), (1.2, 0.95)]
    for idx, (px, py) in enumerate(offsets):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, 0.85))
        p = bpy.context.active_object
        p.name = f"House_Post_{idx+1:02d}"
        p.scale = (0.16, 0.16, 1.76)
        p.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
        apply_smooth_and_bevel(p, bevel_width=0.02, segments=2)
        posts.append(p)
        
    roof_parts = []
    roof_slope = math.radians(37)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.75, 0, 2.22))
    roof_left = bpy.context.active_object
    roof_left.name = "House_Roof_Left"
    roof_left.scale = (1.75, 2.45, 0.14)
    roof_left.rotation_euler = (0, -roof_slope, 0)
    roof_left.data.materials.append(bpy.data.materials["Mat_Roof"])
    apply_smooth_and_bevel(roof_left, bevel_width=0.03, segments=2)
    roof_parts.append(roof_left)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.75, 0, 2.22))
    roof_right = bpy.context.active_object
    roof_right.name = "House_Roof_Right"
    roof_right.scale = (1.75, 2.45, 0.14)
    roof_right.rotation_euler = (0, roof_slope, 0)
    roof_right.data.materials.append(bpy.data.materials["Mat_Roof"])
    apply_smooth_and_bevel(roof_right, bevel_width=0.03, segments=2)
    roof_parts.append(roof_right)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 2.76))
    roof_ridge = bpy.context.active_object
    roof_ridge.name = "House_Roof_Ridge"
    roof_ridge.scale = (0.24, 2.48, 0.20)
    roof_ridge.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
    apply_smooth_and_bevel(roof_ridge, bevel_width=0.02, segments=2)
    roof_parts.append(roof_ridge)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.75, 0, 2.30))
    moss_left = bpy.context.active_object
    moss_left.name = "House_Roof_Moss_L"
    moss_left.scale = (1.45, 2.25, 0.05)
    moss_left.rotation_euler = (0, -roof_slope, 0)
    moss_left.data.materials.append(bpy.data.materials["Mat_RoofMoss"])
    apply_smooth_and_bevel(moss_left, bevel_width=0.02, segments=2)
    roof_parts.append(moss_left)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.75, 0, 2.30))
    moss_right = bpy.context.active_object
    moss_right.name = "House_Roof_Moss_R"
    moss_right.scale = (1.45, 2.25, 0.05)
    moss_right.rotation_euler = (0, roof_slope, 0)
    moss_right.data.materials.append(bpy.data.materials["Mat_RoofMoss"])
    apply_smooth_and_bevel(moss_right, bevel_width=0.02, segments=2)
    roof_parts.append(moss_right)
    
    # 门与台阶
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -0.96, 0.65))
    door_frame = bpy.context.active_object
    door_frame.name = "House_Door_Frame"
    door_frame.scale = (0.75, 0.12, 1.35)
    door_frame.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
    apply_smooth_and_bevel(door_frame, bevel_width=0.02, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -0.97, 0.63))
    door_leaf = bpy.context.active_object
    door_leaf.name = "House_Door_Leaf"
    door_leaf.scale = (0.62, 0.06, 1.25)
    door_leaf.data.materials.append(bpy.data.materials["Mat_Door"])
    apply_smooth_and_bevel(door_leaf, bevel_width=0.015, segments=2)
    
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(-0.12, -1.02, 0.65))
    door_knob = bpy.context.active_object
    door_knob.name = "House_Door_Knob"
    door_knob.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -1.12, 0.18))
    step1 = bpy.context.active_object
    step1.name = "House_Step_01"
    step1.scale = (0.95, 0.35, 0.16)
    step1.data.materials.append(bpy.data.materials["Mat_StepStone"])
    apply_smooth_and_bevel(step1, bevel_width=0.03, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -1.35, 0.08))
    step2 = bpy.context.active_object
    step2.name = "House_Step_02"
    step2.scale = (1.1, 0.35, 0.14)
    step2.data.materials.append(bpy.data.materials["Mat_StepStone"])
    apply_smooth_and_bevel(step2, bevel_width=0.03, segments=2)
    
    # 烟囱与轻烟
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.85, 0.25, 2.45))
    chimney = bpy.context.active_object
    chimney.name = "House_Chimney"
    chimney.scale = (0.45, 0.45, 1.5)
    chimney.data.materials.append(bpy.data.materials["Mat_ChimneyStone"])
    apply_smooth_and_bevel(chimney, bevel_width=0.03, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.85, 0.25, 3.22))
    chimney_cap = bpy.context.active_object
    chimney_cap.name = "House_Chimney_Cap"
    chimney_cap.scale = (0.58, 0.58, 0.1)
    chimney_cap.data.materials.append(bpy.data.materials["Mat_ChimneyStone"])
    apply_smooth_and_bevel(chimney_cap, bevel_width=0.02, segments=2)
    
    smoke_parts = []
    smoke_cfgs = [
        {"loc": (0.85, 0.25, 3.45), "radius": 0.15},
        {"loc": (0.92, 0.32, 3.80), "radius": 0.23},
        {"loc": (1.05, 0.45, 4.25), "radius": 0.33},
        {"loc": (1.22, 0.62, 4.80), "radius": 0.45},
    ]
    for idx, sc in enumerate(smoke_cfgs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=sc["radius"], location=sc["loc"])
        sm = bpy.context.active_object
        sm.name = f"House_Smoke_{idx+1:02d}"
        sm.data.materials.append(bpy.data.materials["Mat_Smoke"])
        apply_smooth_and_bevel(sm, bevel_width=0.02, segments=2)
        smoke_parts.append(sm)
        
    # 门侧挂灯
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.02, depth=0.25, location=(0.15, -1.05, 1.15))
    bracket = bpy.context.active_object
    bracket.name = "House_Lantern_Bracket"
    bracket.rotation_euler = (math.radians(90), 0, 0)
    bracket.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.07, depth=0.18, location=(0.15, -1.15, 1.05))
    lantern = bpy.context.active_object
    lantern.name = "House_Lantern"
    lantern.data.materials.append(bpy.data.materials["Mat_LanternEmission"])
    apply_smooth_and_bevel(lantern, bevel_width=0.015, segments=2)
    
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.10, depth=0.08, location=(0.15, -1.15, 1.16))
    l_cap = bpy.context.active_object
    l_cap.name = "House_Lantern_Cap"
    l_cap.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
    
    all_parts = [
        cabin_body, door_frame, door_leaf, door_knob, step1, step2,
        chimney, chimney_cap, bracket, lantern, l_cap
    ] + posts + wall_planks + roof_parts + smoke_parts
    
    house_root = bpy.data.objects.new("House_Root", None)
    house_root.location = cabin_pos
    house_root.rotation_euler = (0, 0, cabin_rot_z)
    bpy.context.scene.collection.objects.link(house_root)
    link_to_collection(house_root, "House")
    
    for part in all_parts:
        part.parent = house_root
        link_to_collection(part, "House")
        
    create_hollow_window("House_Window_Front", house_root, Vector((0.55, -0.98, 0.95)), Euler((0, 0, 0)), width=0.65, height=0.75)
    create_hollow_window("House_Window_Side", house_root, Vector((-1.22, 0.1, 0.95)), Euler((0, 0, math.radians(90))), width=0.65, height=0.75)
    
    return house_root

# ==============================================================================
# 4. 植被森林生态
# ==============================================================================

def create_lowpoly_pine_tree(name, location, total_height=3.0, mat_pine=None):
    trunk_h = total_height * 0.35
    trunk_r = total_height * 0.05
    
    tree_root = bpy.data.objects.new(name, None)
    tree_root.location = location
    bpy.context.scene.collection.objects.link(tree_root)
    link_to_collection(tree_root, "Trees")
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=trunk_r, depth=trunk_h, location=(0, 0, trunk_h * 0.5))
    trunk = bpy.context.active_object
    trunk.name = f"{name}_Trunk"
    trunk.parent = tree_root
    trunk.data.materials.append(bpy.data.materials["Mat_Trunk"])
    apply_smooth_and_bevel(trunk, bevel_width=0.02, segments=1)
    link_to_collection(trunk, "Trees")
    
    crown_layers = 3
    for c_idx in range(crown_layers):
        frac = c_idx / (crown_layers - 1)
        layer_z = trunk_h * 0.7 + frac * (total_height * 0.55)
        layer_r = total_height * (0.35 - frac * 0.12)
        layer_h = total_height * (0.42 - frac * 0.08)
        
        bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=layer_r, depth=layer_h, location=(0, 0, layer_z))
        cone = bpy.context.active_object
        cone.name = f"{name}_Cone_{c_idx+1}"
        cone.parent = tree_root
        cone.rotation_euler = (random.uniform(-0.06, 0.06), random.uniform(-0.06, 0.06), random.uniform(0, math.pi))
        cone.data.materials.append(mat_pine)
        apply_smooth_and_bevel(cone, bevel_width=0.03, segments=1)
        link_to_collection(cone, "Trees")
        
    return tree_root

def create_vegetation():
    random.seed(42)
    mats_pine = [
        bpy.data.materials["Mat_Pine_Deep"],
        bpy.data.materials["Mat_Pine_Mid"],
        bpy.data.materials["Mat_Pine_Bright"],
    ]
    
    tree_coords = [
        (-0.5, 3.2), (0.8, 3.4), (2.2, 3.0), (3.3, 2.1), (-1.8, 3.0),
        (-2.8, 1.8), (-3.2, 0.6), (-2.5, -0.6),
        (3.4, 0.7), (3.6, -0.8), (2.8, -1.8)
    ]
    
    for idx, (tx, ty) in enumerate(tree_coords):
        tz = get_terrain_height(tx, ty)
        h = random.uniform(2.3, 3.8)
        chosen_mat = mats_pine[idx % 3]
        tree_name = f"Tree_Pine_{idx+1:02d}"
        create_lowpoly_pine_tree(tree_name, (tx, ty, tz), total_height=h, mat_pine=chosen_mat)
        
    shrub_coords = [(-1.8, -2.4), (-0.8, -3.2), (1.6, -3.0), (2.8, -2.6)]
    for s_idx, (sx, sy) in enumerate(shrub_coords):
        sz = get_terrain_height(sx, sy)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.35, location=(sx, sy, sz + 0.2))
        shrub = bpy.context.active_object
        shrub.name = f"Shrub_{s_idx+1:02d}"
        shrub.scale = (random.uniform(0.9, 1.3), random.uniform(0.9, 1.3), random.uniform(0.7, 0.9))
        shrub.data.materials.append(mats_pine[2])
        apply_smooth_and_bevel(shrub, bevel_width=0.03, segments=1)
        link_to_collection(shrub, "Props")
        
    mushroom_coords = [
        (-1.2, -1.6, 0.12, bpy.data.materials["Mat_MushroomRed"]),
        (-1.0, -1.8, 0.08, bpy.data.materials["Mat_MushroomYel"]),
        (-1.4, -2.0, 0.10, bpy.data.materials["Mat_MushroomRed"]),
        ( 1.1, -2.0, 0.11, bpy.data.materials["Mat_MushroomYel"]),
        ( 1.3, -2.2, 0.09, bpy.data.materials["Mat_MushroomRed"]),
        ( 0.4, -2.8, 0.08, bpy.data.materials["Mat_MushroomRed"]),
        (-2.2,  0.2, 0.13, bpy.data.materials["Mat_MushroomRed"]),
        ( 2.2,  1.1, 0.10, bpy.data.materials["Mat_MushroomYel"]),
    ]
    for m_idx, (mx, my, scale_m, m_mat) in enumerate(mushroom_coords):
        mz = get_terrain_height(mx, my)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=scale_m * 0.35, depth=scale_m * 1.5, location=(mx, my, mz + scale_m * 0.75))
        stem = bpy.context.active_object
        stem.name = f"Mushroom_{m_idx+1:02d}_Stem"
        stem.data.materials.append(bpy.data.materials["Mat_MushroomStem"])
        link_to_collection(stem, "Props")
        
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=scale_m * 0.9, depth=scale_m * 0.7, location=(mx, my, mz + scale_m * 1.4))
        cap = bpy.context.active_object
        cap.name = f"Mushroom_{m_idx+1:02d}_Cap"
        cap.rotation_euler = (random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), 0)
        cap.data.materials.append(m_mat)
        apply_smooth_and_bevel(cap, bevel_width=0.01, segments=1)
        link_to_collection(cap, "Props")

# ==============================================================================
# 5. 细节道具系统
# ==============================================================================

def create_props():
    random.seed(88)
    
    path_nodes = [
        ( 0.05, -0.65),
        (-0.20, -1.05),
        (-0.45, -1.45),
        (-0.65, -1.90),
        (-0.95, -2.35),
        (-1.25, -2.80),
        (-1.60, -3.25),
        (-1.95, -3.70),
        (-2.25, -4.15),
    ]
    for p_idx, (px, py) in enumerate(path_nodes):
        pz = get_terrain_height(px, py) + 0.03
        bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=random.uniform(0.28, 0.42), depth=0.06, location=(px, py, pz))
        stone = bpy.context.active_object
        stone.name = f"Path_Stone_{p_idx+1:02d}"
        stone.scale = (random.uniform(0.9, 1.2), random.uniform(0.8, 1.1), 1.0)
        stone.rotation_euler = (random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), random.uniform(0, math.pi))
        stone.data.materials.append(bpy.data.materials["Mat_StepStone"])
        apply_smooth_and_bevel(stone, bevel_width=0.02, segments=1)
        link_to_collection(stone, "Props")
        
    fence_posts = [(-1.5, -0.5), (-1.9, -0.9), (-2.2, -1.3), (-2.5, -1.8), (-2.7, -2.3)]
    for f_idx, (fx, fy) in enumerate(fence_posts):
        fz = get_terrain_height(fx, fy)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(fx, fy, fz + 0.35))
        p = bpy.context.active_object
        p.name = f"Fence_Post_{f_idx+1:02d}"
        p.scale = (0.12, 0.12, 0.75)
        p.rotation_euler = (random.uniform(-0.08, 0.08), random.uniform(-0.08, 0.08), random.uniform(-0.2, 0.2))
        p.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
        apply_smooth_and_bevel(p, bevel_width=0.02, segments=1)
        link_to_collection(p, "Props")
        
    for f_idx in range(len(fence_posts) - 1):
        p1 = fence_posts[f_idx]
        p2 = fence_posts[f_idx + 1]
        mx = (p1[0] + p2[0]) * 0.5
        my = (p1[1] + p2[1]) * 0.5
        mz = (get_terrain_height(p1[0], p1[1]) + get_terrain_height(p2[0], p2[1])) * 0.5 + 0.35
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        dist = math.sqrt(dx * dx + dy * dy)
        ang = math.atan2(dy, dx)
        
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, mz + 0.15))
        bar1 = bpy.context.active_object
        bar1.name = f"Fence_Rail_Top_{f_idx+1}"
        bar1.scale = (dist * 1.05, 0.06, 0.08)
        bar1.rotation_euler = (0, 0, ang)
        bar1.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
        apply_smooth_and_bevel(bar1, bevel_width=0.015, segments=1)
        link_to_collection(bar1, "Props")
        
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, mz - 0.12))
        bar2 = bpy.context.active_object
        bar2.name = f"Fence_Rail_Bot_{f_idx+1}"
        bar2.scale = (dist * 1.05, 0.06, 0.08)
        bar2.rotation_euler = (0, 0, ang)
        bar2.data.materials.append(bpy.data.materials["Mat_WoodTrim"])
        apply_smooth_and_bevel(bar2, bevel_width=0.015, segments=1)
        link_to_collection(bar2, "Props")
        
    big_rocks = [
        {"loc": (-2.6, 2.5), "scale": (1.1, 0.9, 0.8), "rot": (0.3, 0.4, 1.2)},
        {"loc": (2.7, 1.8),  "scale": (0.9, 1.2, 0.7), "rot": (-0.2, 0.3, 2.1)},
        {"loc": (0.8, -3.2), "scale": (0.8, 0.7, 0.6), "rot": (0.4, -0.2, 0.8)},
    ]
    for r_idx, rc in enumerate(big_rocks):
        rx, ry = rc["loc"]
        rz = get_terrain_height(rx, ry) + rc["scale"][2] * 0.3
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.8, location=(rx, ry, rz))
        b_rock = bpy.context.active_object
        b_rock.name = f"Scenic_Rock_{r_idx+1:02d}"
        b_rock.scale = rc["scale"]
        b_rock.rotation_euler = rc["rot"]
        b_rock.data.materials.append(bpy.data.materials["Mat_Rock"])
        apply_smooth_and_bevel(b_rock, bevel_width=0.04, segments=1, angle_deg=35)
        link_to_collection(b_rock, "Props")
        
    # 36 颗发光萤火虫
    random.seed(99)
    for ff_idx in range(36):
        ang = random.uniform(0, 2 * math.pi)
        dist = random.uniform(1.2, 4.4)
        fx = math.cos(ang) * dist
        fy = math.sin(ang) * dist
        ground_z = get_terrain_height(fx, fy)
        fz = ground_z + random.uniform(0.35, 2.3)
        
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.035, location=(fx, fy, fz))
        ff = bpy.context.active_object
        ff.name = f"Firefly_{ff_idx+1:02d}"
        ff.data.materials.append(bpy.data.materials["Mat_Firefly"])
        link_to_collection(ff, "FX")

# ==============================================================================
# 6. 相机与远景皎洁月亮星辰精确投影
# ==============================================================================

def setup_camera_and_cosmos():
    cam_data = bpy.data.cameras.new(name="Camera_Main")
    cam_data.lens = 52.0
    cam_data.dof.use_dof = True
    cam_data.dof.aperture_fstop = 2.8
    
    cam_obj = bpy.data.objects.new("Camera_Main", cam_data)
    # 微调高度与机位，确保地台最下方的尖锥与悬浮小碎石在画面的下半部留出舒适空间
    cam_obj.location = (-6.6, -15.8, 4.7)
    cam_obj.rotation_euler = (math.radians(73.5), 0, math.radians(-23.0))
    
    bpy.context.scene.collection.objects.link(cam_obj)
    link_to_collection(cam_obj, "Camera")
    bpy.context.scene.camera = cam_obj
    
    cabin_body = bpy.data.objects.get("House_Body")
    if cabin_body:
        cam_data.dof.focus_object = cabin_body
        
    # 强制更新 view_layer 以获取正确的 matrix_world
    bpy.context.view_layer.update()
    
    sensor_w = cam_data.sensor_width
    focal = cam_data.lens
    aspect = 2560.0 / 1440.0
    fov_x = 2 * math.atan((sensor_w / 2) / focal)
    fov_y = 2 * math.atan(((sensor_w / aspect) / 2) / focal)
    
    # 皎洁圆月精确放置在左上方 (u=0.22, v=0.84, 深度 24m, 半径 1.05m)
    depth = 24.0
    u_moon = 0.22
    v_moon = 0.84
    local_x = (u_moon - 0.5) * 2.0 * math.tan(fov_x / 2) * depth
    local_y = (v_moon - 0.5) * 2.0 * math.tan(fov_y / 2) * depth
    local_z = -depth
    moon_world = cam_obj.matrix_world @ Vector((local_x, local_y, local_z))
    
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.05, location=moon_world)
    moon = bpy.context.active_object
    moon.name = "Moon_Celestial"
    moon.data.materials.append(bpy.data.materials["Mat_Moon"])
    link_to_collection(moon, "FX")
    
    # 散落远景星辰 (30 颗)
    random.seed(888)
    for s_idx in range(30):
        su = random.uniform(0.04, 0.96)
        sv = random.uniform(0.55, 0.96)
        s_depth = random.uniform(26.0, 34.0)
        s_lx = (su - 0.5) * 2.0 * math.tan(fov_x / 2) * s_depth
        s_ly = (sv - 0.5) * 2.0 * math.tan(fov_y / 2) * s_depth
        s_lz = -s_depth
        s_world = cam_obj.matrix_world @ Vector((s_lx, s_ly, s_lz))
        
        rad = random.uniform(0.05, 0.09)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rad, location=s_world)
        star = bpy.context.active_object
        star.name = f"Star_{s_idx+1:02d}"
        star.data.materials.append(bpy.data.materials["Mat_Star"])
        link_to_collection(star, "FX")

# ==============================================================================
# 7. World 背景与灯光体积雾
# ==============================================================================

def setup_world_background():
    world = bpy.context.scene.world or bpy.data.worlds.new("World_NightSky")
    bpy.context.scene.world = world
    world.use_nodes = True
    wnodes = world.node_tree.nodes
    wnodes.clear()
    
    w_out = wnodes.new(type='ShaderNodeOutputWorld')
    w_bg = wnodes.new(type='ShaderNodeBackground')
    w_bg.inputs['Strength'].default_value = 0.30
    
    w_coord = wnodes.new(type='ShaderNodeTexCoord')
    w_map = wnodes.new(type='ShaderNodeMapping')
    w_grad = wnodes.new(type='ShaderNodeTexGradient')
    w_grad.gradient_type = 'LINEAR'
    
    w_ramp = wnodes.new(type='ShaderNodeValToRGB')
    w_ramp.color_ramp.elements[0].position = 0.20
    w_ramp.color_ramp.elements[0].color = hex_to_rgba("#0C152B")
    w_ramp.color_ramp.elements[1].position = 0.85
    w_ramp.color_ramp.elements[1].color = hex_to_rgba("#03040C")
    
    world.node_tree.links.new(w_coord.outputs['Window'], w_map.inputs['Vector'])
    world.node_tree.links.new(w_map.outputs['Vector'], w_grad.inputs['Vector'])
    world.node_tree.links.new(w_grad.outputs['Fac'], w_ramp.inputs['Fac'])
    world.node_tree.links.new(w_ramp.outputs['Color'], w_bg.inputs['Color'])
    world.node_tree.links.new(w_bg.outputs['Background'], w_out.inputs['Surface'])

def setup_lights():
    # 1. 冷蓝月光 (Sun)
    sun_data = bpy.data.lights.new(name="Light_MoonSun", type='SUN')
    sun_data.energy = 1.55
    sun_data.color = hex_to_rgba("#8FB4FF")[:3]
    sun_data.angle = math.radians(4.0)
    
    sun_obj = bpy.data.objects.new("Light_MoonSun", sun_data)
    sun_obj.rotation_euler = (math.radians(52), math.radians(-15), math.radians(45))
    bpy.context.scene.collection.objects.link(sun_obj)
    link_to_collection(sun_obj, "Lights")
    
    # 2. 正面窗户暖光 (Point 300W)
    win1_pt_data = bpy.data.lights.new(name="Light_Window_Front_Point", type='POINT')
    win1_pt_data.energy = 300.0
    win1_pt_data.color = hex_to_rgba("#FFAA55")[:3]
    win1_pt_data.shadow_soft_size = 0.15
    win1_pt = bpy.data.objects.new("Light_Window_Front_Point", win1_pt_data)
    win1_pt.location = (1.15, 0.08, 1.15)
    bpy.context.scene.collection.objects.link(win1_pt)
    link_to_collection(win1_pt, "Lights")
    
    # 3. 侧面窗户暖光 (Point 200W)
    win2_pt_data = bpy.data.lights.new(name="Light_Window_Side_Point", type='POINT')
    win2_pt_data.energy = 200.0
    win2_pt_data.color = hex_to_rgba("#FFAA55")[:3]
    win2_pt_data.shadow_soft_size = 0.15
    win2_pt = bpy.data.objects.new("Light_Window_Side_Point", win2_pt_data)
    win2_pt.location = (-0.45, 0.85, 1.15)
    bpy.context.scene.collection.objects.link(win2_pt)
    link_to_collection(win2_pt, "Lights")
    
    # 4. 门侧提灯暖光 (Point 80W)
    lant_pt_data = bpy.data.lights.new(name="Light_Lantern_Point", type='POINT')
    lant_pt_data.energy = 80.0
    lant_pt_data.color = hex_to_rgba("#FFC070")[:3]
    lant_pt_data.shadow_soft_size = 0.08
    lant_pt = bpy.data.objects.new("Light_Lantern_Point", lant_pt_data)
    lant_pt.location = (0.55, -0.15, 1.25)
    bpy.context.scene.collection.objects.link(lant_pt)
    link_to_collection(lant_pt, "Lights")
    
    # 5. 镜头侧暗部弱补光 (Area)
    fill_data = bpy.data.lights.new(name="Light_Camera_Fill_Area", type='AREA')
    fill_data.energy = 16.0
    fill_data.size = 7.0
    fill_data.color = hex_to_rgba("#657AB8")[:3]
    fill_obj = bpy.data.objects.new("Light_Camera_Fill_Area", fill_data)
    fill_obj.location = (-4.5, -9.0, 3.5)
    fill_obj.rotation_euler = (math.radians(65), 0, math.radians(-25))
    bpy.context.scene.collection.objects.link(fill_obj)
    link_to_collection(fill_obj, "Lights")
    
    # 6. 地台倒锥底部边缘轮廓补光 (Point)
    bottom_pt_data = bpy.data.lights.new(name="Light_Base_Rim", type='POINT')
    bottom_pt_data.energy = 120.0
    bottom_pt_data.color = hex_to_rgba("#4B65A6")[:3]
    bottom_pt_data.shadow_soft_size = 0.5
    bottom_pt = bpy.data.objects.new("Light_Base_Rim", bottom_pt_data)
    bottom_pt.location = (1.5, 2.5, -3.2)
    bpy.context.scene.collection.objects.link(bottom_pt)
    link_to_collection(bottom_pt, "Lights")

def setup_volumetric_fog():
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.2))
    fog_box = bpy.context.active_object
    fog_box.name = "FX_Volume_FogBox"
    fog_box.scale = (18.0, 18.0, 14.0)
    
    mat_fog = bpy.data.materials.new(name="Mat_Volume_Fog")
    mat_fog.use_nodes = True
    fnodes = mat_fog.node_tree.nodes
    fnodes.clear()
    
    f_out = fnodes.new(type='ShaderNodeOutputMaterial')
    f_vol = fnodes.new(type='ShaderNodeVolumePrincipled')
    f_vol.inputs['Color'].default_value = hex_to_rgba("#8AA2CE")
    f_vol.inputs['Density'].default_value = 0.012
    
    mat_fog.node_tree.links.new(f_vol.outputs['Volume'], f_out.inputs['Volume'])
    fog_box.data.materials.append(mat_fog)
    link_to_collection(fog_box, "FX")

# ==============================================================================
# 8. 渲染与后期合成设置 (2560 x 1440, 128 samples, EEVEE)
# ==============================================================================

def setup_render_and_compositor():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    
    scene.render.resolution_x = 2560
    scene.render.resolution_y = 1440
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'
    scene.render.filepath = "E:/workspace/cod/render/night_cabin_diorama.png"
    
    if hasattr(scene, "eevee"):
        eevee = scene.eevee
        if hasattr(eevee, "taa_render_samples"):
            eevee.taa_render_samples = 128
        if hasattr(eevee, "use_gtao"):
            eevee.use_gtao = True
            eevee.gtao_distance = 2.0
            eevee.gtao_factor = 1.2
        if hasattr(eevee, "use_bloom"):
            eevee.use_bloom = True
            eevee.bloom_threshold = 1.0
            eevee.bloom_intensity = 0.08
            eevee.bloom_radius = 6.0
        if hasattr(eevee, "use_ssr"):
            eevee.use_ssr = True
            eevee.use_ssr_refraction = True
        if hasattr(eevee, "use_soft_shadows"):
            eevee.use_soft_shadows = True
        if hasattr(eevee, "volumetric_tile_size"):
            eevee.volumetric_tile_size = '2'
            
    view_set = scene.view_settings
    available_transforms = [vt.name for vt in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] if hasattr(bpy.types, "ColorManagedViewSettings") else []
    if "AgX" in available_transforms:
        view_set.view_transform = 'AgX'
    elif "Filmic" in available_transforms:
        view_set.view_transform = 'Filmic'
    view_set.look = 'Medium High Contrast'
    
    scene.use_nodes = True
    c_tree = scene.node_tree
    c_tree.nodes.clear()
    
    n_rl = c_tree.nodes.new(type='CompositorNodeRLayers')
    
    n_glare = c_tree.nodes.new(type='CompositorNodeGlare')
    n_glare.glare_type = 'FOG_GLOW'
    n_glare.quality = 'HIGH'
    n_glare.threshold = 1.0
    n_glare.size = 8
    
    n_lens = c_tree.nodes.new(type='CompositorNodeLensdist')
    n_lens.inputs['Distort'].default_value = 0.0
    n_lens.inputs['Dispersion'].default_value = 0.003
    
    n_cb = c_tree.nodes.new(type='CompositorNodeColorBalance')
    n_cb.correction_method = 'LIFT_GAMMA_GAIN'
    n_cb.lift = (0.96, 0.98, 1.04)
    n_cb.gamma = (1.02, 1.01, 0.99)
    n_cb.gain = (1.06, 1.04, 0.95)
    
    n_comp = c_tree.nodes.new(type='CompositorNodeComposite')
    
    c_tree.links.new(n_rl.outputs['Image'], n_glare.inputs['Image'])
    c_tree.links.new(n_glare.outputs['Image'], n_lens.inputs['Image'])
    c_tree.links.new(n_lens.outputs['Image'], n_cb.inputs['Image'])
    c_tree.links.new(n_cb.outputs['Image'], n_comp.inputs['Image'])

# ==============================================================================
# 9. 主装配执行函数
# ==============================================================================

def main():
    print("====================================================")
    print(">>> 开始全案执行「夜晚森林小木屋微缩场景」制作流程...")
    print("====================================================")
    
    print(">>> [1/8] 清空旧场景，配置集合体系...")
    reset_scene()
    setup_collections()
    
    print(">>> [2/8] 构建 Principled BSDF 纯着色材质系统...")
    create_procedural_materials()
    
    print(">>> [3/8] 生成悬浮圆形地台与底部倒锥岩石、漂浮碎石...")
    create_floating_island()
    
    print(">>> [4/8] 建造精致童话小木屋与中空发光十字窗...")
    create_cabin()
    
    print(">>> [5/8] 程序化分布低模松树森林、灌木与童话蘑菇...")
    create_vegetation()
    
    print(">>> [6/8] 铺设石板小路、乡村栅栏、大石与36颗发光萤火虫...")
    create_props()
    
    print(">>> [7/8] 布置相机机位与远景皎洁月亮星辰精确投影...")
    setup_camera_and_cosmos()
    
    print(">>> [8/8] 建立渐变夜空背景、冷暖灯光体系、体积雾与后期合成器...")
    setup_world_background()
    setup_lights()
    setup_volumetric_fog()
    setup_render_and_compositor()
    
    blend_path = "E:/workspace/cod/render/night_cabin_diorama.blend"
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f">>> [成功] .blend 工程文件已保存: {blend_path}")
    print(">>> 场景制作与参数调试全部完成！")
    print("====================================================")

main()
