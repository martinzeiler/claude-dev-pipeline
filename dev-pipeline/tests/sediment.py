#!/usr/bin/env python3
"""Test sedimentu pluginu dev-pipeline: próza pro model nesmí nést incidenty, data, čísla verzí ani HTML komentáře,
stejný odstavec nesmí ležet ve dvou souborech a každý soubor má rozpočet slov.

Použití:
  tests/sediment.py <plugin_root> [--jen <cesta>…] [--tabulka]

  --jen <cesta>   jen soubory pod danou cestou (relativně ke kořeni pluginu, víckrát); rozpočty, vzory i duplicity
                  se hodnotí jen nad vybranými soubory
  --tabulka       vypíše rozpočet všech souborů (slova dnes / strop), i když jsou v pořádku

Co kontroluje (množina souborů: skills/**/*.md, agents/*.md, standardy/*.md, workflows/*.js, hooks/*.sh, scripts/*.sh, scripts/*.py):
  vzory      „v běhu <slug>“, jméno běhu za slovem běh/běhu, datum (2026-10, 6. 10. 2026), číslo verze (1.7.0),
             HTML komentář v .md; u .js bez řádků komentářů // a bloků /* */, u .sh a .py bez řádků s # a bez
             docstringů (model je nečte); výjimky: README.md, tests/, řádky z tests/sediment-vyjimky.txt (přesný text)
  duplicity  odstavec nad 40 slov (text mezi prázdnými řádky po normalizaci mezer) ve dvou souborech .md, u .js
             řetězcové literály po řádcích; kód v .sh a .py se nesrovnává
  rozpočet   slova per soubor (wc -w celého souboru) podle tabulky ROZPOCET; popis agenta (description ve
             frontmatteru) do 30 slov, popis skillu, meta.description a meta.whenToUse Workflow do 40 slov

Výstup: nálezy jako cesta:řádek: typ: úryvek, souhrn po souborech; exit 1 při nálezu, 0 bez nálezu.
"""
import os
import re
import sys

ROZPOCET = {
    "skills/orchestrate/SKILL.md": 3500,
    "skills/orchestrate/KONTRAKT.md": 2000,
    "skills/orchestrate/TVAR-DOKUMENTU.md": 1500,
    "skills/orchestrate/FINALE.md": 900,
    "skills/orchestrate/OBNOVA.md": 500,
    "skills/orchestrate/PO-COMPACTU.md": 300,
    "skills/vize/SKILL.md": 3400,
    "skills/vize/CERSTVE-OCI.md": 900,
    "skills/review-kolecko/SKILL.md": 900,
    "agents/prd.md": 2000,
    "agents/prd-check.md": 1200,
    "agents/deploy.md": 1300,
    "agents/thermo-nuclear-review.md": 1500,
    "agents/e2e-verifier.md": 1100,
    "agents/implement.md": 1000,
    "agents/fix.md": 800,
    "standardy/SLOVNIK-NAVRHU.md": 300,
    "standardy/STANDARD-REVIEW.md": 500,
}
ROZPOCET_PROTOTYP = 800        # skills/prototyp/*.md, každý
ROZPOCET_AGENT_OSTATNI = 900   # agents/*.md bez vlastního řádku
POPIS_AGENT = 30
POPIS_SKILL = 40
POPIS_WORKFLOW = 40            # meta.description i meta.whenToUse, každé zvlášť
DUPLICITA_SLOV = 40

# Jméno běhu je slug s pomlčkou (web-rijen, sonnet-5-5, bez-dluhu) nebo sklik; holé „v běhu a živá kopie“ není nález.
VZORY = [
    ("jméno běhu", re.compile(r"v běhu (?:[a-z0-9]+(?:-[a-z0-9]+)+|sklik)\b")),
    ("jméno běhu", re.compile(r"běhu? [a-z]+-[a-z0-9-]+")),
    ("datum", re.compile(r"\b20\d\d-\d\d\b")),
    ("datum", re.compile(r"\b\d{1,2}\. ?\d{1,2}\. ?20\d\d\b")),
    ("verze", re.compile(r"\b1\.\d+\.\d+\b")),
]
VZOR_HTML = ("HTML komentář", re.compile(r"<!--"))

MNOZINA = (("skills", ".md", True), ("agents", ".md", False), ("standardy", ".md", False),
           ("workflows", ".js", False), ("hooks", ".sh", False), ("scripts", ".sh", False), ("scripts", ".py", False))


def soubory(root):
    out = []
    for adresar, pripona, rekurzivne in MNOZINA:
        base = os.path.join(root, adresar)
        if not os.path.isdir(base):
            continue
        if rekurzivne:
            for d, _, fs in os.walk(base):
                out += [os.path.join(d, f) for f in fs if f.endswith(pripona)]
        else:
            out += [os.path.join(base, f) for f in os.listdir(base) if f.endswith(pripona)]
    return sorted(set(os.path.relpath(p, root) for p in out))


