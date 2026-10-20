#!/usr/bin/env python3
"""Přehled docs/follow-ups.md podle osudu a oblasti, aby nikdo nemusel číst celý soubor.

Použití:
  follow-ups.py <cwd> [--osud <osud>] [--oblast <text>] [--rez <NN|kolecko>] [--json] [--soubor <cesta>]

Bez voleb: počty osud × oblast a seznam položek [rozhodnutí] (ty jediné potřebují majitele).
  --osud oprava      položky daného osudu seskupené podle oblasti a cesty (adresář první cesty v textu)
  --oblast <text>    jen oblasti, které text obsahují (bez ohledu na velikost písmen)
  --rez 5 | 05 | kolecko   jen položky daného řezu (ze značky, jinak z nadpisu sekce)
  --json             strojový výstup pro agenty: {soubor, otevrene, uzavrene, pocty, polozky[]}
  --soubor <cesta>   jiný soubor než <cwd>/docs/follow-ups.md

Tvar položky (TVAR-DOKUMENTU, sekce Follow-ups): „- [řez NN · <oblast>] [<osud>] text“, kolečko „[kolečko · <oblast>]“;
osud je rozhodnutí | oprava | nápad | obsah a smí stát i jako první značka („[oprava] [řez NN · oblast] …“) nebo sám
(„[oprava] text“: řez z nadpisu, oblast „?“). Položka bez osudu se vede jako „bez osudu“ (starší zápisy), řádek s ~~ je
uzavřená položka a do přehledu nejde. Odsazené řádky pod odrážkou patří k ní. Nadpisy „## Řez NN …“ dávají řez položkám
bez značky řezu.
"""
import json
import os
import re
import sys

OSUDY = ("rozhodnutí", "oprava", "nápad", "obsah")
OSUD_ALIAS = {"rozhodnuti": "rozhodnutí", "rozhodnutí": "rozhodnutí", "oprava": "oprava", "napad": "nápad", "nápad": "nápad",
              "obsah": "obsah"}
BEZ_OSUDU = "bez osudu"
ODRAZKA = re.compile(r"^\s*[-*]\s+(.*)$")
NADPIS = re.compile(r"^#{2,4}\s+(.*)$")
ZNACKA = re.compile(r"^\[([^\]]*)\]\s*")
REZ = re.compile(r"řez\s*0*(\d+[a-z]?)", re.I)
KOLECKO = re.compile(r"kole[čc]k", re.I)
CESTA = re.compile(r"(?<![\w/])((?:[\w.@-]+/)+[\w.@-]+|[\w-]+\.(?:ts|tsx|js|mjs|cjs|py|astro|md|json|css|scss|sql|sh|yml|yaml|toml|html|vue|svelte))(?![\w/])")


def nn(x):
    s = str(x or "").strip()
    m = re.match(r"0*(\d+)([a-z]?)$", s)
    return (m.group(1).zfill(2) + m.group(2)) if m else s


def rozeber_znacku(znacka, rez_nadpisu):
    """[řez 03 · api] → (rez "03", oblast "api"); [E2E kosmetika řez 06] → ("06", "E2E kosmetika"); [kolečko · web] → ("kolecko", "web")."""
    rez = None
    kusy = [k.strip() for k in re.split(r"\s*[·|]\s*", znacka) if k.strip()]
    zbytek = []
    for k in kusy:
        m = REZ.search(k)
        if m and rez is None:
            rez = nn(m.group(1))
            z = REZ.sub("", k).strip(" -:")
            if z:
                zbytek.append(z)
        elif KOLECKO.search(k) and rez is None:
            rez = "kolecko"
            z = KOLECKO.sub("", k).strip(" -:oů")
            if z and not re.fullmatch(r"[a-zěščřžýáíéúů]{0,2}", z):
                zbytek.append(z)
        else:
            zbytek.append(k)
    oblast = zbytek[-1] if zbytek else "?"
    return rez or rez_nadpisu or "?", oblast


def polozky(text):
    """Seznam položek a počet uzavřených; položka = {radek, rez, oblast, osud, text, cesty}."""
    out, uzavrene = [], 0
    rez_nadpisu = None
    akt = None   # (radek, text, rez_nadpisu)

    def uzavri():
        nonlocal akt, uzavrene
        if akt is None:
            return
        radek, t, rn = akt
        akt = None
        t = " ".join(t.split())
        if "~~" in t:
            uzavrene += 1
            return
        # Osud je první NEBO druhá hranatá značka ([řez NN · oblast] [oprava] …, [oprava] [řez NN · oblast] …, holé
        # [oprava] text); značka, která není osud, nese řez a oblast. Osud se nikdy nevykazuje jako oblast.
        rez, oblast, osud, znacka_rezu = None, None, BEZ_OSUDU, False
        for _ in range(2):
            m = ZNACKA.match(t)
            if not m:
                break
            kand = m.group(1).strip().lower()
            if kand in OSUD_ALIAS:
                if osud != BEZ_OSUDU:
                    break
                osud = OSUD_ALIAS[kand]
            elif not znacka_rezu:
                rez, oblast = rozeber_znacku(m.group(1), rn)
                znacka_rezu = True
            else:
                break
            t = t[m.end():]
        if not znacka_rezu:
            rez, oblast = rn or "?", "?"
        out.append({"radek": radek, "rez": rez, "oblast": oblast, "osud": osud, "text": t.strip(),
                    "cesty": sorted(set(c for c in CESTA.findall(t) if "/" in c or "." in c))})

    for i, r in enumerate(text.splitlines(), 1):
        mh = NADPIS.match(r)
        if mh:
            uzavri()
            h = mh.group(1)
            m = REZ.search(h)
            rez_nadpisu = nn(m.group(1)) if m else ("kolecko" if KOLECKO.search(h) else None)
            continue
        mo = ODRAZKA.match(r)
        if mo and not r.startswith((" ", "\t")):
            uzavri()
            akt = (i, mo.group(1), rez_nadpisu)
            continue
        if akt is not None:
            if r.strip() == "":
                uzavri()
            elif r.startswith((" ", "\t")):
                akt = (akt[0], akt[1] + " " + r.strip(), akt[2])
            else:
                uzavri()
    uzavri()
    return out, uzavrene


