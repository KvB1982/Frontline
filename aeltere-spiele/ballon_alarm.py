"""
Ballon-Alarm – ein kinderfreundliches Schießspiel mit Seifenblasen.

Bunte Ballons, kleine Roboter und Glibber-Blobs schweben von oben herunter.
Die Kinder unten bringen sie mit Seifenblasen zum Platzen. Je mehr Treffer,
desto mehr Freunde helfen mit. Später kommen Kanonentürme mit Glitzersternen
dazu, die man im Menü (oder mit T) an- und ausschalten kann.

Steuerung:
  Pfeil links / rechts   bewegen
  Leertaste (halten)     Seifenblasen schießen
  X                      Kanonentürme feuern
  T                      Kanonentürme an/aus
  P oder Esc             Pause
  M                      Ton an/aus

Start:  pip install pygame   und dann   python ballon_alarm.py
"""

import array
import json
import math
import os
import random
import sys

import pygame

W, H = 480, 720
GROUND = H - 70
FPS = 60

# Farben
INK = (29, 53, 87)
MUTED = (91, 114, 144)
WHITE = (255, 255, 255)
ORANGE = (255, 122, 61)
ORANGE_DARK = (217, 95, 38)
YELLOW = (255, 210, 63)
PURPLE = (131, 56, 236)
PINK = (239, 71, 111)
GREEN = (6, 214, 160)
BLUE = (58, 134, 255)

KID_COLORS = [ORANGE, BLUE, PURPLE, GREEN, PINK, (255, 183, 3), (17, 138, 178)]
SKIN = [(245, 199, 161), (217, 160, 102), (141, 85, 36), (255, 219, 172),
        (198, 134, 66), (241, 194, 125), (224, 172, 105)]
BALLOON_COLORS = [PINK, YELLOW, GREEN, BLUE, ORANGE, (181, 23, 158)]

SHOOTER_STEPS = [0, 6, 15, 28, 45, 65, 90]   # Treffer für 1..7 Schützen
TOWER_STEPS = [20, 40, 65, 95]               # Treffer für 1..4 Türme
TOWER_X = [56, W - 56, 140, W - 140]
CANNON_RELOAD = 1.4

SAVE_FILE = os.path.join(os.path.expanduser("~"), ".ballon_alarm.json")


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
            self.ok = True
        except pygame.error:
            return
        self.shoot = self._tone(800, 0.08, 0.15, slide=300)
        self.pop = self._tone(600, 0.12, 0.35, slide=-350, wave="tri")
        self.hit = self._tone(300, 0.06, 0.12, wave="square")
        self.cannon = self._tone(160, 0.35, 0.5, slide=-100, wave="tri")
        self.boom = self._tone(220, 0.3, 0.25, slide=-150, wave="saw")
        self.up = self._tone(520, 0.1, 0.3, wave="tri", then=(780, 0.15))
        self.lose = self._tone(300, 0.4, 0.3, slide=-200, wave="tri")

    def _tone(self, freq, dur, vol, slide=0, wave="sine", then=None):
        rate = 22050
        parts = [(freq, dur, slide)]
        if then:
            parts.append((then[0], then[1], 0))
        buf = array.array("h")
        for f0, d, sl in parts:
            n = int(rate * d)
            phase = 0.0
            for i in range(n):
                t = i / n
                f = f0 + sl * t
                phase += f / rate
                p = phase % 1.0
                if wave == "square":
                    s = 1.0 if p < 0.5 else -1.0
                elif wave == "tri":
                    s = 4 * abs(p - 0.5) - 1
                elif wave == "saw":
                    s = 2 * p - 1
                else:
                    s = math.sin(2 * math.pi * p)
                env = (1 - t) ** 2
                buf.append(int(s * env * vol * 32767))
        return pygame.mixer.Sound(buffer=buf.tobytes())

    def play(self, name):
        if self.ok and not self.muted:
            getattr(self, name).play()


# ---------------------------------------------------------------- Hilfen
def text(surf, font, msg, pos, color, align="center", outline=True):
    img = font.render(msg, True, color)
    rect = img.get_rect()
    setattr(rect, {"center": "center", "left": "midleft", "right": "midright"}[align], pos)
    if outline:
        edge = font.render(msg, True, WHITE)
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (-2, 2), (2, -2)):
            surf.blit(edge, rect.move(dx, dy))
    surf.blit(img, rect)


