"""
阶段一：场景初始化与悬浮地台构建 (Terrain & Diorama Base)
- 清空默认物体并重置场景
- 创建核心集合结构: Terrain, House, Trees, Props, Lights, FX, Camera
- 构建悬浮圆形地台 (顶部起伏草坪、泥土截面、底部倒锥岩石)
- 生成边缘外溢草块及底部漂浮碎石
"""

import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, noise

# 1. 清空默认场景
def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    
    # 清理无用数据块
    for mesh in bpy.data.meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in bpy.data.materials:
        if mat.users == 0:
            bpy.data.materials.remove(mat)

# 2. 建立清晰的 Collection 结构
def setup_collections():
    colls = ["Terrain", "House", "Trees", "Props", "Lights", "FX", "Camera"]
    scene_coll = bpy.context.scene.collection
    created = {}
    for name in colls:
        if name in bpy.data.collections:
            c = bpy.data.collections[name]
        else:
            c = bpy.data.collections.new(name)
            scene_coll.children.link(c)
        created[name] = c
    return created

# 辅助函数：将物体链接到指定集合并从主集合中移除
def link_to_collection(obj, coll_name):
    target = bpy.data.collections.get(coll_name)
    if not target:
        return
    for c in list(obj.users_collection):
        if c != target:
            c.objects.unlink(obj)
    if obj.name not in target.objects:
        target.objects.link(obj)

# 3. 创建悬浮地台主体 (微缩模型底座)
def create_floating_island():
    # 使用 bmesh 纯程序化构建多段地台：草地顶层、泥土过渡环、不规则岩石倒锥
    mesh = bpy.data.meshes.new("Terrain_Base_Mesh")
    bm = bmesh.new()
    
    random.seed(42)
    radius = 5.0
    segments = 48
    
    # 构建顶部草地多圈环状顶点网格 (带自然起伏)
    rings = 10
    vert_rings = []
    
    for r_idx in range(rings + 1):
        r_frac = r_idx / rings
        current_r = radius * r_frac
        ring_verts = []
        for s_idx in range(segments):
            angle = (s_idx / segments) * 2 * math.pi
            # 基础坐标
            x = math.cos(angle) * current_r
            y = math.sin(angle) * current_r
            
            # 使用数学噪波生成顶部草坪的高低缓坡 (最大落差约 0.25m)
            noise_val = noise.noise(Vector((x * 0.45, y * 0.45, 0.5))) * 0.35
            # 中心略高，边缘平缓
            z_base = 0.15 * (1.0 - (r_frac ** 2))
            z = z_base + noise_val
            
            # 边缘圈略带不规则微抖动
            if r_idx == rings:
                r_wobble = 1.0 + (noise.noise(Vector((x * 0.8, y * 0.8, 1.2))) - 0.5) * 0.08
                x *= r_wobble
                y *= r_wobble
            
            v = bm.verts.new((x, y, z))
            ring_verts.append(v)
        vert_rings.append(ring_verts)
    
    # 连接草坪顶面各环面
    for r_idx in range(rings):
        for s_idx in range(segments):
            next_s = (s_idx + 1) % segments
            v1 = vert_rings[r_idx][s_idx]
            v2 = vert_rings[r_idx][next_s]
            v3 = vert_rings[r_idx + 1][next_s]
            v4 = vert_rings[r_idx + 1][s_idx]
            if r_idx == 0:
                # 最中心环为扇形三角面
                bm.faces.new((v1, v3, v4))
            else:
                bm.faces.new((v1, v2, v3, v4))
                
    # 泥土厚度环 (向下垂落约 0.45m)
    dirt_ring = []
    top_rim = vert_rings[-1]
    for s_idx in range(segments):
        top_v = top_rim[s_idx]
        dirt_z = top_v.co.z - 0.45
        # 泥土外缘稍微凹凸
        d_noise = noise.noise(Vector((top_v.co.x * 0.6, top_v.co.y * 0.6, 2.0))) * 0.12
        v = bm.verts.new((top_v.co.x * (1.01 + d_noise), top_v.co.y * (1.01 + d_noise), dirt_z))
        dirt_ring.append(v)
    
    for s_idx in range(segments):
        next_s = (s_idx + 1) % segments
        bm.faces.new((top_rim[s_idx], top_rim[next_s], dirt_ring[next_s], dirt_ring[s_idx]))
        
    # 下方倒立岩石锥 (向下收窄约 3.2m，分 4 层收缩，带随机岩石切面)
    rock_layers = 4
    prev_ring = dirt_ring
    rock_depths = [-1.2, -2.1, -2.8, -3.4]
    rock_radii = [0.82, 0.55, 0.28, 0.08]
    
    for layer_idx in range(rock_layers):
        curr_ring = []
        target_z = rock_depths[layer_idx]
        r_scale = rock_radii[layer_idx]
        for s_idx in range(segments):
            angle = (s_idx / segments) * 2 * math.pi
            # 偏心与多面体扰动
            wobble = noise.noise(Vector((math.cos(angle) * 1.5, math.sin(angle) * 1.5, layer_idx * 1.2))) * 0.35
            rx = math.cos(angle) * radius * (r_scale + wobble) + 0.15 * layer_idx
            ry = math.sin(angle) * radius * (r_scale + wobble) - 0.1 * layer_idx
            rz = target_z + noise.noise(Vector((rx * 0.5, ry * 0.5, 3.5))) * 0.25
            v = bm.verts.new((rx, ry, rz))
            curr_ring.append(v)
            
        for s_idx in range(segments):
            next_s = (s_idx + 1) % segments
            bm.faces.new((prev_ring[s_idx], prev_ring[next_s], curr_ring[next_s], curr_ring[s_idx]))
        prev_ring = curr_ring
        
    # 底部最尖端点封底
    tip_vert = bm.verts.new((0.3, -0.2, -3.6))
    for s_idx in range(segments):
        next_s = (s_idx + 1) % segments
        bm.faces.new((prev_ring[s_idx], prev_ring[next_s], tip_vert))
        
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    
    island_obj = bpy.data.objects.new("Terrain_Island_Base", mesh)
    bpy.context.scene.collection.objects.link(island_obj)
    link_to_collection(island_obj, "Terrain")
    
    # 平滑着色并添加适度 Bevel 增加微缩高光倒角
    bpy.context.view_layer.objects.active = island_obj
    island_obj.select_set(True)
    bpy.ops.object.shade_smooth()
    
    bev = island_obj.modifiers.new(name="Bevel", type='BEVEL')
    bev.width = 0.04
    bev.segments = 2
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(40)
    
    return island_obj

