# RZ Flight Dashboard

Dashboard **single-file HTML** per analizzare i log di volo di veleggiatori radiocomandati.
Nessuna dipendenza, nessun build: è un unico file `.html` che gira **offline** aprendolo in un browser (Chrome/Edge/Firefox/Safari).
È anche una **PWA**: da iPhone/iPad/Android si installa sulla schermata Home e funziona senza rete.

- Versione corrente: **v1.32**
- Online (installabile come app): https://rzannori.github.io/rz-flight-dashboard/
- File di riferimento: `index.html` (versioni marcate con tag git `vX.Y`)
- Autore/owner: Roberto (RZ) — progetto personale modellismo

---

## 1. Cos'è e cosa fa

Carica un log di volo e lo analizza con: KPI, grafico quota con le salite a motore evidenziate,
giudizio automatico "a bordo pista", tabella dati, grafici personalizzabili multi-asse,
variabili **derivate** (calcolate), drill-through, zoom, focus, multilingua e temi.

Interfaccia **trilingue IT / EN / FR**, tema scuro antracite con colori personalizzabili, logo personalizzabile.

---

## 2. Come si usa (utente finale)

1. Salva il file `.html` e aprilo con doppio clic (funziona offline).
2. In alto a destra il pulsante **Carica ▾** apre un menu con:
   - **Jeti Log** → log Jeti grezzo `.log` o CSV esportato;
   - **SM Modellbau** → file GPS `.nmea`;
   - **RZ GPS** → *placeholder, non ancora implementato*;
   - **Demo** → carica dati fittizi + 2 grafici d'esempio.

   Il menu si chiude con Esc, con un clic fuori o dopo la scelta; è navigabile da tastiera (↓ ↑ Invio). Accanto c'è **Set up** (ingranaggio).
3. Schede: **Panoramica · Analisi volo · Grafico · Tabella · Polare · Traiettoria · Archivio**, più **Set up** (ingranaggio) e guida **?**.
4. Lingua con le bandierine 🇮🇹 🇬🇧 🇫🇷; logo cliccabile in alto a sinistra.

### Installazione su iPhone / iPad
1. Apri https://rzannori.github.io/rz-flight-dashboard/ con **Safari**.
2. **Condividi** (quadrato con freccia) → **Aggiungi alla schermata Home** → **Aggiungi**.
3. L'app si apre a schermo intero e funziona anche offline. I log si caricano dall'app **File** (iCloud Drive, AirDrop, …).

Note: report salvati, colori e logo dell'app installata sono separati da quelli di Safari.
Gli aggiornamenti pubblicati su GitHub arrivano da soli: l'app scarica la nuova versione in background e la usa all'apertura successiva.

---

> **Prova rapida:** nella cartella [`esempi/`](esempi/) ci sono log GPS sintetici: [`volo-completo-test.nmea`](esempi/volo-completo-test.nmea) per provare **tutte le schede** e `polare-traiettoria-test.nmea` per Polare e Traiettoria, con i valori attesi.

## 3. Architettura

File del repository:
- `index.html` — l'intera app (vedi sotto);
- `manifest.json` — nome, colori e icone della PWA;
- `sw.js` — service worker per l'offline (cache *stale-while-revalidate*; **cambiare `CACHE` a ogni versione**);
- `icons/` — icone generate dal logo RZ (180 apple-touch, 192, 512, 512 maskable, favicon 32).

`index.html` contiene, nell'ordine:
- `<!doctype html>`, `<meta charset="utf-8">`, `<meta viewport>`, `<title>`, `<style>` (con `@import` dei Google Font in testa ; tutto il CSS, token-based, tema unico scuro);
- avviso `#nojs` (visibile solo se JavaScript non gira, es. anteprima WhatsApp; rimosso al boot);
- markup: **header** (logo / titolo+versione / loaders+lingua+guida), **barra tab**, le **sezioni** (`<section data-page="ov|ju|gr|tb|re">`), l'**overlay guida**;
- `<script>` (IIFE, tutto il JS inline).

> Nota runtime: l'attributo `hidden` da solo perde contro un `display` impostato dal CSS (es. `.focusbar{display:flex}`).
> Dalla v1.5 il CSS include `[hidden]{display:none !important}`, quindi `hidden` è affidabile; per gli elementi
> con stato visibile/nascosto resta comunque preferibile una **classe** (`.show`/`.open`).

---

## 4. Modello dati interno ("frame")

Ogni log, dopo il parsing, diventa un oggetto `frame`:

```js
{
  t: [sec, ...],                 // asse tempo (s), campionato su griglia DT
  DT: 0.2,                       // passo di ricampionamento (s)
  series: {                      // dizionario per nome-canale
    "Rel. altit": { unit:"m", vals:[...] },
    "IBat":       { unit:"A", vals:[...] },
    "Power":      { unit:"W", vals:[...], derived:true },   // variabili derivate: derived:true
    ...
  },
  dur: <s>,                      // durata
  model: "<nome>",               // da header log / filename / "SM GPS"
  meta: { dateObj, time, dateKnown },  // data/ora inizio volo
  cells: <n>,                    // stima n° celle (da UBat a riposo / 4.2)
  climbs: [ { t0,t1,dur,ipk,imean,umin,tesc,dalt,a0,mah }, ... ]  // salite a motore rilevate
}
```

`DATA` = frame corrente. `VF()` restituisce `DATA` oppure una **fetta** (sliceFrame) se c'è un focus attivo.

---

## 5. Parser di input

| Funzione | Formato | Note |
|---|---|---|
| `parseRaw(text)` | Jeti `.log` grezzo | righe di definizione sensori (`000000000;dev;idx;label;unit`) + righe dati a **gruppi di 4** `idx;type;dec;val`. Valore = `val/10^dec`, con **segno a complemento a 2** su 32 bit; **sentinel 4294967295 = "no data"** (scartato). |
| `parseCsv(text)` | Jeti CSV esportato | header `JetiAdapter;...` + colonne con `[unità]`; tempo in `mm:ss.SSS`. |
| `parseNMEA(text)` | SM Modellbau `.nmea` | NMEA 0183 (`$GNRMC/$GNGNS/$GNVTG/$GNGSA`) + proprietarie `$SMGPS`/`$SMGPS2`. ~10 Hz. |

Tutti producono il frame via `frameFromSeries(seriesRaw, model, dur)` → ricampiona a `DT=0.2 s` con forward-fill, poi chiama `computeDerived()` e `detectClimbs()`.

**Canali da NMEA (SM Modellbau):** `Lat`/`Lon`(°, da RMC con fix valido), `Speed`(km/h, da VTG/RMC), `Alt. MSL`, `Rel. altit`, `Vario`, `Pressione`, `VRx`, `Dist.`, `Course`, `Sat`, `HDOP`, `Acc X/Y/Z`(g), `ENL` (rumore motore → usato per rilevare salite quando manca la corrente).

---

## 6. Variabili derivate (badge ƒ) — `computeDerived(frame)`

Elettriche (se presenti `UBat` e `IBat`):
- **Power** `UBat×IBat` [W]
- **Energy** `∫P dt` [Wmin] (cumulativa)
- **Rint** resistenza interna stimata `(U_vuoto − U_carico)/I` [mΩ] — definita solo con corrente > 5 A (baseline U_vuoto aggiornata con I < 1.5 A)

Cinematiche (se presente `Speed`; più ricche con `Vario`):
- **Accel** `dV/dt` [m/s²]
- **VarioTE** vario compensato in energia totale `vario + (V/g)·dV/dt` [m/s]
- **Glide** efficienza di planata `V_oriz / caduta` (solo in planata, V>3 e vario<−0.2)

Nomi trilingui (it/en/fr) in `DERIV_NAMES`; sono distinte nell'UI dal badge **ƒ** (`isDeriv()`, `derivBadge()`). Display localizzato via `dispName()` (`DERIV_NAMES` + `DISP_NAMES`).

---

## 7. Funzionalità per scheda

**Panoramica (`ov`)**
- `renderKpis(VF())`: tile Quota/Vario/Velocità/Durata con sparkline; le prime tre **cliccabili** → drill nel Grafico.
- `renderMain()`: grafico quota (area) con **bande salite a motore** e tooltip hover.
- **Brushing/Focus**: trascinando sul grafico si seleziona un intervallo → `focusRange`; KPI e Tabella si ricalcolano sulla fetta (`sliceFrame`/`VF`); barra "Focus … ✕" (`updateFocusBar`/`clearFocus`).
- **Popup salita**: clic su una banda → riepilogo (durata, Δquota, I picco/media, V/cella, mAh).
- Interazioni in `setupMainInteractions()`.

