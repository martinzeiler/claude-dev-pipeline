#!/usr/bin/env python3
"""Kostra závěrečné zprávy běhu (docs/zaverecna-zprava.md) z dokumentů běhu; orchestrátor doplní jen prózu.

Použití:
  zprava.py <cwd> --plugin-root <root> [--vystup docs/zaverecna-zprava.md] [--bez-cisel] [--session <dir>]

Co skládá: hlavičku (vize, verze pluginu, od–do a délka), pevný blok Cílů se značkami a názvy do 5 slov z vize (C vždy,
F a R, když je vize má), tabulku řezů z docs/handoff.md (řez, název, stav, pokusy z výsledků bloků, Dveře · Dosah ze
zápisů nasazení docs/e2e/rez-NN-nasazeni*.md, poznámka), čísla běhu z `co-dela.sh --zprava` (cena, délka, agenti,
restarty, compacty orchestrátora, předávky, bloky), follow-ups podle osudu a seznam [rozhodnutí] (scripts/follow-ups.py)
a OTÁZKY jako dotazník ze docs/vize-spory.md: každý záznam bez řádku „**Rozhodnuto majitelem:** „<citace>““ (starší tvar:
„Co by to rozhodlo“ = „rozhodnuto majitelem“) jako
blok s účelem, navrženou odpovědí, řádkem „Proti vizi“ (když ho záznam nese) a prázdným řádkem „Odpověď:“; nejdřív
záznamy s „Proti vizi“ a s rozhodnutím, pak ostatní. Sekce „Spory ve vizi“ je seznam všech záznamů.

Sekce pro orchestrátora (Stav Cílů, Zastavení a obnovy, ROZHODNUTÍ PRO TEBE) stojí mezi značkami
<!-- orchestrátor: <název> --> … <!-- /orchestrátor -->; při opakovaném běhu skript kostru přepíše a tyto sekce
i vyplněné odpovědi pod „Odpověď:“ zachová. Nic nepočítá z hlavy: co nezjistí, napíše „nezjištěno“.
  --bez-cisel   nevolá co-dela.sh (rychlý náhled kostry)
  --session     adresář session orchestrátora pro co-dela.sh, když docs/.orchestrator-run už neexistuje
Návratové kódy: 0 zapsáno · 2 chybí vstup (cwd/docs, handoff).
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ZNACKA_ORCH = re.compile(r"<!-- orchestrátor: (.*?) -->\n(.*?)<!-- /orchestrátor -->", re.S)
SEKCE_ORCH = [
    ("Stav Cílů", "(doplň: ke každému Cíli jedna věta se stavem; u Cíle s verdiktem měření 2–3 věty: jak se měřilo, co rozhodlo, "
                  "příklad a odkaz na sekci zdůvodnění; přeskočené nebo změněné části plánu s důvodem)"),
    ("Zastavení a obnovy", "(doplň: každé zastavení s délkou stání a s tím, co obnova změnila; výpadek spojení jen jako informace; "
                           "bez zastavení napiš „žádné“)"),
    ("ROZHODNUTÍ PRO TEBE", "(doplň: jen položky, které mění Cíl, Ne-cíl, Rozhodnutí nebo mantinel vize, každá s doporučením; "
                            "sem patří i návrh změny docs/produkt.md; follow-upy ani měřicí otázky sem nepatří)"),
]


def nacti(cesta):
    try:
        with open(cesta, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def nn(x):
    s = str(x or "").strip()
    m = re.match(r"0*(\d+)([a-z]?)$", s)
    return (m.group(1).zfill(2) + m.group(2)) if m else s


def slov(text, n=5):
    t = re.sub(r"[*`_]", "", " ".join(text.split()))
    kusy = t.split()
    out = " ".join(kusy[:n]).rstrip(" .,;:")
    return out + ("…" if len(kusy) > n else "")


def handoff(cwd):
    txt = nacti(os.path.join(cwd, "docs", "handoff.md"))
    h = {"slug": None, "vize": None, "branch": None, "start": None, "session": None, "radky": []}
    if not txt:
        return h
    hlavicka = None
    for l in txt.splitlines():
        m = re.match(r"^#\s*Běh vize\s+(.+)$", l)
        if m:
            h["slug"] = m.group(1).strip()
        for klic in ("vize", "branch", "start", "session"):
            m = re.search(r"(?:^|·)\s*" + klic + r":\s*([^·]+)", l)
            if m and h[klic] is None and not l.startswith("|"):
                h[klic] = m.group(1).strip()
        if l.startswith("|"):
            bunky = [c.strip() for c in l.strip().strip("|").split("|")]
            if hlavicka is None and bunky and bunky[0] in ("#", "č.", "řez"):
                hlavicka = [c.lower() for c in bunky]
            elif hlavicka is not None and bunky and re.fullmatch(r"\d+[a-z]?", bunky[0]):
                h["radky"].append(bunky)
    def sloupec(rx):
        if hlavicka:
            for i, c in enumerate(hlavicka):
                if re.search(rx, c):
                    return i
        return None
    i_nazev, i_stav, i_pozn = sloupec(r"n[áa]zev"), sloupec(r"stav"), sloupec(r"pozn|commit|e2e")
    if i_nazev is None:
        i_nazev = 1
    out = []
    for r in h["radky"]:
        out.append({"rez": nn(r[0]), "nazev": r[i_nazev] if i_nazev < len(r) else "",
                    "stav": r[i_stav] if i_stav is not None and i_stav < len(r) else "",
                    "pozn": r[i_pozn] if i_pozn is not None and i_pozn < len(r) else ""})
    h["radky"] = out
    return h


def cile(vize_txt):
    """[(značka, název do 5 slov)] pro C vždy, F (nadpisy nebo odrážky nejvyšší úrovně) a R, když je vize má."""
    out, videne = [], set()
    for l in vize_txt.splitlines():
        m = re.match(r"^\s*[-*]\s*\*\*(C\d+)\*\*\s*(.+)$", l) or re.match(r"^#{2,5}\s*(C\d+)\b[.:]?\s*(.*)$", l)
        if m:
            z = m.group(1)
            if z not in videne:
                videne.add(z); out.append((z, slov(m.group(2))))
            continue
        m = re.match(r"^#{2,5}\s*(F\d+)\b[.:]?\s*(.*)$", l) or re.match(r"^\s*[-*]\s*\*\*(F\d+)\*\*\s*(.+)$", l)
        if m:
            z = m.group(1)
            if z not in videne:
                videne.add(z); out.append((z, slov(m.group(2))))
            continue
        m = re.match(r"^\s*[-*]\s*\*\*(R\d+)\b[.:]?\s*([^*]*)\*\*\s*(.*)$", l) or re.match(r"^\s*[-*]\s*\*\*(R\d+)\*\*\s*(.+)$", l)
        if m:
            z = m.group(1)
            text = m.group(2) if m.group(2).strip() else (m.group(3) if m.lastindex >= 3 else "")
            if z not in videne:
                videne.add(z); out.append((z, slov(text)))
    def klic(x):
        return ("CFR".index(x[0][0]), int(re.sub(r"\D", "", x[0]) or 0))
    return sorted(out, key=klic)


def dvere_dosah(cwd):
    """{NN: "jednosměrné · data"} z posledního řádku Dveře/Dosah posledního zápisu nasazení řezu."""
    out = {}
    e2e = os.path.join(cwd, "docs", "e2e")
    if not os.path.isdir(e2e):
        return out
    for f in sorted(os.listdir(e2e)):
        m = re.match(r"rez-(\d+[a-z]?)-nasazeni(?:-\d+)?\.md$", f)
        if not m:
            continue
        for l in nacti(os.path.join(e2e, f)).splitlines():
            mm = re.search(r"Dveře:\s*([^·|]+?)\s*[·|]\s*Dosah:\s*(\S+)", l)
            if mm:
                out[nn(m.group(1))] = f"{mm.group(1).strip()} · {mm.group(2).strip().rstrip('.,;')}"
    return out


def vize_spory(cwd):
    txt = nacti(os.path.join(cwd, "docs", "vize-spory.md"))
    zaznamy, akt = [], None
    for l in txt.splitlines():
        m = re.match(r"^##\s+(\S+)\s*\|\s*(.+?)\s*\|\s*(.+)$", l)
        if m:
            akt = {"datum": m.group(1), "rez": m.group(2).strip(), "agent": m.group(3).strip(), "pole": {}, "posledni": None}
            zaznamy.append(akt)
            continue
        if akt is None:
            continue
        mp = re.match(r"^\*\*([^*]+?):\*\*\s*(.*)$", l)
        if mp:
            akt["pole"][mp.group(1).strip().lower()] = mp.group(2).strip()
            akt["posledni"] = mp.group(1).strip().lower()
        elif l.strip() and akt["posledni"]:
            akt["pole"][akt["posledni"]] += " " + l.strip()
    for z in zaznamy:
        p = z["pole"]
        z["rozpor"] = p.get("rozpor nebo předpoklad", "")
        z["jak"] = p.get("jak jsem se zachoval", "")
        z["co"] = p.get("co by to rozhodlo", "")
        z["hledal"] = p.get("hledal jsem ve vizi", "")
        z["proti"] = p.get("proti vizi", "")
        z["rozhodnuto"] = p.get("rozhodnuto majitelem", "")
        # otevřená otázka = záznam bez řádku **Rozhodnuto majitelem:** (zapisuje orchestrátor citací); starší tvar
        # „rozhodnuto majitelem“ v Co by to rozhodlo platí jako druhá možnost
        z["otazka"] = not (z["rozhodnuto"].strip() or re.search(r"rozhodnuto majitelem", z["co"], re.I))
        z["titul"] = slov(re.split(r"(?<=[.;:])\s", z["rozpor"], 1)[0], 12) if z["rozpor"] else "(bez rozporu)"
    return zaznamy


def spust(prikaz, cwd):
    try:
        r = subprocess.run(prikaz, cwd=cwd, capture_output=True, text=True, timeout=900)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0 or not r.stdout.strip():
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def existujici(cesta):
    """(sekce orchestrátora podle názvu, odpovědi podle titulu otázky) ze stávající zprávy."""
    txt = nacti(cesta)
    sekce = {m.group(1).strip(): m.group(2).strip("\n") for m in ZNACKA_ORCH.finditer(txt)}
    odpovedi, titul, sbiram, buf = {}, None, False, []
    for l in txt.splitlines() + ["## konec"]:
        if l.startswith("### "):
            if titul and buf:
                odpovedi[titul] = "\n".join(buf).strip()
            titul, sbiram, buf = l[4:].strip(), False, []
            continue
        if l.startswith("## "):
            if titul and buf:
                odpovedi[titul] = "\n".join(buf).strip()
            titul, sbiram, buf = None, False, []
            continue
        if titul and l.startswith("Odpověď:"):
            sbiram = True
            zb = l[len("Odpověď:"):].strip()
            if zb:
                buf.append(zb)
            continue
        if sbiram and l.strip():
            buf.append(l.rstrip())
    return sekce, odpovedi


def fmt_cas(iso):
    if not iso:
        return "nezjištěno"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone().strftime("%-d. %-m. %Y %H:%M")
    except ValueError:
        return iso


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0
    cwd = os.path.abspath(argv[0])
    opt = {"plugin-root": None, "vystup": "docs/zaverecna-zprava.md", "bez-cisel": False, "session": None}
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--bez-cisel":
            opt["bez-cisel"] = True
        elif a in ("--plugin-root", "--vystup", "--session") and i + 1 < len(argv):
            opt[a[2:]] = argv[i + 1]
            i += 1
        else:
            print(f"zprava: neznámý nebo neúplný argument {a}", file=sys.stderr)
            return 2
        i += 1
    if not os.path.isdir(os.path.join(cwd, "docs")):
        print(f"zprava: {cwd}/docs neexistuje", file=sys.stderr)
        return 2
    root = os.path.abspath(opt["plugin-root"] or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    h = handoff(cwd)
    marker = {}
    try:
        with open(os.path.join(cwd, "docs", ".orchestrator-run"), encoding="utf-8") as f:
            marker = json.load(f) or {}
    except (OSError, ValueError):
        pass
    slug = marker.get("slug") or h["slug"]
    if not slug and not h["radky"]:
        print("zprava: chybí docs/handoff.md s tabulkou plánu (nebo docs/.orchestrator-run)", file=sys.stderr)
        return 2
    vize_rel = marker.get("vize") or h["vize"] or (f"docs/vize/{slug}.md" if slug else "")
    vize_abs = vize_rel if os.path.isabs(vize_rel) else os.path.join(cwd, vize_rel)
    vize_txt = nacti(vize_abs)
    verze = "nezjištěno"
    try:
        with open(os.path.join(root, ".claude-plugin", "plugin.json"), encoding="utf-8") as f:
            verze = str(json.load(f).get("version") or verze)
    except (OSError, ValueError):
        pass

    cisla = None
    if not opt["bez-cisel"]:
        prikaz = ["bash", os.path.join(root, "scripts", "co-dela.sh"), "--zprava"]
        if opt["session"]:
            prikaz += ["--session", opt["session"]]
        cisla = spust(prikaz, cwd)
    fu = spust([sys.executable, "-I", os.path.join(root, "scripts", "follow-ups.py"), cwd, "--json"], cwd) or {}
    dd = dvere_dosah(cwd)
    spory = vize_spory(cwd)
    vystup = opt["vystup"] if os.path.isabs(opt["vystup"]) else os.path.join(cwd, opt["vystup"])
    sekce_stare, odpovedi_stare = existujici(vystup)

    out = []
    out.append(f"# Závěrečná zpráva: {slug or 'běh vize'}")
    out.append("")
    od = fmt_cas(cisla.get("od")) if cisla else fmt_cas(marker.get("started")) if marker else (h["start"] or "nezjištěno")
    do = fmt_cas(cisla.get("do")) if cisla else "nezjištěno"
    delka = f"{cisla['delka_h']} h" if cisla and cisla.get("delka_h") is not None else "nezjištěno"
    out.append(f"vize: `{vize_rel or 'nezjištěno'}` · plugin dev-pipeline {verze} · běh {od} až {do} ({delka})"
               + (f" · větev `{marker.get('branch') or h['branch']}`" if (marker.get("branch") or h["branch"]) else ""))
    out.append("")
    out.append("<!-- kostru skládá scripts/zprava.py z dokumentů běhu; sekce mezi značkami orchestrátor píše orchestrátor, zbytek skript při dalším spuštění přepíše -->")
    out.append("")

    out.append("## Cíle vize")
    out.append("")
    cl = cile(vize_txt)
    if cl:
        for z, nazev in cl:
            out.append(f"- **{z}** ({nazev})")
    else:
        out.append("- (Cíle se z vize nepodařilo přečíst: nezjištěno)")
    out.append("")
    out.append("## Stav Cílů")
    out.append("")
    out.append(f"<!-- orchestrátor: {SEKCE_ORCH[0][0]} -->")
    out.append(sekce_stare.get(SEKCE_ORCH[0][0]) or SEKCE_ORCH[0][1])
    out.append("<!-- /orchestrátor -->")
    out.append("")

    out.append("## Řezy")
    out.append("")
    out.append("| řez | název | stav | pokusy | dveře · dosah | pozn. |")
    out.append("|---|---|---|---|---|---|")
    rezy_c = (cisla or {}).get("rezy") or {}
    for r in h["radky"]:
        rc = rezy_c.get(r["rez"]) or {}
        pokusy = rc.get("pokusy") if rc else None
        dvd = dd.get(r["rez"]) or (f"{rc.get('dvere')} · {rc.get('dosah')}" if rc.get("dvere") and rc.get("dosah") else "")
        out.append(f"| {r['rez']} | {r['nazev']} | {r['stav'] or (rc.get('vysledek') or '')} | {pokusy if pokusy is not None else ''} | {dvd} | {r['pozn']} |")
    if not h["radky"]:
        out.append("| | (tabulka plánu v docs/handoff.md nenalezena) | | | | |")
    kol = (cisla or {}).get("kolecko")
    if kol:
        out.append("")
        out.append(f"Kolečko: {'hotovo' if kol.get('ok') else 'selhalo'}" + (f" ({kol.get('faze')})" if kol.get("faze") else "")
                   + (f": {kol.get('detail')}" if kol.get("detail") else ""))
    out.append("")

    out.append("## Čísla běhu")
    out.append("")
    if cisla:
        cm = ", ".join(f"{m} ${c:,.0f}" for m, c in sorted(cisla.get("cena_podle_modelu", {}).items(), key=lambda x: -x[1]))
        out.append(f"- cena: ${cisla.get('cena_usd', 0):,.0f}" + (f" ({cm})" if cm else ""))
        out.append(f"- délka: {od} až {do} ({delka}); agentů {cisla.get('agentu', 'nezjištěno')}")
        out.append(f"- restartů po stallu {cisla.get('restartu_stall', 0)} (ztráta ~{cisla.get('ztrata_restartu_min', 0)} min), po limitu {cisla.get('restartu_limit', 0)}; předávek {cisla.get('predavek', 0)}")
        out.append(f"- compactů orchestrátora {cisla.get('compactu_orchestratora', 0)}, compactů agentů {cisla.get('compactu_agentu', 0)}")
        b = cisla.get("bloky") or {}
        pb = ", ".join(f"{k} {v.get('hotovo', 0)}/{v.get('hotovo', 0) + v.get('selhalo', 0)}" for k, v in sorted((b.get("podle_bloku") or {}).items()))
        out.append(f"- bloky: hotovo {b.get('hotovo', 0)}, selhalo {b.get('selhalo', 0)}" + (f" ({pb})" if pb else ""))
    else:
        out.append("- nezjištěno (co-dela.sh --zprava nevrátil čísla; spusť ho zvlášť, nebo zprávu bez čísel)")
    out.append("")

    for nazev, vychozi in SEKCE_ORCH[1:]:
        out.append(f"## {nazev}")
        out.append("")
        out.append(f"<!-- orchestrátor: {nazev} -->")
        out.append(sekce_stare.get(nazev) or vychozi)
        out.append("<!-- /orchestrátor -->")
        out.append("")

    out.append("## Follow-ups")
    out.append("")
    if fu:
        pocty = {}
        for ob in (fu.get("pocty") or {}).values():
            for osud, n in ob.items():
                pocty[osud] = pocty.get(osud, 0) + n
        poradi = ["rozhodnutí", "oprava", "nápad", "obsah", "bez osudu"]
        out.append(f"{fu.get('otevrene', 0)} otevřených ("
                   + ", ".join(f"{k} {pocty.get(k, 0)}" for k in poradi if pocty.get(k)) + f"), {fu.get('uzavrene', 0)} uzavřených; "
                   f"přehled: `python3 {os.path.relpath(os.path.join(root, 'scripts', 'follow-ups.py'), cwd)} {os.path.relpath(cwd, cwd) or '.'}`")
        rozh = [p for p in fu.get("polozky", []) if p.get("osud") == "rozhodnutí"]
        if rozh:
            out.append("")
            out.append("[rozhodnutí] (jediné položky, které potřebují majitele):")
            for p in rozh:
                hlava = "kolečko" if p.get("rez") == "kolecko" else f"řez {p.get('rez')}"
                out.append(f"- {hlava} · {p.get('oblast')}: {p.get('text')}")
    else:
        out.append("nezjištěno (docs/follow-ups.md chybí nebo follow-ups.py selhal)")
    out.append("")

    out.append("## Otázky s navrženou odpovědí")
    out.append("")
    otazky = [z for z in spory if z["otazka"]]
    def poradi_otazek(z):
        return (0 if z["proti"] else 1 if re.search(r"rozhodnut", z["rozpor"] + z["co"], re.I) else 2, z["datum"])
    otazky.sort(key=poradi_otazek)
    if otazky:
        out.append("Odpověz pod „Odpověď:“ přímo v tomto souboru; další session odpovědi přečte odtud. Nejdřív otázky, jejichž navržená odpověď jde proti znění vize, pak ty s rozhodnutím, pak ostatní.")
        out.append("")
        for z in otazky:
            titul = f"{z['rez']} · {z['titul']}"
            out.append(f"### {titul}")
            out.append(f"Účel: {z['rozpor'] or 'nezjištěno'}")
            out.append(f"Navržená odpověď: {z['jak'] or 'nezjištěno'}")
            if z["proti"]:
                out.append(f"Proti vizi: {z['proti']}")
            if z["hledal"]:
                out.append(f"Hledal jsem ve vizi: {z['hledal']}")
            out.append(f"Co by to rozhodlo: {z['co'] or 'nezjištěno'} ({z['datum']}, {z['agent']})")
            stara = odpovedi_stare.get(titul, "")
            out.append("Odpověď: " + stara if stara else "Odpověď:")
            out.append("")
    else:
        out.append("Žádné: každý záznam vize-spory je rozhodnutý majitelem, nebo soubor chybí.")
        out.append("")

    out.append("## Spory ve vizi")
    out.append("")
    rozhodnute = sum(1 for z in spory if not z["otazka"])
    out.append(f"{len(spory)} záznamů v docs/vize-spory.md ({len(otazky)} otázek výše, {rozhodnute} rozhodnutých majitelem).")
    for z in spory:
        out.append(f"- {z['datum']} · {z['rez']} · {z['agent']}: {z['titul']}"
                   + ("" if z["otazka"] else (f" (rozhodnuto majitelem: {z['rozhodnuto']})" if z["rozhodnuto"] else " (rozhodnuto majitelem)")))
    out.append("")

    with open(vystup, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    rel = os.path.relpath(vystup, cwd)
    vychozi = dict(SEKCE_ORCH)
    zachovano = sum(1 for k, v in sekce_stare.items() if v.strip() and v.strip() != vychozi.get(k, ""))
    print(f"{rel}: {os.path.getsize(vystup)} B; Cílů {len(cl)}, řezů {len(h['radky'])}, otázek {len(otazky)} z {len(spory)} záznamů, "
          f"follow-ups {fu.get('otevrene', 'nezjištěno') if fu else 'nezjištěno'}, čísla {'ano' if cisla else 'ne'}; "
          f"doplň sekce: {', '.join(n for n, _ in SEKCE_ORCH)}"
          + (f"; zachováno {zachovano} sekcí a {len(odpovedi_stare)} odpovědí" if sekce_stare or odpovedi_stare else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
