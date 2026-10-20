/* Test automatici di RZ Flight Dashboard (Playwright + Chromium).
   Uso:  node tests/run.mjs        (dalla cartella principale; serve Playwright: npm i -g playwright)
   Avvia un piccolo server locale, apre l'app e verifica i casi sui file di esempio. Esce con codice 1 se qualcosa fallisce. */
import { createRequire } from "module";
import http from "http"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const require = createRequire(process.env.PW_PATH || "/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === "/" ? "index.html" : decodeURIComponent(q.url.split("?")[0]));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": mime[path.extname(f)] || "text/plain" }); r.end(d); } }); });
await new Promise(res => srv.listen(0, res));
const url = "http://localhost:" + srv.address().port + "/";
const E = p => path.join(root, "esempi", p);
let fails = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };

const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => { errs.push("dialog: " + d.message().slice(0, 50)); d.accept(); });
const fresh = async () => { await p.goto(url); await p.waitForTimeout(400); };
const load = async files => { await p.setInputFiles("#file", files); await p.waitForTimeout(1500); };
const text = async sel => (await p.textContent(sel)).replace(/\s+/g, " ");
await p.goto(url); await p.waitForTimeout(400);

console.log("NMEA (SM GPS)");
await load(E("volo-completo-test.nmea"));
await p.click("text=Polare"); await p.waitForTimeout(500);
ok(/Sink minimo 0,3\d m\/s/.test(await text("body")), "polare: sink minimo ~0,35 m/s");
await p.click("text=Analisi volo"); await p.waitForTimeout(400);
const sc = +(await text("#scoreBody")).match(/(\d+) \/100/)[1];
ok(sc >= 40 && sc <= 90, "indice di volo plausibile (" + sc + ")");

console.log("Jeti sintetico");
await fresh();
await load(E("volo-completo-test.log"));
await p.click("text=Analisi volo"); await p.waitForTimeout(400);
ok(/Regolatore.*Mezon 90/.test(await text("#flightHead")), "assetto: regolatore Mezon 90");
ok(/Modalità di volo/.test(await text("#anaTiles")) && /Termica/.test(await text("#anaTiles")), "fasi di volo da interruttori Sa/Sb");
ok(/Calo qualità collegamento/.test(await text("#radioEv")), "evento radio: calo di Q rilevato");

console.log("Unione Jeti + NMEA");
await fresh();
await load([E("volo-completo-test.log"), E("volo-completo-test.nmea")]);
const fname = await text("#fname"); const m = fname.match(/\(([+-]?[\d,]+) s, r=([\d,]+)\)/);
ok(!!m && Math.abs(parseFloat(m[1].replace(",", ".")) - 37.4) < 0.5, "offset ritrovato ~ +37,4 s (" + (m && m[1]) + ")");
ok(!!m && parseFloat(m[2].replace(",", ".")) > 0.95, "correlazione > 0,95");
await p.click("text=Polare"); await p.waitForTimeout(500);
ok(/Sink minimo/.test(await text("body")), "volo unito: polare disponibile");

console.log("Interruttori impostabili");
await p.click("#setupBtn"); await p.waitForTimeout(300);
ok(await p.locator("#phRow select").count() === 6, "impostazioni interruttori presenti");

console.log("Archivio (senza cartella)");
const jeti = fs.readFileSync(E("volo-completo-test.log"), "latin1");
await p.evaluate(t => { window.__rz.addFlight(t, "2026-10-01_a.log", "Prova"); window.__rz.addFlight(t, "2026-10-02_b.log", "Prova"); }, jeti);
await p.click("text=Archivio"); await p.waitForTimeout(500);
ok(/Miglior volo registrato: \d+/.test(await text("#arBest")), "miglior volo registrato mostrato");
ok(!(await p.locator("#tdCard").isHidden()), "grafico andamento visibile con 2 voli");

ok(errs.length === 0, "nessun errore JavaScript" + (errs.length ? ": " + errs.join(" | ") : ""));
await b.close(); srv.close();
console.log(fails ? `\n${fails} test FALLITI` : "\nTutti i test superati"); process.exit(fails ? 1 : 0);
