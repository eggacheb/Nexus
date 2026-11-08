"""
阶段一至阶段四：完整几何体与细节道具生成 (Terrain, House, Trees, Props, FX)
- 优化地台倒锥与草坪
- 优化小木屋屋顶双坡贴合苔藓、墙面横木层
- 程序化森林植被 (10 棵低多边形三层松树，深绿至蓝绿渐变，seed=42)
- 灌木与童话小蘑菇
- 蜿蜒石板小路 (9 块扁石)
- 半开放乡村木栅栏
- 景观大石
- 30 颗林间漂浮发光萤火虫
"""

import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, noise

def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

def setup_collections():
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
    target = bpy.data.collections.get(coll_name)
    if not target:
        return
    for c in list(obj.users_collection):
        if c != target:
            c.objects.unlink(obj)
    if obj.name not in target.objects:
        target.objects.link(obj)

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

def hex_to_rgba(hex_str, alpha=1.0):
    hex_str = hex_str.lstrip('#')
    lv = len(hex_str)
    rgb = [int(hex_str[i:i + lv // 3], 16) / 255.0 for i in range(0, lv, lv // 3)]
    linear_rgb = [math.pow(c, 2.2) for c in rgb]
    return (linear_rgb[0], linear_rgb[1], linear_rgb[2], alpha)

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

# 获取地表高度辅助函数
def get_terrain_height(x, y):
    r = math.sqrt(x * x + y * y)
    r_frac = min(r / 5.0, 1.0)
    wobble = noise.noise(Vector((x * 0.4, y * 0.4, 0.7))) * 0.28
    z_top = 0.2 * (1.0 - (r_frac ** 2)) + wobble
    return z_top

# ----------------- 1. 地台系统 -----------------
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
        
    # 面槽 0: 草地
    for r_idx in range(rings):
        for s_idx in range(segments):
            next_s = (s_idx + 1) % segments
            v1 = vert_rings[r_idx][s_idx]
            v2 = vert_rings[r_idx][next_s]
            v3 = vert_rings[r_idx + 1][next_s]
            v4 = vert_rings[r_idx + 1][s_idx]
            f = bm.faces.new((v1, v3, v4) if r_idx == 0 else (v1, v2, v3, v4))
            f.material_index = 0
            
    # 面槽 1: 泥土环带 (厚度 0.55m)
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
        
    # 面槽 2: 岩石倒锥 (向下延伸 3.5m)
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
        
    # 底部最尖端封底
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
        {"loc": (-1.2, 1.5, -4.2), "scale": (0.48, 0.40, 0.55), "rot": (0.3, 0.5, 1.1)},
        {"loc": (1.4, -1.0, -4.6), "scale": (0.38, 0.45, 0.40), "rot": (-0.4, 0.2, 2.3)},
        {"loc": (0.3, 1.9, -4.9), "scale": (0.30, 0.34, 0.38), "rot": (0.6, -0.3, 0.7)},
    ]
    for idx, cfg in enumerate(rock_configs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.6, location=cfg["loc"])
        rock = bpy.context.active_object
        rock.name = f"Floating_Rock_{idx+1:02d}"
        rock.scale = cfg["scale"]
        rock.rotation_euler = cfg["rot"]
        rock.data.materials.append(mat_rock)
        apply_smooth_and_bevel(rock, bevel_width=0.04, segments=2, angle_deg=35)
        link_to_collection(rock, "Terrain")

# ----------------- 2. 小木屋系统 -----------------
def create_cabin():
    cabin_pos = Vector((0.7, 0.8, 0.18))
    cabin_rot_z = math.radians(-18)
    
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
    mat_smoke = get_or_create_material("Mat_Smoke", base_color=hex_to_rgba("#E8EDF2"), roughness=0.6, alpha=0.45)
    mat_lantern = get_or_create_material("Mat_LanternEmission", 
                                         base_color=hex_to_rgba("#FFC070"), 
                                         emission_color=hex_to_rgba("#FFC070"), 
                                         emission_strength=12.0)
    
    # 墙面主体 (2.4m x 1.9m x 1.7m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.85))
    cabin_body = bpy.context.active_object
    cabin_body.name = "House_Body"
    cabin_body.scale = (2.4, 1.9, 1.7)
    cabin_body.data.materials.append(mat_wood)
    apply_smooth_and_bevel(cabin_body, bevel_width=0.03, segments=2)
    
    # 墙面横向实木板条装饰 (增添童话木屋凹凸质感)
    wall_planks = []
    for h_step in range(4):
        h_z = 0.35 + h_step * 0.40
        # 正面木条
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.96, h_z))
        pl = bpy.context.active_object
        pl.name = f"House_Plank_F_{h_step+1}"
        pl.scale = (2.42, 0.04, 0.12)
        pl.data.materials.append(mat_wood)
        apply_smooth_and_bevel(pl, bevel_width=0.015, segments=2)
        wall_planks.append(pl)
    
    # 四角实木立柱
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
        
    # 双坡人字斜屋顶 (左右斜坡倾斜 ~37 度)
    roof_parts = []
    # 左斜坡板
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.75, 0, 2.22))
    roof_left = bpy.context.active_object
    roof_left.name = "House_Roof_Left"
    roof_left.scale = (1.75, 2.45, 0.14)
    roof_left.rotation_euler = (0, math.radians(37), 0)
    roof_left.data.materials.append(mat_roof)
    apply_smooth_and_bevel(roof_left, bevel_width=0.03, segments=2)
    roof_parts.append(roof_left)
    
    # 右斜坡板
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.75, 0, 2.22))
    roof_right = bpy.context.active_object
    roof_right.name = "House_Roof_Right"
    roof_right.scale = (1.75, 2.45, 0.14)
    roof_right.rotation_euler = (0, math.radians(-37), 0)
    roof_right.data.materials.append(mat_roof)
    apply_smooth_and_bevel(roof_right, bevel_width=0.03, segments=2)
    roof_parts.append(roof_right)
    
    # 屋脊封顶木梁
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 2.76))
    roof_ridge = bpy.context.active_object
    roof_ridge.name = "House_Roof_Ridge"
    roof_ridge.scale = (0.24, 2.48, 0.20)
    roof_ridge.data.materials.append(mat_trim)
    apply_smooth_and_bevel(roof_ridge, bevel_width=0.02, segments=2)
    roof_parts.append(roof_ridge)
    
    # 贴合双坡屋顶的薄苔藓/雪层
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.75, 0, 2.30))
    moss_left = bpy.context.active_object
    moss_left.name = "House_Roof_Moss_L"
    moss_left.scale = (1.45, 2.25, 0.05)
    moss_left.rotation_euler = (0, math.radians(37), 0)
    moss_left.data.materials.append(mat_moss)
    apply_smooth_and_bevel(moss_left, bevel_width=0.02, segments=2)
    roof_parts.append(moss_left)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.75, 0, 2.30))
    moss_right = bpy.context.active_object
    moss_right.name = "House_Roof_Moss_R"
    moss_right.scale = (1.45, 2.25, 0.05)
    moss_right.rotation_euler = (0, math.radians(-37), 0)
    moss_right.data.materials.append(mat_moss)
    apply_smooth_and_bevel(moss_right, bevel_width=0.02, segments=2)
    roof_parts.append(moss_right)
    
    # 门、台阶、窗户、烟囱
    # 门框与门
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -0.96, 0.65))
    door_frame = bpy.context.active_object
    door_frame.name = "House_Door_Frame"
    door_frame.scale = (0.75, 0.12, 1.35)
    door_frame.data.materials.append(mat_trim)
    apply_smooth_and_bevel(door_frame, bevel_width=0.02, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -0.97, 0.63))
    door_leaf = bpy.context.active_object
    door_leaf.name = "House_Door_Leaf"
    door_leaf.scale = (0.62, 0.06, 1.25)
    door_leaf.data.materials.append(mat_door)
    apply_smooth_and_bevel(door_leaf, bevel_width=0.015, segments=2)
    
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(-0.12, -1.02, 0.65))
    door_knob = bpy.context.active_object
    door_knob.name = "House_Door_Knob"
    door_knob.data.materials.append(mat_trim)
    
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
    
    # 正面窗
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
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.55, -0.98, 0.95))
    win1_grid = bpy.context.active_object
    win1_grid.name = "House_Window_Front_Grid"
    win1_grid.scale = (0.52, 0.02, 0.05)
    win1_grid.data.materials.append(mat_trim)
    
    # 侧面窗
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
    
    # 烟囱与轻烟
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.75, 0.55, 2.45))
    chimney = bpy.context.active_object
    chimney.name = "House_Chimney"
    chimney.scale = (0.45, 0.45, 1.4)
    chimney.data.materials.append(mat_chimney)
    apply_smooth_and_bevel(chimney, bevel_width=0.03, segments=2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.75, 0.55, 3.18))
    chimney_cap = bpy.context.active_object
    chimney_cap.name = "House_Chimney_Cap"
    chimney_cap.scale = (0.58, 0.58, 0.1)
    chimney_cap.data.materials.append(mat_chimney)
    apply_smooth_and_bevel(chimney_cap, bevel_width=0.02, segments=2)
    
    smoke_parts = []
    smoke_cfgs = [
        {"loc": (0.75, 0.55, 3.40), "radius": 0.15},
        {"loc": (0.82, 0.62, 3.75), "radius": 0.23},
        {"loc": (0.95, 0.75, 4.18), "radius": 0.33},
        {"loc": (1.12, 0.92, 4.70), "radius": 0.45},
    ]
    for idx, sc in enumerate(smoke_cfgs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=sc["radius"], location=sc["loc"])
        sm = bpy.context.active_object
        sm.name = f"House_Smoke_{idx+1:02d}"
        sm.data.materials.append(mat_smoke)
        apply_smooth_and_bevel(sm, bevel_width=0.02, segments=2)
        smoke_parts.append(sm)
        
    # 门侧提灯
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.02, depth=0.25, location=(0.15, -1.05, 1.15))
    bracket = bpy.context.active_object
    bracket.name = "House_Lantern_Bracket"
    bracket.rotation_euler = (math.radians(90), 0, 0)
    bracket.data.materials.append(mat_trim)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.07, depth=0.18, location=(0.15, -1.15, 1.05))
    lantern = bpy.context.active_object
    lantern.name = "House_Lantern"
    lantern.data.materials.append(mat_lantern)
    apply_smooth_and_bevel(lantern, bevel_width=0.015, segments=2)
    
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.10, depth=0.08, location=(0.15, -1.15, 1.16))
    l_cap = bpy.context.active_object
    l_cap.name = "House_Lantern_Cap"
    l_cap.data.materials.append(mat_trim)
    
    all_parts = [
        cabin_body, door_frame, door_leaf, door_knob, step1, step2,
        win1_frame, win1_glass, win1_grid, win2_frame, win2_glass,
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
        
    return house_root

# ----------------- 3. 植被系统 (松树、灌木、蘑菇) -----------------
def create_lowpoly_pine_tree(name, location, total_height=3.0, mat_pine=None):
    mat_trunk = get_or_create_material("Mat_Trunk", base_color=hex_to_rgba("#4A2E1B"), roughness=0.95)
    
    trunk_h = total_height * 0.35
    trunk_r = total_height * 0.05
    
    tree_root = bpy.data.objects.new(name, None)
    tree_root.location = location
    bpy.context.scene.collection.objects.link(tree_root)
    link_to_collection(tree_root, "Trees")
    
    # 树干 (6 边形圆柱)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=trunk_r, depth=trunk_h, location=(0, 0, trunk_h * 0.5))
    trunk = bpy.context.active_object
    trunk.name = f"{name}_Trunk"
    trunk.parent = tree_root
    trunk.data.materials.append(mat_trunk)
    apply_smooth_and_bevel(trunk, bevel_width=0.02, segments=1)
    link_to_collection(trunk, "Trees")
    
    # 3 层圆锥树冠 (7 边形)
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
        # 顶部微倾斜
        cone.rotation_euler = (random.uniform(-0.06, 0.06), random.uniform(-0.06, 0.06), random.uniform(0, math.pi))
        cone.data.materials.append(mat_pine)
        apply_smooth_and_bevel(cone, bevel_width=0.03, segments=1)
        link_to_collection(cone, "Trees")
        
    return tree_root

def create_vegetation():
    random.seed(42)
    
    # 准备三种不同深浅的松树材质 (深绿至蓝绿)
    mats_pine = [
        get_or_create_material("Mat_Pine_Deep", base_color=hex_to_rgba("#1F5A4A"), roughness=0.9),
        get_or_create_material("Mat_Pine_Mid", base_color=hex_to_rgba("#256B52"), roughness=0.9),
        get_or_create_material("Mat_Pine_Bright", base_color=hex_to_rgba("#2E7D5B"), roughness=0.9),
    ]
    
    # 规划 11 棵松树坐标：木屋后方呈环弧包围，木屋两侧错落，前景通透
    tree_coords = [
        # 木屋后方森林
        (-0.5, 3.2), (0.8, 3.4), (2.2, 3.0), (3.3, 2.1), (-1.8, 3.0),
        # 木屋左侧
        (-2.8, 1.8), (-3.2, 0.6), (-2.5, -0.6),
        # 木屋右侧
        (3.4, 0.7), (3.6, -0.8), (2.8, -1.8)
    ]
    
    for idx, (tx, ty) in enumerate(tree_coords):
        tz = get_terrain_height(tx, ty)
        h = random.uniform(2.3, 3.8)
        chosen_mat = mats_pine[idx % 3]
        tree_name = f"Tree_Pine_{idx+1:02d}"
        create_lowpoly_pine_tree(tree_name, (tx, ty, tz), total_height=h, mat_pine=chosen_mat)
        
    # 4 丛前景小灌木
    mat_shrub = mats_pine[2]
    shrub_coords = [(-1.8, -2.4), (-0.8, -3.2), (1.6, -3.0), (2.8, -2.6)]
    for s_idx, (sx, sy) in enumerate(shrub_coords):
        sz = get_terrain_height(sx, sy)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.35, location=(sx, sy, sz + 0.2))
        shrub = bpy.context.active_object
        shrub.name = f"Shrub_{s_idx+1:02d}"
        shrub.scale = (random.uniform(0.9, 1.3), random.uniform(0.9, 1.3), random.uniform(0.7, 0.9))
        shrub.data.materials.append(mat_shrub)
        apply_smooth_and_bevel(shrub, bevel_width=0.03, segments=1)
        link_to_collection(shrub, "Props")
        
    # 7 朵治愈小蘑菇 (带红色与暖黄伞盖)
    mat_stem = get_or_create_material("Mat_MushroomStem", base_color=hex_to_rgba("#E8E0D5"), roughness=0.85)
    mat_cap_red = get_or_create_material("Mat_MushroomRed", base_color=hex_to_rgba("#D94A38"), roughness=0.7)
    mat_cap_yel = get_or_create_material("Mat_MushroomYel", base_color=hex_to_rgba("#EAA83B"), roughness=0.7)
    
    mushroom_coords = [
        (-1.2, -1.6, 0.12, mat_cap_red),
        (-1.0, -1.8, 0.08, mat_cap_yel),
        (-1.4, -2.0, 0.10, mat_cap_red),
        ( 1.1, -2.0, 0.11, mat_cap_yel),
        ( 1.3, -2.2, 0.09, mat_cap_red),
        (-2.2,  0.2, 0.13, mat_cap_red),
        ( 2.2,  1.1, 0.10, mat_cap_yel),
    ]
    for m_idx, (mx, my, scale_m, m_mat) in enumerate(mushroom_coords):
        mz = get_terrain_height(mx, my)
        # 菌柄
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=scale_m * 0.35, depth=scale_m * 1.5, location=(mx, my, mz + scale_m * 0.75))
        stem = bpy.context.active_object
        stem.name = f"Mushroom_{m_idx+1:02d}_Stem"
        stem.data.materials.append(mat_stem)
        link_to_collection(stem, "Props")
        
        # 菌盖
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=scale_m * 0.9, depth=scale_m * 0.7, location=(mx, my, mz + scale_m * 1.4))
        cap = bpy.context.active_object
        cap.name = f"Mushroom_{m_idx+1:02d}_Cap"
        cap.rotation_euler = (random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), 0)
        cap.data.materials.append(m_mat)
        apply_smooth_and_bevel(cap, bevel_width=0.01, segments=1)
        link_to_collection(cap, "Props")

