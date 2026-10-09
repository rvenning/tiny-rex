"""Shared Blender recipe for every Tiny Rex render: terrain, props, creatures.

Run inside Blender:  blender --background --python script.py -- args
One camera, one light rig, one colour pipeline, one set of unit conventions, so
anything rendered by any script composes with anything else in the game.

GAME SPACE (what the game simulation uses)
    gx, gy   ground coordinates in world UNITS (1 unit ~ 1 metre of dinosaur).
    gz       height above ground in units.
    Screen projection (see proj()):   sx = (gx - gy) * COS45 * PPU
                                      sy = (gx + gy) * COS45 * PPU * SQUASH - gz * PPU * VSCALE
    So +gx runs down-right on screen, +gy runs down-left, +gz runs straight up.

BLENDER SPACE
    Blender X = gy, Blender Y = gx, Z up   (see b_xy()).
    The camera sits at +X,+Y,+Z looking toward -X,-Y so that the above holds.
    A model built "facing Blender +Y" and rotated by rotation_euler.z = -heading
    faces game heading `heading` radians, where heading 0 = +gx, pi/2 = +gy.
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

# --------------------------------------------------------------------------- units
PPU = 80.0  # rendered pixels per world unit along a screen axis; game shows it at ~1.25x (100 css px/unit)
ELEV_DEG = 35.264  # true isometric elevation; ground foreshortening = sin(elev)
AZIM_DEG = 45.0
COS45 = math.cos(math.radians(45))
SQUASH = math.sin(math.radians(ELEV_DEG))  # ground Y foreshortening (~0.577)
VSCALE = math.cos(math.radians(ELEV_DEG))  # vertical foreshortening (~0.816)

# Frame / sprite convention. Sprite images are cropped; the manifest stores the
# foot anchor (pixel inside the crop that sits on the ground contact point).
DIRECTIONS = 8  # headings at k * 45 degrees in game space, k = 0..7


def proj(gx, gy, gz=0.0):
    """Game coords -> pixel offset from the world origin at zoom 1.0 (y down)."""
    return (
        (gx - gy) * COS45 * PPU,
        (gx + gy) * COS45 * PPU * SQUASH - gz * PPU * VSCALE,
    )


def b_xy(gx, gy):
    return gy, gx


def args_after_dashes():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


# --------------------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def enable_gpu(scene):
    """Cycles on the GPU when one exists (OptiX > CUDA), else CPU."""
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                return kind
        except Exception:
            continue
    scene.cycles.device = "CPU"
    return "CPU"


def setup_render(scene, w, h, samples=96, transparent=True, denoise=True):
    scene.render.engine = "CYCLES"
    enable_gpu(scene)
    c = scene.cycles
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.use_denoising = denoise
    try:
        c.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    c.max_bounces = 6
    c.diffuse_bounces = 3
    c.glossy_bounces = 3
    c.transmission_bounces = 6
    c.transparent_max_bounces = 16
    c.sample_clamp_indirect = 6.0
    c.use_light_tree = True
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    # Colour pipeline: punchy, warm, saturated storybook look.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"
    return scene


def make_camera(scene, target=(0.0, 0.0, 0.0), ortho_width_px=None, w=None, h=None, shift_px=(0, 0)):
    """Orthographic game camera aimed at game-space `target`.

    ortho_width_px: frame width in pixels at PPU (sets ortho_scale).
    shift_px: (dx, dy) pixel shift of the frame (dy positive = frame moves DOWN
    on screen), used to tile large renders.
    """
    cam_data = bpy.data.cameras.new("GameCam")
    cam_data.type = "ORTHO"
    cam_data.clip_start = 0.1
    cam_data.clip_end = 2000
    w = w or scene.render.resolution_x
    h = h or scene.render.resolution_y
    cam_data.ortho_scale = (ortho_width_px or w) / PPU * (1.0 if w >= h else 1.0)
    cam_data.sensor_fit = "HORIZONTAL"
    cam = bpy.data.objects.new("GameCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Aim: direction toward -X,-Y (Blender) from a point up and toward +X,+Y.
    el = math.radians(ELEV_DEG)
    d = 400.0
    tx, ty = b_xy(target[0], target[1])
    t = Vector((tx, ty, target[2]))
    cam.location = t + Vector(
        (
            d * math.cos(el) * COS45,
            d * math.cos(el) * COS45,
            d * math.sin(el),
        )
    )
    cam.rotation_euler = Euler(
        (math.radians(90 - ELEV_DEG), 0.0, math.radians(135.0)), "XYZ"
    )
    # shift is in units of the larger frame dimension (sensor-fit horizontal -> width)
    cam_data.shift_x = shift_px[0] / w
    cam_data.shift_y = -shift_px[1] / w
    return cam


# --------------------------------------------------------------------------- light
SUN_ELEV = 40.0  # degrees above the horizon
# Where the sun sits relative to the camera, as a screen-space bearing: 0 = from
# screen-left, 90 = from the back (top of the screen). Shadows fall to the
# lower right of the screen.
SUN_BEARING = 125.0  # upper-left, slightly behind
SUN_COLOR = (1.0, 0.86, 0.66)
SUN_STRENGTH = 4.2
SKY_ZENITH = (0.40, 0.58, 0.95)
SKY_HORIZON = (1.00, 0.86, 0.66)
SKY_STRENGTH = 0.95


def sun_vector():
    """Unit vector pointing FROM the ground TOWARD the sun, in Blender space."""
    # screen basis in Blender XY: right = (1,-1)/sqrt2 ... derived from camera yaw 135
    right = Vector((COS45, -COS45, 0.0))
    away = Vector((-COS45, -COS45, 0.0))  # up-screen (away from camera)
    b = math.radians(SUN_BEARING)
    horiz = right * -math.cos(b) + away * math.sin(b)
    horiz.normalize()
    el = math.radians(SUN_ELEV)
    return Vector((horiz.x * math.cos(el), horiz.y * math.cos(el), math.sin(el)))


def setup_lighting(scene, with_world=True, sun_strength=SUN_STRENGTH, sun_size_deg=3.5):
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = sun_strength
    sun_data.color = SUN_COLOR
    sun_data.angle = math.radians(sun_size_deg)
    sun = bpy.data.objects.new("Sun", sun_data)
    scene.collection.objects.link(sun)
    v = sun_vector()
    # Sun lamp points along -Z locally; rotate so -Z -> -v (light travels away from sun)
    sun.rotation_euler = (-v).to_track_quat("-Z", "Y").to_euler()
    if with_world:
        world = bpy.data.worlds.new("World")
        scene.world = world
        world.use_nodes = True
        nt = world.node_tree
        nt.nodes.clear()
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        bg = nt.nodes.new("ShaderNodeBackground")
        out = nt.nodes.new("ShaderNodeOutputWorld")
        nt.links.new(tc.outputs["Generated"], sep.inputs[0])
        # Generated.z in 0..1 across the sphere? Use view vector for a true dome.
        tc2 = nt.nodes.new("ShaderNodeNewGeometry")
        nt.links.new(tc2.outputs["Incoming"], sep.inputs[0])
        math_n = nt.nodes.new("ShaderNodeMath")
        math_n.operation = "MULTIPLY"
        math_n.inputs[1].default_value = -0.5
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        add.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs["Z"], math_n.inputs[0])
        nt.links.new(math_n.outputs[0], add.inputs[0])
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (*SKY_ZENITH, 1)
        ramp.color_ramp.elements[1].position = 0.55
        ramp.color_ramp.elements[1].color = (*SKY_HORIZON, 1)
        nt.links.new(add.outputs[0], ramp.inputs["Fac"])
        bg.inputs["Strength"].default_value = SKY_STRENGTH
        nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
        nt.links.new(bg.outputs[0], out.inputs[0])
    return sun


# --------------------------------------------------------------------------- misc
def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def render_to(scene, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def frame_camera(scene, w, h, anchor_frac=(0.5, 0.75)):
    """Camera for a fixed-size sprite frame: the game-space origin (0,0,0)
    lands exactly on pixel (w*anchor_frac[0], h*anchor_frac[1]) of the image.
    All sprites (props, creatures) use this so anchors are known by construction.
    """
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    ax, ay = w * anchor_frac[0], h * anchor_frac[1]
    return make_camera(scene, target=(0, 0, 0), ortho_width_px=w, w=w, h=h, shift_px=(w / 2 - ax, h / 2 - ay))
