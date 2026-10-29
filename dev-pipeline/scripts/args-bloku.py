#!/usr/bin/env python3
"""Args bloků dev-pipeline do souboru: orchestrátor předá bloku jen {cwd, plugin_root, rez, args_file} a první agent
bloku (dev-pipeline:nacteni-args) soubor načte. Workflow skript soubory číst neumí. Soubor nese i stálá pole běhu
z docs/.run-args.json, takže agent opisuje jediný soubor a nic neslučuje.

Proč: args přepisované rukou procházejí kontextem orchestrátora opakovaně a přenášejí chyby mezi řezy. Skript skládá
soubor deterministicky; výsledek bloku PRD čte sám ze souboru běhu Workflow, orchestrátor ho neopisuje.

Použití:
  args-bloku.py stavba  <cwd> <NN> --prd-run <runId> [--doplnit '<json>' | --doplnit @soubor.json]
  args-bloku.py stavba  <cwd> <NN> --prd-vysledek <soubor> [--doplnit …]           (záložní cesta)
  args-bloku.py prd     <cwd> <NN> [--puvodni-run <runId> | --puvodni-vysledek <soubor>] [--doplnit …]
  args-bloku.py kolecko <cwd> [--doplnit …]
  args-bloku.py rozhodnuti <cwd> --text '<doslovná citace majitele>'
  (stavba, prd i kolecko navíc [--i-kdyz-bezi])

--prd-vysledek / --puvodni-vysledek: soubor .output, na který runtime odkazuje v useknuté notifikaci („full result in
…/tasks/<id>.output“: JSON s polem result), celý výsledek bloku PRD, nebo jen jeho pole stavba.

--puvodni-run uloží celý výsledek dřívějšího běhu blok-prd téhož řezu jako `puvodni` (režim zapracování, od_faze
"autori"): orchestrátor předchozí návrat neopisuje. Pokračování bloku PRD (puvodni, rezim nebo od_faze) bere za základ
pole volání z existujícího docs/.prd-NN.json (plan_row, hypotezy, profil …; bez souboru z args předchozího běhu), aby blok
neskončil na „chybí plan_row“; pole režimu z minula (rezim, nalezy, prd_path, od_faze …) do základu nejdou.
Stálá pole běhu (STALA, včetně vize a produkt) patří do docs/.run-args.json: skript je ze stavby z výsledku PRD vynechá
(mohla zastarat) a do každého souboru bloku vloží všechna neprázdná pole docs/.run-args.json; pole souboru (z výsledku
PRD, z minulého volání, z --doplnit) mají přednost. vize z docs/.orchestrator-run jen tehdy, když ji .run-args.json nemá.

Pole `obnova` patří do volání bloku, ne do souboru (--doplnit s ním skončí kódem 2): načítací agent by si ho mohl vymyslet
a obnova by přehrála celou stavbu. Obnova musí nést `pokus` ≥ 1 = číslo PŘERUŠENÉHO pokusu (`pokusy` z návratu
zastaveného bloku; bez návratu číslo z labelu posledního agenta), nikdy +1: blok ten pokus dokončí a od něj čísluje
pokusy, labely a reporty, aby nepřepsal reporty dřívějších pokusů. Další klíče obnovy: `od_faze`, `znacka`,
`bez_cache` (true/false; true jen po aktualizaci pluginu nebo změně args, blok pak cache Workflow nevěří), `app_pristup`
(nové pokyny k prostředí jen pro fáze od od_faze; `.run-args.json` ani cesta k args se při obnově nemění, cache by minula),
`rozhodnuti_majitele`; neznámý klíč skript odmítne. `app_pristup` (v --doplnit, v obnově i v docs/.run-args.json) nad
1 500 znaků skončí kódem 2: nasazovací pokyny patří do runbooku projektu, args nesou odkaz a tajemství prostředí.
Pole s prázdnou hodnotou (null, "", [], {}) se do
souboru nepíšou (kromě rez); `_pole` je seřazený seznam klíčů sloučeného souboru (bez prázdných hodnot): blok podle něj
pozná, že načítací agent pole vynechal nebo přidal.

Běžící blok: když v session běhu (session_id z docs/.orchestrator-run) právě běží blok téhož typu pro týž řez (u kolečka
jakékoli kolečko), skript args nesloží a skončí kódem 6: druhý běh téhož řezu by přepisoval tentýž strom (typicky po
compactu mezi spuštěním bloku a zápisem jeho task id do handoffu). Běžící bloky a jejich řez (z labelů agentů, jinak
z args běhu) zná scripts/co-dela.sh --bezici; blok bez známého řezu se nepočítá. Blok bez stavového souboru se počítá
vždy, i zombie (journal i agenti mlčí přes 2 h): stejně vypadá blok, který stojí na usage limitu a po resetu pokračuje, takže
hláška jen řekne, co ověřit. --i-kdyz-bezi kontrolu vypne (blok zastavený nebo spadlý bez stavového souboru).

kolecko: commity bez review (pole bez_review v docs/.vysledek-stavba-NN.json a docs/.vysledek-stavba-NN-zastaveno.json,
[{rez, commit, popis}], každý commit jednou) skript zapíše do souboru kolečka jako bez_review; --doplnit je smí přepsat.

rozhodnuti: rozhodnutí majitele, které mění provoz běhu, připíše do docs/.run-args.json (pole rozhodnuti_majitele, položka
"<YYYY-MM-DD HH:MM> <citace>"); platí od dalšího složeného souboru args (soubor bloku ho nese jako stálé pole). Orchestrátor JSON ručně nepřepisuje.

Výstup: docs/.stavba-NN.json, docs/.prd-NN.json, docs/.kolecko.json; na stdout jeden řádek (cesta, velikost, pole),
obsah nevypisuje. Návratové kódy: 0 zapsáno; 2 špatné argumenty nebo nevalidní JSON; 3 výsledek bloku PRD nenalezen
nebo nedokončený (vypíše záložní cestu); 4 výsledek patří jinému řezu; 5 výsledek bloku PRD není schválené PRD pro stavbu
(ok: false, konec po architektovi s návrhem rozdělit řez, bez prd_path); 6 blok téhož řezu v session běží.
"""
import glob
import json
import os
import re
import subprocess
import sys
from datetime import datetime