# ----------------- 4. 细节道具系统 (石板路、木篱笆、大石、萤火虫) -----------------
def create_props():
    random.seed(88)
    mat_stone = bpy.data.materials.get("Mat_StepStone")
    mat_wood_trim = bpy.data.materials.get("Mat_WoodTrim")
    mat_rock = bpy.data.materials.get("Mat_Rock")
    mat_firefly = get_or_create_material("Mat_Firefly", 
                                         base_color=hex_to_rgba("#D4FF66"), 
                                         emission_color=hex_to_rgba("#D4FF66"), 
                                         emission_strength=8.0)
    
    # 1. 蜿蜒石板小路 (从木屋门口蜿蜒至地台前景边缘，共 9 块不规则扁平石头)
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
        stone.data.materials.append(mat_stone)
        apply_smooth_and_bevel(stone, bevel_width=0.02, segments=1)
        link_to_collection(stone, "Props")
        
    # 2. 半开放乡村木栅栏 (位于前院左侧，5 根木桩加横条，绝不封闭)
    fence_posts = [
        (-1.5, -0.5), (-1.9, -0.9), (-2.2, -1.3), (-2.5, -1.8), (-2.7, -2.3)
    ]
    post_objs = []
    for f_idx, (fx, fy) in enumerate(fence_posts):
        fz = get_terrain_height(fx, fy)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(fx, fy, fz + 0.35))
        p = bpy.context.active_object
        p.name = f"Fence_Post_{f_idx+1:02d}"
        p.scale = (0.12, 0.12, 0.75)
        # 轻微自然歪斜
        p.rotation_euler = (random.uniform(-0.08, 0.08), random.uniform(-0.08, 0.08), random.uniform(-0.2, 0.2))
        p.data.materials.append(mat_wood_trim)
        apply_smooth_and_bevel(p, bevel_width=0.02, segments=1)
        link_to_collection(p, "Props")
        post_objs.append(p)
        
    # 栅栏横木条 (连接木桩)
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
        
        # 上横木
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, mz + 0.15))
        bar1 = bpy.context.active_object
        bar1.name = f"Fence_Rail_Top_{f_idx+1}"
        bar1.scale = (dist * 1.05, 0.06, 0.08)
        bar1.rotation_euler = (0, 0, ang)
        bar1.data.materials.append(mat_wood_trim)
        apply_smooth_and_bevel(bar1, bevel_width=0.015, segments=1)
        link_to_collection(bar1, "Props")
        
        # 下横木
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, my, mz - 0.12))
        bar2 = bpy.context.active_object
        bar2.name = f"Fence_Rail_Bot_{f_idx+1}"
        bar2.scale = (dist * 1.05, 0.06, 0.08)
        bar2.rotation_euler = (0, 0, ang)
        bar2.data.materials.append(mat_wood_trim)
        apply_smooth_and_bevel(bar2, bevel_width=0.015, segments=1)
        link_to_collection(bar2, "Props")
        
    # 3. 景观大石 (3 块，带自然切面)
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
        b_rock.data.materials.append(mat_rock)
        apply_smooth_and_bevel(b_rock, bevel_width=0.04, segments=1, angle_deg=35)
        link_to_collection(b_rock, "Props")
        
    # 4. 萤火虫群 (30 颗漂浮发光微球)
    random.seed(99)
    for ff_idx in range(30):
        # 散落于木屋四周和林间
        ang = random.uniform(0, 2 * math.pi)
        dist = random.uniform(1.2, 4.2)
        fx = math.cos(ang) * dist
        fy = math.sin(ang) * dist
        ground_z = get_terrain_height(fx, fy)
        fz = ground_z + random.uniform(0.4, 2.2)
        
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.035, location=(fx, fy, fz))
        ff = bpy.context.active_object
        ff.name = f"Firefly_{ff_idx+1:02d}"
        ff.data.materials.append(mat_firefly)
        link_to_collection(ff, "FX")

def main():
    print(">>> [Stage 1-4] 重置场景并创建集合结构...")
    reset_scene()
    setup_collections()
    
    print(">>> [Stage 1] 生成微缩悬浮地台与碎石...")
    create_floating_island()
    create_grass_overhangs()
    create_floating_rocks()
    
    print(">>> [Stage 2] 生成精致童话小木屋...")
    create_cabin()
    
    print(">>> [Stage 3] 生成低模松树、灌木与童话蘑菇...")
    create_vegetation()
    
    print(">>> [Stage 4] 生成石板小路、木篱笆、大石与萤火虫...")
    create_props()
    
    print(">>> [Stage 1-4] 几何生态与细节道具全部构建完成！")

main()
