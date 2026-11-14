"""
Frontlinie 2 – Soldaten-Schießspiel in 3D-Perspektive (ab ca. 10 Jahren).

Neu gegenüber Frontlinie 1:
  * Die Gegner schießen zurück. Getroffene Kameraden fallen um und können
    gerettet werden (hingehen und E halten).
  * Deckung: Pfeil runter (oder S) halten. Hinter den Sandsäcken treffen
    dich keine Kugeln, und du erholst dich. In Deckung schießt du aber nicht.
  * Spezialwaffen mit langer Ladezeit: 1 Drohnen, 2 Luftunterstützung
    (Kampfhubschrauber), 3 Kampfbomber.
  * Die Gegner bekommen immer bessere Waffen: Raketen, Jeeps, Panzer.
  * Du bekommst schweres Gerät dazu: eigenen Panzer und Raketenwerfer.
  * Vorrücken: Ist ein Gebiet gesichert, drückst du V und die Armee rückt
    vor, über Brücke, Dorf und Bunkerlinie bis zur gegnerischen Basis.
    Wer die Basis zerstört, hat das Level geschafft.

Steuerung:
  Pfeil links / rechts (A / D)   bewegen
  Leertaste (halten)              schießen
  Pfeil runter / S (halten)       in Deckung gehen
  E (halten)                      Kamerad aufhelfen / Fahrzeug reparieren
  X                               Kanonentürme feuern
  1 / 2 / 3                       Drohnen / Luftunterstützung / Kampfbomber
  V                               vorrücken (wenn das Gebiet gesichert ist)
  T                               Kanonentürme an/aus
  P oder Esc                      Pause
  M                               Ton an/aus

Start:  pip install pygame   und dann   python frontlinie2.py
"""

import array
import json
import math
import os
import random
import sys

import pygame

W, H = 960, 640
FPS = 60

# ---------------------------------------------------------------- 3D-Projektion
HORIZON = 230
BOTTOM = 660
FOCAL = 7.0
PX_PER_M = 62
ROAD_HALF = 6.0
Z_FAR = 36.0
PLAYER_Z = 1.8
ALLY_Z = 2.6
COVER_Z = 3.5          # Sandsack-Deckung vor der eigenen Linie
VEHICLE_Z = 4.6
BREACH_Z = 3.0         # erreicht ein Gegner diese Tiefe, ist er durchgebrochen
TOWER_Z = 5.5
TOWER_XS = [-8.6, 8.6]
SECTION_LEN = 28.0     # so weit rückt die Armee pro Abschnitt vor
LANDMARK_Z = 33.0
FORT_Z = 33.0


def scale_at(z):
    return FOCAL / (FOCAL + max(z, -FOCAL + 0.5))


def project(x, z, h=0.0):
    sc = scale_at(z)
    sx = W / 2 + x * PX_PER_M * sc
    sy = HORIZON + (BOTTOM - HORIZON) * sc - h * PX_PER_M * sc
    return sx, sy, sc


# ---------------------------------------------------------------- Farben
WHITE = (255, 255, 255)
INK = (20, 26, 34)
TEXT = (235, 240, 245)
MUTED = (160, 172, 186)
GOLD = (255, 196, 60)
RED = (230, 70, 60)
CYAN = (70, 220, 255)
GREEN = (90, 200, 110)
PANEL = (18, 24, 32)
BOOT = (40, 34, 30)
BELT = (60, 48, 36)
ENEMY_SHOT = (255, 90, 70)

# ---------------------------------------------------------------- Spielwerte
WEAPONS = [
    {"name": "Pistole",        "need": 0,   "rate": 0.38, "dmg": 1, "shots": 1, "spread": 0.0,  "color": (255, 230, 140), "rocket": 0},
    {"name": "Gewehr",         "need": 10,  "rate": 0.26, "dmg": 1, "shots": 1, "spread": 0.0,  "color": (255, 230, 140), "rocket": 0},
    {"name": "Sturmgewehr",    "need": 28,  "rate": 0.13, "dmg": 1, "shots": 1, "spread": 0.0,  "color": (255, 210, 110), "rocket": 0},
    {"name": "Doppel-MG",      "need": 55,  "rate": 0.12, "dmg": 1, "shots": 2, "spread": 0.35, "color": (255, 190, 90),  "rocket": 0},
    {"name": "Plasma-Blaster", "need": 90,  "rate": 0.11, "dmg": 2, "shots": 2, "spread": 0.4,  "color": CYAN,            "rocket": 0},
    {"name": "Gatling-Laser",  "need": 135, "rate": 0.07, "dmg": 2, "shots": 3, "spread": 0.45, "color": (255, 90, 220),  "rocket": 0},
    {"name": "Mega-Kanone",    "need": 190, "rate": 0.07, "dmg": 3, "shots": 3, "spread": 0.5,  "color": (255, 150, 40),  "rocket": 5},
]
ALLY_STEPS = [5, 16, 32, 55, 85, 120]
ALLY_OFFSETS = [-1.5, 1.5, -3.0, 3.0, -4.5, 4.5]
TOWER_LEVELS = [
    {"need": 20,  "name": "Kanonenturm",       "count": 1, "reload": 3.0, "kind": "shell",  "n": 1, "dmg": 4, "radius": 2.2},
    {"need": 50,  "name": "Zwei Kanonentürme", "count": 2, "reload": 2.6, "kind": "shell",  "n": 1, "dmg": 4, "radius": 2.2},
    {"need": 95,  "name": "Doppelkanone",      "count": 2, "reload": 2.2, "kind": "shell",  "n": 2, "dmg": 5, "radius": 2.5},
    {"need": 150, "name": "Raketenturm",       "count": 2, "reload": 1.9, "kind": "rocket", "n": 2, "dmg": 6, "radius": 2.8},
    {"need": 210, "name": "Mega-Turm",         "count": 2, "reload": 1.4, "kind": "rocket", "n": 3, "dmg": 8, "radius": 3.3},
]
SPECIALS = [
    {"key": "1", "name": "Drohnen",            "need": 15,  "reload": 22.0},
    {"key": "2", "name": "Luftunterstützung",  "need": 60,  "reload": 35.0},
    {"key": "3", "name": "Kampfbomber",        "need": 110, "reload": 50.0},
]
# Gegner: hp, Tempo, Größe, Punkte, Waffe, Schüsse pro Sekunde
ENEMIES = {
    "rekrut":     {"hp": 1,  "speed": 2.4, "size": 0.95, "pts": 10,  "gun": "gewehr",  "rate": 0.18},
    "soldat":     {"hp": 2,  "speed": 2.6, "size": 1.0,  "pts": 20,  "gun": "gewehr",  "rate": 0.25},
    "elite":      {"hp": 4,  "speed": 2.8, "size": 1.04, "pts": 40,  "gun": "mg",      "rate": 0.35},
    "raketen":    {"hp": 3,  "speed": 2.0, "size": 1.02, "pts": 40,  "gun": "rakete",  "rate": 0.15},
    "schwer":     {"hp": 8,  "speed": 1.8, "size": 1.12, "pts": 80,  "gun": "mg",      "rate": 0.4},
    "kommandant": {"hp": 15, "speed": 1.6, "size": 1.16, "pts": 200, "gun": "mg",      "rate": 0.45},
    "jeep":       {"hp": 12, "speed": 3.0, "size": 1.0,  "pts": 120, "gun": "mg",      "rate": 0.5},
    "panzer":     {"hp": 30, "speed": 1.1, "size": 1.0,  "pts": 300, "gun": "granate", "rate": 0.22},
}
VEHICLES = ("jeep", "panzer")

# Abschnitte des Levels. "goal" = so viele Gegner müssen besiegt werden.
SECTIONS = [
    {"name": "Waldweg",     "next": "Brücke",      "goal": 60, "enemies": {"rekrut": 6, "soldat": 3}},
    {"name": "Brücke",      "next": "Dorf",        "goal": 90, "enemies": {"rekrut": 3, "soldat": 5, "elite": 2, "jeep": 0.6}},
    {"name": "Dorf",        "next": "Bunkerlinie", "goal": 120, "enemies": {"soldat": 4, "elite": 3, "raketen": 2, "schwer": 1, "jeep": 0.8, "panzer": 0.3}},
    {"name": "Bunkerlinie", "next": "Basis",       "goal": 0,  "enemies": {"soldat": 3, "elite": 3, "raketen": 2, "schwer": 2, "kommandant": 0.6, "jeep": 0.8, "panzer": 0.6}},
]
CHECKPOINTS = ["Start", "Brücke", "Dorf", "Bunker", "Basis"]
FORT_HP = 600
PLAYER_HP = 12
ALLY_HP = 3
LIVES = 5
# Wie stark die Gegner gegen die eigene Armee drücken (0.5 = leicht, 0.85 = normal, 1.0 = schwer).
# Über 1.0 kann die Armee irgendwann nicht mehr alle schaffen.
SCHWIERIGKEIT = 0.85

SAVE_FILE = os.path.join(os.path.expanduser("~"), ".frontlinie2.json")


