#!/usr/bin/env python3
"""Args bloků dev-pipeline do souboru (1.6.0): orchestrátor předá bloku jen {cwd, plugin_root, rez, args_file} a první agent
bloku (dev-pipeline:nacteni-args) soubor načte a sloučí s docs/.run-args.json. Workflow skript soubory číst neumí.

Proč: v běhu web-rijen orchestrátor args 26× přepisoval ručně (159 k znaků výstupu, args stavby prošly kontextem
třikrát) a stavba 8 dostala mapu kostry řezu 7. Skript skládá soubor deterministicky; výsledek bloku PRD čte sám ze souboru
běhu Workflow, orchestrátor ho neopisuje.

Použití:
  args-bloku.py stavba  <cwd> <NN> --prd-run <runId> [--doplnit '<json>' | --doplnit @soubor.json]
  args-bloku.py stavba  <cwd> <NN> --prd-vysledek <soubor> [--doplnit …]           (záložní cesta)
  args-bloku.py prd     <cwd> <NN> [--puvodni-run <runId> | --puvodni-vysledek <soubor>] [--doplnit …]
  args-bloku.py kolecko <cwd> [--doplnit …]
  args-bloku.py rozhodnuti <cwd> --text '<doslovná citace majitele>'

--prd-vysledek / --puvodni-vysledek: soubor .output, na který runtime odkazuje v useknuté notifikaci („full result in
…/tasks/<id>.output“: JSON s polem result), celý výsledek bloku PRD, nebo jen jeho pole stavba.

--puvodni-run uloží celý výsledek dřívějšího běhu blok-prd téhož řezu jako `puvodni` (režim zapracování, od_faze
"autori"): orchestrátor předchozí návrat neopisuje. Pokračování bloku PRD (puvodni, rezim nebo od_faze) bere za základ
pole volání z existujícího docs/.prd-NN.json (plan_row, hypotezy, profil …; bez souboru z args předchozího běhu), aby blok
neskončil na „chybí plan_row“; pole režimu z minula (rezim, nalezy, prd_path, od_faze …) do základu nejdou.
Stálá pole běhu (STALA, včetně vize a produkt) patří do docs/.run-args.json: skript je ze stavby z výsledku PRD vynechá
a sám je nedoplňuje (vize z docs/.orchestrator-run jen tehdy, když ji .run-args.json nemá); --doplnit je smí přepsat výslovně.

1.7.0: pole `obnova` patří do volání bloku, ne do souboru (--doplnit s ním skončí kódem 2): v běhu sonnet-5-5 si načítací
agent vymyslel `obnova: {}` a obnova pak přehrála celou stavbu řezu 03. Pole s prázdnou hodnotou (null, "", [], {}) se do
souboru nepíšou (kromě rez); `_pole` je seřazený seznam klíčů souboru sjednocený s klíči docs/.run-args.json (bez prázdných
hodnot): blok podle něj pozná, že načítací agent pole vynechal nebo přidal.

rozhodnuti: rozhodnutí majitele, které mění provoz běhu, připíše do docs/.run-args.json (pole rozhodnuti_majitele, položka
"<YYYY-MM-DD HH:MM> <citace>"); bloky ho dávají do rámce agentů od dalšího spuštění. Orchestrátor JSON ručně nepřepisuje.

Výstup: docs/.stavba-NN.json, docs/.prd-NN.json, docs/.kolecko.json; na stdout jeden řádek (cesta, velikost, pole),
obsah nevypisuje. Návratové kódy: 0 zapsáno; 2 špatné argumenty nebo nevalidní JSON; 3 výsledek bloku PRD nenalezen
nebo nedokončený (vypíše záložní cestu); 4 výsledek patří jinému řezu; 5 výsledek bloku PRD není schválené PRD pro stavbu
(ok: false, konec po architektovi s návrhem rozdělit řez, bez prd_path).
"""
import glob
import json
import os
import sys
from datetime import datetime

STALA = ("app_pristup", "runbook", "deploy_mode", "deploy_okno", "ne_cile", "mapa_vize", "vize", "produkt",
         "rozhodnuti_majitele", "rychle_kontroly")