def vyber(rel, jen):
    if not jen:
        return True
    return any(rel == j or rel.startswith(j.rstrip("/") + "/") for j in jen)


def nacti(cesta):
    with open(cesta, encoding="utf-8") as f:
        return f.read()


def slova(text):
    return len(text.split())


def kvoty_vyrovnane(s):
    return all(s.count(q) % 2 == 0 for q in ("'", '"', "`"))


def bez_komentaru_js(radky):
    """Řádky .js bez komentářů: celé řádky //, bloky /* */ (i uvnitř řádku), koncový komentář ' // ' mimo řetězec."""
    out, v_bloku = [], False
    for r in radky:
        s = r
        if v_bloku:
            k = s.find("*/")
            if k < 0:
                out.append("")
                continue
            s, v_bloku = " " * (k + 2) + s[k + 2:], False
        while "/*" in s:
            a = s.find("/*")
            if not kvoty_vyrovnane(s[:a]):
                break
            b = s.find("*/", a + 2)
            if b < 0:
                s, v_bloku = s[:a], True
                break
            s = s[:a] + " " * (b + 2 - a) + s[b + 2:]
        if s.lstrip().startswith("//"):
            out.append("")
            continue
        m = re.search(r"\s//\s", s)
        if m and kvoty_vyrovnane(s[:m.start()]):
            s = s[:m.start()]
        out.append(s)
    return out


def js_literaly(radky):
    """(číslo řádku, text) pro každý řádek obsahu řetězcového literálu ('…', "…", `…`); víceřádkový template literal
    dává jednotku na každý svůj řádek. Komentáře mají být pryč (bez_komentaru_js). Regex literály se nerozlišují."""
    out, q, buf, od = [], None, [], 0
    for n, r in enumerate(radky, 1):
        i = 0
        if q == "`" and buf is not None:
            buf = []
            od = n
        while i < len(r):
            c = r[i]
            if q:
                if c == "\\":
                    buf.append(r[i:i + 2]); i += 2; continue
                if c == q:
                    out.append((od, "".join(buf))); q, buf = None, []
                elif q == "`" and r.startswith("${", i):
                    hl = 1; j = i + 2
                    while j < len(r) and hl:
                        hl += (r[j] == "{") - (r[j] == "}"); j += 1
                    buf.append(" "); i = j; continue
                else:
                    buf.append(c)
                i += 1
                continue
            if c in ("'", '"', "`"):
                q, buf, od = c, [], n
            i += 1
        if q and q != "`":
            q, buf = None, []        # neuzavřený jednořádkový literál (regex, apostrof v kódu): zahodit
        elif q == "`" and buf:
            out.append((od, "".join(buf)))   # řádek template literalu; pokračuje na dalším řádku
    return [(n, " ".join(t.split())) for n, t in out if t.strip()]


def bez_komentaru_skript(radky):
    """Řádky .sh a .py bez řádků s # a bez docstringů (řádek začínající trojitou uvozovkou až po její konec)."""
    out, uzavirac = [], None
    for r in radky:
        s = r.strip()
        if uzavirac:
            out.append("")
            if uzavirac in s:
                uzavirac = None
            continue
        if s.startswith("#"):
            out.append("")
            continue
        m = re.match(r"[rRbBuUfF]{0,2}(\"\"\"|''')", s)
        if m:
            q = m.group(1)
            out.append("")
            if s.count(q) < 2:
                uzavirac = q
            continue
        out.append(r)
    return out


def popis_frontmatter(text):
    """Hodnota description z YAML frontmatteru (jednořádková, nebo blok > | a odsazené pokračování)."""
    if not text.startswith("---"):
        return None
    konec = text.find("\n---", 3)
    if konec < 0:
        return None
    radky = text[3:konec].splitlines()
    for i, r in enumerate(radky):
        m = re.match(r"description:\s*(.*)$", r)
        if not m:
            continue
        hodnota = m.group(1).strip()
        if hodnota in ("", ">", "|", ">-", "|-"):
            hodnota = ""
        kusy = [hodnota] if hodnota else []
        for d in radky[i + 1:]:
            if d.startswith((" ", "\t")):
                kusy.append(d.strip())
            else:
                break
        return " ".join(kusy).strip("'\" ")
    return None


def popisy_workflow(text):
    """{description, whenToUse} z export const meta = {…} (řetězcové literály v uvozovkách nebo zpětných apostrofech)."""
    out = {}
    m = re.search(r"export const meta\s*=\s*\{(.*?)\n\}", text, re.S)
    blok = m.group(1) if m else text
    for klic in ("description", "whenToUse"):
        mm = re.search(klic + r"\s*:\s*(['\"`])((?:\\.|(?!\1).)*)\1", blok, re.S)
        if mm:
            out[klic] = mm.group(2)
    return out


def strop_souboru(rel):
    if rel in ROZPOCET:
        return ROZPOCET[rel]
    if rel.startswith("skills/prototyp/") and rel.endswith(".md"):
        return ROZPOCET_PROTOTYP
    if rel.startswith("agents/") and rel.endswith(".md"):
        return ROZPOCET_AGENT_OSTATNI
    return None


