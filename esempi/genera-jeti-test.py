#!/usr/bin/env python3
"""Genera esempi/volo-completo-test.log: log Jeti SINTETICO (non reale) dello stesso volo di volo-completo-test.nmea,
con l'orologio sfasato di OFFSET secondi, canali di regolatore, vario, ricevente e interruttori Sa/Sb.
Serve a provare l'unione Jeti + NMEA (l'offset ritrovato deve essere +OFFSET) e le fasi di volo.
Uso:  python3 genera-jeti-test.py   (legge volo-completo-test.nmea dalla cartella corrente)"""
OFFSET = 37.4
def sec(h): return int(h[:2]) * 3600 + int(h[2:4]) * 60 + float(h[4:])
pts, enl = [], {}
for l in open("volo-completo-test.nmea"):
    p = l.strip().split(",")
    if p[0] == "$GNGNS": pts.append((sec(p[1]), float(p[9])))
    if p[0] == "$SMGPS2": enl[len(pts)] = float(p[4])
t0, a0 = pts[0]
out = ["# TEST SINTETICO", "000000000;111;0;uVARIO; ", "000000000;111;3;Rel. altit;m",
       "000000000;222;0;MEZON 90; ", "000000000;222;1;Giri;rpm", "000000000;222;2;U Batteria;V", "000000000;222;3;I Batteria;A",
       "000000000;333;0;Rx REX9S; ", "000000000;333;1;U Rx;V", "000000000;333;4;Q;%",
       "000000000;444;0;Tx; ", "000000000;444;1;Comando Sa; ", "000000000;444;2;Comando Sb; "]
for k, (t, a) in enumerate(pts):
    if k % 5: continue                                    # un campione ogni 0,5 s
    ms = int((t - t0 - OFFSET) * 1000) + 1000             # +1 s: il tempo 0 e' riservato alle definizioni
    if ms < 1000: continue
    motor = enl.get(k + 1, 0) > 50
    q = 40 if 300 <= t - t0 - OFFSET <= 302 else 100       # un calo di collegamento a ~5:00
    sa = 0 if 300 <= t - t0 - OFFSET <= 520 else 50        # termica 5:00-8:40, poi normale
    out.append(f"{ms:09d};111;3;1;1;{int(round((a - a0) * 10))}")
    out.append(f"{ms:09d};222;1;4;0;{2000 if motor else 0};2;4;1;{222 if motor else 250};3;4;1;{450 if motor else 0}")
    out.append(f"{ms:09d};333;1;4;2;603;4;1;0;{q}")
    out.append(f"{ms:09d};444;1;1;0;{sa};2;1;0;0;")       # righe Tx con ';' finale, come nei log reali
open("volo-completo-test.log", "w").write("\n".join(out) + "\n")
print("righe:", len(out))