def alpha_rect(surf, color, rect, alpha, radius=0):
    s = pygame.Surface((rect[2], rect[3]), pygame.SRCALPHA)
    pygame.draw.rect(s, (*color, alpha), (0, 0, rect[2], rect[3]), border_radius=radius)
    surf.blit(s, (rect[0], rect[1]))


def heart(surf, x, y, s, filled):
    color = PINK if filled else (200, 208, 220)
    r = s // 4
    pygame.draw.circle(surf, color, (x - r, y + r), r + 1)
    pygame.draw.circle(surf, color, (x + r, y + r), r + 1)
    pygame.draw.polygon(surf, color, [(x - 2 * r - 1, y + r + 2), (x + 2 * r + 1, y + r + 2), (x, y + s)])


# ---------------------------------------------------------------- Spielfiguren
class Enemy:
    def __init__(self, kind, t):
        lvl = 1 + t / 30
        self.kind = kind
        if kind == "blob":
            self.r, self.hp, self.vy, self.pts, self.color = 34, 10, 26 + lvl * 3, 100, (155, 93, 229)
        elif kind == "robot":
            self.r, self.hp, self.vy, self.pts = 22, 3, 40 + lvl * 6, 30
            self.color = random.choice([(142, 202, 230), (173, 181, 189), (144, 190, 109)])
        else:
            self.r, self.hp, self.vy, self.pts = 19, 1, 50 + lvl * 8, 10
            self.color = random.choice(BALLOON_COLORS)
        self.max = self.hp
        self.x = self.base_x = random.uniform(self.r + 10, W - self.r - 10)
        self.y = -self.r - 20
        self.phase = random.uniform(0, math.tau)
        self.hit_t = 0.0
        self.dead = False


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Ballon-Alarm")
        self.screen = pygame.display.set_mode((W, H), pygame.SCALED | pygame.RESIZABLE)
        self.clock = pygame.time.Clock()
        self.font_big = pygame.font.Font(None, 64)
        self.font_mid = pygame.font.Font(None, 40)
        self.font = pygame.font.Font(None, 28)
        self.font_small = pygame.font.Font(None, 22)
        self.sounds = Sounds()

        self.settings = load_settings()
        self.cannons_on = self.settings.get("cannons", True)
        self.best = self.settings.get("best", 0)
        self.sounds.muted = self.settings.get("muted", False)

        self.state = "menu"   # menu | play | pause | over
        self.clouds = [[random.uniform(0, W), random.uniform(40, 420), random.uniform(0.6, 1.3),
                        random.uniform(6, 16)] for _ in range(6)]
        self.toggle_box = pygame.Rect(90, 470, 300, 56)
        self.start_box = pygame.Rect(120, 550, 240, 70)
        self.hud_toggle_box = pygame.Rect(W - 150, 10, 90, 42)
        self.pause_box = pygame.Rect(W - 52, 10, 42, 42)
        self.new_game()

    # ---------- Zustand
    def new_game(self):
        self.t = 0.0
        self.x = W / 2
        self.score = 0
        self.pops = 0
        self.lives = 3
        self.shooters = 1
        self.towers = 0
        self.fire_cd = 0.0
        self.cannon_cd = 0.0
        self.bubbles = []
        self.balls = []
        self.enemies = []
        self.parts = []
        self.texts = []
        self.spawn_cd = 1.0
        self.shake = 0.0
        self.flash = 0.0
        self.new_best = False

    def save(self):
        self.settings.update(cannons=self.cannons_on, best=self.best, muted=self.sounds.muted)
        save_settings(self.settings)

    def toggle_cannons(self):
        self.cannons_on = not self.cannons_on
        self.save()
        self.sounds.play("hit")

    def start(self):
        self.new_game()
        self.state = "play"
        self.sounds.play("up")

    def say(self, msg, x, y, color=INK, big=False):
        self.texts.append({"msg": msg, "x": x, "y": y, "color": color, "big": big, "life": 1.4})

    def confetti(self, x, y, n, colors):
        for _ in range(n):
            a = random.uniform(0, math.tau)
            s = random.uniform(60, 260)
            self.parts.append({"x": x, "y": y, "vx": math.cos(a) * s, "vy": math.sin(a) * s - 60,
                               "life": random.uniform(0.5, 1.1), "c": random.choice(colors),
                               "r": random.uniform(2, 5)})

    def squad(self):
        n = self.shooters
        return [self.x + (i - (n - 1) / 2) * 36 for i in range(n)]

    # ---------- Eingabe
    def on_key(self, key):
        if key == pygame.K_m:
            self.sounds.muted = not self.sounds.muted
            self.save()
            return
        if self.state in ("menu", "over"):
            if key in (pygame.K_t, pygame.K_UP, pygame.K_DOWN):
                self.toggle_cannons()
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
            self.toggle_cannons()
            self.say("Kanonentürme an" if self.cannons_on else "Kanonentürme aus", W / 2, H / 2, INK, True)
        if key in (pygame.K_x, pygame.K_c):
            self.fire_cannons()

    def on_click(self, pos):
        if self.state in ("menu", "over"):
            if self.toggle_box.collidepoint(pos):
                self.toggle_cannons()
            elif self.start_box.collidepoint(pos):
                self.start()
        elif self.pause_box.collidepoint(pos):
            self.state = "play" if self.state == "pause" else "pause"
        elif self.hud_toggle_box.collidepoint(pos):
            self.toggle_cannons()

    def quit(self):
        self.save()
        pygame.quit()
        sys.exit()

    # ---------- Spiellogik
    def spawn_enemy(self):
        r = random.random()
        if self.t > 60 and r < 0.08:
            kind = "blob"
        elif self.t > 15 and r < 0.35:
            kind = "robot"
        else:
            kind = "balloon"
        self.enemies.append(Enemy(kind, self.t))

    def damage(self, e, d):
        e.hp -= d
        e.hit_t = 0.12
        if e.hp <= 0 and not e.dead:
            e.dead = True
            self.score += e.pts
            self.pops += 1
            self.sounds.play("pop")
            if e.kind == "balloon":
                cols = [e.color, WHITE, YELLOW]
            else:
                cols = [YELLOW, PINK, GREEN, BLUE, WHITE]
            self.confetti(e.x, e.y, 50 if e.kind == "blob" else 22, cols)
            words = {"robot": ["Piep!", "Bzzt!", "Klonk!"], "blob": ["Wabbel-Plopp!", "Super!"]}
            self.say(random.choice(words.get(e.kind, ["Plopp!", "Peng!", "Puff!"])), e.x, e.y, INK, e.kind == "blob")
            self.check_upgrades()
        else:
            self.sounds.play("hit")

    def check_upgrades(self):
        s = max(i + 1 for i, need in enumerate(SHOOTER_STEPS) if self.pops >= need)
        if s > self.shooters:
            self.shooters = s
            self.sounds.play("up")
            self.say("Volle Mannschaft!" if s == 7 else "Neuer Schütze!", W / 2, H / 2 - 40, ORANGE, True)
        t = sum(1 for need in TOWER_STEPS if self.pops >= need)
        if t > self.towers:
            self.towers = t
            if self.cannons_on:
                self.sounds.play("up")
                self.say("Kanonenturm! Drücke X" if t == 1 else "Noch ein Kanonenturm!", W / 2, H / 2 + 10, PURPLE, True)

    def fire_cannons(self):
        if not self.cannons_on or self.towers == 0 or self.cannon_cd > 0:
            return
        self.cannon_cd = CANNON_RELOAD
        self.shake = 0.15
        self.sounds.play("cannon")
        for i in range(self.towers):
            tx = TOWER_X[i]
            # zielt auf den tiefsten Gegner in Reichweite, sonst gerade nach oben
            targets = [e for e in self.enemies if not e.dead and e.y > 0 and abs(e.x - tx) < 220]
            vx, vy = 0.0, -520.0
            if targets:
                tgt = max(targets, key=lambda e: e.y)
                dx, dy = tgt.x - tx, tgt.y - (GROUND - 60)
                d = math.hypot(dx, dy) or 1
                vx, vy = dx / d * 520, dy / d * 520
            self.balls.append({"x": tx, "y": GROUND - 64, "vx": vx, "vy": vy, "r": 13, "life": 3.0})

    def explode(self, b):
        self.sounds.play("boom")
        self.confetti(b["x"], b["y"], 30, [YELLOW, ORANGE, WHITE, PURPLE])
        self.parts.append({"ring": True, "x": b["x"], "y": b["y"], "life": 0.35})
        for e in self.enemies:
            if not e.dead and math.hypot(e.x - b["x"], e.y - b["y"]) < 70 + e.r:
                self.damage(e, 3)

    def update(self, dt):
        self.t += dt
        self.fire_cd -= dt
        self.cannon_cd = max(0.0, self.cannon_cd - dt)
        self.shake = max(0.0, self.shake - dt)
        self.flash = max(0.0, self.flash - dt)

        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.x -= 300 * dt
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.x += 300 * dt
        half = (self.shooters - 1) * 18 + 18
        self.x = max(half, min(W - half, self.x))

        if keys[pygame.K_SPACE] and self.fire_cd <= 0:
            self.fire_cd = 0.24
            for sx in self.squad():
                self.bubbles.append({"x": sx, "y": GROUND - 58, "r": 6})
            self.sounds.play("shoot")

        # Gegner kommen mit der Zeit immer schneller
        self.spawn_cd -= dt
        if self.spawn_cd <= 0:
            self.spawn_enemy()
            self.spawn_cd = max(0.35, 1.3 - self.t / 90) * random.uniform(0.7, 1.2)

        for b in self.bubbles:
            b["y"] -= 560 * dt
        for b in self.balls:
            b["x"] += b["vx"] * dt
            b["y"] += b["vy"] * dt
            b["life"] -= dt

        sway = {"balloon": (2, 18), "robot": (1.2, 40), "blob": (0.8, 60)}
        for e in self.enemies:
            e.y += e.vy * dt
            e.hit_t = max(0.0, e.hit_t - dt)
            sp, amp = sway[e.kind]
            e.x = max(e.r, min(W - e.r, e.base_x + math.sin(self.t * sp + e.phase) * amp))

        for b in self.bubbles:
            for e in self.enemies:
                if not e.dead and math.hypot(e.x - b["x"], e.y - b["y"]) < e.r + b["r"]:
                    b["gone"] = True
                    self.damage(e, 1)
                    break
        for b in self.balls:
            for e in self.enemies:
                if not e.dead and math.hypot(e.x - b["x"], e.y - b["y"]) < e.r + b["r"]:
                    b["gone"] = True
                    self.explode(b)
                    break
            if b["y"] < -20 or b["x"] < -20 or b["x"] > W + 20 or b["life"] <= 0:
                b["gone"] = True

        for e in self.enemies:
            if not e.dead and e.y > GROUND - 40:
                e.dead = True
                self.lives -= 1
                self.flash = 0.3
                self.sounds.play("lose")
                self.say("Oh nein!", e.x, GROUND - 60, PINK)
                if self.lives <= 0:
                    self.state = "over"
                    if self.score > self.best:
                        self.best = self.score
                        self.new_best = True
                        self.save()

        self.bubbles = [b for b in self.bubbles if not b.get("gone") and b["y"] > -20]
        self.balls = [b for b in self.balls if not b.get("gone")]
        self.enemies = [e for e in self.enemies if not e.dead]

        for p in self.parts:
            p["life"] -= dt
            if not p.get("ring"):
                p["x"] += p["vx"] * dt
                p["y"] += p["vy"] * dt
                p["vy"] += 400 * dt
        self.parts = [p for p in self.parts if p["life"] > 0]
        for tx in self.texts:
            tx["life"] -= dt
            tx["y"] -= 30 * dt
        self.texts = [tx for tx in self.texts if tx["life"] > 0]

    # ---------- Zeichnen
    def draw_background(self, s, dt):
        for y in range(0, H, 4):
            k = y / H
            c = (int(95 + (217 - 95) * k), int(184 + (241 - 184) * k), 255)
            pygame.draw.rect(s, c, (0, y, W, 4))
        pygame.draw.circle(s, (255, 224, 102), (W - 70, 90), 34)
        for c in self.clouds:
            c[0] += c[3] * dt
            if c[0] - 80 * c[2] > W:
                c[0] = -80 * c[2]
            x, y, sc = c[0], c[1], c[2]
            for ox, oy, r in ((0, 0, 22), (24, -10, 26), (50, 0, 20)):
                pygame.draw.circle(s, (245, 250, 255), (int(x + ox * sc), int(y + oy * sc)), int(r * sc))
        pygame.draw.ellipse(s, (143, 214, 148), (-90, GROUND - 50, 400, 120))
        pygame.draw.ellipse(s, (143, 214, 148), (220, GROUND - 35, 360, 90))
        pygame.draw.rect(s, (99, 199, 77), (0, GROUND, W, H - GROUND))
        for x in range(0, W, 16):
            pygame.draw.polygon(s, (79, 174, 60), [(x, GROUND), (x + 6, GROUND - 8), (x + 12, GROUND)])
        for i in range(9):
            fx, fy = 25 + i * 54, GROUND + 30 + (i % 2) * 18
            col = [YELLOW, PINK, WHITE][i % 3]
            for k in range(5):
                a = k / 5 * math.tau
                pygame.draw.circle(s, col, (int(fx + math.cos(a) * 5), int(fy + math.sin(a) * 5)), 4)
            pygame.draw.circle(s, ORANGE, (fx, fy), 3)

    def draw_kid(self, s, x, i, bob=0):
        c, skin = KID_COLORS[i % len(KID_COLORS)], SKIN[i % len(SKIN)]
        x = int(x)
        y = GROUND + int(bob)
        pygame.draw.ellipse(s, (80, 160, 60), (x - 15, GROUND - 2, 30, 8))
        pygame.draw.rect(s, INK, (x - 8, y - 14, 6, 14))
        pygame.draw.rect(s, INK, (x + 2, y - 14, 6, 14))
        pygame.draw.rect(s, c, (x - 12, y - 36, 24, 24), border_radius=8)
        pygame.draw.rect(s, YELLOW, (x - 4, y - 56, 8, 26), border_radius=3)
        pygame.draw.circle(s, BLUE, (x, y - 56), 5)
        pygame.draw.circle(s, skin, (x, y - 46), 11)
        pygame.draw.circle(s, c, (x, y - 49), 11, draw_top_left=True, draw_top_right=True)
        pygame.draw.rect(s, c, (x - 2, y - 52, 15, 4))
        pygame.draw.circle(s, INK, (x - 4, y - 45), 2)
        pygame.draw.circle(s, INK, (x + 4, y - 45), 2)
        pygame.draw.arc(s, INK, (x - 4, y - 46, 8, 8), math.pi * 1.15, math.pi * 1.85, 2)

    def draw_tower(self, s, x, i):
        y = GROUND
        pygame.draw.ellipse(s, (80, 160, 60), (x - 26, y - 4, 52, 12))
        pygame.draw.rect(s, (233, 196, 106), (x - 22, y - 46, 44, 46), border_radius=6)
        for k in range(3):
            pygame.draw.rect(s, (212, 163, 115), (x - 22, y - 40 + k * 14, 44, 3))
            pygame.draw.rect(s, (233, 196, 106), (x - 22 + k * 17, y - 54, 10, 10))
        ready = self.cannon_cd <= 0
        pygame.draw.rect(s, PURPLE if ready else (162, 155, 189), (x - 9, y - 78, 18, 30), border_radius=8)
        pygame.draw.ellipse(s, INK, (x - 8, y - 82, 16, 8))
        pygame.draw.line(s, INK, (x + 18, y - 54), (x + 18, y - 76), 2)
        pygame.draw.polygon(s, KID_COLORS[(i + 2) % len(KID_COLORS)],
                            [(x + 18, y - 76), (x + 32, y - 71), (x + 18, y - 66)])

    def draw_enemy(self, s, e):
        x, y, r = int(e.x), int(e.y), e.r
        col = WHITE if e.hit_t > 0 else e.color
        if e.kind == "balloon":
            pts = [(x + math.sin(k / 6 * math.pi) * 5, y + r + 2 + k * 4) for k in range(7)]
            pygame.draw.lines(s, (120, 135, 160), False, pts, 1)
            pygame.draw.ellipse(s, col, (x - int(r * 0.9), y - r, int(r * 1.8), r * 2))
            pygame.draw.polygon(s, col, [(x - 4, y + r - 1), (x + 4, y + r - 1), (x, y + r + 5)])
            pygame.draw.ellipse(s, (255, 255, 255), (x - 10, y - 14, 7, 12))
            pygame.draw.circle(s, INK, (x - 5, y - 1), 2)
            pygame.draw.circle(s, INK, (x + 5, y - 1), 2)
            pygame.draw.arc(s, INK, (x - 4, y + 1, 8, 7), math.pi * 1.1, math.pi * 1.9, 2)
        elif e.kind == "robot":
            pygame.draw.line(s, INK, (x, y - r), (x, y - r - 10), 2)
            blink = PINK if math.sin(self.t * 8) > 0 else YELLOW
            pygame.draw.circle(s, blink, (x, y - r - 12), 4)
            pygame.draw.rect(s, col, (x - r, y - r, r * 2, r * 2), border_radius=9)
            pygame.draw.rect(s, INK, (x - r - 6, y - 4, 6, 8))
            pygame.draw.rect(s, INK, (x + r, y - 4, 6, 8))
            pygame.draw.rect(s, INK, (x - r + 5, y - r + 6, r * 2 - 10, 18), border_radius=5)
            pygame.draw.circle(s, (123, 241, 168), (x - 6, y - r + 15), 3)
            pygame.draw.circle(s, (123, 241, 168), (x + 6, y - r + 15), 3)
            pygame.draw.rect(s, INK, (x - 8, y + r - 12, 16, 3))
            self.draw_energy(s, e)
        else:
            wob = math.sin(self.t * 5 + e.phase) * 3
            pygame.draw.ellipse(s, col, (x - r - wob, y - r + wob, (r + wob) * 2, (r - wob) * 2))
            pygame.draw.circle(s, WHITE, (x - 10, y - 4), 8)
            pygame.draw.circle(s, WHITE, (x + 10, y - 4), 8)
            pygame.draw.circle(s, INK, (x - 9, y - 2), 4)
            pygame.draw.circle(s, INK, (x + 11, y - 2), 4)
            pygame.draw.arc(s, INK, (x - 7, y + 3, 14, 14), math.pi * 1.15, math.pi * 1.85, 2)
            self.draw_energy(s, e)

    def draw_energy(self, s, e):
        w = int(e.r * 1.6)
        y = int(e.y - e.r - (24 if e.kind == "robot" else 12))
        x = int(e.x - w / 2)
        pygame.draw.rect(s, (190, 200, 215), (x, y, w, 6), border_radius=3)
        fill = max(1, int(w * max(0, e.hp) / e.max))
        pygame.draw.rect(s, GREEN, (x, y, fill, 6), border_radius=3)

    def draw_star(self, s, b):
        pts = []
        for k in range(10):
            rr = b["r"] * (0.45 if k % 2 else 1)
            a = k / 10 * math.tau + self.t * 8
            pts.append((b["x"] + math.cos(a) * rr, b["y"] + math.sin(a) * rr))
        pygame.draw.polygon(s, YELLOW, pts)
        pygame.draw.polygon(s, ORANGE, pts, 2)

    def draw_world(self, dt):
        world = pygame.Surface((W, H))
        self.draw_background(world, dt)
        if self.cannons_on:
            for i in range(self.towers):
                self.draw_tower(world, TOWER_X[i], i)
        for e in self.enemies:
            self.draw_enemy(world, e)
        for b in self.bubbles:
            bx, by = int(b["x"]), int(b["y"])
            pygame.draw.circle(world, (180, 225, 255), (bx, by), b["r"])
            pygame.draw.circle(world, BLUE, (bx, by), b["r"], 2)
            pygame.draw.circle(world, WHITE, (bx - 2, by - 2), 2)
        for b in self.balls:
            self.draw_star(world, b)

        keys = pygame.key.get_pressed()
        moving = keys[pygame.K_LEFT] or keys[pygame.K_RIGHT]
        bob = -abs(math.sin(self.t * 14)) * 3 if moving else 0
        for i, sx in enumerate(self.squad()):
            self.draw_kid(world, sx, i, bob if i % 2 else -bob * 0.6)

        for p in self.parts:
            if p.get("ring"):
                k = 1 - p["life"] / 0.35
                pygame.draw.circle(world, YELLOW, (int(p["x"]), int(p["y"])), int(20 + k * 60), 5)
            else:
                r = int(p["r"])
                pygame.draw.rect(world, p["c"], (int(p["x"]) - r, int(p["y"]) - r // 2, r * 2, max(2, r)))
        for tx in self.texts:
            text(world, self.font_mid if tx["big"] else self.font, tx["msg"], (tx["x"], tx["y"]), tx["color"])
        if self.flash > 0:
            alpha_rect(world, PINK, (0, 0, W, H), int(self.flash * 255))

        off = (random.randint(-4, 4), random.randint(-4, 4)) if self.shake > 0 else (0, 0)
        self.screen.blit(world, off)

    def draw_hud(self):
        s = self.screen
        alpha_rect(s, WHITE, (10, 10, 186, 70), 215, 14)
        text(s, self.font, f"Punkte {self.score}", (22, 30), INK, "left", outline=False)
        for i in range(3):
            heart(s, 32 + i * 26, 46, 22, i < self.lives)
        text(s, self.font_small, f"Treffer {self.pops}", (110, 61), MUTED, "left", outline=False)

        alpha_rect(s, WHITE, self.pause_box, 215, 12)
        pygame.draw.rect(s, INK, (self.pause_box.x + 13, self.pause_box.y + 12, 6, 18))
        pygame.draw.rect(s, INK, (self.pause_box.x + 24, self.pause_box.y + 12, 6, 18))

        b = self.hud_toggle_box
        if self.cannons_on:
            pygame.draw.rect(s, PURPLE, b, border_radius=12)
        else:
            alpha_rect(s, WHITE, b, 215, 12)
        text(s, self.font_small, "Türme AN" if self.cannons_on else "Türme AUS", b.center,
             WHITE if self.cannons_on else MUTED, outline=False)

        label = None
        if self.shooters < len(SHOOTER_STEPS):
            prev, nxt = SHOOTER_STEPS[self.shooters - 1], SHOOTER_STEPS[self.shooters]
            label = "Nächster Schütze"
        elif self.cannons_on and self.towers < len(TOWER_STEPS):
            prev = TOWER_STEPS[self.towers - 1] if self.towers else SHOOTER_STEPS[-1]
            nxt = TOWER_STEPS[self.towers]
            label = "Nächster Turm"
        if label:
            prog = max(0.02, min(1.0, (self.pops - prev) / (nxt - prev)))
            alpha_rect(s, WHITE, (W - 150, 58, 140, 32), 215, 10)
            text(s, pygame.font.Font(None, 18), label, (W - 142, 68), MUTED, "left", outline=False)
            pygame.draw.rect(s, (200, 208, 220), (W - 142, 78, 124, 6), border_radius=3)
            pygame.draw.rect(s, ORANGE, (W - 142, 78, int(124 * prog), 6), border_radius=3)

        if self.cannons_on and self.towers > 0:
            ready = self.cannon_cd <= 0
            box = pygame.Rect(W // 2 - 80, H - 36, 160, 28)
            if ready:
                pygame.draw.rect(s, PURPLE, box, border_radius=14)
            else:
                alpha_rect(s, WHITE, box, 215, 14)
                done = int(box.w * (1 - self.cannon_cd / CANNON_RELOAD))
                alpha_rect(s, PURPLE, (box.x, box.y, max(1, done), box.h), 90, 14)
            text(s, self.font_small, "Kanonen bereit (X)" if ready else "Kanonen laden …",
                 box.center, WHITE if ready else MUTED, outline=False)

        if self.sounds.muted:
            text(s, self.font_small, "Ton aus (M)", (W - 14, H - 50), MUTED, "right")

    def draw_menu(self, over):
        s = self.screen
        top = 150 if over else 110
        alpha_rect(s, WHITE, (40, top, W - 80, 530 if not over else 490), 200, 26)
        if over:
            text(s, self.font_big, "Geschafft!", (W / 2, 200), ORANGE)
            text(s, self.font_mid, f"{self.score} Punkte", (W / 2, 262), INK)
            text(s, self.font, f"{self.pops} Treffer · {self.shooters} Schützen", (W / 2, 305), MUTED, outline=False)
            if self.new_best:
                text(s, self.font_mid, "Neuer Rekord!", (W / 2, 350), PURPLE)
            else:
                text(s, self.font, f"Rekord: {self.best}", (W / 2, 350), MUTED, outline=False)
        else:
            text(s, self.font_big, "Ballon-Alarm", (W / 2, 165), ORANGE)
            lines = [
                "Bunte Ballons und kleine Roboter",
                "schweben herunter. Bring sie mit",
                "Seifenblasen zum Platzen!",
                "Je mehr du triffst, desto mehr Freunde",
                "helfen dir. Später kommen Kanonentürme",
                "mit Glitzersternen dazu.",
            ]
            for i, line in enumerate(lines):
                text(s, self.font, line, (W / 2, 222 + i * 25), INK, outline=False)
            text(s, self.font_small, "Pfeile: bewegen  ·  Leertaste: Blasen  ·  X: Kanonen",
                 (W / 2, 395), MUTED, outline=False)
            if self.best:
                text(s, self.font, f"Rekord: {self.best}", (W / 2, 430), PURPLE, outline=False)

        b = self.toggle_box
        pygame.draw.rect(s, PURPLE if self.cannons_on else WHITE, b, border_radius=16)
        pygame.draw.rect(s, PURPLE, b, 3, border_radius=16)
        text(s, self.font, "Kanonentürme: " + ("AN" if self.cannons_on else "AUS"), b.center,
             WHITE if self.cannons_on else PURPLE, outline=False)
        text(s, self.font_small, "anklicken oder T drücken", (W / 2, b.bottom + 14), MUTED, outline=False)

        st = self.start_box
        pygame.draw.rect(s, ORANGE_DARK, st.move(0, 4), border_radius=22)
        pygame.draw.rect(s, ORANGE, st, border_radius=22)
        text(s, self.font_mid, "Nochmal!" if over else "Los geht's!", st.center, WHITE, outline=False)
        text(s, self.font_small, "oder Leertaste drücken", (W / 2, st.bottom + 14), MUTED, outline=False)

    def draw_menu_scene(self, dt):
        s = self.screen
        self.draw_background(s, dt)
        now = pygame.time.get_ticks() / 700
        for i in range(5):
            e = Enemy("balloon", 0)
            e.x, e.y, e.r, e.color = 50 + i * 95, 70 + math.sin(now + i) * 10, 16, BALLOON_COLORS[i]
            self.draw_enemy(s, e)
        for i, dx in enumerate((-40, 0, 40)):
            self.draw_kid(s, W / 2 + dx, i)
        if self.cannons_on:
            self.draw_tower(s, TOWER_X[0], 0)
            self.draw_tower(s, TOWER_X[1], 1)

    # ---------- Hauptschleife
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

            if self.state == "play":
                self.update(dt)
            if self.state == "menu":
                self.draw_menu_scene(dt)
                self.draw_menu(False)
            else:
                self.draw_world(dt if self.state == "play" else 0)
                self.draw_hud()
                if self.state == "pause":
                    alpha_rect(self.screen, WHITE, (0, 0, W, H), 150)
                    text(self.screen, self.font_big, "Pause", (W / 2, H / 2 - 20), INK)
                    text(self.screen, self.font, "P drücken zum Weiterspielen", (W / 2, H / 2 + 30), MUTED, outline=False)
                if self.state == "over":
                    self.draw_menu(True)
            pygame.display.flip()

            frames += 1
            if max_frames and frames >= max_frames:
                return


if __name__ == "__main__":
    Game().run()
