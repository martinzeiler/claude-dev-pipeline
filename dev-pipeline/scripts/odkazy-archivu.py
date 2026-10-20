#!/usr/bin/env python3
"""dev-pipeline: přepíše odkazy na docs/prd/*.md a docs/e2e/*.md na archiv vize, ve které odkaz vznikl.

Spouští ho orchestrate-setup.sh před archivací předchozí vize:
    odkazy-archivu.py <projekt> <slug archivované vize> <cesta nové vize>

Proč: setup přesouvá docs/prd a docs/e2e předchozí vize do docs/archive/<slug>/. Odkaz z kódu nebo dokumentu na
docs/e2e/rez-01.md pak buď vede do prázdna (pre-commit brána projektu commit setupu odmítne), nebo po startu nové
vize tiše ukazuje na její stejnojmenný dokument, protože každá vize vytváří znovu rez-01.md atd. (v jednom projektu
takhle ukazovalo 13 ze 14 odkazů na dokument pozdější vize).

Jak určí cíl: commit, který odkaz do souboru přidal (git log -S), a první pozdější commit, který odkazovaný dokument
odstranil. Když ho přejmenoval (archivace minulého setupu), cílem je nová cesta. Když dokument od té doby existuje, patří
archivované vizi a cílem je docs/archive/<slug>/<prd|e2e>/<jméno>. Co nejde určit jednoznačně (dokument nikdy neexistoval,
byl smazán bez přejmenování, nebo zmizel už před vznikem odkazu), nechá beze změny a vypíše jako nevyřešené.

Prohledává jen trackované textové soubory mimo docs/ (kód, skripty, CLAUDE.md: odkaz tam čtou agenti a hlídá ho brána
projektu) a živý docs/follow-ups.md. Dokumenty v docs/ (journal, vize, reporty, archiv) jsou záznam své doby a nemění se;
ve větším projektu by jich byly stovky v desítkách souborů a commit setupu by tím nabobtnal. Nová vize leží v docs/, takže se jí to netýká:
její docs/e2e/rez-01.md je budoucí dokument nové vize.
Změněné soubory přidá do indexu: setup je commitne jedním commitem s archivem.
Návratové kódy: 0 hotovo (i s nevyřešenými) · 2 chybné argumenty nebo není git repo.
"""
import os
import re
import subprocess
import sys

VZOR = re.compile(r"docs/(e2e|prd)/[A-Za-z0-9._-]+\.md")
MAX_VYPIS = 20


def git(*args, ok=(0,)):
    p = subprocess.run(["git", *args], capture_output=True, text=True)
    if p.returncode not in ok:
        return None
    return p.stdout


def existuje(rev, cesta):
    return subprocess.run(["git", "cat-file", "-e", f"{rev}:{cesta}"], capture_output=True).returncode == 0


def cil(soubor, cesta, slug, archivovane):
    """Vrátí (cíl, None), nebo (None, důvod)."""
    vznik = (git("log", "-S", cesta, "--format=%H", "--reverse", "--", soubor) or "").split()
    c = vznik[0] if vznik else None
    if c is None:
        # odkaz ještě není v historii (necommitnutá změna): patří stavu, který se teď archivuje
        if cesta in archivovane:
            return f"docs/archive/{slug}/{cesta[len('docs/'):]}", None
        return None, "odkaz mimo historii a dokument se nearchivuje"
    if not existuje(c, cesta) and (git("log", "-1", "--format=%H", "--diff-filter=D", c, "--", cesta) or "").strip():
        return None, f"dokument zmizel už před vznikem odkazu ({c[:8]})"
    smazani = (git("log", "--format=%H", "--reverse", "--diff-filter=D", f"{c}..HEAD", "--", cesta) or "").split()
    if not smazani:
        if cesta in archivovane:
            return f"docs/archive/{slug}/{cesta[len('docs/'):]}", None
        return None, "dokument neexistuje a nikdy nebyl archivován"
    d = smazani[0]
    for radek in (git("show", "-M", "--name-status", "--format=", d) or "").splitlines():
        kusy = radek.split("\t")
        if len(kusy) == 3 and kusy[0].startswith("R") and kusy[1] == cesta:
            if os.path.exists(kusy[2]):
                return kusy[2], None
            return None, f"archivní cesta {kusy[2]} už neexistuje"
    return None, f"dokument smazán bez přejmenování ({d[:8]})"


