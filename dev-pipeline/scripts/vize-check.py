#!/usr/bin/env python3
"""Kontrola tvaru vize před commitem (skill vize, krok Ulož): ověří řádky, které čtou orchestrátor, bloky a zprava.py.

Použití:
  vize-check.py <vize.md>

Co kontroluje (tvary popisuje skills/vize/SKILL.md, sekce Tvar řádků):
  sekce      povinné nadpisy úrovně 2 (Proč, Cíle, Ne-cíle, Uživatelské scénáře, Funkční požadavky, Technické mantinely,
             Rizika a rozhodnutí, Mantinely a Povolení, Provozní poznámky, Plán řezů); neprázdné Otevřené otázky
  Cíle       odrážka `- **C1 Název.** text` nebo `- **C1** text`, značky jedinečné
  Ne-cíle    každá odrážka nese tučný zápor (**není**, **nejde**, **nikdy** …)
  F          oblast `### F1 Název`, požadavek `- **F1.1 Název.** text` nebo `- **F1.1** text`; požadavek bez oblasti,
             duplicita; požadavek bez věty s kritériem jen upozorní
  R, P       `- **R1 Název.** text`, plocha `### P1 Název`; značky jedinečné
  plán       tabulka se sloupci # · Název · Body vize · Odhad řádků · Definice hotového · Závislosti · Poznámka;
             odhad čitelný a do ~5 k (nad 8 k / 1,5 ho blok PRD rozdělí vždy), odkazy na C, F, R, P existují,
             závislosti míří na řádky plánu, každý Cíl má řez
  provoz     Provozní poznámky nesou řádky Čekání na čas a Merge do main po běhu
  zpráva     scripts/zprava.py (funkce cile) přečte z vize tutéž množinu Cílů C; jinak by závěrečná zpráva Cíle nevypsala

Výstup: `<řádek>: chyba: <problém>` a `<řádek>: upozornění: <problém>`, na konci souhrn se součtem odhadů a odhadem
délky běhu (~1 h na 1 000 řádků odhadu). Exit 0 bez chyb (upozornění smí být), 1 s chybami, 2 když soubor nejde číst.
"""
import importlib.util
import os
import re
import sys
import unicodedata

MEZ_RADKU = 5000                  # řádek plánu do ~5 k odhadu (skill vize, bod 11)
DELI_BLOK = 8000 / 1.5            # blok PRD dělí řez, když 1,5 × odhad přesáhne ~8 k
HODIN_NA_TISIC = 1.0              # délka běhu: ~1 h na 1 000 řádků odhadu včetně pevné části řezů

POVINNE = [
    ("proc", "Proč"), ("cile", "Cíle"), ("ne-cile", "Ne-cíle"), ("uzivatelske scenare", "Uživatelské scénáře"),
    ("funkcni pozadavky", "Funkční požadavky"), ("technicke mantinely", "Technické mantinely"),
    ("rizika", "Rizika a rozhodnutí"), ("mantinely a povoleni", "Mantinely a Povolení"),
    ("provozni poznamky", "Provozní poznámky pro orchestrátora"), ("plan rezu", "Plán řezů"),
]
SLOUPCE = [("#", "#"), ("nazev", "Název"), ("body", "Body vize"), ("odhad", "Odhad řádků"),
           ("definice", "Definice hotového"), ("zavislost", "Závislosti"), ("poznam", "Poznámka")]

ODRAZKA = re.compile(r"^[-*]\s+")
C_KAN = re.compile(r"^[-*]\s+\*\*C(\d+)\s+[^*]*?\S\*\*\s*\S")
C_ALT = re.compile(r"^[-*]\s+\*\*C(\d+)\*\*\s*\S")
F_OBLAST = re.compile(r"^#{3,4}\s+F(\d+)\b[.:]?\s+\S")
F_POLOZKA = re.compile(r"^[-*]\s+\*\*F(\d+)(?:\.(\d+[a-z]?))?(?:\s+[^*]*?\S)?\*\*")
F_VNITRNI = re.compile(r"\*\*F(\d+\.\d+[a-z]?)\b")
R_VNITRNI = re.compile(r"\*\*R(\d+(?:\.\d+)?[a-z]?)\b")
R_POLOZKA = re.compile(r"^[-*]\s+\*\*R(\d+)\b[^*]*\*\*")
P_PLOCHA = re.compile(r"^#{3,4}\s+P(\d+)\b[.:]?\s+\S")
ZAPOR = re.compile(r"\*\*[^*]*?(?<!\w)(ne\w*|nikdy|žádn\w*|bez)(?!\w)[^*]*\*\*", re.I)
ODKAZ = re.compile(r"(?<![\w.])([CFRP])(\d+(?:\.\d+)?[a-z]?)(?![\w])")