def pocty(items):
    p = {}
    for it in items:
        p.setdefault(it["oblast"], {}).setdefault(it["osud"], 0)
        p[it["oblast"]][it["osud"]] += 1
    return p


def tabulka(p, celkem):
    sloupce = list(OSUDY) + [BEZ_OSUDU]
    sirka = max([len("oblast")] + [len(o) for o in p]) if p else len("oblast")
    radky = ["oblast".ljust(sirka) + "  " + "  ".join(s.rjust(10) for s in sloupce) + "  " + "celkem".rjust(7)]
    for o in sorted(p, key=lambda k: -sum(p[k].values())):
        radky.append(o.ljust(sirka) + "  " + "  ".join(str(p[o].get(s, 0) or "·").rjust(10) for s in sloupce)
                     + "  " + str(sum(p[o].values())).rjust(7))
    radky.append("celkem".ljust(sirka) + "  " + "  ".join(str(sum(x.get(s, 0) for x in p.values()) or "·").rjust(10) for s in sloupce)
                 + "  " + str(celkem).rjust(7))
    return "\n".join(radky)


def radek_polozky(it, s_oblasti=True):
    hlava = f"řez {it['rez']}" if it["rez"] not in ("kolecko", "?") else ("kolečko" if it["rez"] == "kolecko" else "?")
    return f"- {hlava}" + (f" · {it['oblast']}" if s_oblasti else "") + f": {it['text']} (ř. {it['radek']})"


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0
    cwd = os.path.abspath(argv[0])
    opt = {"osud": None, "oblast": None, "rez": None, "json": False, "soubor": None}
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--json":
            opt["json"] = True
        elif a in ("--osud", "--oblast", "--rez", "--soubor") and i + 1 < len(argv):
            opt[a[2:]] = argv[i + 1]
            i += 1
        else:
            print(f"follow-ups: neznámý nebo neúplný argument {a}", file=sys.stderr)
            return 2
        i += 1
    soubor = opt["soubor"] or os.path.join(cwd, "docs", "follow-ups.md")
    try:
        with open(soubor, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        print(f"follow-ups: {soubor} nejde přečíst ({e})", file=sys.stderr)
        return 2
    items, uzavrene = polozky(text)
    if opt["osud"]:
        chci = OSUD_ALIAS.get(opt["osud"].strip().lower(), opt["osud"].strip().lower())
        if chci not in OSUDY and chci != BEZ_OSUDU:
            print(f"follow-ups: neznámý osud {opt['osud']} (rozhodnutí, oprava, nápad, obsah, bez osudu)", file=sys.stderr)
            return 2
        items = [it for it in items if it["osud"] == chci]
    if opt["oblast"]:
        hled = opt["oblast"].lower()
        items = [it for it in items if hled in it["oblast"].lower()]
    if opt["rez"]:
        r = "kolecko" if KOLECKO.search(opt["rez"]) else nn(opt["rez"])
        items = [it for it in items if it["rez"] == r]
    p = pocty(items)
    rel = os.path.relpath(soubor, cwd) if soubor.startswith(cwd) else soubor

    if opt["json"]:
        print(json.dumps({"soubor": rel, "otevrene": len(items), "uzavrene": uzavrene, "pocty": p, "polozky": items},
                         ensure_ascii=False, indent=1))
        return 0

    print(f"follow-ups: {len(items)} otevřených položek, {uzavrene} uzavřených ({rel})")
    if not items:
        return 0
    if opt["osud"]:
        print()
        for oblast in sorted(p, key=lambda k: -sum(p[k].values())):
            sk = [it for it in items if it["oblast"] == oblast]
            print(f"## {oblast} ({len(sk)})")
            skupiny = {}
            for it in sk:
                klic = os.path.dirname(it["cesty"][0]) or it["cesty"][0] if it["cesty"] else "bez cesty"
                skupiny.setdefault(klic, []).append(it)
            for klic in sorted(skupiny, key=lambda k: (k == "bez cesty", k)):
                print(f"### {klic} ({len(skupiny[klic])})")
                for it in skupiny[klic]:
                    print(radek_polozky(it, s_oblasti=False))
            print()
        return 0
    print()
    print(tabulka(p, len(items)))
    rozh = [it for it in items if it["osud"] == "rozhodnutí"]
    print(f"\n[rozhodnutí] ({len(rozh)}):")
    for it in rozh:
        print(radek_polozky(it))
    bez = sum(1 for it in items if it["osud"] == BEZ_OSUDU)
    if bez:
        print(f"\n{bez} položek bez osudu (starší zápis bez značky): výběr přes --osud 'bez osudu' nebo --oblast.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