def load_settings():
    try:
        with open(SAVE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_settings(data):
    try:
        with open(SAVE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except OSError:
        pass


# ---------------------------------------------------------------- Töne
class Sounds:
    def __init__(self):
        self.ok = False
        self.muted = False
        try:
            pygame.mixer.init(frequency=22050, size=-16, channels=1)
            pygame.mixer.set_num_channels(32)
            self.ok = True
        except pygame.error:
            return
        self.shot = self._tone(180, 0.07, 0.22, wave="noise", slide=-60)
        self.eshot = self._tone(140, 0.06, 0.1, wave="noise", slide=-40)
        self.laser = self._tone(1200, 0.09, 0.12, wave="square", slide=-800)
        self.hit = self._tone(400, 0.05, 0.12, wave="square", slide=-150)
        self.ouch = self._tone(300, 0.12, 0.2, wave="square", slide=-180)
        self.down = self._tone(240, 0.18, 0.25, wave="tri", slide=-140)
        self.cannon = self._tone(90, 0.4, 0.5, wave="noise", slide=-40)
        self.boom = self._tone(70, 0.5, 0.55, wave="noise", slide=-30)
        self.ping = self._tone(1500, 0.05, 0.08, wave="tri", slide=-500)
        self.up = self._tone(520, 0.1, 0.3, wave="square", then=(780, 0.18))
        self.alarm = self._tone(440, 0.25, 0.25, wave="saw", slide=-200)
        self.jet = self._tone(300, 1.2, 0.3, wave="noise", slide=-200)

    def _tone(self, freq, dur, vol, slide=0, wave="sine", then=None):
        rate = 22050
        parts = [(freq, dur, slide)] + ([(then[0], then[1], 0)] if then else [])
        buf = array.array("h")
        rnd = random.Random(1)
        for f0, d, sl in parts:
            n = int(rate * d)
            phase = 0.0
            last = 0.0
            for i in range(n):
                t = i / n
                phase += (f0 + sl * t) / rate
                p = phase % 1.0
                if wave == "square":
                    s = 0.6 if p < 0.5 else -0.6
                elif wave == "tri":
                    s = 4 * abs(p - 0.5) - 1
                elif wave == "saw":
                    s = 2 * p - 1
                elif wave == "noise":
                    last = last * 0.6 + rnd.uniform(-1, 1) * 0.4
                    s = last * 1.6 + math.sin(2 * math.pi * p) * 0.6
                else:
                    s = math.sin(2 * math.pi * p)
                env = (1 - t) ** 2
                buf.append(int(max(-1, min(1, s)) * env * vol * 32767))
        return pygame.mixer.Sound(buffer=buf.tobytes())

    def play(self, name):
        if self.ok and not self.muted:
            getattr(self, name).play()


# ---------------------------------------------------------------- Soldaten zeichnen
SPRITE_W, SPRITE_H = 100, 150
SPRITE_METERS = 2.4

PALETTES = {
    "rekrut":     {"uniform": (122, 116, 98),  "pants": (98, 92, 78),  "vest": (110, 104, 88), "helmet": (88, 84, 70),  "bulk": 0.95, "hat": "cap"},
    "soldat":     {"uniform": (110, 108, 96),  "pants": (86, 84, 74),  "vest": (92, 90, 80),   "helmet": (78, 80, 70),  "bulk": 1.0,  "hat": "helmet"},
    "elite":      {"uniform": (96, 100, 108),  "pants": (74, 78, 86),  "vest": (70, 74, 82),   "helmet": (62, 66, 74),  "bulk": 1.05, "hat": "helmet"},
    "raketen":    {"uniform": (104, 96, 84),   "pants": (84, 78, 68),  "vest": (90, 82, 70),   "helmet": (70, 66, 56),  "bulk": 1.02, "hat": "helmet", "tube": True},
    "schwer":     {"uniform": (84, 86, 90),    "pants": (64, 66, 70),  "vest": (58, 60, 64),   "helmet": (52, 54, 58),  "bulk": 1.22, "hat": "visor"},
    "kommandant": {"uniform": (92, 78, 70),    "pants": (70, 60, 54),  "vest": (80, 66, 58),   "helmet": (170, 40, 40), "bulk": 1.15, "hat": "beret"},
    "kamerad":    {"uniform": (74, 104, 62),   "pants": (60, 84, 52),  "vest": (88, 112, 70),  "helmet": (66, 92, 56),  "bulk": 1.0,  "pack": (96, 84, 60)},
    "held":       {"uniform": (34, 38, 46),    "pants": (28, 30, 36),  "vest": (46, 52, 62),   "helmet": (26, 28, 34),  "bulk": 1.3,  "pack": (40, 46, 56)},
}

_sprite_cache = {}


def _rect(s, color, x, y, w, h, rad=0):
    pygame.draw.rect(s, color, (int(x), int(y), int(w), int(h)), border_radius=rad)


def draw_back_gun(s, gx, gy, lvl):
    if lvl == 0:
        _rect(s, (50, 50, 56), gx - 3, gy - 22, 7, 24, 2)
    elif lvl == 1:
        _rect(s, (90, 70, 48), gx - 4, gy - 8, 9, 14, 2)
        _rect(s, (50, 52, 58), gx - 2, gy - 46, 5, 44, 2)
    elif lvl == 2:
        _rect(s, (44, 46, 52), gx - 4, gy - 50, 9, 56, 3)
        _rect(s, (30, 30, 34), gx + 4, gy - 22, 6, 14, 2)
    elif lvl == 3:
        _rect(s, (44, 46, 52), gx - 7, gy - 52, 6, 58, 2)
        _rect(s, (44, 46, 52), gx + 2, gy - 52, 6, 58, 2)
        _rect(s, (70, 72, 80), gx - 9, gy - 18, 19, 14, 3)
    elif lvl == 4:
        _rect(s, (40, 60, 80), gx - 8, gy - 56, 17, 62, 6)
        _rect(s, CYAN, gx - 3, gy - 54, 7, 50, 3)
    elif lvl == 5:
        _rect(s, (70, 30, 70), gx - 10, gy - 20, 21, 26, 5)
        for dx in (-7, -2, 3, 8):
            _rect(s, (255, 110, 230), gx + dx - 2, gy - 60, 4, 42, 2)
    else:
        _rect(s, (60, 46, 30), gx - 12, gy - 24, 25, 30, 6)
        _rect(s, (255, 150, 40), gx - 9, gy - 66, 19, 46, 6)
        _rect(s, (255, 220, 120), gx - 4, gy - 64, 9, 40, 4)


def make_sprite(kind, frame, lvl=0):
    """frame 0..3 = Laufen, 4 = in Deckung (kniend)."""
    if frame == 4:
        full = make_sprite(kind, 0, lvl)
        s = pygame.Surface((SPRITE_W, SPRITE_H), pygame.SRCALPHA)
        b = SPRITE_H - 4
        cut = b - 44
        # Oberkörper tiefer setzen, Beine kniend
        s.blit(full, (0, 40), (0, 0, SPRITE_W, cut - 14))
        p = PALETTES[kind]
        bulk = p["bulk"]
        cx = SPRITE_W // 2
        lw = 11 * bulk
        _rect(s, p["pants"], cx - 3 - lw - 6, b - 16, lw + 14, 14, 5)
        _rect(s, p["pants"], cx + 3, b - 16, lw + 8, 14, 5)
        _rect(s, BOOT, cx + 6, b - 8, lw + 6, 8, 3)
        return s

    p = PALETTES[kind]
    s = pygame.Surface((SPRITE_W, SPRITE_H), pygame.SRCALPHA)
    cx, b = SPRITE_W // 2, SPRITE_H - 4
    bulk = p["bulk"]
    swing = [0, 5, 0, -5][frame]
    lw = 11 * bulk
    lift_l, lift_r = max(0, swing), max(0, -swing)
    _rect(s, p["pants"], cx - 3 - lw, b - 44, lw, 38 - lift_l, 3)
    _rect(s, p["pants"], cx + 3, b - 44, lw, 38 - lift_r, 3)
    _rect(s, BOOT, cx - 5 - lw, b - 9 - lift_l, lw + 4, 9, 3)
    _rect(s, BOOT, cx + 1, b - 9 - lift_r, lw + 4, 9, 3)
    tw = 38 * bulk
    _rect(s, p["uniform"], cx - tw / 2, b - 88, tw, 48, 9)
    _rect(s, p["vest"], cx - tw / 2 + 4, b - 84, tw - 8, 36, 6)
    _rect(s, BELT, cx - tw / 2, b - 47, tw, 6)

    if "pack" in p:
        _rect(s, p["pack"], cx - 15 * bulk, b - 84, 30 * bulk, 32, 7)
        _rect(s, p["uniform"], cx - tw / 2 - 8, b - 84, 10, 32, 5)
        _rect(s, p["uniform"], cx + tw / 2 - 3, b - 86, 10, 22, 5)
        if kind == "held":
            for sx in (cx - tw / 2, cx + tw / 2):
                pygame.draw.circle(s, (56, 62, 74), (int(sx), b - 84), int(10 * bulk))
                pygame.draw.circle(s, (80, 88, 104), (int(sx), b - 84), int(10 * bulk), 2)
            _rect(s, CYAN, cx - 10, b - 76, 20, 3, 1)
            _rect(s, CYAN, cx - 10, b - 66, 20, 3, 1)
            pygame.draw.line(s, (90, 96, 110), (cx + 8, b - 112), (cx + 14, b - 132), 2)
            pygame.draw.circle(s, RED, (cx + 14, b - 133), 3)
        hb = min(bulk, 1.15)
        pygame.draw.circle(s, p["helmet"], (cx, b - 100), int(13 * hb))
        pygame.draw.ellipse(s, p["helmet"], (cx - 16 * hb, b - 98, 32 * hb, 9))
        if kind == "held":
            pygame.draw.arc(s, CYAN, (cx - 13, b - 113, 26, 26), math.pi * 0.15, math.pi * 0.85, 2)
        draw_back_gun(s, cx + tw / 2 + 2, b - 76, lvl)
    else:
        skin = (214, 172, 136)
        if p.get("tube"):
            _rect(s, (70, 80, 60), cx + 4, b - 118, 12, 60, 5)                # Raketenrohr auf der Schulter
            pygame.draw.circle(s, (30, 30, 30), (cx + 10, b - 117), 6)
        else:
            pygame.draw.line(s, (40, 40, 44), (cx - tw / 2 - 6, b - 58), (cx + tw / 2 + 10, b - 80), 6)
        pygame.draw.circle(s, skin, (int(cx - tw / 2 + 2), b - 60), 5)
        pygame.draw.circle(s, skin, (int(cx + tw / 2 - 2), b - 74), 5)
        pygame.draw.circle(s, skin, (cx, b - 100), 12)
        pygame.draw.circle(s, INK, (cx - 4, b - 100), 2)
        pygame.draw.circle(s, INK, (cx + 4, b - 100), 2)
        pygame.draw.line(s, INK, (cx - 7, b - 105), (cx - 2, b - 103), 2)
        pygame.draw.line(s, INK, (cx + 7, b - 105), (cx + 2, b - 103), 2)
        pygame.draw.line(s, (120, 80, 70), (cx - 3, b - 94), (cx + 3, b - 94), 2)
        hat = p["hat"]
        if hat == "cap":
            pygame.draw.circle(s, p["helmet"], (cx, b - 104), 12, draw_top_left=True, draw_top_right=True)
            _rect(s, p["helmet"], cx - 13, b - 106, 26, 4, 2)
        elif hat == "beret":
            pygame.draw.ellipse(s, p["helmet"], (cx - 15, b - 118, 28, 12))
            pygame.draw.circle(s, GOLD, (cx + 10, b - 76), 4)
        else:
            pygame.draw.circle(s, p["helmet"], (cx, b - 103), 14, draw_top_left=True, draw_top_right=True)
            _rect(s, p["helmet"], cx - 16, b - 105, 32, 5, 2)
            if hat == "visor":
                _rect(s, (30, 32, 36), cx - 11, b - 103, 22, 7, 2)
                _rect(s, (120, 200, 255), cx - 8, b - 101, 16, 2, 1)
    return s


def soldier_image(kind, frame, lvl, size, sc):
    h = SPRITE_METERS * size * PX_PER_M * sc
    hq = max(6, int(h / 2) * 2)
    key = (kind, frame, lvl, hq)
    img = _sprite_cache.get(key)
    if img is None:
        base_key = (kind, frame, lvl, "base")
        base = _sprite_cache.get(base_key)
        if base is None:
            base = make_sprite(kind, frame, lvl)
            _sprite_cache[base_key] = base
        img = pygame.transform.smoothscale(base, (max(4, int(hq * SPRITE_W / SPRITE_H)), hq))
        if len(_sprite_cache) > 4000:
            _sprite_cache.clear()
        _sprite_cache[key] = img
    return img


# ---------------------------------------------------------------- Hilfen
def text(surf, font, msg, pos, color, align="center", shadow=True):
    img = font.render(msg, True, color)
    rect = img.get_rect()
    setattr(rect, {"center": "center", "left": "midleft", "right": "midright"}[align], (int(pos[0]), int(pos[1])))
    if shadow:
        surf.blit(font.render(msg, True, (0, 0, 0)), rect.move(2, 2))
    surf.blit(img, rect)


def alpha_rect(surf, color, rect, alpha, radius=0):
    if rect[2] < 1 or rect[3] < 1:
        return
    s = pygame.Surface((int(rect[2]), int(rect[3])), pygame.SRCALPHA)
    pygame.draw.rect(s, (*color, max(0, min(255, alpha))), (0, 0, int(rect[2]), int(rect[3])), border_radius=radius)
    surf.blit(s, (int(rect[0]), int(rect[1])))


def bar(surf, x, y, w, h, frac, color, back=(40, 46, 56)):
    pygame.draw.rect(surf, back, (int(x), int(y), int(w), int(h)), border_radius=h // 2)
    if frac > 0:
        pygame.draw.rect(surf, color, (int(x), int(y), max(2, int(w * min(1, frac))), int(h)), border_radius=h // 2)


def shield(surf, x, y, filled):
    color = GREEN if filled else (60, 70, 80)
    pts = [(x - 8, y), (x + 8, y), (x + 8, y + 9), (x, y + 16), (x - 8, y + 9)]
    pygame.draw.polygon(surf, color, pts)
    pygame.draw.polygon(surf, (20, 30, 20), pts, 2)


def blend(c1, c2, k):
    return tuple(int(a + (b - a) * k) for a, b in zip(c1, c2))


# ---------------------------------------------------------------- Spielobjekte
class Enemy:
    def __init__(self, kind, speed_mul, z_start=Z_FAR, hp_mul=1.0):
        d = ENEMIES[kind]
        self.kind = kind
        self.vehicle = kind in VEHICLES
        self.hp = self.max = max(1, round(d["hp"] * hp_mul))
        self.speed = d["speed"] * speed_mul * random.uniform(0.9, 1.1)
        self.size = d["size"]
        self.pts = d["pts"]
        self.gun = d["gun"]
        self.rate = d["rate"]
        lim = ROAD_HALF - (1.6 if self.vehicle else 0.6)
        self.x = self.base_x = random.uniform(-lim, lim)
        self.z = z_start + random.uniform(0, 3)
        self.phase = random.uniform(0, math.tau)
        self.fire_cd = random.uniform(0.4, 2.0)
        self.hit_t = 0.0
        self.dying = -1.0
        self.fall_dir = random.choice((-1, 1))
        self.gone = False

    @property
    def alive(self):
        return self.dying < 0 and not self.gone


class Member:
    """Ein eigener Soldat oder ein eigenes Fahrzeug."""

    def __init__(self, kind, offset=0.0, z=ALLY_Z, hp=ALLY_HP):
        self.kind = kind            # held | kamerad | panzer | werfer
        self.offset = offset        # Abstand zum Spieler (Soldaten) oder feste x-Position (Fahrzeuge)
        self.z = z
        self.hp = self.max = hp
        self.down = False           # umgefallen / außer Gefecht
        self.down_t = 0.0
        self.revive = 0.0
        self.fire_cd = random.uniform(0.5, 1.5)
        self.hit_t = 0.0
        self.x = 0.0


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Frontlinie 2")
        self.screen = pygame.display.set_mode((W, H), pygame.SCALED | pygame.RESIZABLE)
        self.clock = pygame.time.Clock()
        self.font_huge = pygame.font.Font(None, 96)
        self.font_big = pygame.font.Font(None, 58)
        self.font_mid = pygame.font.Font(None, 38)
        self.font = pygame.font.Font(None, 28)
        self.font_small = pygame.font.Font(None, 22)
        self.font_tiny = pygame.font.Font(None, 18)
        self.sounds = Sounds()

        self.settings = load_settings()
        self.towers_on = self.settings.get("towers", True)
        self.best = self.settings.get("best", 0)
        self.sounds.muted = self.settings.get("muted", False)

        self.sky = self.make_sky()
        self.props = self.make_props()
        self.toggle_box = pygame.Rect(W // 2 - 170, 430, 340, 54)
        self.start_box = pygame.Rect(W // 2 - 130, 508, 260, 66)
        self.pause_box = pygame.Rect(W - 54, 12, 42, 42)
        self.hud_toggle_box = pygame.Rect(W - 176, 12, 112, 42)
        self.state = "menu"
        self.new_game()

    # ---------- Zustand
    def new_game(self):
        self.t = 0.0
        self.sec_t = 0.0
        self.x = 0.0
        self.score = 0
        self.pops = 0
        self.lives = LIVES
        self.weapon = 0
        self.tower_lvl = -1
        self.fire_cd = 0.0
        self.shot_count = 0
        self.tower_cd = 0.0
        self.special_cd = [0.0, 0.0, 0.0]
        self.muzzle_t = 0.0
        self.spawn_cd = 2.0
        self.player = Member("held", 0.0, PLAYER_Z, PLAYER_HP)
        self.allies = []
        self.vehicles = []
        self.invuln = 0.0
        self.ducking = False
        self.enemies = []
        self.bullets = []
        self.ebullets = []
        self.shells = []
        self.effects = []
        self.aircraft = []
        self.texts = []
        self.shake = 0.0
        self.flash = 0.0
        self.new_best = False
        # Level
        self.section = 0
        self.sec_pops = 0
        self.scroll = 0.0
        self.advancing = 0.0       # > 0: Armee rückt gerade vor
        self.secured = False
        self.secured_t = 0.0
        self.fort_hp = FORT_HP
        self.fort_hit = 0.0
        self.won = False

    def save(self):
        self.settings.update(towers=self.towers_on, best=self.best, muted=self.sounds.muted)
        save_settings(self.settings)

    def toggle_towers(self):
        self.towers_on = not self.towers_on
        self.save()
        self.sounds.play("hit")

    def start(self):
        self.new_game()
        self.state = "play"
        self.sounds.play("up")
        self.say("Abschnitt 1: " + SECTIONS[0]["name"], GOLD)

    def say(self, msg, color=GOLD, big=True, y=None):
        self.texts.append({"msg": msg, "x": W / 2, "y": y, "color": color, "big": big, "life": 2.2})

    def squad(self):
        """Alle eigenen Leute und Fahrzeuge, mit aktueller x-Position."""
        self.player.x = self.x
        lim = ROAD_HALF + 2.5
        for a in self.allies:
            if not a.down:
                a.x = max(-lim, min(lim, self.x + a.offset))
        for v in self.vehicles:
            v.x = v.offset
        return [self.player] + self.allies + self.vehicles

    def squad_extent(self):
        offs = [0] + [a.offset for a in self.allies]
        return min(offs), max(offs)

    def fort_active(self):
        return self.section == len(SECTIONS) - 1 and self.fort_hp > 0 and not self.advancing

    # ---------- Eingabe
    def on_key(self, key):
        if key == pygame.K_m:
            self.sounds.muted = not self.sounds.muted
            self.save()
            return
        if self.state in ("menu", "over", "win"):
            if key in (pygame.K_t, pygame.K_UP):
                self.toggle_towers()
            elif key in (pygame.K_SPACE, pygame.K_RETURN):
                self.start()
            elif key == pygame.K_ESCAPE:
                self.quit()
            return
        if key in (pygame.K_p, pygame.K_ESCAPE):
            self.state = "play" if self.state == "pause" else "pause"
            return
        if self.state != "play":
            return
        if key == pygame.K_t:
            self.toggle_towers()
            self.say("Kanonentürme AN" if self.towers_on else "Kanonentürme AUS", TEXT, False)
        elif key in (pygame.K_x, pygame.K_c):
            self.fire_towers()
        elif key in (pygame.K_1, pygame.K_KP1):
            self.use_special(0)
        elif key in (pygame.K_2, pygame.K_KP2):
            self.use_special(1)
        elif key in (pygame.K_3, pygame.K_KP3):
            self.use_special(2)
        elif key == pygame.K_v:
            self.advance()

    def on_click(self, pos):
        if self.state in ("menu", "over", "win"):
            if self.toggle_box.collidepoint(pos):
                self.toggle_towers()
            elif self.start_box.collidepoint(pos):
                self.start()
        elif self.pause_box.collidepoint(pos):
            self.state = "play" if self.state == "pause" else "pause"
        elif self.hud_toggle_box.collidepoint(pos):
            self.toggle_towers()

    def quit(self):
        self.save()
        pygame.quit()
        sys.exit()

    # ---------- Fortschritt
    def check_upgrades(self):
        w = max(i for i, wp in enumerate(WEAPONS) if self.pops >= wp["need"])
        if w > self.weapon:
            self.weapon = w
            self.sounds.play("up")
            self.say("Neue Waffe: " + WEAPONS[w]["name"] + "!")
        n = sum(1 for need in ALLY_STEPS if self.pops >= need)
        while len(self.allies) < n:
            self.allies.append(Member("kamerad", ALLY_OFFSETS[len(self.allies)]))
            self.sounds.play("up")
            self.say("Verstärkung! " + str(len(self.allies) + 1) + " Soldaten", GREEN)
        tl = max([i for i, tw in enumerate(TOWER_LEVELS) if self.pops >= tw["need"]], default=-1)
        if tl > self.tower_lvl:
            self.tower_lvl = tl
            if self.towers_on:
                self.sounds.play("up")
                self.say(TOWER_LEVELS[tl]["name"] + (" bereit! Drücke X" if tl == 0 else " freigeschaltet!"), CYAN)
        for i, sp in enumerate(SPECIALS):
            if self.pops == sp["need"]:
                self.sounds.play("up")
                self.say(f"Spezialwaffe: {sp['name']}! Taste {sp['key']}", (255, 140, 60))

    def special_ready(self, i):
        return self.pops >= SPECIALS[i]["need"] and self.special_cd[i] <= 0

    def weapon_dps(self, lvl, slow=1.0):
        wp = WEAPONS[lvl]
        return wp["dmg"] * wp["shots"] / (wp["rate"] * slow)

    def army_dps(self):
        dps = self.weapon_dps(self.weapon) * 0.6
        up = sum(1 for a in self.allies if not a.down)
        dps += up * self.weapon_dps(max(0, self.weapon - 1), 1.4) * 0.45
        for v in self.vehicles:
            if not v.down:
                dps += 3.5 if v.kind == "panzer" else 4.0
        if self.towers_on and self.tower_lvl >= 0:
            tw = TOWER_LEVELS[self.tower_lvl]
            dps += tw["count"] * tw["n"] * tw["dmg"] / tw["reload"] * 0.5
        return dps

    def enemy_weights(self):
        return SECTIONS[self.section]["enemies"]

    def spawn_enemy(self):
        weights = self.enemy_weights()
        kinds = list(weights)
        kind = random.choices(kinds, [weights[k] for k in kinds])[0]
        z0 = FORT_Z - 1.5 if self.fort_active() else Z_FAR
        self.enemies.append(Enemy(kind, 1 + self.section * 0.06, z0, self.enemy_armor()))

    def enemy_armor(self):
        """Die Gegner rüsten mit: je besser die eigene Waffe, desto mehr halten sie aus."""
        return 1 + 0.45 * self.weapon

    def next_spawn_delay(self):
        weights = self.enemy_weights()
        total = sum(weights.values())
        avg_hp = sum(ENEMIES[k]["hp"] * w for k, w in weights.items()) / total * self.enemy_armor()
        # Mit der Zeit kommen immer mehr Gegner pro Sekunde, aber nie mehr,
        # als die eigene Armee schaffen kann.
        wanted = 0.6 + self.sec_t / 40 + 0.35 * self.section
        possible = SCHWIERIGKEIT * self.army_dps() / avg_hp
        rate = min(wanted, possible)
        return max(0.15, min(2.6, 1 / rate)) * random.uniform(0.75, 1.25)

    def max_enemies(self):
        return 10 + 3 * (len(self.allies) + 1) + 2 * self.section

    def advance(self):
        if not self.secured or self.advancing:
            return
        self.secured = False
        self.advancing = 4.0
        self.sounds.play("up")
        self.say("Vorrücken!", GOLD)

    def finish_advance(self):
        self.section += 1
        self.sec_pops = 0
        self.sec_t = 0.0
        self.spawn_cd = 2.5
        sec = SECTIONS[self.section]
        # Alle Kameraden stehen wieder auf, Fahrzeuge werden repariert
        for m in self.allies + self.vehicles:
            m.down = False
            m.hp = m.max
        self.player.hp = self.player.max
        if self.section == 1:
            self.vehicles.append(Member("panzer", -4.6, VEHICLE_Z, 25))
            self.say("Schweres Gerät: Panzer!", CYAN, True)
        if self.section == 2:
            self.vehicles.append(Member("werfer", 4.6, VEHICLE_Z, 20))
            self.say("Schweres Gerät: Raketenwerfer!", CYAN, True)
        self.say(f"Checkpoint erreicht: {CHECKPOINTS[self.section]}", GOLD)
        if self.section == len(SECTIONS) - 1:
            self.say("Zerstöre die gegnerische Basis!", RED)
        else:
            self.say(f"Abschnitt {self.section + 1}: {sec['name']}", TEXT, False)

    # ---------- eigene Waffen
    def shoot(self):
        wp = WEAPONS[self.weapon]
        self.shot_count += 1
        rocket = wp["rocket"] and self.shot_count % wp["rocket"] == 0
        n = wp["shots"]
        for i in range(n):
            off = 0 if n == 1 else -wp["spread"] + 2 * wp["spread"] * i / (n - 1)
            self.bullets.append({"x": self.x + 0.35 + off, "z": PLAYER_Z + 0.6, "vx": 0.0, "vz": 48.0,
                                 "dmg": wp["dmg"], "color": wp["color"], "rocket": False, "big": self.weapon >= 4})
        if rocket:
            self.bullets.append({"x": self.x + 0.35, "z": PLAYER_Z + 0.6, "vx": 0.0, "vz": 34.0,
                                 "dmg": 4, "color": (255, 150, 40), "rocket": True, "big": True})
        self.muzzle_t = 0.06
        self.sounds.play("laser" if self.weapon in (4, 5) else "shot")

    def ally_shoot(self, a):
        wp = WEAPONS[max(0, self.weapon - 1)]
        near = [e for e in self.enemies if e.alive and abs(e.x - a.x) < 3.0 and e.z < Z_FAR - 4]
        vx = 0.0
        if near:
            tgt = min(near, key=lambda e: e.z)
            travel = max(0.2, (tgt.z - ALLY_Z) / 44.0)
            vx = (tgt.x - a.x) / travel
        elif not self.fort_active():
            return
        for k in range(wp["shots"]):
            off = 0 if wp["shots"] == 1 else (k - (wp["shots"] - 1) / 2) * 0.3
            self.bullets.append({"x": a.x + 0.3 + off, "z": ALLY_Z + 0.5, "vx": vx, "vz": 44.0,
                                 "dmg": wp["dmg"], "color": wp["color"], "rocket": False, "big": False})

    def pick_target(self, x, z, reach=99):
        targets = [e for e in self.enemies if e.alive and e.z < Z_FAR - 1 and abs(e.x - x) < reach]
        if targets:
            return min(targets, key=lambda e: e.z)
        return None

    def aim_point(self, tgt):
        if tgt:
            return tgt.x, max(BREACH_Z + 1, tgt.z - tgt.speed * 0.8)
        if self.fort_active():
            return random.uniform(-3, 3), FORT_Z
        return random.uniform(-4, 4), random.uniform(12, 25)

    def lob(self, x, z, h, tgt, dmg, radius, kind="shell", delay=0.0, dur=0.8):
        ax, az = self.aim_point(tgt)
        self.shells.append({"kind": kind, "x": x, "z": z, "h": h, "sx": x, "sz": z, "sh": h, "tx": ax, "tz": az,
                            "t": -delay, "dur": dur, "target": tgt, "dmg": dmg, "radius": radius})

    def fire_towers(self):
        if not self.towers_on or self.tower_lvl < 0 or self.tower_cd > 0:
            return
        tw = TOWER_LEVELS[self.tower_lvl]
        self.tower_cd = tw["reload"]
        self.shake = 0.18
        self.sounds.play("cannon")
        targets = sorted([e for e in self.enemies if e.alive and e.z < Z_FAR - 1], key=lambda e: e.z)
        for ti in range(tw["count"]):
            tx = TOWER_XS[ti]
            for k in range(tw["n"]):
                tgt = targets[(ti * tw["n"] + k) % len(targets)] if targets else None
                self.lob(tx, TOWER_Z, 4.2, tgt, tw["dmg"], tw["radius"], tw["kind"], k * 0.12)
            self.effects.append({"kind": "flash", "x": tx, "z": TOWER_Z, "h": 4.3, "life": 0.15, "max": 0.15})

    def use_special(self, i):
        sp = SPECIALS[i]
        if self.pops < sp["need"]:
            self.say(f"{sp['name']} gibt es ab {sp['need']} Treffern", MUTED, False)
            return
        if self.special_cd[i] > 0:
            return
        self.special_cd[i] = sp["reload"]
        self.sounds.play("up")
        if i == 0:
            # Drohnen fliegen los und suchen sich je ein Ziel
            for k in range(5):
                self.aircraft.append({"kind": "drohne", "x": self.x + (k - 2) * 1.2, "z": 0.5, "h": 3.0,
                                      "target": None, "t": -k * 0.15, "life": 8.0})
            self.say("Drohnen gestartet!", CYAN, False)
        elif i == 1:
            self.aircraft.append({"kind": "heli", "x": -9.0, "z": 9.0, "h": 7.0, "t": 0.0, "life": 7.0, "fire": 0.0})
            self.say("Luftunterstützung im Anflug!", CYAN, False)
        else:
            self.aircraft.append({"kind": "bomber", "x": 0.0, "z": -6.0, "h": 11.0, "t": 0.0, "life": 4.0, "drop": 0.0})
            self.sounds.play("jet")
            self.say("Kampfbomber!", (255, 140, 60))

    def fire_vehicle(self, v):
        if v.kind == "panzer":
            tgt = self.pick_target(v.x, v.z)
            if tgt or self.fort_active():
                v.fire_cd = 1.8
                self.sounds.play("cannon")
                self.lob(v.x, v.z + 1.5, 1.6, tgt, 8, 2.5, "shell", dur=0.6)
                self.effects.append({"kind": "flash", "x": v.x, "z": v.z + 1.8, "h": 1.6, "life": 0.12, "max": 0.12})
        else:
            if any(e.alive and e.z < Z_FAR - 1 for e in self.enemies) or self.fort_active():
                v.fire_cd = 4.5
                targets = sorted([e for e in self.enemies if e.alive and e.z < Z_FAR - 1], key=lambda e: -e.hp)
                for k in range(4):
                    tgt = targets[k % len(targets)] if targets else None
                    self.lob(v.x, v.z + 0.5, 2.4, tgt, 6, 2.6, "rocket", k * 0.15)

    # ---------- Treffer
    def damage(self, e, d):
        if not e.alive:
            return
        e.hp -= d
        e.hit_t = 0.1
        if e.hp <= 0:
            e.dying = 0.0
            self.score += e.pts
            self.pops += 1
            self.sec_pops += 1
            self.sounds.play("down")
            self.effects.append({"kind": "dust" if not e.vehicle else "boom", "x": e.x, "z": e.z, "h": 0.4,
                                 "life": 0.6, "max": 0.6, "r": 2.0})
            self.check_upgrades()
        else:
            self.sounds.play("hit")

    def damage_fort(self, d):
        if not self.fort_active():
            return
        self.fort_hp -= d * 0.25 / self.enemy_armor()          # dicke Mauern, die mitwachsen
        self.fort_hit = 0.1
        if self.fort_hp <= 0:
            self.fort_hp = 0
            self.score += 5000
            self.sounds.play("boom")
            for k in range(14):
                self.effects.append({"kind": "boom", "x": random.uniform(-5, 5), "z": FORT_Z + random.uniform(-1, 1),
                                     "h": random.uniform(0, 4), "life": 0.5 + k * 0.08, "max": 0.5 + k * 0.08, "r": 3.0})
            for e in self.enemies:
                if e.alive:
                    e.dying = 0.0
            self.won = True
            self.end_t = 3.0
            self.say("BASIS ZERSTÖRT!", GOLD)

    def explode(self, x, z, radius, dmg):
        self.sounds.play("boom")
        self.shake = max(self.shake, 0.2)
        self.effects.append({"kind": "boom", "x": x, "z": z, "h": 0.5, "life": 0.5, "max": 0.5, "r": radius})
        for e in self.enemies:
            if e.alive and math.hypot(e.x - x, (e.z - z) * 0.7) < radius:
                self.damage(e, dmg)
        if self.fort_active() and z > FORT_Z - 3 - radius and abs(x) < 6 + radius:
            # die Basis ist gepanzert: Explosionen machen ihr nur wenig Schaden
            self.damage_fort(dmg * 0.5)

    def hurt_member(self, m, d):
        if m.down:
            return
        if m is self.player:
            if self.invuln > 0:
                return
            m.hp -= d
            m.hit_t = 0.15
            self.flash = max(self.flash, 0.15)
            self.sounds.play("ouch")
            if m.hp <= 0:
                self.lives -= 1
                m.hp = m.max
                self.invuln = 2.5
                self.flash = 0.4
                self.say("Du wurdest getroffen! Ein Leben weniger", RED, False, H * 0.55)
                self.check_game_over()
            return
        m.hp -= d
        m.hit_t = 0.15
        if m.hp <= 0:
            m.down = True
            m.down_t = 0.0
            m.revive = 0.0
            self.sounds.play("down")
            if m.kind in ("panzer", "werfer"):
                self.say(("Panzer" if m.kind == "panzer" else "Raketenwerfer") + " beschädigt! Mit E reparieren", RED, False, H * 0.55)
            else:
                self.say("Kamerad gefallen! Hingehen und E halten", RED, False, H * 0.55)

    def check_game_over(self):
        self.lives = max(0, self.lives)
        if self.lives <= 0 and self.state == "play":
            self.state = "over"
            if self.score > self.best:
                self.best = self.score
                self.new_best = True
                self.save()

    def enemy_fire(self, e):
        members = [m for m in self.squad() if not m.down]
        weights = [3 if m is self.player else (2 if m.kind in ("panzer", "werfer") else 1) for m in members]
        m = random.choices(members, weights)[0]
        spread = 0.9 if e.gun == "mg" else 0.6
        n = 3 if e.gun == "mg" else 1
        self.sounds.play("eshot")
        for k in range(n):
            aim_x = m.x + random.uniform(-spread, spread)
            speed = {"rakete": 13.0, "granate": 15.0}.get(e.gun, 20.0)
            self.ebullets.append({"x": e.x, "z": e.z - 0.3, "sx": e.x, "sz": e.z - 0.3, "tx": aim_x, "tz": m.z,
                                  "speed": speed, "t": -k * 0.1, "kind": e.gun, "target": m,
                                  "h0": 1.2 if not e.vehicle else 1.0})

    # ---------- Update
    def update(self, dt):
        self.t += dt
        self.sec_t += dt
        self.fire_cd -= dt
        self.tower_cd = max(0.0, self.tower_cd - dt)
        self.special_cd = [max(0.0, c - dt) for c in self.special_cd]
        self.muzzle_t = max(0.0, self.muzzle_t - dt)
        self.shake = max(0.0, self.shake - dt)
        self.flash = max(0.0, self.flash - dt)
        self.invuln = max(0.0, self.invuln - dt)
        self.fort_hit = max(0.0, self.fort_hit - dt)

        keys = pygame.key.get_pressed()
        self.ducking = (keys[pygame.K_DOWN] or keys[pygame.K_s]) and not self.advancing
        if not self.ducking:
            if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                self.x -= 6.0 * dt
            if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
                self.x += 6.0 * dt
        self.x = max(-ROAD_HALF + 0.3, min(ROAD_HALF - 0.3, self.x))
        squad = self.squad()

        if self.ducking:
            self.player.hp = min(self.player.max, self.player.hp + 1.2 * dt)
        elif keys[pygame.K_SPACE] and self.fire_cd <= 0 and not self.advancing:
            self.fire_cd = WEAPONS[self.weapon]["rate"]
            self.shoot()

        # Kameraden aufhelfen / Fahrzeuge reparieren
        helping = None
        if keys[pygame.K_e] and not self.advancing:
            downed = [m for m in squad if m.down and abs(m.x - self.x) < 3.0]
            if downed:
                helping = downed[0]
        for m in squad:
            if m.down:
                m.down_t += dt
                if m is helping:
                    m.revive += dt
                    need = 2.0 if m.kind in ("panzer", "werfer") else 1.2
                    if m.revive >= need:
                        m.down = False
                        m.hp = m.max
                        self.sounds.play("up")
                        self.say("Repariert!" if m.kind in ("panzer", "werfer") else "Kamerad ist zurück!", GREEN, False, H * 0.55)
                else:
                    m.revive = max(0.0, m.revive - dt)
            m.hit_t = max(0.0, m.hit_t - dt)

        # Kameraden und Fahrzeuge schießen von selbst (nicht in Deckung)
        enemies_near = any(e.alive and e.z < Z_FAR - 4 for e in self.enemies) or self.fort_active()
        for a in self.allies:
            if a.down or self.ducking or self.advancing:
                continue
            a.fire_cd -= dt
            if a.fire_cd <= 0 and enemies_near:
                a.fire_cd = WEAPONS[max(0, self.weapon - 1)]["rate"] * 1.4 * random.uniform(0.9, 1.1)
                self.ally_shoot(a)
        for v in self.vehicles:
            if v.down or self.advancing:
                continue
            v.fire_cd -= dt
            if v.fire_cd <= 0:
                v.fire_cd = 0.5
                self.fire_vehicle(v)

        # Vorrücken
        if self.advancing:
            step = SECTION_LEN / 4.0 * dt
            self.advancing = max(0.0, self.advancing - dt)
            self.scroll += step
            for e in self.enemies:
                e.z -= step
            if self.advancing == 0:
                self.scroll = round(self.scroll / SECTION_LEN) * SECTION_LEN
                self.finish_advance()

        # Gegner nachschicken, bis das Gebiet gesichert ist
        goal = SECTIONS[self.section]["goal"]
        spawning = not self.advancing and not self.won and (goal == 0 or self.sec_pops < goal)
        if spawning:
            self.spawn_cd -= dt
            if self.spawn_cd <= 0:
                delay = self.next_spawn_delay()
                group = max(1, round(0.6 / delay)) if delay < 0.6 else 1
                for _ in range(group):
                    if sum(1 for e in self.enemies if e.alive) < self.max_enemies():
                        self.spawn_enemy()
                self.spawn_cd = max(delay, 0.6) if group > 1 else delay
        elif goal and not self.advancing and not self.secured and not any(e.alive for e in self.enemies):
            self.secured = True
            self.secured_t = 0.0
            self.sounds.play("up")
            self.say("Gebiet gesichert!", GREEN)
            self.say("Drücke V zum Vorrücken", TEXT, False)
        if self.secured:
            self.secured_t += dt

        # Die Basis schießt mit Kanonen zurück
        if self.fort_active():
            self.fort_cd = getattr(self, "fort_cd", 2.0) - dt
            if self.fort_cd <= 0:
                self.fort_cd = 1.6
                fake = Enemy("panzer", 1.0)
                fake.x, fake.z = random.uniform(-4, 4), FORT_Z - 1
                self.enemy_fire(fake)

        # Gegner bewegen und schießen
        for e in self.enemies:
            e.hit_t = max(0.0, e.hit_t - dt)
            if e.dying >= 0:
                e.dying += dt
                if e.dying > 1.0:
                    e.gone = True
                continue
            if self.advancing:
                continue
            stop_z = 9.0 if e.kind == "panzer" else BREACH_Z - 1
            if e.z > stop_z:
                e.z -= e.speed * dt
            sway = 0.6 if e.vehicle else 1.2
            e.x = e.base_x + math.sin(self.t * 0.7 + e.phase) * sway
            lim = ROAD_HALF - (1.6 if e.vehicle else 0.4)
            e.x = max(-lim, min(lim, e.x))
            if e.z < Z_FAR - 1:
                e.fire_cd -= dt
                if e.fire_cd <= 0:
                    tier = 1.4 + self.section * 0.2
                    e.fire_cd = random.uniform(0.7, 1.3) / (e.rate * tier)
                    self.enemy_fire(e)
            if e.z < BREACH_Z:
                e.gone = True
                self.lives -= 1
                self.flash = 0.35
                self.sounds.play("alarm")
                self.say("Durchgebrochen!", RED, False, H * 0.55)
                self.check_game_over()

        # eigene Kugeln
        for b in self.bullets:
            z0 = b["z"]
            b["z"] += b["vz"] * dt
            b["x"] += b["vx"] * dt
            for e in self.enemies:
                if not e.alive:
                    continue
                width = (1.3 if e.vehicle else 0.45 * e.size) + 0.1
                if z0 - 0.4 <= e.z <= b["z"] + 0.4 and abs(e.x - b["x"]) < width:
                    b["gone"] = True
                    if b["rocket"]:
                        self.explode(b["x"], e.z, 2.4, b["dmg"])
                    else:
                        self.damage(e, b["dmg"])
                        self.effects.append({"kind": "spark", "x": b["x"], "z": e.z - 0.2, "h": 1.0,
                                             "life": 0.12, "max": 0.12, "c": b["color"]})
                    break
            if not b.get("gone") and self.fort_active() and b["z"] >= FORT_Z - 1.5 and abs(b["x"]) < 6:
                b["gone"] = True
                self.damage_fort(b["dmg"])
                self.effects.append({"kind": "spark", "x": b["x"], "z": FORT_Z - 1.6, "h": 1.5,
                                     "life": 0.12, "max": 0.12, "c": b["color"]})
            if b["z"] > Z_FAR + 4:
                b["gone"] = True
        self.bullets = [b for b in self.bullets if not b.get("gone")]

        # gegnerische Kugeln, Raketen und Granaten
        for b in self.ebullets:
            b["t"] += dt
            if b["t"] < 0:
                continue
            dist = max(0.1, b["sz"] - b["tz"])
            k = min(1.0, b["t"] * b["speed"] / dist)
            b["x"] = b["sx"] + (b["tx"] - b["sx"]) * k
            b["z"] = b["sz"] + (b["tz"] - b["sz"]) * k
            b["h"] = b["h0"] + (math.sin(k * math.pi) * 3 if b["kind"] == "granate" else 0)
            m = b["target"]
            # Deckung hält alles auf, was auf die Soldaten zielt
            if self.ducking and m.kind in ("held", "kamerad") and b["z"] <= COVER_Z + 0.1:
                b["gone"] = True
                self.sounds.play("ping")
                self.effects.append({"kind": "spark", "x": b["x"], "z": COVER_Z + 0.1, "h": 0.6,
                                     "life": 0.12, "max": 0.12, "c": (255, 230, 160)})
                continue
            if k >= 1:
                b["gone"] = True
                if b["kind"] in ("rakete", "granate"):
                    r = 1.4 if b["kind"] == "rakete" else 1.9
                    self.effects.append({"kind": "boom", "x": b["x"], "z": b["z"], "h": 0.3, "life": 0.4, "max": 0.4, "r": r})
                    self.sounds.play("boom")
                    for mm in self.squad():
                        if abs(mm.x - b["x"]) < r and abs(mm.z - b["z"]) < 1.5:
                            if self.ducking and mm.kind in ("held", "kamerad"):
                                continue
                            self.hurt_member(mm, 2)
                else:
                    width = 1.6 if m.kind in ("panzer", "werfer") else 0.45
                    if abs(m.x - b["x"]) < width:
                        self.hurt_member(m, 1)
        self.ebullets = [b for b in self.ebullets if not b.get("gone")]

        # Granaten und Raketen von Türmen, Fahrzeugen und Hubschrauber
        for s in self.shells:
            s["t"] += dt
            if s["t"] < 0:
                continue
            if s["kind"] == "rocket":
                tgt = s["target"]
                if tgt is None or not tgt.alive:
                    alive = [e for e in self.enemies if e.alive and e.z < Z_FAR]
                    tgt = s["target"] = min(alive, key=lambda e: math.hypot(e.x - s["x"], e.z - s["z"])) if alive else None
                if tgt:
                    s["tx"], s["tz"] = tgt.x, tgt.z
                dx, dz = s["tx"] - s["x"], s["tz"] - s["z"]
                d = math.hypot(dx, dz) or 1
                step = 26 * dt
                s["x"] += dx / d * min(step, d)
                s["z"] += dz / d * min(step, d)
                s["h"] = max(0.8, s["h"] - dt * 3)
                if s["t"] > 0.05 and len(self.effects) < 260:
                    self.effects.append({"kind": "smoke", "x": s["x"], "z": s["z"], "h": s["h"], "life": 0.4, "max": 0.4})
                if d < 0.6 or s["t"] > 4:
                    s["gone"] = True
                    self.explode(s["x"], s["z"], s["radius"], s["dmg"])
            else:
                k = min(1.0, s["t"] / s["dur"])
                s["x"] = s["sx"] + (s["tx"] - s["sx"]) * k
                s["z"] = s["sz"] + (s["tz"] - s["sz"]) * k
                s["h"] = s["sh"] * (1 - k) + math.sin(k * math.pi) * 6
                if k >= 1:
                    s["gone"] = True
                    self.explode(s["x"], s["z"], s["radius"], s["dmg"])
        self.shells = [s for s in self.shells if not s.get("gone")]

        self.update_aircraft(dt)

        self.enemies = [e for e in self.enemies if not e.gone]
        for fx in self.effects:
            fx["life"] -= dt
        self.effects = [fx for fx in self.effects if fx["life"] > 0]
        for tx in self.texts:
            tx["life"] -= dt
        self.texts = [tx for tx in self.texts if tx["life"] > 0]

        if self.won:
            self.end_t -= dt
            if self.end_t <= 0:
                self.state = "win"
                if self.score > self.best:
                    self.best = self.score
                    self.new_best = True
                    self.save()

    def update_aircraft(self, dt):
        for a in self.aircraft:
            a["t"] += dt
            a["life"] -= dt
            if a["t"] < 0:
                continue
            if a["kind"] == "drohne":
                tgt = a["target"]
                if tgt is None or not tgt.alive:
                    taken = {id(o["target"]) for o in self.aircraft if o is not a and o.get("target")}
                    free = [e for e in self.enemies if e.alive and e.z < Z_FAR and id(e) not in taken]
                    pool = free or [e for e in self.enemies if e.alive and e.z < Z_FAR]
                    tgt = a["target"] = max(pool, key=lambda e: e.hp) if pool else None
                if tgt:
                    tx, tz, th = tgt.x, tgt.z, 1.0
                elif self.fort_active():
                    tx, tz, th = 0.0, FORT_Z - 1, 2.0
                else:
                    tx, tz, th = a["x"], a["z"] + 5, a["h"]
                dx, dz, dh = tx - a["x"], tz - a["z"], th - a["h"]
                d = math.sqrt(dx * dx + dz * dz + dh * dh) or 1
                step = 20 * dt
                a["x"] += dx / d * min(step, d)
                a["z"] += dz / d * min(step, d)
                a["h"] += dh / d * min(step, d)
                if (tgt or self.fort_active()) and d < 0.8:
                    a["life"] = 0
                    self.explode(a["x"], a["z"], 2.0, 10)
            elif a["kind"] == "heli":
                # fliegt von links nach rechts und feuert Raketen
                a["x"] += 3.2 * dt
                a["fire"] -= dt
                if a["fire"] <= 0 and 1.0 < a["t"] < 6.0:
                    a["fire"] = 0.35
                    tgt = self.pick_target(a["x"], a["z"])
                    self.lob(a["x"], a["z"], a["h"], tgt, 9, 2.8, "rocket")
            else:
                # Kampfbomber fliegt über das ganze Feld und wirft Bomben
                a["z"] += 16 * dt
                a["drop"] -= dt
                if a["drop"] <= 0 and 5 < a["z"] < FORT_Z - 4:
                    a["drop"] = 0.12
                    for bx in (-3.5, 0.0, 3.5):
                        self.shells.append({"kind": "bomb", "x": bx, "z": a["z"], "h": a["h"], "sx": bx, "sz": a["z"],
                                            "sh": a["h"], "tx": bx, "tz": a["z"] + 3, "t": 0.0, "dur": 0.7,
                                            "target": None, "dmg": 15, "radius": 3.0})
        self.aircraft = [a for a in self.aircraft if a["life"] > 0]

    # ---------- Hintergrund
    def make_sky(self):
        bg = pygame.Surface((W, HORIZON + 40))
        for y in range(0, HORIZON + 40, 2):
            k = min(1, y / HORIZON)
            c = (int(70 + 120 * k), int(110 + 90 * k), int(160 + 60 * k))
            pygame.draw.rect(bg, c, (0, y, W, 2))
        pygame.draw.circle(bg, (255, 230, 170), (760, 90), 36)
        rnd = random.Random(7)
        for col, base, amp in [((110, 130, 150), HORIZON - 10, 70), ((90, 108, 112), HORIZON, 40)]:
            pts = [(0, HORIZON + 40)]
            x = 0
            while x <= W + 40:
                pts.append((x, base - rnd.uniform(0.3, 1) * amp))
                x += rnd.randint(40, 90)
            pts.append((W, HORIZON + 40))
            pygame.draw.polygon(bg, col, pts)
        return bg

    def section_at(self, zw):
        return max(0, min(len(SECTIONS) - 1, int(zw // SECTION_LEN)))

    def make_props(self):
        rnd = random.Random(3)
        props = []
        total = SECTION_LEN * len(SECTIONS) + 50
        zw = 4.0
        while zw < total:
            sec = self.section_at(zw - 4)
            for side in (-1, 1):
                if rnd.random() < 0.8:
                    x = side * rnd.uniform(ROAD_HALF + 1.5, ROAD_HALF + 14)
                    if abs(x) < 10 and abs(zw % SECTION_LEN - TOWER_Z) < 2:
                        continue
                    kinds = [["tree", "tree", "bush", "rock"],
                             ["tree", "rock", "bush"],
                             ["house", "house", "tree", "bush"],
                             ["bunker", "rock", "wire", "bush"]][sec]
                    props.append({"kind": rnd.choice(kinds), "zw": zw + rnd.uniform(-1, 1), "x": x, "s": rnd.uniform(0.8, 1.3)})
            zw += 3.0
        # Wahrzeichen am Ende jedes Abschnitts
        for i, kind in enumerate(["bridge", "village", "bunkerline"]):
            props.append({"kind": kind, "zw": i * SECTION_LEN + LANDMARK_Z, "x": 0.0, "s": 1.0})
        return props

    def ground_color(self, zw, stripe):
        sec = self.section_at(zw)
        grass = [(106, 128, 70), (98, 126, 74), (118, 124, 74), (112, 108, 80)][sec]
        road = [(176, 150, 104), (170, 150, 110), (160, 146, 120), (150, 140, 124)][sec]
        if stripe % 2:
            return grass, road
        return blend(grass, (0, 0, 0), 0.07), blend(road, (0, 0, 0), 0.06)

    def draw_ground(self, s):
        s.blit(self.sky, (0, 0))
        start = -(self.scroll % 3.0)
        z = start
        while z < 80:
            z2 = z + 3.0
            zw = self.scroll + max(z, 0) + 0.1
            stripe = int((self.scroll + z) // 3.0)
            grass, road = self.ground_color(zw, stripe)
            y1 = project(0, max(z, -1))[1]
            y2 = project(0, z2)[1]
            pygame.draw.rect(s, grass, (0, int(y2), W, int(y1 - y2) + 1))
            a = project(-ROAD_HALF, max(z, -1))
            b = project(ROAD_HALF, max(z, -1))
            c = project(ROAD_HALF, z2)
            d = project(-ROAD_HALF, z2)
            pygame.draw.polygon(s, road, [(a[0], a[1]), (b[0], b[1]), (c[0], c[1]), (d[0], d[1])])
            z = z2
        for side in (-1, 1):
            p1 = project(side * ROAD_HALF, -1)
            p2 = project(side * ROAD_HALF, 80)
            pygame.draw.line(s, (130, 110, 76), (p1[0], p1[1]), (p2[0], p2[1]), 3)
        # Fluss bei der Brücke
        rz = LANDMARK_Z - self.scroll
        if -2 < rz < 80:
            y1 = project(0, rz - 1.5)[1]
            y2 = project(0, rz + 1.5)[1]
            pygame.draw.rect(s, (70, 130, 190), (0, int(y2), W, int(y1 - y2) + 1))

    def draw_prop(self, s, p, z):
        sx, sy, sc = project(p["x"], z)
        m = PX_PER_M * sc * p["s"]
        k = p["kind"]
        if k == "tree":
            pygame.draw.rect(s, (90, 64, 40), (sx - 0.15 * m, sy - 1.2 * m, 0.3 * m, 1.2 * m))
            for i, w in enumerate((1.6, 1.2, 0.8)):
                y0 = sy - (1.0 + i * 0.9) * m
                pygame.draw.polygon(s, (52 + i * 10, 92 + i * 8, 56), [(sx - w * m, y0), (sx + w * m, y0), (sx, y0 - 1.6 * m)])
        elif k == "rock":
            pygame.draw.ellipse(s, (120, 118, 112), (sx - 0.8 * m, sy - 0.8 * m, 1.6 * m, 0.9 * m))
            pygame.draw.ellipse(s, (146, 144, 136), (sx - 0.5 * m, sy - 0.75 * m, 0.7 * m, 0.4 * m))
        elif k == "bush":
            for dx in (-0.4, 0, 0.4):
                pygame.draw.circle(s, (70, 110, 60), (int(sx + dx * m), int(sy - 0.35 * m)), max(1, int(0.45 * m)))
        elif k == "house":
            pygame.draw.rect(s, (200, 184, 150), (sx - 1.6 * m, sy - 2.4 * m, 3.2 * m, 2.4 * m))
            pygame.draw.polygon(s, (150, 70, 50), [(sx - 1.9 * m, sy - 2.4 * m), (sx + 1.9 * m, sy - 2.4 * m), (sx, sy - 3.8 * m)])
            pygame.draw.rect(s, (70, 90, 110), (sx - 0.9 * m, sy - 1.8 * m, 0.6 * m, 0.6 * m))
            pygame.draw.rect(s, (70, 90, 110), (sx + 0.3 * m, sy - 1.8 * m, 0.6 * m, 0.6 * m))
            pygame.draw.rect(s, (100, 70, 50), (sx - 0.3 * m, sy - 1.0 * m, 0.6 * m, 1.0 * m))
        elif k == "bunker":
            pygame.draw.rect(s, (130, 132, 128), (sx - 1.5 * m, sy - 1.3 * m, 3.0 * m, 1.3 * m), border_radius=int(0.4 * m))
            pygame.draw.rect(s, (40, 40, 44), (sx - 0.9 * m, sy - 0.9 * m, 1.8 * m, 0.25 * m))
        elif k == "wire":
            for i in range(4):
                pygame.draw.circle(s, (80, 80, 80), (int(sx + (i - 1.5) * 0.5 * m), int(sy - 0.35 * m)), max(1, int(0.3 * m)), 1)
        elif k == "bridge":
            for side in (-1, 1):
                x1 = project(side * (ROAD_HALF + 0.3), z - 1.6)
                x2 = project(side * (ROAD_HALF + 0.3), z + 1.6)
                for hh in (0.0, 0.9):
                    a = project(side * (ROAD_HALF + 0.3), z - 1.6, hh)
                    b = project(side * (ROAD_HALF + 0.3), z + 1.6, hh)
                    pygame.draw.line(s, (120, 90, 60), (a[0], a[1]), (b[0], b[1]), max(1, int(0.15 * m)))
                for zz in (z - 1.6, z, z + 1.6):
                    a = project(side * (ROAD_HALF + 0.3), zz)
                    b = project(side * (ROAD_HALF + 0.3), zz, 1.0)
                    pygame.draw.line(s, (100, 72, 48), (a[0], a[1]), (b[0], b[1]), max(1, int(0.18 * m)))
        elif k == "village":
            for side in (-1, 1):
                p2 = dict(p, kind="house", x=side * (ROAD_HALF + 2.5), s=1.4)
                self.draw_prop(s, p2, z)
            self.draw_flag(s, -ROAD_HALF - 0.6, z)
        elif k == "bunkerline":
            for side in (-1, 1):
                p2 = dict(p, kind="bunker", x=side * (ROAD_HALF + 2.0), s=1.6)
                self.draw_prop(s, p2, z)
            self.draw_flag(s, ROAD_HALF + 0.6, z)

    def draw_flag(self, s, x, z):
        a = project(x, z)
        b = project(x, z, 4.0)
        m = PX_PER_M * a[2]
        pygame.draw.line(s, (200, 200, 200), (a[0], a[1]), (b[0], b[1]), max(1, int(0.08 * m)))
        pygame.draw.polygon(s, GOLD, [(b[0], b[1]), (b[0] + 1.4 * m, b[1] + 0.4 * m), (b[0], b[1] + 0.8 * m)])

    def draw_cover(self, s):
        # Sandsack-Wall vor der eigenen Linie
        x = -ROAD_HALF - 0.5
        while x < ROAD_HALF + 0.5:
            for row in range(2):
                sx, sy, sc = project(x + row * 0.3, COVER_Z, 0.32 + row * 0.3)
                m = PX_PER_M * sc
                pygame.draw.ellipse(s, (150, 132, 92), (sx - 0.34 * m, sy - 0.17 * m, 0.68 * m, 0.34 * m))
                pygame.draw.ellipse(s, (118, 102, 70), (sx - 0.34 * m, sy - 0.17 * m, 0.68 * m, 0.34 * m), 1)
            x += 0.62

    def draw_fort(self, s, z):
        sx, sy, sc = project(0, z)
        m = PX_PER_M * sc
        col = (255, 255, 255) if self.fort_hit > 0 else (96, 92, 88)
        if self.fort_hp <= 0:
            # Trümmer
            for i in range(9):
                pygame.draw.rect(s, (80, 76, 72), (sx + (i - 4.5) * 1.2 * m, sy - (0.6 + (i % 3) * 0.4) * m, 1.0 * m, (0.6 + (i % 3) * 0.4) * m))
            return
        pygame.draw.rect(s, col, (sx - 7 * m, sy - 4 * m, 14 * m, 4 * m))
        for i in range(9):
            pygame.draw.rect(s, col, (sx - 7 * m + i * 1.6 * m, sy - 4.6 * m, 0.9 * m, 0.7 * m))
        for tx in (-7, 7):
            pygame.draw.rect(s, blend(col, (0, 0, 0), 0.15), (sx + (tx - 1.2) * m, sy - 6.5 * m, 2.4 * m, 6.5 * m))
            pygame.draw.polygon(s, (150, 40, 40), [(sx + (tx - 1.5) * m, sy - 6.5 * m), (sx + (tx + 1.5) * m, sy - 6.5 * m), (sx + tx * m, sy - 8 * m)])
        pygame.draw.rect(s, (40, 36, 34), (sx - 1.6 * m, sy - 2.6 * m, 3.2 * m, 2.6 * m), border_top_left_radius=int(1.6 * m), border_top_right_radius=int(1.6 * m))
        fp = project(0, z, 8.5)
        pygame.draw.line(s, (200, 200, 200), (fp[0], fp[1]), (sx, sy - 4.6 * m), 2)
        pygame.draw.polygon(s, RED, [(fp[0], fp[1]), (fp[0] + 1.6 * m, fp[1] + 0.5 * m), (fp[0], fp[1] + 1.0 * m)])

    def draw_vehicle(self, s, kind, x, z, hit=False, down=False, dying=-1.0, friendly=False):
        sx, sy, sc = project(x, z)
        m = PX_PER_M * sc
        alpha = 255
        if dying >= 0:
            alpha = int(255 * max(0, 1 - dying))
        surf = pygame.Surface((int(4 * m) + 4, int(3.6 * m) + 4), pygame.SRCALPHA)
        ox, oy = surf.get_width() / 2, surf.get_height() - 2
        if friendly:
            body = (70, 96, 60) if kind == "panzer" else (82, 100, 70)
        elif kind == "panzer":
            body = (110, 104, 92)
        else:
            body = (128, 120, 96)
        if hit:
            body = blend(body, WHITE, 0.6)
        if down:
            body = blend(body, (40, 40, 40), 0.6)

        def R(x0, y0, w0, h0, c, r=0):
            pygame.draw.rect(surf, c, (ox + x0 * m, oy - y0 * m, w0 * m, h0 * m), border_radius=int(r * m))

        if kind in ("panzer",):
            R(-1.8, 0.8, 3.6, 0.8, (50, 48, 44), 0.3)                    # Ketten
            for i in range(6):
                pygame.draw.circle(surf, (90, 88, 82), (int(ox + (-1.5 + i * 0.6) * m), int(oy - 0.4 * m)), max(1, int(0.25 * m)))
            R(-1.6, 1.5, 3.2, 0.8, body, 0.15)
            R(-0.9, 2.2, 1.8, 0.8, blend(body, (0, 0, 0), 0.1), 0.3)     # Turm
            if friendly:
                R(-0.18, 3.4, 0.36, 1.3, (50, 52, 48), 0.1)              # Rohr nach vorne (oben im Bild)
                pygame.draw.circle(surf, CYAN, (int(ox), int(oy - 1.85 * m)), max(1, int(0.15 * m)))
            else:
                R(-0.25, 1.95, 0.5, 0.5, (40, 40, 40), 0.25)             # Rohr zeigt auf uns
                pygame.draw.circle(surf, (20, 20, 20), (int(ox), int(oy - 1.7 * m)), max(1, int(0.22 * m)))
        elif kind == "werfer":
            for i in (-1.2, 1.2):
                pygame.draw.circle(surf, (40, 40, 40), (int(ox + i * m), int(oy - 0.35 * m)), max(1, int(0.35 * m)))
            R(-1.5, 1.2, 3.0, 0.8, body, 0.15)
            R(-1.1, 2.3, 2.2, 1.1, (60, 64, 56), 0.15)
            for i in range(4):
                for j in range(2):
                    pygame.draw.circle(surf, (230, 230, 230), (int(ox + (-0.75 + i * 0.5) * m), int(oy - (2.0 - j * 0.45) * m)), max(1, int(0.16 * m)))
        else:  # Jeep
            for i in (-1.0, 1.0):
                pygame.draw.circle(surf, (30, 30, 30), (int(ox + i * m), int(oy - 0.35 * m)), max(1, int(0.35 * m)))
            R(-1.3, 1.2, 2.6, 0.7, body, 0.2)
            R(-1.0, 1.8, 2.0, 0.6, (70, 90, 110), 0.1)                   # Scheibe
            R(-0.15, 2.4, 0.3, 0.6, (40, 40, 40))                        # MG
            R(-0.5, 2.5, 1.0, 0.2, (40, 40, 40))
        if dying >= 0 or alpha < 255:
            surf.set_alpha(alpha)
        s.blit(surf, (sx - ox, sy - oy))
        if down:
            self.effects_smoke(s, sx, sy - 2 * m, m)
        return pygame.Rect(int(sx - 1.8 * m), int(sy - 2.6 * m), int(3.6 * m), int(2.6 * m))

    def effects_smoke(self, s, x, y, m):
        for i in range(3):
            r = max(2, int((0.4 + i * 0.25) * m))
            yy = y - i * 0.5 * m - (self.t * 30 % (0.5 * m))
            alpha_rect(s, (90, 90, 90), (x - r, yy - r, 2 * r, 2 * r), 120, r)

    def draw_soldier(self, s, kind, x, z, frame, lvl=0, size=1.0, dying=-1.0, fall_dir=1, hit=False, lying=False):
        sx, sy, sc = project(x, z)
        img = soldier_image(kind, frame, lvl, size, sc)
        sw = int(0.9 * size * PX_PER_M * sc)
        if sw > 2:
            alpha_rect(s, (0, 0, 0), (sx - sw / 2, sy - sw * 0.12, sw, sw * 0.24), 60, int(sw * 0.12))
        if lying:
            img = pygame.transform.rotate(img, -fall_dir * 88)
        elif dying >= 0:
            k = min(1.0, dying / 0.45)
            img = pygame.transform.rotate(img, -fall_dir * 88 * (k * k))
            fade = 1.0 if dying < 0.55 else max(0.0, 1 - (dying - 0.55) / 0.45)
            img = img.copy()
            img.set_alpha(int(255 * fade))
        elif hit:
            img = img.copy()
            img.fill((110, 60, 60), special_flags=pygame.BLEND_RGB_ADD)
        r = img.get_rect(midbottom=(int(sx), int(sy)))
        s.blit(img, r)
        return r

    def draw_tower(self, s, x, lvl, z):
        sx, sy, sc = project(x, z)
        m = PX_PER_M * sc
        ready = self.tower_cd <= 0
        base_col = [(120, 116, 104), (120, 116, 104), (96, 104, 112), (70, 80, 96), (46, 52, 66)][lvl]
        pygame.draw.ellipse(s, (60, 70, 50), (sx - 1.6 * m, sy - 0.3 * m, 3.2 * m, 0.6 * m))
        pygame.draw.rect(s, base_col, (sx - 1.2 * m, sy - 3.2 * m, 2.4 * m, 3.2 * m), border_radius=int(0.2 * m))
        for k in range(3):
            pygame.draw.rect(s, blend(base_col, (0, 0, 0), 0.2), (sx - 1.2 * m, sy - (0.9 + k) * m, 2.4 * m, 0.12 * m))
        for k in range(4):
            pygame.draw.rect(s, base_col, (sx - 1.2 * m + k * 0.68 * m, sy - 3.6 * m, 0.4 * m, 0.5 * m))
        top = sy - 3.6 * m
        if lvl <= 1:
            pygame.draw.rect(s, (60, 64, 70), (sx - 0.25 * m, top - 1.4 * m, 0.5 * m, 1.6 * m), border_radius=int(0.2 * m))
        elif lvl == 2:
            for dx in (-0.35, 0.35):
                pygame.draw.rect(s, (60, 64, 70), (sx + (dx - 0.2) * m, top - 1.6 * m, 0.4 * m, 1.8 * m), border_radius=int(0.15 * m))
        else:
            n = 2 if lvl == 3 else 3
            pod_w = 0.5 * m * n + 0.3 * m
            pygame.draw.rect(s, (80, 40, 40) if lvl == 3 else (40, 40, 60), (sx - pod_w / 2, top - 1.1 * m, pod_w, 1.2 * m), border_radius=int(0.2 * m))
            for k in range(n):
                rx = sx - pod_w / 2 + 0.25 * m + k * 0.5 * m
                pygame.draw.rect(s, (220, 220, 220), (rx, top - 1.6 * m, 0.3 * m, 0.7 * m), border_radius=int(0.15 * m))
                pygame.draw.polygon(s, RED, [(rx, top - 1.6 * m), (rx + 0.3 * m, top - 1.6 * m), (rx + 0.15 * m, top - 1.95 * m)])
        pygame.draw.rect(s, CYAN if ready else (90, 100, 110), (sx - 0.8 * m, sy - 2.4 * m, 1.6 * m, 0.15 * m))
        for k in range(lvl + 1):
            pygame.draw.circle(s, GOLD, (int(sx - 0.6 * m + k * 0.3 * m), int(sy - 1.6 * m)), max(1, int(0.1 * m)))

    def draw_effect(self, s, fx):
        sx, sy, sc = project(fx["x"], fx["z"], fx["h"])
        m = PX_PER_M * sc
        k = 1 - fx["life"] / fx["max"]
        if fx["kind"] == "boom":
            r = fx.get("r", 2) * m * (0.4 + 0.8 * k)
            if r < 1:
                return
            surf = pygame.Surface((int(r * 2) + 4, int(r * 2) + 4), pygame.SRCALPHA)
            c = int(r) + 2
            a = int(220 * (1 - k))
            pygame.draw.circle(surf, (255, 150, 40, a), (c, c), int(r))
            pygame.draw.circle(surf, (255, 230, 120, a), (c, c), int(r * 0.6))
            pygame.draw.circle(surf, (255, 255, 230, a), (c, c), int(r * 0.25))
            s.blit(surf, (sx - c, sy - c))
        elif fx["kind"] in ("dust", "smoke"):
            r = (0.6 if fx["kind"] == "dust" else 0.25) * m * (0.6 + k)
            surf = pygame.Surface((int(r * 2) + 4, int(r * 2) + 4), pygame.SRCALPHA)
            c = int(r) + 2
            pygame.draw.circle(surf, (200, 190, 170, int(150 * (1 - k))), (c, c), max(1, int(r)))
            s.blit(surf, (sx - c, sy - c))
        elif fx["kind"] == "spark":
            pygame.draw.circle(s, fx["c"], (int(sx), int(sy)), max(2, int(0.15 * m)))
        elif fx["kind"] == "flash":
            pygame.draw.circle(s, (255, 230, 150), (int(sx), int(sy)), max(3, int(0.6 * m)))

    def draw_bullet(self, s, b):
        x1, y1, sc = project(b["x"], b["z"], 1.25)
        x0, y0, _ = project(b["x"] - b["vx"] * 0.025, b["z"] - 1.6, 1.25)
        wdt = max(2, int((0.12 if b["big"] else 0.07) * PX_PER_M * sc * 1.6))
        if b["rocket"]:
            pygame.draw.line(s, (220, 220, 220), (x0, y0), (x1, y1), wdt + 2)
            pygame.draw.circle(s, b["color"], (int(x1), int(y1)), wdt + 1)
        else:
            pygame.draw.line(s, b["color"], (x0, y0), (x1, y1), wdt)
            pygame.draw.circle(s, WHITE, (int(x1), int(y1)), max(1, wdt // 2))

    def draw_ebullet(self, s, b):
        x1, y1, sc = project(b["x"], b["z"], b["h"])
        m = PX_PER_M * sc
        if b["kind"] == "rakete":
            pygame.draw.circle(s, (230, 230, 230), (int(x1), int(y1)), max(2, int(0.18 * m)))
            pygame.draw.circle(s, (255, 120, 40), (int(x1), int(y1 - 0.15 * m)), max(2, int(0.12 * m)))
        elif b["kind"] == "granate":
            pygame.draw.circle(s, (30, 30, 30), (int(x1), int(y1)), max(2, int(0.22 * m)))
        else:
            x0, y0, _ = project(b["x"], b["z"] + 1.2, b["h"])
            pygame.draw.line(s, ENEMY_SHOT, (x0, y0), (x1, y1), max(2, int(0.06 * m * 1.6)))

    def draw_shell(self, s, sh):
        sx, sy, sc = project(sh["x"], sh["z"], sh["h"])
        m = PX_PER_M * sc
        if sh["kind"] == "rocket":
            pygame.draw.circle(s, (230, 230, 230), (int(sx), int(sy)), max(2, int(0.22 * m)))
            pygame.draw.circle(s, (255, 160, 40), (int(sx), int(sy + 0.2 * m)), max(2, int(0.16 * m)))
        elif sh["kind"] == "bomb":
            pygame.draw.ellipse(s, (40, 44, 40), (sx - 0.2 * m, sy - 0.4 * m, 0.4 * m, 0.8 * m))
        else:
            pygame.draw.circle(s, (40, 40, 44), (int(sx), int(sy)), max(2, int(0.28 * m)))

    def draw_aircraft(self, s, a):
        sx, sy, sc = project(a["x"], a["z"], a["h"])
        m = PX_PER_M * sc
        if a["kind"] == "drohne":
            pygame.draw.rect(s, (40, 46, 56), (sx - 0.3 * m, sy - 0.12 * m, 0.6 * m, 0.24 * m), border_radius=int(0.1 * m))
            for dx in (-0.45, 0.45):
                pygame.draw.ellipse(s, (180, 190, 200), (sx + (dx - 0.25) * m, sy - 0.22 * m, 0.5 * m, 0.1 * m))
            pygame.draw.circle(s, RED if int(self.t * 6) % 2 else CYAN, (int(sx), int(sy)), max(1, int(0.07 * m)))
        elif a["kind"] == "heli":
            pygame.draw.ellipse(s, (60, 80, 56), (sx - 1.2 * m, sy - 0.5 * m, 2.4 * m, 1.0 * m))
            pygame.draw.rect(s, (60, 80, 56), (sx - 2.6 * m, sy - 0.2 * m, 1.6 * m, 0.25 * m))
            pygame.draw.ellipse(s, (120, 170, 200), (sx + 0.3 * m, sy - 0.35 * m, 0.7 * m, 0.45 * m))
            span = 2.8 * m * abs(math.sin(self.t * 30))
            pygame.draw.line(s, (40, 40, 40), (sx - span, sy - 0.65 * m), (sx + span, sy - 0.65 * m), max(1, int(0.08 * m)))
            pygame.draw.rect(s, (40, 40, 40), (sx - 1.0 * m, sy + 0.35 * m, 2.0 * m, 0.1 * m))
        else:
            # Kampfbomber von hinten/unten gesehen
            pygame.draw.polygon(s, (90, 100, 110), [(sx, sy - 0.6 * m), (sx + 4 * m, sy + 0.5 * m), (sx - 4 * m, sy + 0.5 * m)])
            pygame.draw.ellipse(s, (70, 78, 88), (sx - 0.6 * m, sy - 1.6 * m, 1.2 * m, 3.0 * m))
            pygame.draw.polygon(s, (70, 78, 88), [(sx, sy - 1.0 * m), (sx + 1.4 * m, sy - 1.4 * m), (sx - 1.4 * m, sy - 1.4 * m)])
            pygame.draw.circle(s, (255, 170, 60), (int(sx), int(sy + 1.3 * m)), max(2, int(0.35 * m)))

    def draw_world(self):
        s = pygame.Surface((W, H))
        self.draw_ground(s)
        items = []
        for p in self.props:
            z = p["zw"] - self.scroll
            if -3 < z < 80:
                items.append((z, 0, lambda p=p, z=z: self.draw_prop(s, p, z)))
        fz = (len(SECTIONS) - 1) * SECTION_LEN + FORT_Z - self.scroll
        if fz < 80:
            items.append((fz, 0, lambda fz=fz: self.draw_fort(s, fz)))
        if self.towers_on and self.tower_lvl >= 0:
            tw = TOWER_LEVELS[self.tower_lvl]
            for i in range(tw["count"]):
                items.append((TOWER_Z, 1, lambda x=TOWER_XS[i]: self.draw_tower(s, x, self.tower_lvl, TOWER_Z)))
        items.append((COVER_Z, 1, lambda: self.draw_cover(s)))
        for e in self.enemies:
            frame = int(self.t * 7 + e.phase) % 4 if e.dying < 0 else 0
            items.append((e.z, 2, lambda e=e, f=frame: self.draw_enemy(s, e, f)))
        keys = pygame.key.get_pressed()
        moving = self.advancing or (self.state == "play" and (keys[pygame.K_LEFT] or keys[pygame.K_RIGHT]))
        for mbr in self.squad():
            items.append((mbr.z, 3, lambda mbr=mbr, mv=moving: self.draw_member(s, mbr, mv)))
        for b in self.bullets:
            items.append((b["z"], 4, lambda b=b: self.draw_bullet(s, b)))
        for b in self.ebullets:
            if b["t"] >= 0:
                items.append((b["z"] - 0.2, 4, lambda b=b: self.draw_ebullet(s, b)))
        for sh in self.shells:
            if sh["t"] >= 0:
                items.append((sh["z"] - 0.5, 4, lambda sh=sh: self.draw_shell(s, sh)))
        for fx in self.effects:
            items.append((fx["z"] - 0.3, 5, lambda fx=fx: self.draw_effect(s, fx)))
        items.sort(key=lambda it: (-it[0], it[1]))
        for _, _, fn in items:
            fn()
        for a in self.aircraft:
            if a["t"] >= 0:
                self.draw_aircraft(s, a)
        return s

    def draw_enemy(self, s, e, frame):
        if e.vehicle:
            r = self.draw_vehicle(s, e.kind, e.x, e.z, e.hit_t > 0, dying=e.dying)
        else:
            r = self.draw_soldier(s, e.kind, e.x, e.z, frame, 0, e.size, e.dying, e.fall_dir, e.hit_t > 0)
        if e.alive and e.max > 1 and r.h > 20:
            w = max(16, int(r.w * 0.8))
            x0, y0 = r.centerx - w // 2, r.top - 8
            bar(s, x0, y0, w, 5, e.hp / e.max, (240, 90, 70), (30, 30, 30))

    def draw_member(self, s, mbr, moving):
        if mbr.kind in ("panzer", "werfer"):
            r = self.draw_vehicle(s, mbr.kind, mbr.x, mbr.z, mbr.hit_t > 0, mbr.down, friendly=True)
        else:
            if mbr.down:
                frame = 0
            elif self.ducking:
                frame = 4
            else:
                frame = int(self.t * 9) % 4 if moving else 0
            lvl = self.weapon if mbr.kind == "held" else max(0, self.weapon - 1)
            size = 1.3 if mbr.kind == "held" else 1.0
            blink = mbr is self.player and self.invuln > 0 and int(self.t * 12) % 2
            if blink:
                return
            r = self.draw_soldier(s, mbr.kind, mbr.x, mbr.z, frame, lvl, size, hit=mbr.hit_t > 0, lying=mbr.down,
                                  fall_dir=1 if mbr.offset >= 0 else -1)
            if mbr is self.player and self.muzzle_t > 0 and not self.ducking:
                gx, gy = r.left + r.w * 0.82, r.top + r.h * 0.08
                pygame.draw.circle(s, WEAPONS[self.weapon]["color"], (int(gx), int(gy)), 9)
                pygame.draw.circle(s, WHITE, (int(gx), int(gy)), 4)
        if mbr.down:
            # Rettungs-Symbol und Fortschritt
            cx, cy = r.centerx, r.top - 18
            near = abs(mbr.x - self.x) < 3.0
            pygame.draw.circle(s, WHITE, (cx, cy), 12)
            pygame.draw.rect(s, (220, 50, 50), (cx - 3, cy - 8, 6, 16))
            pygame.draw.rect(s, (220, 50, 50), (cx - 8, cy - 3, 16, 6))
            if near:
                text(s, self.font_small, "E halten", (cx, cy - 24), TEXT)
            if mbr.revive > 0:
                need = 2.0 if mbr.kind in ("panzer", "werfer") else 1.2
                bar(s, cx - 24, cy + 16, 48, 6, mbr.revive / need, GREEN)
        elif mbr is not self.player and mbr.hp < mbr.max:
            bar(s, r.centerx - 16, r.top - 6, 32, 4, mbr.hp / mbr.max, GREEN, (30, 30, 30))

    # ---------- HUD und Menüs
    def draw_hud(self):
        s = self.screen
        alpha_rect(s, PANEL, (12, 12, 300, 118), 190, 12)
        text(s, self.font_mid, f"Punkte {self.score}", (26, 34), TEXT, "left")
        for i in range(LIVES):
            shield(s, 34 + i * 24, 54, i < self.lives)
        text(s, self.font_small, f"Treffer {self.pops}", (165, 62), MUTED, "left")
        text(s, self.font_tiny, "Gesundheit", (26, 86), MUTED, "left", False)
        hp = self.player.hp / self.player.max
        bar(s, 110, 81, 190, 10, hp, GREEN if hp > 0.5 else GOLD if hp > 0.25 else RED)
        wp = WEAPONS[self.weapon]
        text(s, self.font, wp["name"], (26, 112), wp["color"], "left")
        up = sum(1 for a in self.allies if not a.down) + 1
        text(s, self.font_small, f"Armee: {up}/{len(self.allies) + 1}", (215, 112), GREEN, "left")

        # Fortschritt im Level
        cx, y = W // 2, 26
        n = len(CHECKPOINTS)
        span = 300
        x0 = cx - span // 2
        alpha_rect(s, PANEL, (x0 - 30, 8, span + 60, 58), 190, 12)
        pygame.draw.line(s, (70, 80, 92), (x0, y), (x0 + span, y), 4)
        prog = (self.section + (1 - self.advancing / 4.0 if self.advancing else 0)) / (n - 1)
        pygame.draw.line(s, GOLD, (x0, y), (x0 + span * min(1, prog), y), 4)
        for i, name in enumerate(CHECKPOINTS):
            px = x0 + span * i / (n - 1)
            reached = i <= self.section
            pygame.draw.circle(s, GOLD if reached else (70, 80, 92), (int(px), y), 7)
            text(s, self.font_tiny, name, (px, y + 18), TEXT if reached else MUTED, shadow=False)
        goal = SECTIONS[self.section]["goal"]
        if self.fort_active() or (self.section == len(SECTIONS) - 1 and self.fort_hp <= 0):
            text(s, self.font_tiny, "Basis", (x0 - 6, 56), RED, "right", False)
            bar(s, x0, 51, span, 8, self.fort_hp / FORT_HP, RED)
        elif goal and not self.secured and not self.advancing:
            bar(s, x0, 51, span, 6, self.sec_pops / goal, GREEN)
        elif self.secured:
            text(s, self.font_tiny, "Gebiet gesichert! V = vorrücken", (cx, 56), GREEN, shadow=False)

        alpha_rect(s, PANEL, self.pause_box, 190, 10)
        pygame.draw.rect(s, TEXT, (self.pause_box.x + 13, self.pause_box.y + 12, 6, 18))
        pygame.draw.rect(s, TEXT, (self.pause_box.x + 24, self.pause_box.y + 12, 6, 18))
        b = self.hud_toggle_box
        if self.towers_on:
            pygame.draw.rect(s, (40, 120, 150), b, border_radius=10)
        else:
            alpha_rect(s, PANEL, b, 190, 10)
        text(s, self.font_small, "Türme AN" if self.towers_on else "Türme AUS", b.center, TEXT if self.towers_on else MUTED)

        # Spezialwaffen
        for i, sp in enumerate(SPECIALS):
            bx, by = W - 196, 66 + i * 34
            alpha_rect(s, PANEL, (bx, by, 184, 28), 190, 8)
            unlocked = self.pops >= sp["need"]
            ready = unlocked and self.special_cd[i] <= 0
            if unlocked and not ready:
                alpha_rect(s, (90, 60, 30), (bx, by, 184 * (1 - self.special_cd[i] / sp["reload"]), 28), 200, 8)
            if ready:
                pygame.draw.rect(s, (255, 140, 60), (bx, by, 184, 28), 2, border_radius=8)
            label = f"{sp['key']}  {sp['name']}" if unlocked else f"{sp['key']}  ab {sp['need']} Treffern"
            text(s, self.font_small, label, (bx + 10, by + 14), TEXT if ready else MUTED, "left", False)

        if self.towers_on and self.tower_lvl >= 0:
            tw = TOWER_LEVELS[self.tower_lvl]
            ready = self.tower_cd <= 0
            box = pygame.Rect(W // 2 - 130, H - 40, 260, 30)
            alpha_rect(s, PANEL, box, 200, 15)
            if not ready:
                alpha_rect(s, (40, 120, 150), (box.x, box.y, max(1, int(box.w * (1 - self.tower_cd / tw["reload"]))), box.h), 200, 15)
            else:
                pygame.draw.rect(s, CYAN, box, 2, border_radius=15)
            text(s, self.font_small, (tw["name"] + " bereit (X)") if ready else "Türme laden …",
                 box.center, CYAN if ready else MUTED, shadow=False)
        if self.ducking:
            text(s, self.font_mid, "IN DECKUNG", (W // 2, H - 70), (180, 220, 255))
        else:
            text(s, self.font_tiny, "Pfeil runter = Deckung", (16, H - 16), MUTED, "left")
        if self.sounds.muted:
            text(s, self.font_small, "Ton aus (M)", (W - 14, H - 24), MUTED, "right")

    def draw_menu(self, kind):
        s = self.screen
        alpha_rect(s, PANEL, (W // 2 - 320, 50, 640, 560), 220, 18)
        if kind == "over":
            text(s, self.font_huge, "Einsatz beendet", (W // 2, 120), GOLD)
            text(s, self.font_big, f"{self.score} Punkte", (W // 2, 195), TEXT)
            text(s, self.font, f"Erreicht: {CHECKPOINTS[self.section]}  ·  {self.pops} Treffer  ·  Waffe: {WEAPONS[self.weapon]['name']}",
                 (W // 2, 245), MUTED)
        elif kind == "win":
            text(s, self.font_huge, "SIEG!", (W // 2, 120), GOLD)
            text(s, self.font_mid, "Die gegnerische Basis ist zerstört. Level geschafft!", (W // 2, 185), TEXT)
            text(s, self.font_big, f"{self.score} Punkte", (W // 2, 240), TEXT)
        else:
            text(s, self.font_huge, "FRONTLINIE 2", (W // 2, 110), GOLD)
            lines = [
                "Rücke vor bis zur gegnerischen Basis und zerstöre sie!",
                "Die Gegner schießen zurück: geh in Deckung (Pfeil runter).",
                "Umgefallene Kameraden rettest du mit E.",
                "Spezialwaffen 1 / 2 / 3: Drohnen, Luftunterstützung, Kampfbomber.",
            ]
            for i, line in enumerate(lines):
                text(s, self.font, line, (W // 2, 170 + i * 30), TEXT)
            text(s, self.font_small, "Pfeile: bewegen · Leertaste: schießen · X: Türme · V: vorrücken · P: Pause",
                 (W // 2, 305), MUTED)
        if kind != "menu":
            if self.new_best:
                text(s, self.font_mid, "Neuer Rekord!", (W // 2, 300), GOLD)
            else:
                text(s, self.font, f"Rekord: {self.best}", (W // 2, 300), MUTED)
        elif self.best:
            text(s, self.font, f"Rekord: {self.best}", (W // 2, 360), GOLD)

        b = self.toggle_box
        pygame.draw.rect(s, (40, 120, 150) if self.towers_on else (50, 56, 66), b, border_radius=14)
        pygame.draw.rect(s, CYAN if self.towers_on else MUTED, b, 2, border_radius=14)
        text(s, self.font_mid, "Kanonentürme: " + ("AN" if self.towers_on else "AUS"), b.center, TEXT)
        text(s, self.font_small, "anklicken oder T drücken", (W // 2, b.bottom + 14), MUTED, shadow=False)
        st = self.start_box
        pygame.draw.rect(s, (150, 100, 20), st.move(0, 4), border_radius=16)
        pygame.draw.rect(s, GOLD, st, border_radius=16)
        text(s, self.font_big, "Los!" if kind == "menu" else "Nochmal", st.center, INK, shadow=False)
        text(s, self.font_small, "oder Leertaste", (W // 2, st.bottom + 16), MUTED, shadow=False)

    # ---------- Hauptschleife
    def frame(self, dt):
        if self.state == "play":
            self.update(dt)
        elif self.state == "menu":
            self.t += dt
            if len(self.enemies) < 6 and random.random() < dt * 0.8:
                self.enemies.append(Enemy(random.choice(["rekrut", "soldat", "elite", "jeep"]), 1.0))
            for e in self.enemies:
                e.z -= e.speed * dt
                if e.z < 8:
                    e.gone = True
            self.enemies = [e for e in self.enemies if not e.gone]

        world = self.draw_world()
        if self.flash > 0:
            alpha_rect(world, RED, (0, 0, W, H), int(self.flash * 300))
        off = (random.randint(-5, 5), random.randint(-5, 5)) if self.shake > 0 else (0, 0)
        self.screen.fill(INK)
        self.screen.blit(world, off)

        if self.state == "menu":
            self.draw_menu("menu")
        else:
            self.draw_hud()
            row = 0
            for tx in self.texts:
                rise = (2.2 - tx["life"]) * 12
                if tx["y"]:
                    y = tx["y"] - rise
                else:
                    y = H * 0.3 + row * 50 - rise
                    row += 1
                text(self.screen, self.font_big if tx["big"] else self.font_mid, tx["msg"], (tx["x"], y), tx["color"])
            if self.state == "pause":
                alpha_rect(self.screen, INK, (0, 0, W, H), 150)
                text(self.screen, self.font_huge, "Pause", (W // 2, H // 2 - 20), TEXT)
                text(self.screen, self.font, "P drücken zum Weiterspielen", (W // 2, H // 2 + 40), MUTED)
            if self.state in ("over", "win"):
                self.draw_menu(self.state)
        pygame.display.flip()

    def run(self, max_frames=None):
        frames = 0
        while True:
            dt = min(0.05, self.clock.tick(FPS) / 1000)
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT:
                    self.quit()
                elif ev.type == pygame.KEYDOWN:
                    self.on_key(ev.key)
                elif ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                    self.on_click(ev.pos)
            self.frame(dt)
            frames += 1
            if max_frames and frames >= max_frames:
                return


if __name__ == "__main__":
    Game().run()
