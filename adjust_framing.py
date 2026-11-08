"""
微调构图、相机视角、木屋门窗与月亮位置
"""
import bpy
import math
from mathutils import Vector, Euler

# 1. 调整木屋正面木板条，避免挡住正面窗户
for obj in bpy.data.objects:
    if "House_Plank_F" in obj.name:
        # 如果高度落在窗户区域 (0.6 ~ 1.3)，将其移开或缩短宽度避开窗户
        if 0.55 < obj.location.z < 1.35:
            # 缩窄木条至门左侧
            obj.location.x = -0.85
            obj.scale.x = 0.7

# 2. 确保窗户玻璃材质发光正常，窗框十字格清晰
win_glass = bpy.data.objects.get("House_Window_Front_Glass")
if win_glass:
    win_glass.location.y = -0.99 # 稍微靠前，确保不被主体穿透

# 3. 调整月亮位置，使其准确位于相机视野的左上方
moon = bpy.data.objects.get("Moon_Celestial")
if moon:
    moon.location = (-4.8, -2.5, 6.2)
    moon.scale = (1.5, 1.5, 1.5)

# 4. 调整相机机位，完整展现悬浮地台微缩模型、左上月亮与右侧木屋
cam = bpy.data.objects.get("Camera_Main")
if cam:
    cam.data.lens = 50.0
    # 相机后移并微调高度与角度
    cam.location = (-6.2, -14.2, 5.0)
    cam.rotation_euler = (math.radians(72.5), 0, math.radians(-23.5))
    
    # 景深对准木屋主体
    cabin_body = bpy.data.objects.get("House_Body")
    if cabin_body:
        cam.data.dof.focus_object = cabin_body
        cam.data.dof.aperture_fstop = 3.2

# 5. 渲染预览
scene = bpy.context.scene
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.filepath = "E:/workspace/cod/render/test_camera_preview_v2.png"
if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
    scene.eevee.taa_render_samples = 48

bpy.ops.render.render(write_still=True)
print("Preview v2 rendered successfully!")
