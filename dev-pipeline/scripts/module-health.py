#!/usr/bin/env python3
"""Zdraví deep modules: hloubka (LOC na jeden export rozhraní) a poctivost barrelu.

Doktrína „malé veřejné rozhraní, hluboká implementace" nemá automatický guard —
depcruise hlídá hrany a cykly, ne šířku rozhraní. Tenhle skript měří to, co se
dá spočítat, a nechává úsudek na člověku (nebo na thermo-nuclear agentovi).

Klíčová metrika: BARREL, KTERÝ NIKDO NEPOUŽÍVÁ, JE LEŽ. Když modul má index.ts
a >=80 % externích importů ho obchází, je to nález: buď barrel smazat, nebo
kontrakt vynutit. Není to „všechno přes barrel" — deep import může být záměr.

Použití:
    python3 module-health.py --root apps/api/src --dir services
    python3 module-health.py --root src --dir modules --min-loc 200 --json

Bez závislostí, stdlib only. Heuristika nad regexy: čísla ber jako řádový
signál k prošetření, ne jako verdikt.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict

CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mts", ".cts")
SKIP_DIRS = {"node_modules", "dist", "build", ".git", ".next", "coverage", "__snapshots__"}

# `export function|const|class|type|interface|enum` na začátku řádku + `export {` re-exporty
RE_EXPORT_DECL = re.compile(
    r"^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s",
    re.M,
)
RE_EXPORT_BLOCK = re.compile(r"^export\s*(?:type\s*)?\{", re.M)
RE_IMPORT_FROM = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")


def count_lines(path):
    try:
        with open(path, errors="replace") as fh:
            return sum(1 for _ in fh)
    except OSError:
        return 0


def count_exports(path):
    try:
        with open(path, errors="replace") as fh:
            src = fh.read()
    except OSError:
        return 0
    return len(RE_EXPORT_DECL.findall(src)) + len(RE_EXPORT_BLOCK.findall(src))


def collect_imports(root):
    """{absolutní cesta souboru: [import specifier, ...]} pro celý strom pod root."""
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if not name.endswith(CODE_EXT):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, errors="replace") as fh:
                    src = fh.read()
            except OSError:
                continue
            specs = RE_IMPORT_FROM.findall(src)
            if specs:
                out[path] = specs
    return out


def classify_import(spec, group, module):
    """Vrátí 'barrel' | 'deep' | None podle toho, jak specifier míří do modulu.

    Bere v úvahu jak aliasy (`@app/services/foo`), tak relativní cesty
    (`../../services/foo/bar`) — obojí končí segmentem `<group>/<module>`.
    """
    marker = f"{group}/{module}"
    idx = spec.rfind(marker)
    if idx == -1:
        return None
    # marker musí končit na hranici segmentu, ne uprostřed jména (services/foo vs services/foobar)
    tail = spec[idx + len(marker):]
    if tail and not tail.startswith("/"):
        return None
    # a začínat na hranici segmentu (…/services/foo, ne …/xservices/foo)
    if idx > 0 and spec[idx - 1] not in "/":
        return None
    if tail in ("", "/", "/index", "/index.ts", "/index.js"):
        return "barrel"
    return "deep"


def analyze(root, group, min_loc):
    group_dir = os.path.join(root, group)
    if not os.path.isdir(group_dir):
        sys.exit(f"Adresář neexistuje: {group_dir}")

    imports = collect_imports(root)
    rows = []

    for module in sorted(os.listdir(group_dir)):
        mod_dir = os.path.join(group_dir, module)
        if not os.path.isdir(mod_dir):
            continue

        files = []
        for dirpath, dirnames, filenames in os.walk(mod_dir):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            files += [os.path.join(dirpath, f) for f in filenames if f.endswith(CODE_EXT)]
        files = [f for f in files if "__tests__" not in f and ".test." not in f]
        if not files:
            continue

        loc = sum(count_lines(f) for f in files)
        exports_total = sum(count_exports(f) for f in files)

        barrel_path = next(
            (os.path.join(mod_dir, f"index{e}") for e in (".ts", ".tsx", ".js")
             if os.path.exists(os.path.join(mod_dir, f"index{e}"))),
            None,
        )
        barrel_exports = count_exports(barrel_path) if barrel_path else None

        via_barrel, via_deep = 0, 0
        callers = set()
        deep_targets = defaultdict(int)

        for src_file, specs in imports.items():
            if src_file.startswith(mod_dir + os.sep):
                continue  # vnitřní importy modulu nejsou volající
            if "__tests__" in src_file or ".test." in src_file:
                continue
            for spec in specs:
                kind = classify_import(spec, group, module)
                if kind is None:
                    continue
                callers.add(src_file)
                if kind == "barrel":
                    via_barrel += 1
                else:
                    via_deep += 1
                    marker = f"{group}/{module}"
                    deep_targets[spec[spec.rfind(marker) + len(marker):].lstrip("/")] += 1

        if loc < min_loc:
            continue

        iface = barrel_exports if barrel_exports is not None else exports_total
        external = via_barrel + via_deep
        rows.append({
            "modul": module,
            "souboru": len(files),
            "loc": loc,
            "exportu_celkem": exports_total,
            "barrel_exportu": barrel_exports,
            "volajicich": len(callers),
            "importu_pres_barrel": via_barrel,
            "importu_mimo_barrel": via_deep,
            "hloubka_loc_na_export": round(loc / iface, 1) if iface else None,
            "podil_mimo_barrel": round(100 * via_deep / external, 1) if external else None,
            "deep_cile": sorted(deep_targets.items(), key=lambda x: -x[1])[:5],
        })

    return rows


def render(rows, threshold):
    width = 116
    print("=" * width)
    print("DEEP MODULES — hloubka vs. šířka rozhraní")
    print("=" * width)
    print(f"{'modul':<28}{'soub':>5}{'LOC':>7}{'exp':>5}{'barrel':>8}"
          f"{'volajících':>11}{'přes barrel':>12}{'mimo':>7}{'LOC/export':>12}{'% mimo':>9}")

    for r in sorted(rows, key=lambda x: -x["loc"]):
        barrel = "—" if r["barrel_exportu"] is None else str(r["barrel_exportu"])
        depth = "—" if r["hloubka_loc_na_export"] is None else f"{r['hloubka_loc_na_export']:.0f}:1"
        share = "—" if r["podil_mimo_barrel"] is None else f"{r['podil_mimo_barrel']:.0f}%"
        print(f"{r['modul'][:27]:<28}{r['souboru']:>5}{r['loc']:>7}{r['exportu_celkem']:>5}{barrel:>8}"
              f"{r['volajicich']:>11}{r['importu_pres_barrel']:>12}{r['importu_mimo_barrel']:>7}"
              f"{depth:>12}{share:>9}")

    lies = [r for r in rows
            if r["barrel_exportu"] is not None
            and r["podil_mimo_barrel"] is not None
            and r["podil_mimo_barrel"] >= threshold]

    print()
    print("=" * width)
    print(f"BARREL, KTERÝ NIKDO NEPOUŽÍVÁ (>= {threshold:.0f} % externích importů ho obchází)")
    print("=" * width)
    if not lies:
        print("Žádný. Barrely, které existují, se používají.")
        return
    for r in sorted(lies, key=lambda x: -x["importu_mimo_barrel"]):
        print(f"\n{r['modul']}: barrel exportuje {r['barrel_exportu']}, "
              f"ale {r['importu_mimo_barrel']} z {r['importu_mimo_barrel'] + r['importu_pres_barrel']} "
              f"externích importů jde mimo něj ({r['podil_mimo_barrel']:.0f} %)")
        if r["deep_cile"]:
            print("   nejčastější deep cíle: "
                  + ", ".join(f"{t} ({c}×)" for t, c in r["deep_cile"]))
    print("\nNález znamená: barrel předstírá rozhraní, které neexistuje.")
    print("Náprava je JEDNA ZE DVOU — smazat barrel, nebo kontrakt vynutit a zúžit.")
    print("„Přidat do barrelu další exporty\" náprava NENÍ: tím se rozhraní jen rozšíří,")
    print("dokud přestane být rozhraním.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True,
                    help="kořen zdrojů, ve kterém se hledají volající (např. apps/api/src)")
    ap.add_argument("--dir", required=True, dest="group",
                    help="adresář s doménovými moduly relativně k --root (např. services)")
    ap.add_argument("--min-loc", type=int, default=400,
                    help="ignoruj moduly menší než tolik řádků (výchozí 400)")
    ap.add_argument("--threshold", type=float, default=80.0,
                    help="podíl importů mimo barrel, od kterého je to nález (výchozí 80 %%)")
    ap.add_argument("--json", action="store_true", help="strojový výstup místo tabulky")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    rows = analyze(root, args.group, args.min_loc)

    if args.json:
        json.dump(rows, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        render(rows, args.threshold)


if __name__ == "__main__":
    main()