def main():
    if len(sys.argv) != 4:
        print("použití: odkazy-archivu.py <projekt> <slug archivované vize> <cesta nové vize>", file=sys.stderr)
        return 2
    projekt, slug = sys.argv[1:3]  # třetí argument (nová vize) leží v docs/, prohledávání se jí netýká
    try:
        os.chdir(projekt)
    except OSError as e:
        print(f"odkazy-archivu: {e}", file=sys.stderr)
        return 2
    if git("rev-parse", "--git-dir") is None:
        print("odkazy-archivu: není git repozitář", file=sys.stderr)
        return 2
    archivovane = {f"docs/{d}/{n}" for d in ("prd", "e2e") if os.path.isdir(f"docs/{d}")
                   for n in os.listdir(f"docs/{d}") if n.endswith(".md") and os.path.isfile(f"docs/{d}/{n}")}
    vystup = ""
    for spec in ([".", ":(exclude)docs"], ["docs/follow-ups.md"]):
        cast = git("grep", "-z", "-n", "-I", "-o", "-E", VZOR.pattern, "--", *spec, ok=(0, 1))
        if cast is None:
            print("odkazy-archivu: git grep selhal", file=sys.stderr)
            return 2
        vystup += cast
    nalezy = {}  # soubor → {řádek: {cesta}}
    for zaznam in vystup.splitlines():
        kusy = zaznam.split("\0")
        if len(kusy) < 3:
            continue
        soubor, radek, cesta = kusy[0], int(kusy[1]), kusy[2]
        nalezy.setdefault(soubor, {}).setdefault(radek, set()).add(cesta)
    prepsano, nevyreseno, zmenene = [], [], []
    cache = {}
    for soubor in sorted(nalezy):
        try:
            with open(soubor, encoding="utf-8") as f:
                radky = f.read().split("\n")
        except (OSError, UnicodeDecodeError) as e:
            nevyreseno.append(f"{soubor}: nejde číst ({e})")
            continue
        zmena = False
        for radek, cesty in sorted(nalezy[soubor].items()):
            for cesta in sorted(cesty):
                klic = (soubor, cesta)
                if klic not in cache:
                    cache[klic] = cil(soubor, cesta, slug, archivovane)
                novy, duvod = cache[klic]
                if novy is None:
                    nevyreseno.append(f"{soubor}:{radek} {cesta} ({duvod})")
                    continue
                if 0 < radek <= len(radky) and cesta in radky[radek - 1]:
                    # archivní cesta docs/archive/<x>/e2e/… řetězec docs/e2e/ neobsahuje, prosté nahrazení ji nepoškodí
                    radky[radek - 1] = radky[radek - 1].replace(cesta, novy)
                    prepsano.append(f"{soubor}:{radek} {cesta} → {novy}")
                    zmena = True
        if zmena:
            with open(soubor, "w", encoding="utf-8") as f:
                f.write("\n".join(radky))
            zmenene.append(soubor)
    if zmenene:
        git("add", "--", *zmenene)
    if not prepsano and not nevyreseno:
        print("odkazy na archiv: žádné")
        return 0
    print(f"odkazy na archiv: přepsáno {len(prepsano)} v {len(zmenene)} souborech" +
          (f", nevyřešeno {len(nevyreseno)}" if nevyreseno else ""))
    for r in prepsano[:MAX_VYPIS]:
        print(f"  {r}")
    if len(prepsano) > MAX_VYPIS:
        print(f"  … a dalších {len(prepsano) - MAX_VYPIS}")
    for r in nevyreseno[:MAX_VYPIS]:
        print(f"  nevyřešeno: {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
