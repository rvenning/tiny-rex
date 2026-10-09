"""Authored breathing, gait and attack poses for the feathered theropod rig."""
import math


def rest_pose(C):
    return {}


def phase(frame, count):
    return frame / max(1, count - 1)


def idle(C, f, n):
    t = math.tau * f / n
    return {"chest": (0.018 * math.sin(t), 0, 0), "neck2": (0.025 * math.sin(t + 0.8), 0, 0),
            "tail3": (0, 0.04 * math.sin(t), 0)}


def run(C, f, n):
    t = math.tau * f / n
    pose = {"root": (0, 0, 0.04 * (1 - math.cos(2 * t))), "chest": (-0.10, 0, 0),
            "neck1": (0.08, 0, 0), "tail2": (0, 0.06 * math.sin(t), 0),
            "humR": (0.08 * math.sin(t), 0, 0), "humL": (-0.08 * math.sin(t), 0, 0), "legs": {}}
    for side, shift in (("R", 0), ("L", math.pi)):
        ball = list(C.sk.legs[side]["rest"]["ball"])
        ball[1] += 0.28 * math.cos(t + shift)
        ball[2] += 0.19 * max(0, math.sin(t + shift))
        pose["legs"][side] = {"ball": ball, "toe": -0.2 * max(0, math.sin(t + shift))}
    return pose


def windup(C, f, n):
    u = phase(f, n)
    return {"root": (0, -0.08 * u, -0.07 * u), "chest": (0.10 * u, 0, 0),
            "neck1": (-0.15 * u, 0, 0), "jaw": (-0.17 * u, 0, 0),
            "humR": (0.2 * u, 0, -0.12 * u), "humL": (0.2 * u, 0, 0.12 * u)}


def bite(C, f, n):
    pulse = math.sin(math.pi * phase(f, n))
    return {"root": (0, 0.12 * pulse, 0), "chest": (-0.16 * pulse, 0, 0),
            "neck1": (0.12 * pulse, 0, 0), "neck3": (-0.12 * pulse, 0, 0),
            "jaw": (-0.38 * pulse, 0, 0), "humR": (-0.15 * pulse, 0, 0), "humL": (-0.15 * pulse, 0, 0)}


def recover(C, f, n):
    u = 1 - phase(f, n)
    return {"chest": (-0.13 * u, 0, 0), "neck2": (0.12 * u, 0, 0), "jaw": (-0.1 * u, 0, 0)}


def hurt(C, f, n):
    pulse = math.sin(math.pi * phase(f, n))
    return {"root": (0, -0.1 * pulse, -0.05 * pulse), "chest": (0.16 * pulse, 0, 0.1 * pulse), "neck2": (-0.12 * pulse, 0, 0)}


def dead(C, f, n):
    u = phase(f, n)
    return {"root": (0, 0, -0.4 * u), "pelvis": (0, 0, 1.15 * u), "neck2": (-0.12 * u, 0, 0), "jaw": (-0.08 * u, 0, 0)}


POSES = {"idle": idle, "run": run, "windup": windup, "bite": bite, "recover": recover, "hurt": hurt, "dead": dead}
NFR = {"idle": 4, "run": 8, "windup": 4, "bite": 4, "recover": 4, "hurt": 3, "dead": 5}
FPS = {"idle": 5, "run": 14, "windup": 8, "bite": 16, "recover": 8, "hurt": 10, "dead": 9}
LOOP = {name: name in ("idle", "run") for name in POSES}
SPECIES_POSES = {"raptor": list(POSES)}