# Pole args stavby, která dává blok PRD (výsledek bez pole `stavba` = blok před 1.6.0).
ZE_STAVBY = ("prd_path", "e2e_path", "casti", "kontrakt_potreba", "e2e_sekce", "doklad_pred", "kriteria",
             "runtime_dopad", "oblasti", "casti_nad_stropem", "profil")
# Pole volání bloku PRD, která pokračování (zapracování, od_faze "autori") přebírá z minulého volání téhož řezu. Šablony
# skillu je neopakují; bez plan_row blok skončí „chybí args“ (code-review 1.6.0, N2).
VOLANI_PRD = ("plan_row", "stav_po_minulem", "hypotezy", "follow_ups", "profil", "prd_lehke", "kontrakt_prd", "kontrakt_rez")


def chyba(kod, text):
    print(f"args-bloku: {text}", file=sys.stderr)
    sys.exit(kod)


def nn(x):
    s = str(x).strip()
    return s.zfill(2) if s.isdigit() else s


def nacti_json(text, odkud):
    if text.startswith("@"):
        try:
            with open(text[1:], encoding="utf-8") as f:
                text = f.read()
        except OSError as e:
            chyba(2, f"{odkud}: soubor {text[1:]} nejde přečíst ({e})")
    try:
        return json.loads(text)
    except ValueError as e:
        chyba(2, f"{odkud}: nevalidní JSON ({e})")