STALA = ("app_pristup", "runbook", "deploy_mode", "deploy_okno", "ne_cile", "mapa_vize", "vize", "produkt",
         "rozhodnuti_majitele", "rychle_kontroly")
# Pole args stavby, která dává blok PRD (výsledek bez pole `stavba` = blok před 1.6.0).
ZE_STAVBY = ("prd_path", "e2e_path", "casti", "kontrakt_potreba", "e2e_sekce", "doklad_pred", "kriteria",
             "runtime_dopad", "oblasti", "casti_nad_stropem", "profil", "nove_pojmy")
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


def koren_projektu():
    return os.environ.get("DEV_PIPELINE_TRANSCRIPTS") or os.path.join(
        os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude"), "projects")


def sid_behu(cwd):
    try:
        with open(os.path.join(cwd, "docs", ".orchestrator-run"), encoding="utf-8") as f:
            return str(json.load(f).get("session_id") or "")
    except (OSError, ValueError, AttributeError):
        return ""


def adresar_session(cwd):
    """Adresář session běhu (<projekty>/<slug>/<session_id>); prázdný, když marker nebo adresář chybí."""
    sid = sid_behu(cwd)
    if not sid:
        return ""
    nalez = [d for d in glob.glob(os.path.join(glob.escape(koren_projektu()), "*", glob.escape(sid))) if os.path.isdir(d)]
    return nalez[0] if nalez else ""


def soubor_behu(cwd, run_id):
    koren = koren_projektu()
    jmena = [run_id] if run_id.startswith("wf_") else [run_id, "wf_" + run_id]
    sid = sid_behu(cwd)
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
    return s, " (stavba sestavena z polí výsledku: starší tvar výsledku bloku PRD bez pole stavba)"


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


BLOK = {"stavba": "blok-stavby", "prd": "blok-prd", "kolecko": "blok-kolecko"}


def bezici_blok(cwd, druh, NN):
    """Běžící blok téhož typu a řezu podle co-dela.sh --bezici, jinak None. Bez session nebo s nečitelným výstupem kontrola
    mlčí: nespuštěný blok nemá co přepsat, a selhaný dotaz nesmí zastavit běh."""
    sess = adresar_session(cwd)
    if not sess:
        return None
    skript = os.path.join(os.path.dirname(os.path.abspath(__file__)), "co-dela.sh")
    try:
        out = subprocess.run(["bash", skript, "--session", sess, "--bezici"], cwd=cwd, capture_output=True, text=True,
                             timeout=60).stdout
        bezici = json.loads(out)
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
    for b in bezici if isinstance(bezici, list) else []:
        if not isinstance(b, dict) or b.get("name") != BLOK[druh]:
            continue
        if druh == "kolecko" or (b.get("rez") and nn(b["rez"]) == NN):
            return b
    return None


VYSLEDEK_STAVBY = re.compile(r"\.vysledek-stavba-([0-9]+[a-z]?)(-zastaveno)?\.json$")


def bez_review_z_vysledku(cwd):
    """[{rez, commit, popis}] z pole bez_review souborů výsledku stavby (docs/.vysledek-stavba-NN.json i -zastaveno.json:
    trvalý zdroj přes všechny sessions běhu) podle řezu, každý commit jednou."""
    soubory = []
    for p in glob.glob(os.path.join(glob.escape(os.path.join(cwd, "docs")), ".vysledek-stavba-*.json")):
        m = VYSLEDEK_STAVBY.search(os.path.basename(p))
        if m:
            soubory.append(((int(re.sub(r"\D", "", m.group(1))), m.group(1), bool(m.group(2))), p))
    zdroje = []
    for (_, nazev, _), p in sorted(soubory):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(d, dict) and isinstance(d.get("bez_review"), list):
            zdroje.append((nn(d.get("rez") or nazev), d["bez_review"]))
    out, videne = [], set()
    for rez, xs in zdroje:
        for x in xs:
            c = str(x.get("commit") or "").strip() if isinstance(x, dict) else ""
            if c and c not in videne:
                videne.add(c)
                out.append({"rez": rez, "commit": c, "popis": str(x.get("popis") or "").strip()[:400]})
    return out


def prazdne(v):
    """Hodnota, která se do souboru args nepíše: blok ji čte stejně jako chybějící pole."""
    return v is None or (isinstance(v, (str, list, dict)) and len(v) == 0)


APP_PRISTUP_MAX = 1500
OBNOVA_KLICE = ("od_faze", "znacka", "pokus", "bez_cache", "app_pristup", "rozhodnuti_majitele")


def over_app_pristup(v, odkud):
    """app_pristup nad strop je chyba, ne tiché useknutí: nasazovací pokyny patří do runbooku projektu."""
    if isinstance(v, str) and len(v) > APP_PRISTUP_MAX:
        chyba(2, f"{odkud}: app_pristup má {len(v)} znaků, strop je {APP_PRISTUP_MAX}; nasazovací pokyny patří do runbooku "
                 "projektu (runbook), args nesou jen odkaz na něj a tajemství prostředí; zkrať a spusť znovu")


def over_obnovu(ob):
    """Tvar pole obnova ve volání bloku: známé klíče, bez_cache jen true/false, app_pristup řetězec pod stropem."""
    cizi = sorted(k for k in ob if k not in OBNOVA_KLICE)
    if cizi:
        chyba(2, f"obnova nese neznámé klíče {', '.join(cizi)}; povolené: {', '.join(OBNOVA_KLICE)}")
    if "bez_cache" in ob and not isinstance(ob["bez_cache"], bool):
        chyba(2, "obnova.bez_cache musí být true nebo false (true jen po aktualizaci pluginu nebo změně args: blok pak "
                 "přeskočí jen fáze nad doloženým nasazením a cache Workflow nevěří)")
    if "app_pristup" in ob and not isinstance(ob["app_pristup"], str):
        chyba(2, "obnova.app_pristup musí být řetězec (nové pokyny k prostředí jen pro fáze od od_faze)")
    rm = ob.get("rozhodnuti_majitele")
    if rm is not None and not (isinstance(rm, list) and all(isinstance(x, str) for x in rm)):
        chyba(2, "obnova.rozhodnuti_majitele musí být seznam řetězců (citace majitele pro fáze od od_faze)")
    over_app_pristup(ob.get("app_pristup"), "obnova")


def run_args(cwd):
    try:
        with open(os.path.join(cwd, "docs", ".run-args.json"), encoding="utf-8") as f:
            ra = json.load(f)
    except (OSError, ValueError):
        return {}
    return ra if isinstance(ra, dict) else {}


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
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0
    if argv[0] == "rozhodnuti":
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
    i_kdyz_bezi = "--i-kdyz-bezi" in rest
    rest = [x for x in rest if x != "--i-kdyz-bezi"]
    while rest:
        k = rest[0]
        if k not in ("--prd-run", "--prd-vysledek", "--puvodni-run", "--puvodni-vysledek", "--doplnit") or len(rest) < 2:
            chyba(2, f"neznámý nebo neúplný argument {k}")
        opt[k] = rest[1]
        rest = rest[2:]
    if not os.path.isdir(os.path.join(cwd, "docs")):
        chyba(2, f"{cwd}/docs neexistuje")
    if not i_kdyz_bezi:
        b = bezici_blok(cwd, druh, NN)
        if b:
            kde = "kolečko" if druh == "kolecko" else f"{BLOK[druh]} řezu {NN}"
            if b.get("zombie"):
                chyba(6, f"{kde} nemá stavový soubor a mlčí přes 2 h ({b.get('wf')}): buď čeká na usage limit a po resetu "
                         "sám pokračuje, nebo je mrtvý. Args nesložím, druhý běh téhož řezu by přepisoval tentýž strom. Ověř "
                         "co-dela.sh --kratce a stav usage limitu; teprve když blok opravdu neběží, spusť znovu s --i-kdyz-bezi")
            chyba(6, f"{kde} v session právě běží ({b.get('wf')}); args nesložím, druhý běh téhož řezu by přepisoval tentýž "
                     "strom. Zkontroluj stav běhu v docs/handoff.md a co-dela.sh --kratce: když blok běží, doplň do handoffu "
                     "jeho task id a počkej na jeho konec; jen když opravdu neběží (zastavený nebo spadlý bez stavového "
                     "souboru), spusť znovu s --i-kdyz-bezi")

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
        data.pop("mapa_kostry", None)  # agenti si mapu kostry dělají sami
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
            ob = d["obnova"]
            pokus = ob.get("pokus") if isinstance(ob, dict) else None
            try:
                pokus_ok = pokus is not None and not isinstance(pokus, bool) and int(pokus) >= 1 and float(pokus) == int(pokus)
            except (TypeError, ValueError):
                pokus_ok = False
            if not pokus_ok:
                chyba(2, "obnova bez pokus ≥ 1: do volání bloku dej obnova: {od_faze, znacka, pokus: N}, kde N je číslo "
                         "přerušeného pokusu (pokusy z návratu zastaveného bloku, bez návratu číslo z labelu posledního "
                         "agenta; nikdy +1); blok ten pokus dokončí a od N čísluje pokusy, labely a reporty. Obnova patří "
                         "do volání bloku, ne do souboru args.")
            over_obnovu(ob)
            chyba(2, "obnova patří do volání bloku, ne do souboru (Workflow args: {cwd, plugin_root, rez, args_file, obnova: "
                     + json.dumps(ob, ensure_ascii=False) + "})")
        over_app_pristup(d.get("app_pristup"), "--doplnit")
        dr = d.get("rez")
        if dr is not None and druh != "kolecko" and nn(dr) != NN:
            chyba(4, f"--doplnit nese rez {nn(dr)}, ne {NN}")
    over_app_pristup(run_args(cwd).get("app_pristup"), "docs/.run-args.json")
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
    if druh == "kolecko":
        br = bez_review_z_vysledku(cwd)
        if br:
            data["bez_review"] = br
            pozn += f" (bez_review: {len(br)} commitů z výsledků stavby)"
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
    # Stálá pole běhu do souboru bloku (spec H1): pole souboru mají přednost, .run-args.json doplní chybějící.
    for k, v in run_args(cwd).items():
        if k not in ("_pole", "obnova") and k not in data and not prazdne(v):
            data[k] = v
    data["_pole"] = sorted(data)

    jmeno = {"stavba": f".stavba-{NN}.json", "prd": f".prd-{NN}.json", "kolecko": ".kolecko.json"}[druh]
    cil = os.path.join(cwd, "docs", jmeno)
    zapis_json(cil, data)
    print(f"docs/{jmeno}: {os.path.getsize(cil)} B; pole: {', '.join(k for k in sorted(data) if k != '_pole')}{pozn}")


if __name__ == "__main__":
    main(sys.argv[1:])
