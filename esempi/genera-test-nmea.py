#!/usr/bin/env python3
"""Genera esempi/polare-traiettoria-test.nmea: un volo SINTETICO (non reale) per provare le schede Polare e Traiettoria.

Contenuto: salita a motore in cerchi, 8 planate a velocita' costante (40..90 km/h), una termica, altre 4 planate e un
avvicinamento a spirale. La polare "vera" usata e' sink(v) = 0,35 + 0,0003*(v-45)^2 [m/s, v in km/h]:
sink minimo 0,35 m/s a 45 km/h, finesse massima ~40:1 a ~56 km/h. Aria calma, accelerazione limitata a 1,5 m/s^2.
Uso:  python3 genera-test-nmea.py   (scrive polare-traiettoria-test.nmea nella cartella corrente)
"""
import random, math
random.seed(11)
dt=0.1; G=9.81
lat0,lon0=45.4642,9.1900                      # punto fittizio (Milano), solo per il test
sink=lambda v: 0.35+0.0003*(v-45)**2          # polare "vera": sink min 0,35 m/s @ 45 km/h
# fasi: (nome, durata s, velocita km/h, virata °/s, portanza aria m/s, motore, extra sink)
ph=[("terra",10,0,0,0,False,0),
    ("salita motore",50,60,18,0,True,0)]
for i,v in enumerate([40,45,50,55,60,70,80,90]):
    ph.append((f"planata {v}",25,v,3 if i%2==0 else -3,0,False,0))
ph.append(("termica",60,50,22,1.6,False,0))
for i,v in enumerate([65,52,75,47]):
    ph.append((f"planata {v}",25,v,-2 if i%2==0 else 2,0,False,0))
ph.append(("atterraggio",9999,60,12,0,False,0))   # spirale di avvicinamento fino a terra
lines=[]; alt=0.0; hd=0.5; x=y=0.0; v=0.0; t=0.0; i=0; landed=False
def hms(t): return f"{int(7+t//3600):02d}{int(t%3600//60):02d}{t%60:05.2f}"
def ddm(a,d): g=int(abs(a)); mm=(abs(a)-g)*60; return f"{g*100+mm:0{d+7}.4f}"
tail=0
for name,dur,spd,turn,lift,motor,extra in ph:
    n=int(dur/dt) if dur<9000 else 10**7
    for k in range(n):
        vold=v; mx=1.5*3.6*dt; v+=max(-mx,min(mx,(spd-v)))   # accelerazione max 1,5 m/s²
        dvdt=(v-vold)/3.6/dt
        if motor: vr=4.0
        elif name=="terra" or (name=="atterraggio" and alt<=0): vr=0
        else: vr=lift-sink(v)-extra-(v/3.6)*dvdt/G
        alt=max(0,alt+vr*dt)
        if name=="atterraggio" and alt<=0: spd=0; turn=0
        if v>1: hd+=math.radians(turn)*dt
        ms=v/3.6; x+=ms*math.sin(hd)*dt; y+=ms*math.cos(hd)*dt
        la=lat0+y/110574; lo=lon0+x/(111320*math.cos(math.radians(lat0)))
        sp=max(0,v+random.gauss(0,0.25)); ts=hms(t); crs=math.degrees(hd)%360
        enl=120 if motor else 0
        lines.append(f"$GNRMC,{ts},A,{ddm(la,2)},N,{ddm(lo,3)},E,{sp/1.852:.2f},{crs:.1f},051026,,,A*00")
        lines.append(f"$GNGNS,{ts},,,,,AAN,12,0.8,{alt+120:.1f},,,*00")
        lines.append(f"$GNVTG,{crs:.1f},T,,M,{sp/1.852:.2f},N,{sp:.2f},K,A*00")
        lines.append(f"$SMGPS,{ts},{vr+random.gauss(0,0.08):.2f},4.9,0.000*00")
        lines.append(f"$SMGPS2,0.00,0.00,1.00,{enl},0,0,1000.0*00")   # accX,accY,accZ,ENL,-,-,pressione (formato atteso da parseNMEA)
        t+=dt
        if name=="atterraggio" and alt<=0:
            tail+=1
            if tail>150: break
    if name=="atterraggio": break
open("polare-traiettoria-test.nmea","w").write("\n".join(lines)+"\n")
print("durata s:",round(t),"quota fine:",round(alt,1))
