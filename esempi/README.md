# File di esempio

## `polare-traiettoria-test.nmea`
Log GPS **sintetico** (inventato, non è un volo reale) per provare le schede **Polare** e **Traiettoria** (v1.8+).
Si carica da **Carica ▾ → SM Modellbau**.

- Durata circa 12 minuti (≈ 1,7 MB), posizione fittizia a Milano, aria calma.
- Sequenza: salita a motore in cerchi · 8 planate a velocità costante (40, 45, 50, 55, 60, 70, 80, 90 km/h) · una termica · 4 planate (65, 52, 75, 47 km/h) · avvicinamento a spirale.
- **Valori attesi nella Polare:** sink minimo ≈ **0,35 m/s a ~45 km/h**, finesse massima ≈ **40:1 a ~56 km/h** (la dashboard legge 0,35 m/s a 44 km/h e 40,0:1 a 56 km/h).
- **Traiettoria:** salite e termica in verde, planate in rosso; l'aliante 3D si inclina nelle virate.

`genera-test-nmea.py` rigenera il file (modificabile: velocità, durate, polare).
