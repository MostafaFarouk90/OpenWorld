"""Convert Quaternius Farm Animals Horse.fbx to a GLB for public/assets/quaternius-farm-animals/.

    python3 -m venv .venv && .venv/bin/pip install -r tools/assets/blender/requirements.txt
    .venv/bin/python -I tools/assets/blender/convert_horse.py <Horse.fbx> public/assets/quaternius-farm-animals/Horse.glb

Source: https://github.com/tilakpatell/tilakverse-assets at 85064399bbdacc0e8cc50807179490314bc4ff1c,
quaternius/farm-animals/FBX/Horse.fbx (CC0 1.0, Quaternius). The FBX's actions arrive as
"Armature|Armature|Walk"; they are renamed to the bare clip names (Idle, Walk, WalkSlow, Run,
Jump, Death) so the game can look them up directly. Geometry and animation are otherwise unchanged.
"""
import hashlib
import sys

import bpy

EXPECTED_CLIPS = ["Death", "Idle", "Jump", "Run", "Walk", "WalkSlow"]
EXPECTED_FBX_SHA256 = "6db270ddc7591e9a013f96eab445031381fa6d5d68d2feba567f964e0fe68d90"


def main(src: str, dst: str) -> None:
    with open(src, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != EXPECTED_FBX_SHA256:
        raise SystemExit(f"{src}: SHA-256 {digest} does not match the pinned source")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)

    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    clips = []
    # Renaming re-sorts bpy.data.actions, so iterate over a snapshot.
    actions = list(bpy.data.actions)
    for action in actions:
        action.name = action.name.split("|")[-1]
        action.use_fake_user = True
        clips.append(action.name)
    if sorted(clips) != EXPECTED_CLIPS:
        raise SystemExit(f"unexpected clips {sorted(clips)}")
    # Push every action to its own NLA track so the exporter writes each as a named clip.
    arm.animation_data_create()
    for action in actions:
        track = arm.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(action.frame_range[0]), action)
    arm.animation_data.action = None

    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_yup=True,
    )
    with open(dst, "rb") as f:
        print("wrote", dst, hashlib.sha256(f.read()).hexdigest(), "bpy", bpy.app.version_string)


if __name__ == "__main__":
    main(*sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:3])
