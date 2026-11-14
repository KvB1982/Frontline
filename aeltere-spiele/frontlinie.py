"""
Frontlinie – Soldaten-Schießspiel in 3D-Perspektive (ab ca. 10 Jahren).

Du bist der Anführer einer kleinen Armee. Gegnerische Soldaten marschieren
von hinten auf dem Feld auf dich zu. Getroffene Gegner fallen um und
verschwinden. Je mehr du triffst, desto stärkere Waffen bekommst du und
desto mehr Kameraden kämpfen mit. Die Kanonentürme werden mit der Zeit
immer besser (Kanone, Doppelkanone, Raketenturm, Mega-Turm) und lassen
sich im Menü oder mit T an- und ausschalten.

Die Zahl der Gegner wächst mit, bleibt aber immer so, dass deine Armee
sie schaffen kann.

Steuerung:
  Pfeil links / rechts (oder A / D)   bewegen
  Leertaste (halten)                   schießen
  X                                    Kanonentürme feuern
  T                                    Kanonentürme an/aus
  P oder Esc                           Pause
  M                                    Ton an/aus

Start:  pip install pygame   und dann   python frontlinie.py
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
HORIZON = 230          # Bildschirmhöhe des Horizonts
BOTTOM = 660           # Bildschirmhöhe des Bodens bei Tiefe 0
FOCAL = 7.0            # Brennweite in Metern
PX_PER_M = 62          # Pixel pro Meter bei Maßstab 1
ROAD_HALF = 6.0        # halbe Breite des Kampffeldes in Metern
Z_FAR = 36.0           # hier tauchen die Gegner auf
PLAYER_Z = 1.8
ALLY_Z = 2.6
BREACH_Z = 2.4         # erreicht ein Gegner diese Tiefe, ist er durchgebrochen
TOWER_Z = 5.0
TOWER_XS = [-8.4, 8.4]


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

# ---------------------------------------------------------------- Spielwerte
WEAPONS = [
    {"name": "Pistole",        "need": 0,   "rate": 0.38, "dmg": 1, "shots": 1, "spread": 0.0,  "color": (255, 230, 140), "rocket": 0},
    {"name": "Gewehr",         "need": 12,  "rate": 0.26, "dmg": 1, "shots": 1, "spread": 0.0,  "color": (255, 230, 140), "rocket": 0},
    {"name": "Sturmgewehr",    "need": 35,  "rate": 0.13, "dmg": 1, "shots": 1, "spread": 0.0,  "color": (255, 210, 110), "rocket": 0},
    {"name": "Doppel-MG",      "need": 70,  "rate": 0.12, "dmg": 1, "shots": 2, "spread": 0.35, "color": (255, 190, 90),  "rocket": 0},
    {"name": "Plasma-Blaster", "need": 120, "rate": 0.11, "dmg": 2, "shots": 2, "spread": 0.4,  "color": CYAN,            "rocket": 0},
    {"name": "Gatling-Laser",  "need": 190, "rate": 0.07, "dmg": 2, "shots": 3, "spread": 0.45, "color": (255, 90, 220),  "rocket": 0},
    {"name": "Mega-Kanone",    "need": 280, "rate": 0.07, "dmg": 3, "shots": 3, "spread": 0.5,  "color": (255, 150, 40),  "rocket": 5},
]
ALLY_STEPS = [6, 20, 45, 80, 125, 180]               # Treffer für Kamerad 1..6
ALLY_OFFSETS = [-1.5, 1.5, -3.0, 3.0, -4.5, 4.5]
TOWER_LEVELS = [
    {"need": 30,  "name": "Kanonenturm",  "count": 1, "reload": 3.0, "kind": "shell",  "n": 1, "dmg": 4, "radius": 2.2},
    {"need": 75,  "name": "Zwei Kanonentürme", "count": 2, "reload": 2.6, "kind": "shell", "n": 1, "dmg": 4, "radius": 2.2},
    {"need": 140, "name": "Doppelkanone", "count": 2, "reload": 2.2, "kind": "shell",  "n": 2, "dmg": 5, "radius": 2.5},
    {"need": 220, "name": "Raketenturm",  "count": 2, "reload": 1.9, "kind": "rocket", "n": 2, "dmg": 6, "radius": 2.8},
    {"need": 320, "name": "Mega-Turm",    "count": 2, "reload": 1.4, "kind": "rocket", "n": 3, "dmg": 8, "radius": 3.3},
]
ENEMIES = {
    "rekrut":     {"hp": 1,  "speed": 2.6, "size": 0.95, "pts": 10},
    "soldat":     {"hp": 2,  "speed": 2.9, "size": 1.0,  "pts": 20},
    "elite":      {"hp": 4,  "speed": 3.1, "size": 1.04, "pts": 40},
    "schwer":     {"hp": 8,  "speed": 2.0, "size": 1.12, "pts": 80},
    "kommandant": {"hp": 15, "speed": 1.8, "size": 1.16, "pts": 200},
}
LIVES = 5
# Wie stark die Gegner gegen die eigene Armee drücken (0.4 = leicht, 0.65 = normal, 0.9 = schwer).
# Über 1.0 kann die Armee irgendwann nicht mehr alle schaffen.
SCHWIERIGKEIT = 0.65

SAVE_FILE = os.path.join(os.path.expanduser("~"), ".frontlinie.json")


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
            pygame.mixer.set_num_channels(24)
            self.ok = True
        except pygame.error:
            return
        self.shot = self._tone(180, 0.07, 0.25, wave="noise", slide=-60)
        self.laser = self._tone(1200, 0.09, 0.12, wave="square", slide=-800)
        self.hit = self._tone(400, 0.05, 0.12, wave="square", slide=-150)
        self.down = self._tone(240, 0.18, 0.25, wave="tri", slide=-140)
        self.cannon = self._tone(90, 0.4, 0.5, wave="noise", slide=-40)
        self.boom = self._tone(70, 0.5, 0.55, wave="noise", slide=-30)
        self.up = self._tone(520, 0.1, 0.3, wave="square", then=(780, 0.18))
        self.alarm = self._tone(440, 0.25, 0.25, wave="saw", slide=-200)

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
                    # gefiltertes Rauschen plus tiefer Wumms
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


# ---------------------------------------------------------------- Figuren zeichnen
# Die Soldaten werden einmal groß gezeichnet und dann je nach Entfernung skaliert.
SPRITE_W, SPRITE_H = 100, 150
SPRITE_METERS = 2.4    # so viele Meter entsprechen der Sprite-Höhe

PALETTES = {
    # Gegner (von vorne gesehen): schlichtere graue/braune Uniformen
    "rekrut":     {"uniform": (122, 116, 98),  "pants": (98, 92, 78),  "vest": (110, 104, 88), "helmet": (88, 84, 70),  "bulk": 0.95, "hat": "cap"},
    "soldat":     {"uniform": (110, 108, 96),  "pants": (86, 84, 74),  "vest": (92, 90, 80),   "helmet": (78, 80, 70),  "bulk": 1.0,  "hat": "helmet"},
    "elite":      {"uniform": (96, 100, 108),  "pants": (74, 78, 86),  "vest": (70, 74, 82),   "helmet": (62, 66, 74),  "bulk": 1.05, "hat": "helmet"},
    "schwer":     {"uniform": (84, 86, 90),    "pants": (64, 66, 70),  "vest": (58, 60, 64),   "helmet": (52, 54, 58),  "bulk": 1.22, "hat": "visor"},
    "kommandant": {"uniform": (92, 78, 70),    "pants": (70, 60, 54),  "vest": (80, 66, 58),   "helmet": (170, 40, 40), "bulk": 1.15, "hat": "beret"},
    # eigene Leute (von hinten gesehen)
    "kamerad":    {"uniform": (74, 104, 62),   "pants": (60, 84, 52),  "vest": (88, 112, 70),  "helmet": (66, 92, 56),  "bulk": 1.0,  "pack": (96, 84, 60)},
    "held":       {"uniform": (34, 38, 46),    "pants": (28, 30, 36),  "vest": (46, 52, 62),   "helmet": (26, 28, 34),  "bulk": 1.3,  "pack": (40, 46, 56)},
}

_sprite_cache = {}


def _rect(s, color, x, y, w, h, rad=0):
    pygame.draw.rect(s, color, (int(x), int(y), int(w), int(h)), border_radius=rad)


def draw_back_gun(s, gx, gy, lvl):
    """Waffe des eigenen Soldaten, zeigt nach vorne (im Bild nach oben)."""
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
    p = PALETTES[kind]
    s = pygame.Surface((SPRITE_W, SPRITE_H), pygame.SRCALPHA)
    cx, b = SPRITE_W // 2, SPRITE_H - 4
    bulk = p["bulk"]
    swing = [0, 5, 0, -5][frame]
    lw = 11 * bulk
    lift_l, lift_r = max(0, swing), max(0, -swing)
    # Beine und Stiefel
    _rect(s, p["pants"], cx - 3 - lw, b - 44, lw, 38 - lift_l, 3)
    _rect(s, p["pants"], cx + 3, b - 44, lw, 38 - lift_r, 3)
    _rect(s, BOOT, cx - 5 - lw, b - 9 - lift_l, lw + 4, 9, 3)
    _rect(s, BOOT, cx + 1, b - 9 - lift_r, lw + 4, 9, 3)
    # Oberkörper
    tw = 38 * bulk
    _rect(s, p["uniform"], cx - tw / 2, b - 88, tw, 48, 9)
    _rect(s, p["vest"], cx - tw / 2 + 4, b - 84, tw - 8, 36, 6)
    _rect(s, BELT, cx - tw / 2, b - 47, tw, 6)
    back = "pack" in p

    if back:
        # von hinten: Rucksack, Helm, Waffe rechts nach vorne gerichtet
        _rect(s, p["pack"], cx - 15 * bulk, b - 84, 30 * bulk, 32, 7)
        _rect(s, p["uniform"], cx - tw / 2 - 8, b - 84, 10, 32, 5)          # linker Arm
        _rect(s, p["uniform"], cx + tw / 2 - 3, b - 86, 10, 22, 5)          # rechter Arm
        if kind == "held":
            for sx in (cx - tw / 2, cx + tw / 2):                            # Schulterpanzer
                pygame.draw.circle(s, (56, 62, 74), (int(sx), b - 84), int(10 * bulk))
                pygame.draw.circle(s, (80, 88, 104), (int(sx), b - 84), int(10 * bulk), 2)
            _rect(s, CYAN, cx - 10, b - 76, 20, 3, 1)                        # Leuchtstreifen
            _rect(s, CYAN, cx - 10, b - 66, 20, 3, 1)
            pygame.draw.line(s, (90, 96, 110), (cx + 8, b - 112), (cx + 14, b - 132), 2)  # Antenne
            pygame.draw.circle(s, RED, (cx + 14, b - 133), 3)
        pygame.draw.circle(s, p["helmet"], (cx, b - 100), int(13 * min(bulk, 1.15)))
        pygame.draw.ellipse(s, p["helmet"], (cx - 16 * min(bulk, 1.15), b - 98, 32 * min(bulk, 1.15), 9))
        if kind == "held":
            pygame.draw.arc(s, CYAN, (cx - 13, b - 113, 26, 26), math.pi * 0.15, math.pi * 0.85, 2)
        draw_back_gun(s, cx + tw / 2 + 2, b - 76, lvl)
    else:
        # von vorne: Gewehr quer vor der Brust, Gesicht, Kopfbedeckung
        skin = (214, 172, 136)
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
            pygame.draw.circle(s, GOLD, (cx + 10, b - 76), 4)               # Orden
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
        if len(_sprite_cache) > 3000:
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
    s = pygame.Surface((int(rect[2]), int(rect[3])), pygame.SRCALPHA)
    pygame.draw.rect(s, (*color, alpha), (0, 0, int(rect[2]), int(rect[3])), border_radius=radius)
    surf.blit(s, (int(rect[0]), int(rect[1])))


def shield(surf, x, y, filled):
    color = GREEN if filled else (60, 70, 80)
    pts = [(x - 8, y), (x + 8, y), (x + 8, y + 9), (x, y + 16), (x - 8, y + 9)]
    pygame.draw.polygon(surf, color, pts)
    pygame.draw.polygon(surf, (20, 30, 20), pts, 2)


# ---------------------------------------------------------------- Spielobjekte
class Enemy:
    def __init__(self, kind, speed_mul):
        d = ENEMIES[kind]
        self.kind = kind
        self.hp = self.max = d["hp"]
        self.speed = d["speed"] * speed_mul * random.uniform(0.9, 1.1)
        self.size = d["size"]
        self.pts = d["pts"]
        self.x = self.base_x = random.uniform(-ROAD_HALF + 0.6, ROAD_HALF - 0.6)
        self.z = Z_FAR + random.uniform(0, 3)
        self.phase = random.uniform(0, math.tau)
        self.hit_t = 0.0
        self.dying = -1.0          # >= 0: fällt gerade um
        self.fall_dir = random.choice((-1, 1))
        self.gone = False

    @property
    def alive(self):
        return self.dying < 0 and not self.gone


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Frontlinie")
        self.screen = pygame.display.set_mode((W, H), pygame.SCALED | pygame.RESIZABLE)
        self.clock = pygame.time.Clock()
        self.font_huge = pygame.font.Font(None, 96)
        self.font_big = pygame.font.Font(None, 58)
        self.font_mid = pygame.font.Font(None, 38)
        self.font = pygame.font.Font(None, 28)
        self.font_small = pygame.font.Font(None, 22)
        self.sounds = Sounds()

        self.settings = load_settings()
        self.towers_on = self.settings.get("towers", True)
        self.best = self.settings.get("best", 0)
        self.sounds.muted = self.settings.get("muted", False)

        self.background = self.make_background()
        self.props = self.make_props()
        self.toggle_box = pygame.Rect(W // 2 - 170, 420, 340, 54)
        self.start_box = pygame.Rect(W // 2 - 130, 500, 260, 66)
        self.pause_box = pygame.Rect(W - 54, 12, 42, 42)
        self.hud_toggle_box = pygame.Rect(W - 176, 12, 112, 42)
        self.state = "menu"
        self.new_game()

    # ---------- Zustand
    def new_game(self):
        self.t = 0.0
        self.x = 0.0
        self.score = 0
        self.pops = 0
        self.lives = LIVES
        self.weapon = 0
        self.allies = 0
        self.tower_lvl = -1
        self.fire_cd = 0.0
        self.ally_cd = 0.0
        self.shot_count = 0
        self.tower_cd = 0.0
        self.muzzle_t = 0.0
        self.spawn_cd = 1.5
        self.enemies = []
        self.bullets = []
        self.shells = []
        self.effects = []
        self.texts = []
        self.shake = 0.0
        self.flash = 0.0
        self.new_best = False

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

    def say(self, msg, color=GOLD, big=True, y=None):
        self.texts.append({"msg": msg, "x": W / 2, "y": y, "color": color, "big": big, "life": 2.0})

    def squad(self):
        """Weltpositionen (x, z, art) aller eigenen Soldaten."""
        out = [(self.x, PLAYER_Z, "held")]
        for i in range(self.allies):
            out.append((self.x + ALLY_OFFSETS[i], ALLY_Z, "kamerad"))
        return out

    def squad_extent(self):
        offs = [0] + ALLY_OFFSETS[:self.allies]
        return min(offs), max(offs)

    # ---------- Eingabe
    def on_key(self, key):
        if key == pygame.K_m:
            self.sounds.muted = not self.sounds.muted
            self.save()
            return
        if self.state in ("menu", "over"):
            if key in (pygame.K_t, pygame.K_UP, pygame.K_DOWN):
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
        if key in (pygame.K_x, pygame.K_c):
            self.fire_towers()

    def on_click(self, pos):
        if self.state in ("menu", "over"):
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

    # ---------- Fortschritt und Schwierigkeit
    def check_upgrades(self):
        w = max(i for i, wp in enumerate(WEAPONS) if self.pops >= wp["need"])
        if w > self.weapon:
            self.weapon = w
            self.sounds.play("up")
            self.say("Neue Waffe: " + WEAPONS[w]["name"] + "!")
        a = sum(1 for need in ALLY_STEPS if self.pops >= need)
        if a > self.allies:
            self.allies = a
            self.sounds.play("up")
            self.say("Verstärkung! " + str(a + 1) + " Soldaten", GREEN)
        tl = max([i for i, tw in enumerate(TOWER_LEVELS) if self.pops >= tw["need"]], default=-1)
        if tl > self.tower_lvl:
            self.tower_lvl = tl
            if self.towers_on:
                self.sounds.play("up")
                msg = TOWER_LEVELS[tl]["name"] + (" bereit! Drücke X" if tl == 0 else " freigeschaltet!")
                self.say(msg, CYAN)

    def weapon_dps(self, lvl, slow=1.0):
        wp = WEAPONS[lvl]
        return wp["dmg"] * wp["shots"] / (wp["rate"] * slow)

    def army_dps(self):
        """Wie viel Schaden pro Sekunde die eigene Armee schafft (vorsichtig geschätzt)."""
        dps = self.weapon_dps(self.weapon) * 0.6          # der Spieler trifft nicht immer
        dps += self.allies * self.weapon_dps(max(0, self.weapon - 1), 1.4) * 0.45
        if self.towers_on and self.tower_lvl >= 0:
            tw = TOWER_LEVELS[self.tower_lvl]
            dps += tw["count"] * tw["n"] * tw["dmg"] / tw["reload"] * 0.5
        return dps

    def enemy_weights(self):
        p = self.pops
        return {
            "rekrut": max(1.0, 6 - p / 25),
            "soldat": 0 if p < 10 else min(5, 1 + p / 25),
            "elite": 0 if p < 50 else min(4, (p - 50) / 30),
            "schwer": 0 if p < 100 else min(2.5, (p - 100) / 50),
            "kommandant": 0 if p < 200 else min(0.8, (p - 200) / 120),
        }

    def spawn_enemy(self):
        weights = self.enemy_weights()
        kinds = list(weights)
        kind = random.choices(kinds, [weights[k] for k in kinds])[0]
        self.enemies.append(Enemy(kind, 1 + min(0.35, self.t / 400)))

    def next_spawn_delay(self):
        weights = self.enemy_weights()
        total = sum(weights.values())
        avg_hp = sum(ENEMIES[k]["hp"] * w for k, w in weights.items()) / total
        # Mit der Zeit kommen immer mehr Gegner. Sie bringen aber nie mehr als
        # etwa zwei Drittel so viel Lebenspunkte pro Sekunde, wie die Armee an Schaden
        # schafft. So bleibt es immer schaffbar.
        wanted = 1.0 + self.t / 20
        pressure = min(wanted, SCHWIERIGKEIT * self.army_dps())
        return max(0.12, min(2.6, avg_hp / pressure)) * random.uniform(0.75, 1.25)

    def max_enemies(self):
        return 6 + 3 * (self.allies + 1)

    # ---------- Kampf
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

    def allies_shoot(self):
        lvl = max(0, self.weapon - 1)
        wp = WEAPONS[lvl]
        for i in range(self.allies):
            ax = self.x + ALLY_OFFSETS[i]
            # Kameraden zielen auf den nächsten Gegner in ihrer Nähe
            near = [e for e in self.enemies if e.alive and abs(e.x - ax) < 3.0 and e.z < Z_FAR - 4]
            vx = 0.0
            if near:
                tgt = min(near, key=lambda e: e.z)
                travel = max(0.2, (tgt.z - ALLY_Z) / 44.0)
                vx = (tgt.x - ax) / travel
            for k in range(wp["shots"]):
                off = 0 if wp["shots"] == 1 else (k - (wp["shots"] - 1) / 2) * 0.3
                self.bullets.append({"x": ax + 0.3 + off, "z": ALLY_Z + 0.5, "vx": vx, "vz": 44.0,
                                     "dmg": wp["dmg"], "color": wp["color"], "rocket": False, "big": False})

    def fire_towers(self):
        if not self.towers_on or self.tower_lvl < 0 or self.tower_cd > 0:
            return
        tw = TOWER_LEVELS[self.tower_lvl]
        self.tower_cd = tw["reload"]
        self.shake = 0.18
        self.sounds.play("cannon")
        targets = sorted([e for e in self.enemies if e.alive and e.z < Z_FAR - 2], key=lambda e: e.z)
        for ti in range(tw["count"]):
            tx = TOWER_XS[ti] if tw["count"] == 2 else TOWER_XS[0]
            for k in range(tw["n"]):
                tgt = targets[(ti * tw["n"] + k) % len(targets)] if targets else None
                aim = (tgt.x, tgt.z + tgt.speed * 0.8) if tgt else (random.uniform(-4, 4), random.uniform(12, 25))
                self.shells.append({"kind": tw["kind"], "x": tx, "z": TOWER_Z, "h": 4.2,
                                    "sx": tx, "sz": TOWER_Z, "tx": aim[0], "tz": aim[1], "t": -k * 0.12,
                                    "dur": 0.8, "target": tgt, "dmg": tw["dmg"], "radius": tw["radius"]})
            self.effects.append({"kind": "flash", "x": tx, "z": TOWER_Z, "h": 4.3, "life": 0.15, "max": 0.15})

    def damage(self, e, d):
        if not e.alive:
            return
        e.hp -= d
        e.hit_t = 0.1
        if e.hp <= 0:
            e.dying = 0.0
            self.score += e.pts
            self.pops += 1
            self.sounds.play("down")
            self.effects.append({"kind": "dust", "x": e.x, "z": e.z, "h": 0.2, "life": 0.6, "max": 0.6})
            self.check_upgrades()
        else:
            self.sounds.play("hit")

    def explode(self, x, z, radius, dmg):
        self.sounds.play("boom")
        self.shake = max(self.shake, 0.2)
        self.effects.append({"kind": "boom", "x": x, "z": z, "h": 0.5, "life": 0.5, "max": 0.5, "r": radius})
        for e in self.enemies:
            if e.alive and math.hypot(e.x - x, (e.z - z) * 0.7) < radius:
                self.damage(e, dmg)

    # ---------- Update
    def update(self, dt):
        self.t += dt
        self.fire_cd -= dt
        self.ally_cd -= dt
        self.tower_cd = max(0.0, self.tower_cd - dt)
        self.muzzle_t = max(0.0, self.muzzle_t - dt)
        self.shake = max(0.0, self.shake - dt)
        self.flash = max(0.0, self.flash - dt)

        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.x -= 6.0 * dt
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.x += 6.0 * dt
        lo, hi = self.squad_extent()
        self.x = max(-ROAD_HALF - 0.8 - lo, min(ROAD_HALF + 0.8 - hi, self.x))

        if keys[pygame.K_SPACE] and self.fire_cd <= 0:
            self.fire_cd = WEAPONS[self.weapon]["rate"]
            self.shoot()
        # Kameraden schießen von selbst, sobald Gegner da sind
        if self.allies and self.ally_cd <= 0 and any(e.alive and e.z < Z_FAR - 4 for e in self.enemies):
            self.ally_cd = WEAPONS[max(0, self.weapon - 1)]["rate"] * 1.4
            self.allies_shoot()

        self.spawn_cd -= dt
        if self.spawn_cd <= 0:
            delay = self.next_spawn_delay()
            # bei einer starken Armee kommen die Gegner in Gruppen
            group = max(1, round(0.6 / delay)) if delay < 0.6 else 1
            for _ in range(group):
                if sum(1 for e in self.enemies if e.alive) < self.max_enemies():
                    self.spawn_enemy()
            self.spawn_cd = max(delay, 0.6) if group > 1 else delay

        # Gegner bewegen
        for e in self.enemies:
            e.hit_t = max(0.0, e.hit_t - dt)
            if e.dying >= 0:
                e.dying += dt
                if e.dying > 1.0:
                    e.gone = True
                continue
            e.z -= e.speed * dt
            e.x = e.base_x + math.sin(self.t * 0.7 + e.phase) * 1.2
            e.x = max(-ROAD_HALF + 0.4, min(ROAD_HALF - 0.4, e.x))
            if e.z < BREACH_Z:
                e.gone = True
                self.lives -= 1
                self.flash = 0.35
                self.sounds.play("alarm")
                self.say("Durchgebrochen!", RED, False, H * 0.55)
                if self.lives <= 0:
                    self.state = "over"
                    if self.score > self.best:
                        self.best = self.score
                        self.new_best = True
                        self.save()

        # Kugeln
        for b in self.bullets:
            z0 = b["z"]
            b["z"] += b["vz"] * dt
            b["x"] += b["vx"] * dt
            for e in self.enemies:
                if not e.alive:
                    continue
                if z0 - 0.4 <= e.z <= b["z"] + 0.4 and abs(e.x - b["x"]) < 0.45 * e.size + 0.1:
                    b["gone"] = True
                    if b["rocket"]:
                        self.explode(b["x"], e.z, 2.4, b["dmg"])
                    else:
                        self.damage(e, b["dmg"])
                        self.effects.append({"kind": "spark", "x": b["x"], "z": e.z - 0.2, "h": 1.2,
                                             "life": 0.12, "max": 0.12, "c": b["color"]})
                    break
            if b["z"] > Z_FAR + 4:
                b["gone"] = True
        self.bullets = [b for b in self.bullets if not b.get("gone")]

        # Turmgeschosse: Granaten im Bogen, Raketen suchen ihr Ziel
        for s in self.shells:
            s["t"] += dt
            if s["t"] < 0:
                continue
            if s["kind"] == "rocket":
                tgt = s["target"]
                if tgt is None or not tgt.alive:
                    alive = [e for e in self.enemies if e.alive]
                    tgt = s["target"] = min(alive, key=lambda e: math.hypot(e.x - s["x"], e.z - s["z"])) if alive else None
                if tgt:
                    s["tx"], s["tz"] = tgt.x, tgt.z
                dx, dz = s["tx"] - s["x"], s["tz"] - s["z"]
                d = math.hypot(dx, dz) or 1
                step = 26 * dt
                s["x"] += dx / d * min(step, d)
                s["z"] += dz / d * min(step, d)
                s["h"] = max(0.8, s["h"] - dt * 3)
                if s["t"] > 0.05 and len(self.effects) < 220:
                    self.effects.append({"kind": "smoke", "x": s["x"], "z": s["z"], "h": s["h"], "life": 0.4, "max": 0.4})
                if d < 0.6 or s["t"] > 4:
                    s["gone"] = True
                    self.explode(s["x"], s["z"], s["radius"], s["dmg"])
            else:
                k = min(1.0, s["t"] / s["dur"])
                s["x"] = s["sx"] + (s["tx"] - s["sx"]) * k
                s["z"] = s["sz"] + (s["tz"] - s["sz"]) * k
                s["h"] = 4.2 * (1 - k) + math.sin(k * math.pi) * 6
                if k >= 1:
                    s["gone"] = True
                    self.explode(s["x"], s["z"], s["radius"], s["dmg"])
        self.shells = [s for s in self.shells if not s.get("gone")]

        self.enemies = [e for e in self.enemies if not e.gone]
        for fx in self.effects:
            fx["life"] -= dt
        self.effects = [fx for fx in self.effects if fx["life"] > 0]
        for tx in self.texts:
            tx["life"] -= dt
        self.texts = [tx for tx in self.texts if tx["life"] > 0]

    # ---------- Hintergrund
    def make_background(self):
        bg = pygame.Surface((W, H))
        for y in range(0, HORIZON + 4, 2):
            k = y / HORIZON
            c = (int(70 + 120 * k), int(110 + 90 * k), int(160 + 60 * k))
            pygame.draw.rect(bg, c, (0, y, W, 2))
        pygame.draw.circle(bg, (255, 230, 170), (760, 90), 36)
        rnd = random.Random(7)
        for layer, (col, base, amp) in enumerate([((110, 130, 150), HORIZON - 10, 70), ((90, 108, 112), HORIZON, 40)]):
            pts = [(0, H)]
            x = 0
            while x <= W + 40:
                pts.append((x, base - rnd.uniform(0.3, 1) * amp))
                x += rnd.randint(40, 90)
            pts.append((W, H))
            pygame.draw.polygon(bg, col, pts)
        # Boden mit Streifen für Tiefenwirkung
        z = 0.0
        stripe = 0
        while z < 80:
            z2 = z + 3.0
            y1 = project(0, z)[1]
            y2 = project(0, z2)[1]
            col = (106, 128, 70) if stripe % 2 else (98, 120, 64)
            pygame.draw.rect(bg, col, (0, int(y2), W, int(y1 - y2) + 1))
            z, stripe = z2, stripe + 1
        # Kampffeld (Sandweg)
        z = 0.0
        stripe = 0
        while z < 80:
            z2 = z + 3.0
            a = project(-ROAD_HALF, z)
            b = project(ROAD_HALF, z)
            c = project(ROAD_HALF, z2)
            d = project(-ROAD_HALF, z2)
            col = (176, 150, 104) if stripe % 2 else (166, 140, 96)
            pygame.draw.polygon(bg, col, [(a[0], a[1]), (b[0], b[1]), (c[0], c[1]), (d[0], d[1])])
            z, stripe = z2, stripe + 1
        for side in (-1, 1):
            p1 = project(side * ROAD_HALF, 0)
            p2 = project(side * ROAD_HALF, 80)
            pygame.draw.line(bg, (130, 110, 76), (p1[0], p1[1]), (p2[0], p2[1]), 3)
        return bg

    def make_props(self):
        rnd = random.Random(3)
        props = []
        for i in range(26):
            side = rnd.choice((-1, 1))
            x = side * rnd.uniform(ROAD_HALF + 1.5, ROAD_HALF + 14)
            z = rnd.uniform(6, 60)
            props.append({"kind": rnd.choice(["tree", "tree", "rock", "bush"]), "x": x, "z": z, "s": rnd.uniform(0.8, 1.4)})
        for i in range(6):
            props.append({"kind": "barrier", "x": rnd.uniform(-5, 5), "z": rnd.uniform(14, 40), "s": 1.0})
        return props

    # ---------- Zeichnen einzelner Dinge
    def draw_prop(self, s, p):
        sx, sy, sc = project(p["x"], p["z"])
        m = PX_PER_M * sc * p["s"]
        if p["kind"] == "tree":
            pygame.draw.rect(s, (90, 64, 40), (sx - 0.15 * m, sy - 1.2 * m, 0.3 * m, 1.2 * m))
            for k, w in enumerate((1.6, 1.2, 0.8)):
                y0 = sy - (1.0 + k * 0.9) * m
                pygame.draw.polygon(s, (52 + k * 10, 92 + k * 8, 56), [(sx - w * m, y0), (sx + w * m, y0), (sx, y0 - 1.6 * m)])
        elif p["kind"] == "rock":
            pygame.draw.ellipse(s, (120, 118, 112), (sx - 0.8 * m, sy - 0.8 * m, 1.6 * m, 0.9 * m))
            pygame.draw.ellipse(s, (146, 144, 136), (sx - 0.5 * m, sy - 0.75 * m, 0.7 * m, 0.4 * m))
        elif p["kind"] == "bush":
            for dx in (-0.4, 0, 0.4):
                pygame.draw.circle(s, (70, 110, 60), (int(sx + dx * m), int(sy - 0.35 * m)), max(1, int(0.45 * m)))
        else:  # Sandsack-Barriere (nur Deko, man schießt darüber)
            for row in range(2):
                for k in range(4 - row):
                    bx = sx + (k - (3 - row) / 2) * 0.55 * m
                    by = sy - (0.3 + row * 0.28) * m
                    pygame.draw.ellipse(s, (150, 132, 92), (bx - 0.3 * m, by - 0.16 * m, 0.6 * m, 0.32 * m))
                    pygame.draw.ellipse(s, (120, 104, 70), (bx - 0.3 * m, by - 0.16 * m, 0.6 * m, 0.32 * m), 1)

    def draw_soldier(self, s, kind, x, z, frame, lvl=0, size=1.0, dying=-1.0, fall_dir=1, hit=False):
        sx, sy, sc = project(x, z)
        img = soldier_image(kind, frame, lvl, size, sc)
        # Schatten
        sw = int(0.9 * size * PX_PER_M * sc)
        if sw > 2:
            alpha_rect(s, (0, 0, 0), (sx - sw / 2, sy - sw * 0.12, sw, sw * 0.24), 60, int(sw * 0.12))
        if dying >= 0:
            k = min(1.0, dying / 0.45)
            img = pygame.transform.rotate(img, -fall_dir * 88 * (k * k))
            fade = 1.0 if dying < 0.55 else max(0.0, 1 - (dying - 0.55) / 0.45)
            img = img.copy()
            img.set_alpha(int(255 * fade))
        elif hit:
            img = img.copy()
            img.fill((90, 90, 90), special_flags=pygame.BLEND_RGB_ADD)
        r = img.get_rect(midbottom=(int(sx), int(sy)))
        s.blit(img, r)
        return r

    def draw_tower(self, s, x, lvl):
        sx, sy, sc = project(x, TOWER_Z)
        m = PX_PER_M * sc
        ready = self.tower_cd <= 0
        base_col = [(120, 116, 104), (120, 116, 104), (96, 104, 112), (70, 80, 96), (46, 52, 66)][lvl]
        pygame.draw.ellipse(s, (60, 70, 50), (sx - 1.6 * m, sy - 0.3 * m, 3.2 * m, 0.6 * m))
        # Sockel
        pygame.draw.rect(s, base_col, (sx - 1.2 * m, sy - 3.2 * m, 2.4 * m, 3.2 * m), border_radius=int(0.2 * m))
        for k in range(3):
            pygame.draw.rect(s, tuple(max(0, c - 25) for c in base_col), (sx - 1.2 * m, sy - (0.9 + k) * m, 2.4 * m, 0.12 * m))
        for k in range(4):
            pygame.draw.rect(s, base_col, (sx - 1.2 * m + k * 0.68 * m, sy - 3.6 * m, 0.4 * m, 0.5 * m))
        top = sy - 3.6 * m
        glow = CYAN if ready else (90, 100, 110)
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
        pygame.draw.rect(s, glow, (sx - 0.8 * m, sy - 2.4 * m, 1.6 * m, 0.15 * m))
        # Stufen-Sterne
        for k in range(lvl + 1):
            pygame.draw.circle(s, GOLD, (int(sx - 0.6 * m + k * 0.3 * m), int(sy - 1.6 * m)), max(1, int(0.1 * m)))

    def draw_effect(self, s, fx):
        sx, sy, sc = project(fx["x"], fx["z"], fx["h"])
        m = PX_PER_M * sc
        k = 1 - fx["life"] / fx["max"]
        if fx["kind"] == "boom":
            r = fx["r"] * m * (0.4 + 0.8 * k)
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

    def draw_shell(self, s, sh):
        sx, sy, sc = project(sh["x"], sh["z"], sh["h"])
        m = PX_PER_M * sc
        if sh["kind"] == "rocket":
            pygame.draw.circle(s, (230, 230, 230), (int(sx), int(sy)), max(2, int(0.22 * m)))
            pygame.draw.circle(s, (255, 160, 40), (int(sx), int(sy + 0.2 * m)), max(2, int(0.16 * m)))
        else:
            pygame.draw.circle(s, (40, 40, 44), (int(sx), int(sy)), max(2, int(0.28 * m)))
            pygame.draw.circle(s, (120, 120, 130), (int(sx - 0.08 * m), int(sy - 0.08 * m)), max(1, int(0.1 * m)))

    def draw_world(self, dt, surf=None):
        s = surf or pygame.Surface((W, H))
        s.blit(self.background, (0, 0))

        items = []
        for p in self.props:
            items.append((p["z"], 0, lambda p=p: self.draw_prop(s, p)))
        if self.towers_on and self.tower_lvl >= 0:
            tw = TOWER_LEVELS[self.tower_lvl]
            for i in range(tw["count"]):
                x = TOWER_XS[i] if tw["count"] == 2 else TOWER_XS[0]
                items.append((TOWER_Z, 1, lambda x=x: self.draw_tower(s, x, self.tower_lvl)))
        for e in self.enemies:
            frame = int(self.t * 7 + e.phase) % 4 if e.dying < 0 else 0
            items.append((e.z, 2, lambda e=e, f=frame: self.draw_enemy(s, e, f)))
        moving = self.state == "play" and (pygame.key.get_pressed()[pygame.K_LEFT] or pygame.key.get_pressed()[pygame.K_RIGHT])
        for x, z, kind in self.squad():
            frame = int(self.t * 9) % 4 if moving else 0
            lvl = self.weapon if kind == "held" else max(0, self.weapon - 1)
            size = 1.3 if kind == "held" else 1.0
            items.append((z, 3, lambda x=x, z=z, kind=kind, frame=frame, lvl=lvl, size=size:
                          self.draw_friend(s, kind, x, z, frame, lvl, size)))
        for b in self.bullets:
            items.append((b["z"], 4, lambda b=b: self.draw_bullet(s, b)))
        for sh in self.shells:
            if sh["t"] >= 0:
                items.append((sh["z"] - 0.5, 4, lambda sh=sh: self.draw_shell(s, sh)))
        for fx in self.effects:
            items.append((fx["z"] - 0.3, 5, lambda fx=fx: self.draw_effect(s, fx)))

        items.sort(key=lambda it: (-it[0], it[1]))
        for _, _, fn in items:
            fn()
        return s

    def draw_enemy(self, s, e, frame):
        r = self.draw_soldier(s, e.kind, e.x, e.z, frame, 0, e.size, e.dying, e.fall_dir, e.hit_t > 0)
        if e.alive and e.max > 1 and r.h > 24:
            w = max(16, int(r.w * 0.8))
            x0, y0 = r.centerx - w // 2, r.top - 8
            pygame.draw.rect(s, (30, 30, 30), (x0, y0, w, 5), border_radius=2)
            pygame.draw.rect(s, (240, 90, 70), (x0, y0, max(1, int(w * e.hp / e.max)), 5), border_radius=2)

    def draw_friend(self, s, kind, x, z, frame, lvl, size):
        r = self.draw_soldier(s, kind, x, z, frame, lvl, size)
        if kind == "held" and self.muzzle_t > 0:
            gx = r.left + r.w * 0.82
            gy = r.top + r.h * 0.08
            col = WEAPONS[self.weapon]["color"]
            pygame.draw.circle(s, col, (int(gx), int(gy)), 9)
            pygame.draw.circle(s, WHITE, (int(gx), int(gy)), 4)

    # ---------- HUD und Menüs
    def draw_hud(self):
        s = self.screen
        alpha_rect(s, PANEL, (12, 12, 300, 92), 190, 12)
        text(s, self.font_mid, f"Punkte {self.score}", (26, 34), TEXT, "left")
        for i in range(LIVES):
            shield(s, 34 + i * 24, 54, i < self.lives)
        text(s, self.font_small, f"Treffer {self.pops}", (165, 62), MUTED, "left")
        wp = WEAPONS[self.weapon]
        text(s, self.font, wp["name"], (26, 88), wp["color"], "left")
        text(s, self.font_small, f"Armee: {self.allies + 1}", (230, 88), GREEN, "left")

        alpha_rect(s, PANEL, self.pause_box, 190, 10)
        pygame.draw.rect(s, TEXT, (self.pause_box.x + 13, self.pause_box.y + 12, 6, 18))
        pygame.draw.rect(s, TEXT, (self.pause_box.x + 24, self.pause_box.y + 12, 6, 18))
        b = self.hud_toggle_box
        if self.towers_on:
            pygame.draw.rect(s, (40, 120, 150), b, border_radius=10)
        else:
            alpha_rect(s, PANEL, b, 190, 10)
        text(s, self.font_small, "Türme AN" if self.towers_on else "Türme AUS", b.center, TEXT if self.towers_on else MUTED)

        # nächste Belohnung
        goals = []
        nw = next((wp for wp in WEAPONS if wp["need"] > self.pops), None)
        if nw:
            goals.append((nw["need"], nw["name"]))
        if self.allies < len(ALLY_STEPS):
            goals.append((ALLY_STEPS[self.allies], "Verstärkung"))
        if self.towers_on:
            nt = next((tw for tw in TOWER_LEVELS if tw["need"] > self.pops), None)
            if nt:
                goals.append((nt["need"], nt["name"]))
        if goals:
            need, label = min(goals)
            alpha_rect(s, PANEL, (W - 260, 62, 248, 40), 190, 10)
            text(s, self.font_small, f"Nächstes: {label}", (W - 250, 74), MUTED, "left", False)
            text(s, self.font_small, f"{self.pops}/{need}", (W - 22, 74), MUTED, "right", False)
            pygame.draw.rect(s, (50, 58, 70), (W - 250, 86, 228, 7), border_radius=3)
            pygame.draw.rect(s, GOLD, (W - 250, 86, int(228 * min(1, self.pops / need)), 7), border_radius=3)

        if self.towers_on and self.tower_lvl >= 0:
            tw = TOWER_LEVELS[self.tower_lvl]
            ready = self.tower_cd <= 0
            box = pygame.Rect(W // 2 - 130, H - 40, 260, 30)
            alpha_rect(s, PANEL, box, 200, 15)
            if not ready:
                done = int(box.w * (1 - self.tower_cd / tw["reload"]))
                alpha_rect(s, (40, 120, 150), (box.x, box.y, max(1, done), box.h), 200, 15)
            else:
                pygame.draw.rect(s, CYAN, box, 2, border_radius=15)
            text(s, self.font_small, (tw["name"] + " bereit (X)") if ready else "Türme laden …",
                 box.center, CYAN if ready else MUTED, shadow=False)
        if self.sounds.muted:
            text(s, self.font_small, "Ton aus (M)", (W - 14, H - 24), MUTED, "right")

    def draw_menu(self, over):
        s = self.screen
        alpha_rect(s, PANEL, (W // 2 - 300, 60, 600, 540), 215, 18)
        if over:
            text(s, self.font_huge, "Einsatz beendet", (W // 2, 130), GOLD)
            text(s, self.font_big, f"{self.score} Punkte", (W // 2, 205), TEXT)
            text(s, self.font, f"{self.pops} Treffer  ·  Waffe: {WEAPONS[self.weapon]['name']}  ·  Armee: {self.allies + 1}",
                 (W // 2, 255), MUTED)
            if self.new_best:
                text(s, self.font_mid, "Neuer Rekord!", (W // 2, 310), GOLD)
            else:
                text(s, self.font, f"Rekord: {self.best}", (W // 2, 310), MUTED)
        else:
            text(s, self.font_huge, "FRONTLINIE", (W // 2, 120), GOLD)
            lines = [
                "Gegnerische Soldaten marschieren auf deine Stellung zu.",
                "Halte die Linie! Getroffene Gegner fallen um.",
                "Mehr Treffer bringen stärkere Waffen und Verstärkung.",
                "Die Kanonentürme werden immer besser.",
            ]
            for i, line in enumerate(lines):
                text(s, self.font, line, (W // 2, 185 + i * 30), TEXT)
            text(s, self.font_small, "Pfeile / A D: bewegen   ·   Leertaste: schießen   ·   X: Türme   ·   P: Pause",
                 (W // 2, 320), MUTED)
            if self.best:
                text(s, self.font, f"Rekord: {self.best}", (W // 2, 360), GOLD)

        b = self.toggle_box
        pygame.draw.rect(s, (40, 120, 150) if self.towers_on else (50, 56, 66), b, border_radius=14)
        pygame.draw.rect(s, CYAN if self.towers_on else MUTED, b, 2, border_radius=14)
        text(s, self.font_mid, "Kanonentürme: " + ("AN" if self.towers_on else "AUS"), b.center, TEXT)
        text(s, self.font_small, "anklicken oder T drücken", (W // 2, b.bottom + 14), MUTED, shadow=False)
        st = self.start_box
        pygame.draw.rect(s, (150, 100, 20), st.move(0, 4), border_radius=16)
        pygame.draw.rect(s, GOLD, st, border_radius=16)
        text(s, self.font_big, "Nochmal" if over else "Los!", st.center, INK, shadow=False)
        text(s, self.font_small, "oder Leertaste", (W // 2, st.bottom + 16), MUTED, shadow=False)

    # ---------- Hauptschleife
    def frame(self, dt):
        if self.state == "play":
            self.update(dt)
        elif self.state == "menu":
            self.t += dt
            # Vorschau: ein paar Gegner marschieren im Hintergrund
            if not self.enemies or random.random() < dt * 0.8:
                if len(self.enemies) < 6:
                    self.enemies.append(Enemy(random.choice(list(ENEMIES)), 1.0))
            for e in self.enemies:
                e.z -= e.speed * dt
                if e.z < 8:
                    e.gone = True
            self.enemies = [e for e in self.enemies if not e.gone]

        world = self.draw_world(dt)
        if self.flash > 0:
            alpha_rect(world, RED, (0, 0, W, H), int(self.flash * 300))
        off = (random.randint(-5, 5), random.randint(-5, 5)) if self.shake > 0 else (0, 0)
        self.screen.fill(INK)
        self.screen.blit(world, off)

        if self.state == "menu":
            self.draw_menu(False)
        else:
            self.draw_hud()
            row = 0
            for tx in self.texts:
                rise = (2.0 - tx["life"]) * 12
                y = tx["y"] - rise if tx["y"] else H * 0.3 + row * 50 - rise
                if not tx["y"]:
                    row += 1
                text(self.screen, self.font_big if tx["big"] else self.font_mid, tx["msg"], (tx["x"], y), tx["color"])
            if self.state == "pause":
                alpha_rect(self.screen, INK, (0, 0, W, H), 150)
                text(self.screen, self.font_huge, "Pause", (W // 2, H // 2 - 20), TEXT)
                text(self.screen, self.font, "P drücken zum Weiterspielen", (W // 2, H // 2 + 40), MUTED)
            if self.state == "over":
                self.draw_menu(True)
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
