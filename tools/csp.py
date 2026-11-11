#!/usr/bin/env python3
"""Aggiorna la Content-Security-Policy di index.html.

La pagina ha UNO script inline: la CSP lo autorizza solo con il suo hash SHA-256. Se il codice cambia e l'hash no, il browser
blocca lo script e l'app resta vuota. Quindi, dopo OGNI modifica a index.html:   python3 tools/csp.py
(tests/run.mjs controlla che l'hash sia aggiornato.)"""
import base64, hashlib, re, sys
P = "index.html"
s = open(P, encoding="utf-8").read()
m = re.search(r"<script>(.*?)</script>", s, re.S)
if not m or len(re.findall(r"<script\b", s)) != 1:
    sys.exit("atteso esattamente uno script inline in index.html")
h = "sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode()
csp = ("default-src 'none'; "
       f"script-src '{h}'; "
       "style-src 'unsafe-inline'; "
       "img-src 'self' data: https://tile.openstreetmap.org https://server.arcgisonline.com; "
       "connect-src 'self'; manifest-src 'self'; worker-src 'self'; "
       "base-uri 'none'; form-action 'none'; object-src 'none'")
tag = f'<meta http-equiv="Content-Security-Policy" content="{csp}">'
if re.search(r'<meta http-equiv="Content-Security-Policy"[^>]*>', s):
    s2 = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', lambda _: tag, s, count=1)
else:
    s2 = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + tag, 1)
if s2 != s:
    open(P, "w", encoding="utf-8").write(s2); print("CSP aggiornata:", h)
else:
    print("CSP già aggiornata:", h)