def sloucit(zaklad, navic):
    """Slovníky se slučují do hloubky (hypotezy z bloku PRD + hypotezy.text orchestrátora), ostatní hodnoty navic přepíše."""
    out = dict(zaklad)
    for k, v in navic.items():
        out[k] = sloucit(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def soubor_behu(cwd, run_id):
    koren = os.environ.get("DEV_PIPELINE_TRANSCRIPTS") or os.path.join(
        os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude"), "projects")
    jmena = [run_id] if run_id.startswith("wf_") else [run_id, "wf_" + run_id]
    sid = ""
    try:
        with open(os.path.join(cwd, "docs", ".orchestrator-run"), encoding="utf-8") as f:
            sid = str(json.load(f).get("session_id") or "")
    except (OSError, ValueError, AttributeError):
        pass
    for sezeni in ([sid] if sid else []) + ["*"]:
        for j in jmena:
            nalez = glob.glob(os.path.join(glob.escape(koren), "*", sezeni if sezeni != "*" else "*", "workflows", j + ".json"))
            if nalez:
                return nalez[0]
    return ""


ZALOHA = ("záložní cesta: notifikace bloku PRD odkazuje na plný výsledek („full result in …/tasks/<id>.output“); spusť "
          "args-bloku.py stavba <cwd> <NN> --prd-vysledek <ta cesta>. Jen když notifikace výsledek neusekla (odkaz nemá), "
          "zapiš výsledek heredocem do docs/.prd-vysledek-NN.json a dej tu cestu")


def rozbal(v):
    """Soubor .output Workflow tasku ({summary, agentCount, logs, result, …}) → result; jiný objekt beze změny."""
    if isinstance(v, dict) and isinstance(v.get("result"), dict) and any(k in v for k in ("logs", "agentCount", "workflowProgress", "totalTokens")):
        return v["result"]
    return v


def stavba_z_vysledku(r, NN):
    if not isinstance(r, dict):
        chyba(3, f"výsledek bloku PRD není objekt; {ZALOHA}")
    rr = r.get("rez")
    if rr is None and isinstance(r.get("stavba"), dict):
        rr = r["stavba"].get("rez")
    if rr is not None and nn(rr) != NN:
        chyba(4, f"výsledek bloku PRD patří řezu {nn(rr)}, ne řezu {NN}")
    # Jen schválitelné PRD jde stavbě (code-review 1.6.0, N5): neúspěšný blok by zapsal args jen s prd_path a velký řez by se
    # stavěl jako malý; konec po architektovi s návrhem rozdělit řez ještě nemá autory částí ani kontrolu.
    if r.get("ok") is False:
        chyba(5, f"blok PRD skončil ok: false ({str(r.get('duvod') or '')[:200]}); stavbu nespouštěj, řeš selhání bloku PRD")
    if r.get("faze") == "architekt":
        chyba(5, "výsledek je z konce po architektovi (návrh rozdělit řez); po rozhodnutí pusť blok PRD znovu "
                 "(od_faze autori) a stavbu skládej z runId toho běhu")
    if isinstance(r.get("stavba"), dict):
        if not r["stavba"].get("prd_path"):
            chyba(5, "pole stavba nemá prd_path; výsledek bloku PRD není úplný")
        s = dict(r["stavba"])
        if "profil" not in s and r.get("profil"):
            s["profil"] = r["profil"]
        return s, ""
    if "prd_path" not in r:
        chyba(3, f"výsledek nemá pole stavba ani prd_path (není to výsledek bloku PRD?); {ZALOHA}")
    s = {k: r[k] for k in ZE_STAVBY if k in r}
    if isinstance(r.get("hypotezy_pro_stavbu"), dict):
        s["hypotezy"] = r["hypotezy_pro_stavbu"]
    return s, " (stavba sestavena z polí výsledku: blok PRD před 1.6.0)"


ZALOHA_PUVODNI = ("záložní cesta: --puvodni-vysledek <cesta .output z notifikace toho bloku PRD> (soubor s celým výsledkem)")


def nacti_beh(cwd, run_id, NN, co):
    """Výsledek dokončeného běhu Workflow ze souboru wf_*.json (a args běhu); kontrola stavu a řezu."""
    zaloha = ZALOHA if co == "--prd-run" else ZALOHA_PUVODNI
    p = soubor_behu(cwd, run_id)
    if not p:
        chyba(3, f"{co}: soubor běhu Workflow {run_id} nenalezen; {zaloha}")
    beh = nacti_json("@" + p, p)
    if not isinstance(beh, dict):
        chyba(3, f"{co}: soubor běhu {p} nenese objekt; {zaloha}")
    if beh.get("status") != "completed":
        chyba(3, f"{co}: běh {run_id} má stav {beh.get('status')!r}, ne completed; {zaloha}")
    jmeno = str(beh.get("workflowName") or "")
    if jmeno and "blok-prd" not in jmeno:
        chyba(3, f"{co}: běh {run_id} je {jmeno}, ne blok-prd")
    return beh.get("result"), beh.get("args")


def nacti_vysledek(cesta, co):
    v = rozbal(nacti_json("@" + cesta, co))
    if not isinstance(v, dict):
        chyba(2, f"{co}: soubor musí nést JSON objekt")
    return v


def zaklad_volani(cwd, NN, args_behu):
    """Pole volání bloku PRD z minula: docs/.prd-NN.json téhož řezu, jinak args předchozího běhu (přímo, nebo jeho args_file)."""
    zdroje = [os.path.join(cwd, "docs", f".prd-{NN}.json")]
    if isinstance(args_behu, dict):
        if args_behu.get("args_file"):
            af = str(args_behu["args_file"])
            zdroje.append(af if os.path.isabs(af) else os.path.join(cwd, af))
        elif any(k in args_behu for k in VOLANI_PRD):
            zdroje.append(args_behu)
    for z in zdroje:
        if isinstance(z, dict):
            d = z
        else:
            try:
                with open(z, encoding="utf-8") as f:
                    d = json.load(f)
            except (OSError, ValueError):
                continue
        if not isinstance(d, dict) or (d.get("rez") is not None and nn(d["rez"]) != NN):
            continue
        return {k: d[k] for k in VOLANI_PRD if k in d}
    return {}


def prazdne(v):
    """Hodnota, která se do souboru args nepíše: blok ji čte stejně jako chybějící pole."""
    return v is None or (isinstance(v, (str, list, dict)) and len(v) == 0)


def klice_run_args(cwd):
    """Klíče docs/.run-args.json s neprázdnou hodnotou (bez _pole); prázdná množina, když soubor chybí nebo není objekt."""
    try:
        with open(os.path.join(cwd, "docs", ".run-args.json"), encoding="utf-8") as f:
            ra = json.load(f)
    except (OSError, ValueError):
        return set()
    return {k for k, v in ra.items() if k != "_pole" and not prazdne(v)} if isinstance(ra, dict) else set()


def zapis_json(cil, data):
    tmp = f"{cil}.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, cil)


def rozhodnuti(argv):
    """args-bloku.py rozhodnuti <cwd> --text '<citace>': připíše rozhodnutí majitele do docs/.run-args.json."""
    if len(argv) != 3 or argv[1] != "--text":
        chyba(2, "použití: args-bloku.py rozhodnuti <cwd> --text '<doslovná citace majitele>'")
    cwd, text = os.path.abspath(argv[0]), " ".join(argv[2].split())
    if not text:
        chyba(2, "rozhodnuti: prázdný --text")
    if not os.path.isdir(os.path.join(cwd, "docs")):
        chyba(2, f"{cwd}/docs neexistuje")
    cil = os.path.join(cwd, "docs", ".run-args.json")
    ra, pozn = {}, ""
    if os.path.exists(cil):
        ra = nacti_json("@" + cil, cil)
        if not isinstance(ra, dict):
            chyba(2, f"{cil} nenese JSON objekt; nic nezapsáno")
    else:
        pozn = " (docs/.run-args.json neexistoval, založen jen s rozhodnutím; stálé args běhu v něm chybí)"
    seznam = ra.get("rozhodnuti_majitele")
    if seznam is None:
        seznam = []
    elif isinstance(seznam, str):
        seznam = [seznam]
    elif not isinstance(seznam, list):
        chyba(2, "rozhodnuti_majitele v docs/.run-args.json není seznam; nic nezapsáno")
    seznam.append(f"{datetime.now().strftime('%Y-%m-%d %H:%M')} {text}")
    ra["rozhodnuti_majitele"] = seznam
    zapis_json(cil, ra)
    print(f"docs/.run-args.json: rozhodnuti_majitele {len(seznam)} položek{pozn}")


def main(argv):
    if argv and argv[0] == "rozhodnuti":
        return rozhodnuti(argv[1:])
    if len(argv) < 2 or argv[0] not in ("stavba", "prd", "kolecko"):
        chyba(2, "použití: args-bloku.py stavba|prd <cwd> <NN> … | kolecko <cwd> … | rozhodnuti <cwd> --text … (viz hlavička skriptu)")
    druh, cwd = argv[0], os.path.abspath(argv[1])
    rest = argv[2:]
    NN = ""
    if druh != "kolecko":
        if not rest or rest[0].startswith("--"):
            chyba(2, f"{druh}: chybí číslo řezu")
        NN = nn(rest[0])
        rest = rest[1:]
    opt = {}
    while rest:
        k = rest[0]
        if k not in ("--prd-run", "--prd-vysledek", "--puvodni-run", "--puvodni-vysledek", "--doplnit") or len(rest) < 2:
            chyba(2, f"neznámý nebo neúplný argument {k}")
        opt[k] = rest[1]
        rest = rest[2:]
    if not os.path.isdir(os.path.join(cwd, "docs")):
        chyba(2, f"{cwd}/docs neexistuje")

    data, pozn = {}, ""
    if druh == "stavba":
        if "--prd-run" in opt:
            data, pozn = stavba_z_vysledku(nacti_beh(cwd, opt["--prd-run"], NN, "--prd-run")[0], NN)
        elif "--prd-vysledek" in opt:
            v = nacti_vysledek(opt["--prd-vysledek"], "--prd-vysledek")
            # Celý výsledek bloku PRD (má ok, souhrn, stavba nebo hypotezy_pro_stavbu), nebo jen jeho pole stavba.
            celek = any(k in v for k in ("stavba", "souhrn", "hypotezy_pro_stavbu", "ok"))
            data, pozn = stavba_z_vysledku(v if celek else {"stavba": v, "rez": v.get("rez")}, NN)
        else:
            chyba(2, "stavba: chybí --prd-run <runId> (nebo záložní --prd-vysledek <soubor>)")
        data.pop("mapa_kostry", None)  # 1.6.0: agenti si mapu kostry dělají sami
        for k in STALA:
            data.pop(k, None)
    elif "--prd-run" in opt or "--prd-vysledek" in opt:
        chyba(2, f"{druh}: --prd-run/--prd-vysledek patří jen ke stavbě")
    d = {}
    if "--doplnit" in opt:
        d = nacti_json(opt["--doplnit"], "--doplnit")
        if not isinstance(d, dict):
            chyba(2, "--doplnit musí být JSON objekt")
        if "obnova" in d:
            chyba(2, "obnova patří do volání bloku, ne do souboru (Workflow args: {cwd, plugin_root, rez, args_file, obnova})")
        dr = d.get("rez")
        if dr is not None and druh != "kolecko" and nn(dr) != NN:
            chyba(4, f"--doplnit nese rez {nn(dr)}, ne {NN}")
    args_behu = None
    if "--puvodni-run" in opt or "--puvodni-vysledek" in opt:
        if druh != "prd":
            chyba(2, f"{druh}: --puvodni-run/--puvodni-vysledek patří jen k bloku PRD")
        if "--puvodni-run" in opt:
            r, args_behu = nacti_beh(cwd, opt["--puvodni-run"], NN, "--puvodni-run")
            odkud = "běhu " + opt["--puvodni-run"]
        else:
            r, odkud = nacti_vysledek(opt["--puvodni-vysledek"], "--puvodni-vysledek"), opt["--puvodni-vysledek"]
        if not isinstance(r, dict):
            chyba(3, f"--puvodni-run: běh {opt['--puvodni-run']} nemá výsledek jako objekt")
        if r.get("rez") is not None and nn(r["rez"]) != NN:
            chyba(4, f"puvodni: výsledek patří řezu {nn(r['rez'])}, ne řezu {NN}")
        data["puvodni"] = r
        pozn = " (puvodni = výsledek " + odkud + ")"
    # Pokračování bloku PRD téhož řezu: pole volání z minula jako základ (N2), přes ně --doplnit a puvodni.
    if druh == "prd" and ("puvodni" in data or "rezim" in d or "od_faze" in d):
        zaklad = zaklad_volani(cwd, NN, args_behu)
        if zaklad:
            data = sloucit(zaklad, data)
            pozn += f" (z minulého volání: {', '.join(sorted(zaklad))})"
        elif "plan_row" not in d:
            pozn += " (POZOR: plan_row z minulého volání nenalezen; dej ho do --doplnit, jinak blok skončí „chybí args“)"
    if "plan_row" in d:
        data.pop("plan_row", None)  # nový řádek plánu nahrazuje starý celý, neslučuje se s ním
    data = sloucit(data, d)

    data["cwd"] = cwd
    data["rez"] = NN if druh != "kolecko" else "kolecko"
    # vize patří do docs/.run-args.json (setup); soubor řezu ji nepřepisuje. Jen když ji .run-args.json nemá (starší setup),
    # doplní se z docs/.orchestrator-run, aby blok neskončil na „chybí vize“.
    if "vize" not in data:
        try:
            with open(os.path.join(cwd, "docs", ".run-args.json"), encoding="utf-8") as f:
                ma_vizi = bool(json.load(f).get("vize"))
        except (OSError, ValueError, AttributeError):
            ma_vizi = False
        if not ma_vizi:
            try:
                with open(os.path.join(cwd, "docs", ".orchestrator-run"), encoding="utf-8") as f:
                    v = json.load(f).get("vize")
                if v:
                    data["vize"] = v if os.path.isabs(v) else os.path.join(cwd, v)
            except (OSError, ValueError, AttributeError):
                pass

    # obnova z výsledku nebo základu volání se do souboru nedostane nikdy (jen volání bloku); prázdné hodnoty blok čte
    # jako chybějící pole, načítací agent by je stejně vynechal a kontrola _pole by hlásila rozdíl
    data.pop("obnova", None)
    data.pop("_pole", None)
    data = {k: v for k, v in data.items() if k == "rez" or not prazdne(v)}
    data["_pole"] = sorted(set(data) | klice_run_args(cwd))

    jmeno = {"stavba": f".stavba-{NN}.json", "prd": f".prd-{NN}.json", "kolecko": ".kolecko.json"}[druh]
    cil = os.path.join(cwd, "docs", jmeno)
    zapis_json(cil, data)
    print(f"docs/{jmeno}: {os.path.getsize(cil)} B; pole: {', '.join(k for k in sorted(data) if k != '_pole')}{pozn}")


if __name__ == "__main__":
    main(sys.argv[1:])