def norm(s):
    s = unicodedata.normalize("NFKD", s.strip().lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"^\d+[a-z]?\.\s*", "", s)


def bunky(radek):
    casti = re.split(r"(?<!\\)\|", radek.strip())
    if casti and casti[0] == "":
        casti = casti[1:]
    if casti and casti[-1] == "":
        casti = casti[:-1]
    return [c.strip() for c in casti]


def odhad_radku(text):
    t = text.replace(" ", " ").replace(" ", " ").replace(" ", " ").lower()
    t = re.sub(r"[~≈]|cca|ř\.|řádků|radku", " ", t)
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*k\b", t)
    if m:
        return round(float(m.group(1).replace(",", ".")) * 1000)
    m = re.search(r"\d[\d ]*", t)
    if m and m.group(0).replace(" ", ""):
        return int(m.group(0).replace(" ", ""))
    return None


def cile_zpravy(text):
    """Množina Cílů C, kterou přečte scripts/zprava.py (funkce cile); None, když zprava.py nejde načíst."""
    cesta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zprava.py")
    try:
        spec = importlib.util.spec_from_file_location("zprava_pro_vize_check", cesta)
        modul = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modul)
        return {int(z[1:]) for z, _ in modul.cile(text) if z.startswith("C")}
    except Exception:
        return None


