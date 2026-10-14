# RZ Flight Dashboard

Dashboard **single-file HTML** per analizzare i log di volo di veleggiatori radiocomandati.
Nessuna dipendenza, nessun build: è un unico file `.html` che gira **offline** aprendolo in un browser (Chrome/Edge/Firefox/Safari).
È anche una **PWA**: da iPhone/iPad/Android si installa sulla schermata Home e funziona senza rete.

- Versione corrente: **v1.7**
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
2. In alto a destra, pulsanti di caricamento:
   - **Jeti Log** → log Jeti grezzo `.log` o CSV esportato;
   - **SM Modellbau** → file GPS `.nmea`;
   - **RZ GPS** → *placeholder, non ancora implementato*;
   - **Demo** → carica dati fittizi + 2 grafici d'esempio.
3. Schede: **Panoramica · Giudizio · Grafico · Tabella · Archivio**, più **Set up** (ingranaggio) e guida **?**.
4. Lingua con le bandierine 🇮🇹 🇬🇧 🇫🇷; logo cliccabile in alto a sinistra.

### Installazione su iPhone / iPad
1. Apri https://rzannori.github.io/rz-flight-dashboard/ con **Safari**.
2. **Condividi** (quadrato con freccia) → **Aggiungi alla schermata Home** → **Aggiungi**.
3. L'app si apre a schermo intero e funziona anche offline. I log si caricano dall'app **File** (iCloud Drive, AirDrop, …).

Note: report salvati, colori e logo dell'app installata sono separati da quelli di Safari.
Gli aggiornamenti pubblicati su GitHub arrivano da soli: l'app scarica la nuova versione in background e la usa all'apertura successiva.

---

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

**Canali da NMEA (SM Modellbau):** `Speed`(km/h, da VTG/RMC), `Alt. MSL`, `Rel. altit`, `Vario`, `Pressione`, `VRx`, `Dist.`, `Course`, `Sat`, `HDOP`, `Acc X/Y/Z`(g), `ENL` (rumore motore → usato per rilevare salite quando manca la corrente).

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

**Giudizio (`ju`)**
- `renderVerdict(DATA)`: giudizio automatico "a bordo pista" (sempre su volo intero), chip colorati + prosa + tabella salite. Testi trilingui via helper `LG(it,en,fr)`.

**Grafico (`gr`)**
- Report selezionabili (menu). **Multi-asse**: un asse per variabile (sx = 1ª, dx impilati). Colore per curva (legenda). **Dettaglio** = risoluzione (decimazione min/max che preserva i picchi).
- **Zoom rotella** + **barra di scorrimento** (pan) + **⟲** reset (`setupViewInteractions`, stato `gZoom`).
- **Drill**: clic su una curva (o sul nome in legenda) → la isola; pulsante **← Indietro** (`drillReturn`) torna al report precedente.

**Tabella (`tb`)**
- Tutti i dati (`VF()`), selettore risoluzione, **Copia CSV** (`;` + virgola decimale; il download diretto è bloccato negli artifact, quindi si usa la copia).

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

**Header**: logo (clic per cambiarlo), titolo + badge versione, loaders, bandierine lingua, guida `?` (overlay con `.open`).

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
