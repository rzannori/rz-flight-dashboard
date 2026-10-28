#!/usr/bin/env python3
"""Genera esempi/volo-completo-rzgps.csv: stesso volo SINTETICO di volo-completo-test.nmea nel formato CSV del GPS RZ
(date,time_utc,lat,lon,fix,sats,hdop,alt_baro_m,alt_gps_m,temp_c,speed_kmh,course_deg), a 1 Hz.
Riproduce le stranezze dei log reali: data 2080-01-05 e ora falsa all'accensione, lat/lon vuote finche' manca il fix, righe duplicate.
Uso:  python3 genera-rzgps-test.py   (legge volo-completo-test.nmea dalla cartella corrente)"""
def sec(h): return int(h[:2]) * 3600 + int(h[2:4]) * 60 + float(h[4:])
def dm(v, d):
    g = int(v / 100 if d == 2 else v / 100); mm = v - g * 100; return g + mm / 60
rows, cur = [], {}
for l in open("volo-completo-test.nmea"):
    p = l.strip().split(",")
    if p[0] == "$GNRMC":
        cur = {"t": sec(p[1]), "lat": dm(float(p[3]), 2), "lon": dm(float(p[5]), 3), "kn": float(p[7]), "crs": float(p[8])}
    elif p[0] == "$GNGNS" and cur: cur["alt"] = float(p[9]); cur["sat"] = int(p[7]); cur["hdop"] = float(p[8]); rows.append(dict(cur))
t0 = rows[0]["t"]; out = ["date,time_utc,lat,lon,fix,sats,hdop,alt_baro_m,alt_gps_m,temp_c,speed_kmh,course_deg"]
for k in range(0, 20): out.append(f",23:59:{40 + k // 2:02d},,,0,0,,7.{k % 9},,25.{k % 4},,")          # accensione senza data ne' fix
for r in rows[::10]:                                                                                     # 1 Hz
    s = int(r["t"] - t0) + 70000; hh, mm, ss = s // 3600 % 24, s % 3600 // 60, s % 60
    fix = 1 if r["t"] - t0 > 8 else 0
    pos = f'{r["lat"]:.6f},{r["lon"]:.6f}' if fix else ","
    out.append(f'2026-10-28,{hh:02d}:{mm:02d}:{ss:02d},{pos},{fix},{r["sat"]:02d},{r["hdop"]:.2f},{r["alt"] - 120 + 9:.1f},{r["alt"]:.1f},24.0,{r["kn"] * 1.852:.1f},{r["crs"]:.1f}')
out.insert(30, out[30])                                                                                  # riga duplicata
open("volo-completo-rzgps.csv", "w").write("\n".join(out) + "\n"); print("righe:", len(out))