def odstavce_md(radky):
    """(číslo prvního řádku, normalizovaný text) pro každý odstavec; prázdný řádek odstavec končí."""
    out, akt, od = [], [], None
    for i, r in enumerate(radky, 1):
        if r.strip():
            if od is None:
                od = i
            akt.append(r.strip())
        elif akt:
            out.append((od, " ".join(" ".join(akt).split())))
            akt, od = [], None
    if akt:
        out.append((od, " ".join(" ".join(akt).split())))
    return out


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0
    root = os.path.abspath(argv[0])
    jen, tabulka = [], False
    i = 1
    while i < len(argv):
        if argv[i] == "--jen" and i + 1 < len(argv):
            i += 1
            while i < len(argv) and not argv[i].startswith("--"):
                jen.append(argv[i].rstrip("/"))
                i += 1
            continue
        if argv[i] == "--tabulka":
            tabulka = True
        else:
            print(f"sediment: neznámý argument {argv[i]}", file=sys.stderr)
            return 2
        i += 1

    vyjimky = set()
    vp = os.path.join(root, "tests", "sediment-vyjimky.txt")
    if os.path.exists(vp):
        for r in nacti(vp).splitlines():
            if r.strip() and not r.lstrip().startswith("#"):
                vyjimky.add(r.strip())

    nalezy = []          # (soubor, řádek, typ, text)
    odstavce = {}        # normalizovaný text -> (soubor, řádek)
    rozpocet_radky = []  # (soubor, slova, strop, ok)
    vsechny = [rel for rel in soubory(root) if vyber(rel, jen)]
    for rel in vsechny:
        cesta = os.path.join(root, rel)
        text = nacti(cesta)
        radky = text.splitlines()
        pripona = rel.rsplit(".", 1)[-1]
        if pripona == "js":
            cisty = bez_komentaru_js(radky)
        elif pripona in ("sh", "py"):
            cisty = bez_komentaru_skript(radky)
        else:
            cisty = radky

        # vzory
        vzory = VZORY + ([VZOR_HTML] if pripona == "md" else [])
        for n, r in enumerate(cisty, 1):
            if not r.strip() or r.strip() in vyjimky:
                continue
            for jmeno, rx in vzory:
                m = rx.search(r)
                if m:
                    nalezy.append((rel, n, f"vzor ({jmeno}: {m.group(0)})", r.strip()[:110]))
                    break

        # duplicity: odstavce .md, řádky řetězců .js
        if pripona == "md":
            jednotky = odstavce_md(cisty)
        elif pripona == "js":
            jednotky = js_literaly(cisty)
        else:
            jednotky = []
        for n, t in jednotky:
            if slova(t) <= DUPLICITA_SLOV:
                continue
            if t in odstavce and odstavce[t][0] != rel:
                s2, n2 = odstavce[t]
                nalezy.append((rel, n, f"duplicita s {s2}:{n2} ({slova(t)} slov)", t[:110]))
            else:
                odstavce.setdefault(t, (rel, n))

        # rozpočet souboru
        strop = strop_souboru(rel)
        if strop is not None:
            pocet = slova(text)
            rozpocet_radky.append((rel, pocet, strop, pocet <= strop))
            if pocet > strop:
                nalezy.append((rel, 1, f"rozpočet {pocet} slov, strop {strop}", ""))

        # popisy
        if pripona == "md" and (rel.startswith("agents/") or rel.endswith("/SKILL.md")):
            popis = popis_frontmatter(text)
            strop_p = POPIS_AGENT if rel.startswith("agents/") else POPIS_SKILL
            if popis is not None and slova(popis) > strop_p:
                nalezy.append((rel, 1, f"popis {slova(popis)} slov, strop {strop_p}", popis[:110]))
        if pripona == "js" and rel.startswith("workflows/"):
            for klic, hodnota in popisy_workflow(text).items():
                if slova(hodnota) > POPIS_WORKFLOW:
                    nalezy.append((rel, 1, f"meta.{klic} {slova(hodnota)} slov, strop {POPIS_WORKFLOW}", hodnota[:110]))

    if tabulka:
        print("rozpočet slov (soubor · dnes / strop):")
        for rel, pocet, strop, ok in rozpocet_radky:
            print(f"  {'ok ' if ok else 'NAD'} {rel}: {pocet} / {strop}")
        print()

    for rel, n, typ, t in nalezy:
        print(f"{rel}:{n}: {typ}" + (f": {t}" if t else ""))
    if nalezy:
        podle = {}
        for rel, *_ in nalezy:
            podle[rel] = podle.get(rel, 0) + 1
        print(f"\nsediment: {len(nalezy)} nálezů v {len(podle)} souborech ({len(vsechny)} kontrolováno): "
              + ", ".join(f"{k} {v}" for k, v in sorted(podle.items(), key=lambda x: -x[1])))
        return 1
    print(f"sediment: v pořádku ({len(vsechny)} souborů)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