# 4. 创建草地边缘外溢的萌态小草块
def create_grass_overhangs():
    random.seed(101)
    overhang_count = 7
    for i in range(overhang_count):
        angle = (i / overhang_count) * 2 * math.pi + random.uniform(-0.2, 0.2)
        r = 4.95 + random.uniform(0.05, 0.2)
        x = math.cos(angle) * r
        y = math.sin(angle) * r
        z = -0.1 + random.uniform(-0.1, 0.05)
        
        # 用低多边形压扁圆台或立方体充当溢出的草皮团
        bpy.ops.mesh.primitive_cube_add(size=0.45, location=(x, y, z))
        lump = bpy.context.active_object
        lump.name = f"Grass_Overhang_{i+1:02d}"
        lump.scale = (random.uniform(0.7, 1.2), random.uniform(0.5, 0.9), random.uniform(0.4, 0.6))
        lump.rotation_euler = (random.uniform(-0.2, 0.2), random.uniform(-0.2, 0.2), angle)
        
        # 赋予倒角修饰器
        bev = lump.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = 0.03
        bev.segments = 2
        bpy.ops.object.shade_smooth()
        link_to_collection(lump, "Terrain")

# 5. 地台下方漂浮的碎石 (营造神秘浮岛反重力感)
def create_floating_rocks():
    random.seed(202)
    rock_configs = [
        {"loc": (-1.1, 1.4, -4.2), "scale": (0.45, 0.38, 0.52), "rot": (0.3, 0.5, 1.1)},
        {"loc": (1.3, -0.9, -4.6), "scale": (0.35, 0.42, 0.38), "rot": (-0.4, 0.2, 2.3)},
        {"loc": (0.2, 1.8, -4.9), "scale": (0.28, 0.31, 0.35), "rot": (0.6, -0.3, 0.7)},
    ]
    for idx, cfg in enumerate(rock_configs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.6, location=cfg["loc"])
        rock = bpy.context.active_object
        rock.name = f"Floating_Rock_{idx+1:02d}"
        rock.scale = cfg["scale"]
        rock.rotation_euler = cfg["rot"]
        
        # 添加 Bevel 修饰器凸显刻面反光
        bev = rock.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = 0.04
        bev.segments = 2
        bev.limit_method = 'ANGLE'
        bpy.ops.object.shade_smooth()
        link_to_collection(rock, "Terrain")

def main():
    print(">>> 正在初始化场景...")
    reset_scene()
    colls = setup_collections()
    print(">>> 正在生成悬浮地台...")
    island = create_floating_island()
    print(">>> 正在生成边缘外溢草块...")
    create_grass_overhangs()
    print(">>> 正在生成地台下方悬浮碎石...")
    create_floating_rocks()
    print(">>> 阶段一完成！地台与微缩底座构建成功。")

main()
