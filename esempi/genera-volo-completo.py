#!/usr/bin/env python3
"""Genera esempi/volo-completo-test.nmea: un volo SINTETICO (non reale) pensato per provare tutte le schede della dashboard.

Sequenza (aria calma, tranne la deriva delle termiche):
  a terra · salita a motore 1 (spirale) · 10 planate a velocita' costante 35..90 km/h (per la Polare) ·
  salita a motore 2 (breve, dritta) · termica 1 (media) · planata veloce a 90 km/h · termica 2 (debole) ·
  planata · termica 3 (forte, cerchi stretti) · planata lunga · rientro veloce a 100 km/h con aerofreni finali.

Polare "vera" usata: sink(v) = 0,35 + 0,0003*(v-45)^2  [m/s, v in km/h]
   -> sink minimo 0,35 m/s a 45 km/h, finesse massima ~40:1 a ~56 km/h.
Il vario e' "barometrico" (vede lo scambio quota/velocita'), l'accelerazione e' limitata a 1,5 m/s^2.
Il pilota resta entro ~1 km dal punto di lancio (se si allontana troppo vira per rientrare).
Le termiche si spostano col vento (2,5-3 m/s verso est): e' la "deriva" mostrata nell'Analisi volo.

Righe prodotte (formato atteso da parseNMEA): $GNRMC, $GNGNS, $GNVTG, $SMGPS (vario, VRx, distanza), $SMGPS2 (accX, accY, accZ, ENL, -, -, pressione).
Uso:  python3 genera-volo-completo.py   (scrive volo-completo-test.nmea nella cartella corrente)
"""
import math
import random

random.seed(2026)
DT = 0.1
G = 9.81
LAT0, LON0 = 45.6000, 9.2000                       # punto fittizio
sink = lambda v: 0.35 + 0.0003 * (v - 45) ** 2     # polare vera [m/s]

# (nome, durata s, velocita' km/h, virata °/s, portanza m/s, motore, vario motore m/s, vento m/s verso est)
FASI = [("a terra", 15, 0, 0, 0, False, 0, 0),
        ("salita motore 1", 60, 60, 16, 0, True, 4.0, 0)]
for i, v in enumerate([40, 45, 50, 55, 60, 70, 80, 90, 35, 65]):
    FASI.append((f"planata {v}", 25, v, 2.5 if i % 2 == 0 else -2.5, 0, False, 0, 0))
FASI += [("salita motore 2", 20, 58, 4, 0, True, 3.5, 0),
         ("termica 1", 60, 50, 22, 1.9, False, 0, 2.5),
         ("planata veloce", 40, 90, 1.5, 0, False, 0, 0),
         ("termica 2 debole", 70, 48, 16, 1.3, False, 0, 2.5),
         ("planata", 50, 55, -2, 0, False, 0, 0),
         ("termica 3 forte", 45, 52, 30, 3.0, False, 0, 3.0),
         ("planata lunga", 60, 65, -1.2, 0, False, 0, 0),
         ("rientro", 99999, 100, 10, 0, False, 0, 0)]

hms = lambda t: f"{int(10 + t // 3600):02d}{int(t % 3600 // 60):02d}{t % 60:05.2f}"      # inizio 10:30:00
def ddm(a, d):
    g = int(abs(a)); mm = (abs(a) - g) * 60
    return f"{g * 100 + mm:0{d + 7}.4f}"

lines = []
alt = 0.0; hd = 0.6; x = y = 0.0; v = 0.0; t = 0.0; tail = 0
for nome, dur, spd, turn, lift, motor, vm, wind in FASI:
    n = int(dur / DT) if dur < 90000 else 10 ** 7
    for _ in range(n):
        vold = v
        mx = 1.5 * 3.6 * DT
        v += max(-mx, min(mx, spd - v))                                  # accelerazione max 1,5 m/s^2
        dvdt = (v - vold) / 3.6 / DT
        extra = 2.0 if (nome == "rientro" and alt < 25) else 0.0          # aerofreni nel finale
        if motor:
            vr = vm
        elif nome == "a terra" or (nome == "rientro" and alt <= 0):
            vr = 0.0
        else:
            vr = lift - sink(v) - extra - (v / 3.6) * dvdt / G
        alt = max(0.0, alt + vr * DT)
        landed = nome == "rientro" and alt <= 0
        if landed:
            spd, turn = 0, 0
        w = math.radians(turn) if v > 1 else 0.0                          # velocita' di virata [rad/s]
        if v > 1 and not motor and not nome.startswith("termica") and math.hypot(x, y) > 650:
            err = (math.atan2(-x, -y) - hd + math.pi) % (2 * math.pi) - math.pi   # troppo lontano: si vira verso la zona di lancio
            w = math.copysign(math.radians(8), err)
        hd += w * DT
        ms = v / 3.6
        x += ms * math.sin(hd) * DT + wind * DT
        y += ms * math.cos(hd) * DT
        bank = math.atan(ms * w / G)
        accz = 1 / math.cos(bank) + random.gauss(0, 0.015)
        accx = dvdt / G + random.gauss(0, 0.01)
        accy = random.gauss(0, 0.012)
        lat = LAT0 + y / 110574
        lon = LON0 + x / (111320 * math.cos(math.radians(LAT0)))
        ts = hms(t + 1800)                                                # inizio alle 10:30:00
        sp = max(0.0, v + random.gauss(0, 0.25))
        crs = math.degrees(hd) % 360
        enl = (120 + random.randint(-8, 8)) if motor else random.randint(2, 14)
        nsat = 12 + int(2 * math.sin(t / 80)); hdop = 0.85 + 0.2 * math.sin(t / 55)
        vrx = 4.92 + 0.04 * math.sin(t / 60) + random.gauss(0, 0.008)
        press = 1013.25 * (1 - (alt + 120) / 44330) ** 5.255
        lines.append(f"$GNRMC,{ts},A,{ddm(lat, 2)},N,{ddm(lon, 3)},E,{sp / 1.852:.2f},{crs:.1f},171026,,,A*00")
        lines.append(f"$GNGNS,{ts},,,,,AAN,{nsat},{hdop:.2f},{alt + 120:.1f},,,*00")
        lines.append(f"$GNVTG,{crs:.1f},T,,M,{sp / 1.852:.2f},N,{sp:.2f},K,A*00")
        lines.append(f"$SMGPS,{ts},{vr + random.gauss(0, 0.08):.2f},{vrx:.2f},{math.hypot(x, y) / 1000:.3f}*00")
        lines.append(f"$SMGPS2,{accx:.2f},{accy:.2f},{accz:.2f},{enl},0,0,{press:.1f}*00")
        t += DT
        if landed:
            tail += 1
            if tail > 150:
                break
    if nome == "rientro":
        break

open("volo-completo-test.nmea", "w").write("\n".join(lines) + "\n")
print("durata s:", round(t), "| quota finale:", round(alt, 1), "| righe:", len(lines))
