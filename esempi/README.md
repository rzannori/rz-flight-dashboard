# File di esempio

| File | Per provare | Durata |
|---|---|---|
| [`volo-completo-test.nmea`](volo-completo-test.nmea) | **tutte le schede** (consigliato) | ~16 min, 2,2 MB |
| [`polare-traiettoria-test.nmea`](polare-traiettoria-test.nmea) | solo Polare e Traiettoria | ~12 min, 1,7 MB |

Tutti i log sono **sintetici** (inventati, non sono voli reali) e si caricano da **Carica ▾ → SM Modellbau**.

## `polare-traiettoria-test.nmea`
Log GPS **sintetico** (inventato, non è un volo reale) per provare le schede **Polare** e **Traiettoria** (v1.8+).
Si carica da **Carica ▾ → SM Modellbau**.

- Durata circa 12 minuti (≈ 1,7 MB), posizione fittizia a Milano, aria calma.
- Sequenza: salita a motore in cerchi · 8 planate a velocità costante (40, 45, 50, 55, 60, 70, 80, 90 km/h) · una termica · 4 planate (65, 52, 75, 47 km/h) · avvicinamento a spirale.
- **Valori attesi nella Polare:** sink minimo ≈ **0,35 m/s a ~45 km/h**, finesse massima ≈ **40:1 a ~56 km/h** (la dashboard legge 0,35 m/s a 44 km/h e 40,0:1 a 56 km/h).
- **Panoramica/Giudizio:** 1 salita a motore (il canale ENL del GPS supera la soglia durante la salita iniziale).
- **Traiettoria:** salite e termica in verde, planate in rosso; l'aliante 3D si inclina nelle virate.

`genera-test-nmea.py` rigenera il file (modificabile: velocità, durate, polare).

---

## `volo-completo-test.nmea` — un po' tutto
Log GPS sintetico (posizione fittizia, sabato 17/10/2026 alle 10:30, aria calma tranne la deriva delle termiche), generato da `genera-volo-completo.py`.

**Sequenza:** a terra · salita a motore 1 (spirale) · 10 planate a velocità costante (40, 45, 50, 55, 60, 70, 80, 90, 35, 65 km/h) · salita a motore 2 (breve, dritta) · termica 1 (media) · planata veloce a 90 km/h · termica 2 (debole) · planata · termica 3 (forte, cerchi stretti) · planata lunga · rientro veloce a 100 km/h con aerofreni finali.
Include tutti i canali: velocità, posizione, quota GPS e relativa, satelliti, HDOP, rotta, vario, VRx, distanza, accelerometri X/Y/Z, ENL, pressione.

**Cosa controllare scheda per scheda** (valori letti dalla dashboard v1.19, con piccole tolleranze):

| Scheda | Atteso |
|---|---|
| **Panoramica** | sabato 17 ottobre 2026 · ore 10:30:00 · quota max **407 m** · velocità max **101 km/h** · durata **15:54** · 2 bande di salita a motore sul grafico. Trascina per il Focus; clic su una KPI → drill nel Grafico e *Indietro* torna qui |
| **Analisi volo** | **2 salite a motore** (tempo motore 1:20, 9 %) · **3 termiche**: ~5:48 (+85 m, +1,5 m/s), ~7:23 (+84 m), ~9:23 (+117 m, +2,5 m/s, la più forte) con **deriva** di circa 200 m · guadagno a motore +335 m, in termica +287 m · percorso ~18 km · distanza max ~870 m · atterraggio a ~100 m dalla partenza · fasi: motore 9 %, termica 19 %, planata 73 % · istogrammi di velocità (30–100 km/h) e vario. Niente chip di batteria (il log non ha la corrente) |
| **Grafico** | pannello Variabili con 19 canali: spunta *Quota rel.* e *Acc Z* (cresce nelle virate), *Vario* ed *ENL* (sale a ~120 durante il motore). Salva come report, cambia X |
| **Tabella** | 954 righe, 19 variabili, con latitudine e longitudine a 6 decimali |
| **Polare** | **sink minimo ≈ 0,35 m/s a ~46 km/h** · **finesse massima ≈ 40,7:1 a ~57 km/h** · 14 fasce · scarto medio ~0,008 m/s (la polare "vera" del file: 0,35 m/s a 45 km/h, ~40:1 a ~56 km/h) |
| **Traiettoria** | salite e termiche in **verde**, planate in **rosso/arancio**; l'aliante si inclina nelle termiche (**inclinazione ~36°** nella termica 3, ~26° nella spirale di salita), assetto ~+13° in salita; i canali a destra cambiano mentre scorri; pan col tasto destro, zoom con la rotella, Segui, ▶ a 1–30× |
| **Archivio** | (Chrome/Edge su PC) salva il volo con modello e pacco: stessa durata e canali ricaricati identici |

> Il vario del file è "barometrico": dopo una decelerazione brusca (90 → 48 km/h) mostra una piccola salita per lo scambio velocità/quota. Per questo la termica 2 ha un vario massimo apparente di ~3,8 m/s: è normale.

> **Sfondo mappa (v1.21):** i file di esempio sono posizionati a circa 45,60° N, 9,20° E (zona del lago di Como/Lecco). Scegliendo *Sfondo → Strade/Satellite* nella scheda Traiettoria si vede la mappa reale di quel punto sotto il volo inventato (serve internet).

## Log Jeti sintetico (v1.36)

| File | Cosa contiene |
|---|---|
| `volo-completo-test.log` | log **Jeti raw** inventato dello stesso volo di `volo-completo-test.nmea`, con l'orologio sfasato di **37,4 s**: quota, regolatore Mezon 90 (giri, V, A), ricevente (U Rx, Q con un calo a ~5:00) e interruttori Sa/Sb (termica 5:00–8:40, poi normale) |
| `genera-jeti-test.py` | lo script che lo produce |

Caricando **insieme** `volo-completo-test.log` e `volo-completo-test.nmea` (selezione multipla in *Carica*) i due voli si uniscono: accanto al nome compare "uniti (+37,4 s, r=1,00)" e hai dati elettrici, polare e traiettoria nello stesso volo.