def zkontroluj(radky):
    chyby, upoz = [], []
    ch = lambda i, t: chyby.append((i, t))
    up = lambda i, t: upoz.append((i, t))

    # sekce úrovně 2 mimo bloky kódu
    sekce, kod = [], False
    for i, r in enumerate(radky, 1):
        if r.lstrip().startswith("```"):
            kod = not kod
            continue
        if not kod and re.match(r"^##\s+\S", r) and not r.startswith("###"):
            sekce.append((i, norm(r[2:])))
    def rozsah(klic):
        for j, (i, n) in enumerate(sekce):
            if n.startswith(klic) and not (klic == "cile" and n.startswith("ne-")):
                konec = sekce[j + 1][0] - 1 if j + 1 < len(sekce) else len(radky)
                return i, konec
        return None
    for klic, nazev in POVINNE:
        if not rozsah(klic):
            ch(1, f"chybí sekce „{nazev}“")
    oo = rozsah("otevrene otazky")
    if oo and any(ODRAZKA.match(radky[k - 1]) for k in range(oo[0] + 1, oo[1] + 1)):
        ch(oo[0], "sekce Otevřené otázky není prázdná; před uložením ji vyřeš a smaž")

    def radky_sekce(klic):
        r = rozsah(klic)
        return [] if not r else [(k, radky[k - 1]) for k in range(r[0] + 1, r[1] + 1)]

    def polozka(seznam, idx):
        """Text odrážky včetně pokračovacích řádků (do další odrážky, nadpisu nebo prázdného řádku)."""
        text = seznam[idx][1]
        for _, r in seznam[idx + 1:]:
            if not r.strip() or ODRAZKA.match(r) or r.startswith("#"):
                break
            text += " " + r.strip()
        return text

    # Cíle
    cile = {}
    seznam = radky_sekce("cile")
    for j, (k, r) in enumerate(seznam):
        if not ODRAZKA.match(r):
            continue
        text = polozka(seznam, j)
        m = C_KAN.match(text) or C_ALT.match(text)
        if not m:
            ch(k, "odrážka v Cílech mimo tvar `- **C1 Název.** text`")
            continue
        c = int(m.group(1))
        if c in cile:
            ch(k, f"Cíl C{c} je dvakrát (poprvé ř. {cile[c]})")
        cile.setdefault(c, k)

    # Ne-cíle
    seznam = radky_sekce("ne-cile")
    for j, (k, r) in enumerate(seznam):
        if ODRAZKA.match(r) and not ZAPOR.search(polozka(seznam, j)):
            ch(k, "Ne-cíl bez tučného záporu (tvar „X **není** v Y“)")

    # Funkční požadavky
    oblasti, pozadavky, bez_oblasti = {}, {}, set()
    seznam = radky_sekce("funkcni pozadavky")
    vnitrni = {f"F{m.group(1)}" for _, r in seznam for m in F_VNITRNI.finditer(r)}
    for j, (k, r) in enumerate(seznam):
        m = F_OBLAST.match(r)
        if m:
            f = int(m.group(1))
            if f in oblasti:
                ch(k, f"oblast F{f} je dvakrát (poprvé ř. {oblasti[f]})")
            oblasti.setdefault(f, k)
            continue
        if not ODRAZKA.match(r) or not re.match(r"^[-*]\s+\*\*F", r):
            continue
        m = F_POLOZKA.match(r)
        if not m:
            ch(k, "požadavek mimo tvar `- **F1.1 Název.** text`")
            continue
        f, pod = int(m.group(1)), m.group(2)
        znacka = f"F{f}.{pod}" if pod else f"F{f}"
        if znacka in pozadavky:
            ch(k, f"požadavek {znacka} je dvakrát (poprvé ř. {pozadavky[znacka]})")
        pozadavky.setdefault(znacka, k)
        if pod and f not in oblasti and f not in bez_oblasti:
            bez_oblasti.add(f)
            ch(k, f"požadavky F{f}.x nemají oblast `### F{f} Název`")
        if "kritéri" not in polozka(seznam, j).lower():
            up(k, f"požadavek {znacka} bez věty s kritériem („Kritérium: …“)")

    # Rizika a rozhodnutí, UI plochy
    rozh = {}
    rozh_vnitrni = {m.group(1) for _, r in radky_sekce("rizika") for m in R_VNITRNI.finditer(r)}
    for k, r in radky_sekce("rizika"):
        if not re.match(r"^[-*]\s+\*\*R", r):
            continue
        m = R_POLOZKA.match(r)
        if not m:
            ch(k, "rozhodnutí mimo tvar `- **R1 Název.** text`")
            continue
        n = int(m.group(1))
        if n in rozh:
            ch(k, f"rozhodnutí R{n} je dvakrát (poprvé ř. {rozh[n]})")
        rozh.setdefault(n, k)
    plochy = {}
    for k, r in radky_sekce("tvar ui"):
        m = P_PLOCHA.match(r)
        if m:
            n = int(m.group(1))
            if n in plochy:
                ch(k, f"plocha P{n} je dvakrát (poprvé ř. {plochy[n]})")
            plochy.setdefault(n, k)

    def existuje(typ, cislo):
        if typ == "C":
            return cislo.isdigit() and int(cislo) in cile
        if typ == "R":
            hlava = re.match(r"\d+", cislo)
            return cislo in rozh_vnitrni or (hlava is not None and int(hlava.group(0)) in rozh)
        if typ == "P":
            return cislo.isdigit() and int(cislo) in plochy
        return f"F{cislo}" in pozadavky or f"F{cislo}" in vnitrni or (cislo.isdigit() and int(cislo) in oblasti)

    # Provozní poznámky
    provoz = " ".join(r for _, r in radky_sekce("provozni poznamky")).lower()
    pr = rozsah("provozni poznamky")
    if pr:
        if "čekání na čas" not in provoz:
            ch(pr[0], "Provozní poznámky bez řádku „**Čekání na čas:** …“")
        if "merge do main" not in provoz:
            ch(pr[0], "Provozní poznámky bez řádku „**Merge do main po běhu:** ano | ne“")

    # Plán řezů
    plan = radky_sekce("plan rezu")
    tab = []
    for k, r in plan:
        if r.lstrip().startswith("|"):
            tab.append((k, r))
        elif tab:
            if bunky(tab[0][1])[:1] == ["#"]:
                break
            tab = []
    soucet = 0
    if plan and not (tab and bunky(tab[0][1])[:1] == ["#"]):
        ch(rozsah("plan rezu")[0], "Plán řezů nemá tabulku se sloupcem „#“")
    elif tab:
        hlav = [norm(c) for c in bunky(tab[0][1])]
        idx = {}
        for klic, nazev in SLOUPCE:
            poz = next((i for i, h in enumerate(hlav) if (h == "#" if klic == "#" else klic in h)), None)
            if poz is None:
                ch(tab[0][0], f"tabulka plánu bez sloupce „{nazev}“")
            idx[klic] = poz
        cisla, pokryte, zav = {}, set(), []
        for k, r in tab[1:]:
            b = bunky(r)
            if all(re.fullmatch(r":?-{2,}:?", x or "--") for x in b):
                continue
            bunka = lambda klic: b[idx[klic]] if idx.get(klic) is not None and idx[klic] < len(b) else ""
            cislo = bunka("#")
            if not re.fullmatch(r"\d+[a-z]?", cislo):
                ch(k, f"řádek plánu bez čísla v sloupci # („{cislo}“)")
            elif cislo in cisla:
                ch(k, f"řez {cislo} je v plánu dvakrát (poprvé ř. {cisla[cislo]})")
            else:
                cisla[cislo] = k
            body = bunka("body")
            if not body.strip():
                ch(k, f"řez {cislo}: prázdné Body vize")
            for m in re.finditer(r"(?<![\w.])([CFRP])(\d+(?:\.\d+)?[a-z]?)\s+až\s+([CFRP])?(\d+(?:\.\d+)?[a-z]?)", body):
                if not existuje(m.group(3) or m.group(1), m.group(4)):
                    ch(k, f"řez {cislo}: rozsah končí neexistující značkou {(m.group(3) or m.group(1))}{m.group(4)}")
            for m in ODKAZ.finditer(body):
                typ, c = m.group(1), m.group(2)
                if not existuje(typ, c):
                    ch(k, f"řez {cislo}: odkaz na neexistující značku {typ}{c}")
                elif typ == "C":
                    pokryte.add(int(c))
            if idx.get("definice") is not None and not bunka("definice").strip():
                ch(k, f"řez {cislo}: prázdná Definice hotového")
            if idx.get("odhad") is not None:
                o = odhad_radku(bunka("odhad"))
                if o is None:
                    ch(k, f"řez {cislo}: odhad řádků chybí nebo nejde přečíst („{bunka('odhad')}“)")
                else:
                    soucet += o
                    if o > DELI_BLOK:
                        ch(k, f"řez {cislo}: odhad {o} ř. je nad ~5 k; blok PRD by ho rozdělil (1,5 × odhad nad ~8 k), rozděl ho v plánu")
                    elif o > MEZ_RADKU:
                        up(k, f"řez {cislo}: odhad {o} ř. je na hraně ~5 k")
            zav.append((k, cislo, bunka("zavislost")))
        for k, cislo, z in zav:
            for d in re.findall(r"(?<![\w.])(\d+[a-z]?)(?![\w.])", z):
                if d not in cisla:
                    ch(k, f"řez {cislo}: závislost na neexistujícím řádku {d}")
                elif d == cislo:
                    ch(k, f"řez {cislo}: závisí sám na sobě")
        for c, k in sorted(cile.items()):
            if c not in pokryte:
                ch(k, f"Cíl C{c} nemá v plánu žádný řez")
    # Křížová kontrola se zprava.py: zpráva vypisuje Cíle svými vzory, rozdíl znamená, že by je nepřečetla
    zpravou = cile_zpravy("\n".join(radky))
    if zpravou is None:
        up(1, "scripts/zprava.py nejde načíst, křížová kontrola Cílů se nekonala")
    else:
        for c in sorted(set(cile) - zpravou):
            ch(cile[c], f"Cíl C{c}: zpráva by Cíle nepřečetla (scripts/zprava.py ho nenajde; tučný název na jednom řádku)")
        for c in sorted(zpravou - set(cile)):
            k = next((i for i, r in enumerate(radky, 1) if re.search(rf"\*\*C{c}\b|^#{{2,5}}\s*C{c}\b", r)), 1)
            ch(k, f"zpráva by Cíle nepřečetla: čte navíc C{c} mimo odrážky sekce Cíle")
    return chyby, upoz, soucet


def main(argv):
    if len(argv) != 2 or argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if len(argv) == 2 else 2
    try:
        with open(argv[1], encoding="utf-8") as f:
            radky = f.read().splitlines()
    except OSError as e:
        print(f"vize-check: soubor nejde číst: {e}", file=sys.stderr)
        return 2
    chyby, upoz, soucet = zkontroluj(radky)
    for i, t in sorted([(i, f"chyba: {t}") for i, t in chyby] + [(i, f"upozornění: {t}") for i, t in upoz]):
        print(f"{i}: {t}")
    hodiny = round(soucet / 1000 * HODIN_NA_TISIC)
    print(f"vize-check: chyb {len(chyby)}, upozornění {len(upoz)}; součet odhadů {soucet} ř., odhad délky běhu ~{hodiny} h")
    return 1 if chyby else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