**Analisi volo (`ju`, ex "Giudizio")** — `analyzeFlight(f)` + `renderAnalysis(f)` + `renderNarrative(...)` (sempre sul volo intero)
- **In alto, "Analisi" — narrativa descrittiva** (`renderNarrative`), a due colonne da 1300 px, in sezioni con titolo: *Il volo* (modello, data, durata, quota massima, ripartizione motore/termica/planata, tipo di volo),
  *Lancio e salite a motore* (n°, tempo, guadagno, rateo medio e giudizio, elenco delle salite), *Termiche* (n°, tempo, guadagno, la migliore, valutazione, deriva col vento), *Planata* (sink medio con valutazione,
  efficienza, % di aria sostenuta e **confronto della velocità mediana con la polare**: sopra/sotto/vicina alla velocità di massima efficienza), *Velocità e percorso* (GPS: velocità, km percorsi, distanza max, precisione dell'atterraggio),
  *Motore e batteria* (commento tecnico: mAh/100 m, sag, capacità, ESC, qualità radio — solo con dati elettrici).
- **Giudizio** in un riquadro evidenziato: livello (**Ottimo / Buono / Discreto / Da migliorare**) da `punti di forza − 1,5 × cose da tenere d'occhio` (Ottimo = nessuna criticità e ≥ 3 punti di forza), elenchi *Punti di forza* e *Da tenere d'occhio*,
  conclusione con il consiglio per il prossimo volo. Regole: forza = uso parsimonioso del motore (≤ 15 %), termiche ≥ 1,5 m/s, più quota dalle termiche che dal motore, sink in planata ≤ 0,6 m/s, velocità vicina alla finesse massima (± 8 km/h),
  atterraggio entro 100 m, ≤ 120 mAh/100 m, ≥ 3,55 V/cella; attenzione = nessuna termica con planata lunga, sink > 1 m/s, passaggio sotto i 20 m a metà volo (esclusi i primi 10 s e gli ultimi 15 s), < 3,45 V/cella, ESC ≥ 70 °C, > 140 mAh/100 m, atterraggio oltre 400 m, distanza oltre 1 km, planata 20 km/h sopra la finesse massima, motore > 25 %.
- Testi in italiano, inglese e francese.
- **Riepilogo dati** in quattro **riquadri bordati** con titolo in evidenza (Volo · Termiche e planata · Velocità e percorso (GPS) · Motore e batteria), a due colonne da 1100 px, con le schede per gruppo: *Volo* (durata, tempo in volo, quota max, quota a fine motore, guadagno a motore e in termica, tempo motore/termica/planata con %),
  *Termiche e planata* (numero, miglior termica, rateo medio, sink medio, efficienza mediana, % vario > 0 in planata), *Velocità e percorso (GPS)* (max/media/mediana,
  percorso, distanza max e dal punto di partenza all'atterraggio), *Motore e batteria* (mAh, Wh, corrente e potenza max, V/cella min con semaforo, Rint, mAh/100 m, ESC max).
  I gruppi e le schede compaiono solo se i canali necessari esistono (un log GPS non mostra la batteria e viceversa).
- **Fasi del volo**: barra temporale a colori (A terra · Motore · Termica · Planata) con tempi e percentuali. Volo = dal primo all'ultimo istante sopra 3 m.
- **Termiche rilevate**: tratti a motore spento (esclusi i 3 s dopo lo spegnimento) con vario medio ±3 s > **+0,3 m/s** per almeno **12 s** (pause < 6 s unite, mai attraverso il motore),
  guadagno ≥ 3 m. Tabella: inizio, durata, guadagno (quota max − quota di ingresso), rateo, vario max, quota di ingresso e, col GPS, **deriva** orizzontale.
- **Distribuzioni**: istogrammi del tempo per velocità (in planata, fasce da 10 km/h) e per vario (a motore spento, fasce da 0,5 m/s).
- Tabella delle **salite a motore** in fondo. I chip e i paragrafi su mAh/100 m e sag compaiono solo con dati elettrici.

**Grafico (`gr`)**
- **Pannello Variabili (live)** a sinistra (sopra il grafico su schermi stretti): elenco verticale di tutte le variabili del volo con spunta,
  colore, unità e badge ƒ; ricerca; **X** (tempo o variabile) e **Tipo** (linea/area/dispersione). Il grafico si ricostruisce a ogni spunta.
- Le scelte vanno nel report speciale **● Live** (ultima voce del menu *Report*; non salvato tra i report standard, ma la selezione è ricordata in
  `localStorage` `fd_live` e riproposta ai caricamenti successivi per le variabili presenti). Se è selezionato un report salvato e si tocca il pannello,
  parte una **copia in Live** e l'originale resta intatto.
- **Salva come report** trasforma il Live in un report standard (come quelli del Set up); **Azzera** svuota la selezione.
- Funzioni: `ensureLive`, `toLive`, `syncLive`, `buildVarList`, `syncVarChecks`.
- Report selezionabili (menu). **Multi-asse**: un asse per variabile (sx = 1ª, dx impilati). Colore per curva (legenda). **Dettaglio** = risoluzione (decimazione min/max che preserva i picchi).
- **Zoom rotella** + **barra di scorrimento** (pan) + **⟲** reset (`setupViewInteractions`, stato `gZoom`).
- **Drill**: clic su una curva (o sul nome in legenda) → la isola; pulsante **← Indietro** torna al report precedente (`drillReturn`) e, se il drill è partito da un'altra scheda (es. clic su una KPI della Panoramica), **alla scheda di partenza** (`drillOrigin`).

**Tabella (`tb`)**
- Tutti i dati (`VF()`), selettore risoluzione, **Copia CSV** (`;` + virgola decimale; il download diretto è bloccato negli artifact, quindi si usa la copia).

**Traiettoria (`tr`)** — richiede `Lat`/`Lon` (GPS SM Modellbau)
- Traiettoria 3D su canvas con proiezione ortografica propria (nessuna libreria, nessuna mappa). `Lat`/`Lon` (gradi decimali) sono
  ora canali normali del frame, quindi compaiono anche in tabella/report e si salvano in archivio.
- Posizione convertita in metri locali (est/nord) dal primo punto; quota = `Rel. altit`. Griglia al suolo con passo "tondo" (10…5000 m),
  ombra della traccia, asse della quota, partenza (○) e fine (□).
- **Colore dal vario** (`varioOf`, media ±2 campioni): scala asimmetrica con lo zero al centro (giallo);
  la discesa satura il **rosso** all'80° percentile del sink (min 0,5 m/s), la salita il **verde** al 95° percentile (min 1 m/s).
- **Layout PC (≥ 1200 px): tre colonne** — a sinistra i **comandi** (Vista: Dall'alto/Laterale/3D, zoom −/+, Quota ×, Segui · Riproduzione: ▶, velocità 1×/5×/10×/30×, cursore ·
  Colore = vario), al centro il grafico 3D a tutta altezza, a destra i **dati del volo** (Aliante: tempo, quota, vario colorato, velocità, rotta, assetto, inclinazione,
  distanza dalla partenza, percorso · Canali del log: tutte le variabili del file all'istante corrente). Tra 900 e 1200 px i dati vanno sotto; su schermi stretti il grafico è per primo, poi comandi e dati.
- **Sfondo mappa gratuito** (`#trMap`, scelta ricordata in `localStorage` `fd_map`): *Nessuno* · *Strade (OSM)* · *Satellite (Esri)*. Nessuna chiave né account. I tasselli Web Mercator
  (`tile.openstreetmap.org`, `server.arcgisonline.com`) sono disegnati sul "pavimento" della scena con **una sola trasformazione affine per tassello** (la proiezione ortografica di un piano è lineare:
  `drawMapFloor`), quindi seguono rotazione, zoom e pan e funzionano anche in vista *Dall'alto* (che diventa la mappa 2D). Lo zoom dei tasselli si adatta alla risoluzione a schermo (z 8–19, max 48 tasselli);
  l'origine è il primo punto GPS. Attribuzione a schermo obbligatoria (© OpenStreetMap contributors / Esri, Maxar, Earthstar Geographics). Serve internet (i tasselli non sono nella cache offline).
  Uso personale e leggero: rispettare le condizioni dei fornitori (OSM *Tile Usage Policy*, termini Esri). Il pavimento è piano: non rappresenta il rilievo del terreno.
- **Mouse:** tasto **sinistro** trascinato = ruota; tasto **destro** (o centrale, o Maiusc+sinistro) trascinato = **pan** (sposta la vista); **rotella** = zoom **verso il cursore**; doppio clic = reset (anche del pan). Menu contestuale del browser disattivato sul grafico. Altri comandi: trascina = rotella o pulsanti **− / +** = zoom da ×0,4 a **×40** (con indicatore del livello), due dita su touch = zoom a pizzico, doppio clic = reset; pulsanti *Dall'alto / Laterale / 3D*; **Quota ×1/2/3/5** per esagerare la
  scala verticale; cursore + ▶ (riproduzione 10×) con marker e lettura di tempo, quota, vario e velocità. Rispetta il **Focus**.
- **Aliante 3D** al posto del marker: sagoma (ali, piani di coda, deriva, fusoliera) con ombra sul suolo e filo a piombo, colorata col vario del
  momento. È orientata su **rotta** (direzione di moto su ±1 s), **angolo di traiettoria** (salita/discesa) e **inclinazione in virata**
  (`atan(V·ω/g)`, max ±60°, calcolata in `trackData` come `hd`/`gm`/`bk`). Dimensione fissa in pixel (28–58 px di apertura): resta visibile a qualsiasi zoom.
- **Segui** (`#trFollow`): centra la vista sull'aliante, utile con lo zoom per vederlo da vicino.
- Funzioni: `trackData`, `renderTrack`, `drawTrack`, `trVarioCol`. Solo log GPS: con Jeti (senza posizione) compare un messaggio.

**Polare (`po`)** — richiede un log con `Speed` (GPS SM Modellbau)
- **Layout:** grafico a sinistra, **colonna destra con tutti i dati** (Risultati · Curva polare · Fasce di velocità · Legenda · Note): sink minimo e finesse massima con le velocità,
  campioni usati, intervallo e velocità mediana, **coefficienti** `a, b, c` della parabola con scarto medio (RMS), tabella delle fasce (velocità, sink mediano, finesse, n) con le fasce
  del sink minimo e della finesse massima evidenziate. Sotto i 1000 px la colonna va sotto il grafico.
- Grafico velocità [km/h] / vario TE [m/s] dei soli tratti di **planata a motore spento** (come in `glideStats`: dalla 1ª salita
  all'ultimo istante sopra 3 m, escludendo 3 s dopo lo spegnimento), con quota > 8 m e velocità ≥ 10 km/h.
- Scartati: punti con |accelerazione| > 1 m/s² (manovre; accelerazione su ±1 s) e punti con vario TE ≥ 0 (salita).
  Il vario TE è `vario + V·dV/dt/g`; se manca il canale `Vario` si deriva dalla quota (`varioOf`).
- Mediana del sink per **fascia di velocità** (2/3/5 km/h, minimo 10 campioni ≈ 2 s), poi **parabola pesata** `s = a + b·v + c·v²`
  (v in m/s) sulle mediane; se `c ≤ 0` la curva non è fisica e si mostrano solo le fasce.
- Risultati: **sink minimo** e **finesse massima** (max di `v/s` lungo la curva, tangente dall'origine), con velocità relative;
  "al limite dei dati" se il massimo cade a un estremo del range misurato.
- Rispetta il **Focus** della Panoramica (usa `VF()`). Funzioni: `polarData`, `renderPolar`. `drawChart` ha l'hook `cfg.after(g,geo)` per overlay.
- Limiti: la velocità GPS è **al suolo** (con vento forte i punti si disperdono); la polare è più fedele con planate a velocità
  costante e diverse tra loro, in aria calma. Punti anomali oltre `1,5×` il sink massimo delle fasce non vengono disegnati.

**Archivio (`ar`)** — solo Chrome/Edge su PC (File System Access API)
- **Cartella**: scelta con `showDirectoryPicker`; l'handle è salvato in IndexedDB (`rzfd` → `kv` → `archDir`) e
  all'avvio si verifica il permesso (`queryPermission`); se serve, pulsante **Riconnetti cartella** (`requestPermission`).
  Consigliato metterla dentro Google Drive per desktop → backup automatico.
- **Salva volo corrente**: campi **Modello / Pacco / Note** (suggerimenti dai voli già archiviati). Un log già
  archiviato (stesso nome file d'origine e stessa durata) viene riconosciuto e **aggiornato**, non duplicato.
  I dati Demo non si archiviano.
- **Elenco**: filtri per modello e pacco; **Apri** carica il volo nelle altre schede; ✕ elimina il file (con conferma).
- **Confronto** (2–4 voli spuntati): curve sovrapposte con **scala Y comune** (`drawChart` con `cfg.sharedY`),
  allineate a *1ª salita*, *1ª planata* o *inizio volo*, finestra 1/2/5 min o tutto; tabella affiancata con il migliore in verde.
  - *Salite*: n°, Δquota media (fino a 10 s dopo lo spegnimento), rateo (Δquota/tempo motore), I picco/media, mAh/100m, V/cella min, Rint mediana.
  - *Planate* (solo motore spento +3 s, dalla 1ª salita all'ultimo istante sopra 3 m): tempo, vario netto, sink medio (solo tratti in discesa),
    % tempo con vario > 0,2 m/s (termica), efficienza mediana (solo se c'è `Speed`). Senza canale `Vario` si deriva dalla quota (±1 s).
- **Riepilogo per pacco**: medie per pacco dei voli filtrati (rateo, mAh/100m, V/cella min, Rint, sink).
- Funzioni: `flightSummary`, `glideStats`, `varioOf`, `frameToJson`/`frameFromJson`, `archReload`, `archSave`, `renderArchive`, `renderCompare`.

**Formato file archivio** — `<AAAA-MM-GG_hhmmss>_<modello>_<pacco>.rzf.json`:
```js
{ format:"rz-flight", version:1, app:"v1.7", saved:"<ISO>", model, pack, note, source:"<file log originale>",
  meta:{ date:"<ISO>", time:"hh:mm:ss", dateKnown }, DT:0.2, dur, summary:{...},   // summary: solo informativo
  series:{ "<canale>":{ unit, vals:[...] } } }                                       // solo canali registrati, null = nessun dato
```
Derivate e salite **non** si salvano: si ricalcolano all'apertura, così i miglioramenti agli algoritmi valgono anche per i voli vecchi.

**Set up (`re`)**
- **Costruttore report**: X (Tempo o variabile), Y (una o più), tipo (linea/area/dispersione), **colore per curva**, nome. Salvati in `localStorage`. La lista parte vuota.
- **Aspetto**: color picker per i token principali (`--bg`, `--surface`, `--fg`, `--accent`, `--accent-2`, `--motor`), applicati live e salvati.

**Header**: logo (clic per cambiarlo, si ridimensiona in proporzione), titolo + badge versione, bandierine lingua, guida `?` (overlay con `.open`),
riga di azioni con il menu **Carica ▾** (`#loadMenu`, classe `.open`; gli `<input type=file>` `#file`/`#fileSM` restano dentro le voci `<label>`) e **Set up**.

---

## 8. Motore grafico (canvas) — `drawChart(canvas, cfg)`

- `cfg.series`: `[{ xs, ys, color, type:'line|area|scatter', name, unit, key }]`
- `cfg.bands` (solo Panoramica), `cfg.xmin/xmax` (zoom/focus), `cfg.xTimeAxis`.
- Ogni serie ha **scala Y propria** (autoscalata min/max). Fino a 2 assi "pieni" + ulteriori a destra impilati.
- **Decimazione min/max** (`decim`) conserva picchi/valli; `decimXY` per scatter.
- **Clipping** all'area del grafico (per zoom).
- Salva la **geometria** su `canvas._geo` (padL, W, H, xmin/xmax, series con xs/ys/_min/_max/col/key) e `canvas._lastCfg`, usati da hover / brush / zoom / drill.
- Tooltip crosshair: `attachHover()` (Grafico) e dentro `setupMainInteractions()` (Panoramica).

Helper: `nearestIdx`, `rangeOf`, `fmtTick`, `rgba/toRgb`, `cssv` (legge i token CSS), `drawSpark` (sparkline KPI).

---

## 9. Stato e persistenza

Variabili di modulo: `DATA`, `reports`, `lang`, `chartPts`, `focusRange`, `gZoom`, `drillReturn`, `isDemo`, `themeOverrides`, `logoData`.

IndexedDB `rzfd` / store `kv`: `archDir` — handle della cartella archivio.

`localStorage`:
- `fd_lang` — lingua (it/en/fr)
- `fd_theme` — override colori
- `fd_logo` — logo (data URL)
- `jeti_reports` — report salvati *(nome legacy, da rinominare in `rz_reports` quando comodo)*

I report `tmp:true` (creati dal drill) **non** vengono persistiti (`saveReports` li filtra) e vengono ripuliti al cambio dataset.

---

## 10. Pipeline di rendering

`renderAll()` → `renderFlightHead` · `renderKpis(VF())` · `renderMain` · `renderVerdict(DATA)` · `refreshReportSel` · `refreshBuilder` · `updateFocusBar` · `setupMainInteractions` · `attachHover(viewChart)` · `setupViewInteractions`.
Il cambio tab mostra/nasconde le sezioni e renderizza su richiesta (`renderView`, `renderTable`).
`setLang(l)` applica `applyI18n()` (elementi con `data-i18n` / `-html` / `-title` / `-ph`) e ri-renderizza i contenuti dinamici.

---

## 11. i18n

- Dizionario `T = { it:{...}, en:{...}, fr:{...} }`, helper `t(key)`.
- Testo statico: attributi `data-i18n`, `data-i18n-html`, `data-i18n-title`, `data-i18n-ph`.
- Testo dinamico: `t(...)`; nel giudizio `LG(it,en,fr)`.
- Numeri/date localizzati via `locale()` / `fmt()`.

---

## 12. Limiti noti

- **Jeti e GPS non si fondono** automaticamente: orologi diversi (Jeti = ms da accensione TX; NMEA = UTC). Si caricano separatamente.
- **Velocità** disponibile solo da GPS (nessun pitot nei log Jeti).
- **Rint** è una **stima** (indicativa, utile per tendenze), non una misura.
- Il **giudizio** è motore-centrico (pensato per log Jeti).
- **Brushing** pensato per mouse (su touch: tap su salita = popup).
- `RZ GPS` è solo un pulsante segnaposto.

---

## 13. Versioning

- Badge in alto: `vX.Y`. File consegnato: `RZ-Flight-Dashboard-vX.Y.html` (stesso numero).
- Convenzione: **minor** (x.Y) per ritocchi/aggiunte piccole, **major** (X.0) per cambiamenti sostanziali.
- Il progetto è sotto **git**: il file è `index.html` e ogni versione ha un tag (`v1.4`, `v1.5`, …).

---

## 14. Roadmap / prossimi passi

- Loader **RZ GPS** (sul modello di `parseNMEA`).
- Zoom rotella anche in Panoramica (coesistendo col brushing).
- Eventuale **merge GPS+Jeti** con allineamento manuale (es. istante di lancio).
- Altre derivate: quota/densità aria, accelerazione verticale.
- Polare: sovrapposizione di più voli dall'archivio (zavorra/baricentro), correzione del vento, esportazione dei punti.
- Traiettoria: sfondo mappa (richiede rete/servizio di tile), colore per altra variabile (velocità, quota), confronto di due voli.
- Archivio: confronto salita-per-salita (non solo medie), andamento nel tempo per pacco (grafico), export CSV del confronto.
- ~~Packaging PWA~~ (fatto in v1.6); eventuale Tauri (.exe) se serve una "vera app" desktop.
- Refactor opzionale in più file (html/css/js) una volta sotto git.

---

## 15. Changelog

- **v1.0** — rinomina in "RZ Flight Dashboard", badge versione.
- **v1.1** — drill-through (KPI cliccabili, brushing/focus, popup salita).
- **v1.2** — drill sulle curve; zoom rotella + barra scorrimento nel Grafico; clipping.
- **v1.3** — fix chiusura barra Focus (via classe, non `hidden`); pulsante **← Indietro** dopo il drill.
- **v1.4** — avviso `#nojs` per chi apre il file in un'anteprima senza JavaScript.
- **v1.24** — **Fasi di volo dagli interruttori** (log Jeti con canali `Comando Sa/Sb`): barra colorata alla base dei grafici (Normale, Termica, Velocità, Atterraggio), canale derivato "Fase volo" e riquadro "Modalità di volo" in Analisi volo con i tempi per fase. Assegnazione: Sa a 3 posizioni (0 = termica, 50 = normale, 100 = velocità), Sb ≥ 50 = atterraggio; modificabile in `PHASE_SA`/`PHASE_SB`. Corretta la lettura delle righe che terminano con `;`; i canali identici duplicati si fondono.
- **v1.23** — **Un solo pulsante "Carica"** (più "Demo"): il tipo di file (log Jeti raw, CSV, NMEA dello SM GPS) è riconosciuto dal contenuto. Sotto il nome del modello compare la **frase dell'assetto** (es. "Jeti Mezon 120 · MiVario · 6S": regolatore e sensori dai nomi nel log, numero di celle dalla tensione, GPS se presente). I nomi leggibili si aggiungono nella tabella `DEVICE_NAMES` in `index.html`. Corretta la lettura dell'ora dal nome file quando è preceduto da altre cifre.
- **v1.22** — Supporto ai log Jeti con regolatore **MEZON** e sensore **MiVario** (es. ARCUS): i nomi dei canali in italiano (Altitudine, U/I Batteria, Capacita, Giri, Acc_X…) sono mappati sui nomi standard; i canali con lo stesso nome su dispositivi diversi ricevono il suffisso del dispositivo; "Temp." del regolatore diventa TempESC; l'intestazione mostra i dispositivi rilevati. Nota: se il canale `Velocita` non è una velocità reale, Polare e Traiettoria non sono disponibili.
- **v1.21** — Traiettoria: **sfondo mappa gratuito** (strade OpenStreetMap o satellite Esri) sotto la traccia, anche in vista dall'alto; allineamento verificato con tasselli di prova (scarto ≈ 1 px).
- **v1.20** — **Analisi volo**: in alto la narrativa **"Analisi"** (descrittiva, più estesa) con **giudizio finale** (livello, punti di forza, cose da tenere d'occhio, consiglio); i gruppi di dati sono in riquadri bordati con titolo in grassetto. Corretto il falso "passaggio molto basso (0 m)" che contava i secondi a terra.
- **v1.19** — scheda **Giudizio → Analisi volo** ampliata (riepilogo a schede, fasi del volo, termiche rilevate, distribuzioni, commento, salite); scheda **Polare** con colonna destra di dati e info (risultati, coefficienti della curva, tabella delle fasce). Corretti i chip "0 mAh/100m" e "sag min —" che comparivano per i log senza dati elettrici.
- **v1.18** — Traiettoria: layout a **tre colonne** (comandi a sinistra, dati del volo a destra) e **pan col tasto destro** del mouse; zoom con la rotella verso il cursore. File di esempio corretto (la riga `$SMGPS2` ora ha il formato atteso dal lettore: la salita a motore viene riconosciuta).
- **v1.17** — scheda Traiettoria: comandi e variabili in **colonna a sinistra** sul PC (vista, zoom, riproduzione con velocità, legenda, valori dell'aliante e di tutti i canali) e grafico a tutta altezza. **Bugfix**: i menu "Dettaglio" non si influenzano più con gli altri menu (Fascia della Polare, Quota ×, velocità) che prima ne alteravano il valore.
- **v1.16** — scheda Grafico: **grafici live**, pannello Variabili a sinistra con spunte/colori/ricerca/X/tipo, report "● Live" ricordato, "Salva come report".
- **v1.15** — drill-through: **← Indietro** dal Grafico torna alla scheda da cui si è partiti (es. la Panoramica), non solo al report precedente.
- **v1.14** — **ottimizzazione PC**: la pagina usa tutta la larghezza dello schermo (prima colonna fissa di 1040 px; ora fino a 2000 px, con tetto per i monitor enormi);
  i grafici (Panoramica, Grafico, Polare, Traiettoria) si adattano all'**altezza** della finestra (`chartH`) per riempire lo schermo senza scorrere;
  il Giudizio è su due colonne e il Set up affianca Costruttore e Aspetto (da 1100 px). Sotto i 900 px restano le altezze di prima.
- **v1.13** — **ottimizzazione iPhone/telefono**: la barra delle schede scorre in orizzontale (con 7 schede allargava l'intera pagina e spingeva
  fuori bordo i comandi) e centra la scheda scelta; intestazioni e comandi delle schede vanno a capo; campi dell'Archivio e del Set up a tutta
  larghezza; bersagli di tocco più grandi (`@media (pointer:coarse)`). Verificato in emulazione iPhone 13 (390 px): nessun elemento fuori bordo in nessuna scheda.
- **v1.12** — traiettoria: zoom fino a **×40** (prima ×8), pulsanti − / + con indicatore del livello, zoom a pizzico su touch.
- **v1.11** — traiettoria: **aliante 3D** (rotta, assetto, inclinazione in virata, ombra) al posto del cerchietto; opzione **Segui**.
- **v1.10** — schermata iniziale più compatta: i quattro pulsanti di caricamento sono un unico menu a tendina **Carica ▾** (Jeti, SM Modellbau, RZ GPS, Demo) accanto a Set up; logo proporzionale su schermi stretti.
- **v1.9** — scheda **Traiettoria 3D** colorata dal vario; `parseNMEA` ora salva `Lat`/`Lon` (conversione ddmm.mmmm → gradi decimali, solo fix validi).
- **v1.8** — scheda **Polare di velocità** (sink minimo, finesse massima, curva e tangente); hook `cfg.after` in `drawChart`.
- **v1.7** — **Archivio voli** su cartella del PC (Chrome/Edge) con modello, pacco e note; **confronto** di 2–4 voli
  (curve sovrapposte su scala comune, allineamento a salita/planata, tabella salite e planate); riepilogo per pacco;
  `hhmmss` gestisce i tempi negativi.
- **v1.6** — **PWA** installabile su iPhone: manifest, icone, service worker offline (anche font), safe-area per notch,
  selettore File senza filtro estensioni su iOS (altrimenti `.nmea` risulta non selezionabile).
- **v1.5** — bugfix: nomi canali in francese (prima `undefined`); `@import` dei font spostato in testa (prima ignorato);
  KPI coerenti col Focus dopo resize/cambio lingua; `<!doctype>` + `charset utf-8` + viewport (apertura locale e mobile);
  regola CSS `[hidden]`; nome report predefinito localizzato; rimosso codice morto nel loader Jeti.

*(Prima della v1.0: parser Jeti raw/CSV e NMEA SM, variabili derivate, multilingua IT/EN/FR, tema antracite + color picker, logo, Demo, tabella + Copia CSV, assi multipli, guida.)*

---

## 16. Sviluppo

```bash
git clone <url-del-repo> && cd <repo>
python3 -m http.server 8000   # poi apri http://localhost:8000
```

Oppure apri direttamente `index.html` con doppio clic (funziona offline; senza rete si usano i font di sistema).
