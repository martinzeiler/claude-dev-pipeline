#!/usr/bin/env bash
# dev-pipeline: co právě dělají agenti běžící session Claude Code.
# Čte jen soubory session na disku (journal Workflow, metadata a konce transkriptů agentů); žádný model nevolá,
# žádný obsah odpovědí, diffů ani výsledků nevypisuje: jen labely, fáze, modely, časy a jména volání nástrojů.
#
#   co-dela.sh                 orchestrátor v cronu: session z docs/.orchestrator-run v aktuálním cwd, plný výpis
#   co-dela.sh --kratce        tvar pro cron „zkontroluj stav běhu“: hlavička běhu (vize, hotové řezy), per blok řez, pokus,
#                              fáze i/N s trváním a hotové fáze, živí agenti bez šumu argumentů, hotové a selhané bloky za 30 min
#   co-dela.sh --status        segment pro status line; JSON status line na stdin (transcript_path), bez nového řádku;
#                              za časem „· fronta N“, jen když ve frontě těžkých příkazů něco čeká
#   co-dela.sh --zprava        čísla běhu pro závěrečnou zprávu jako JSON (scripts/zprava.py je vkládá do kostry): cena a
#                              tokeny z transkriptů orchestrátora i agentů (usage z posledního záznamu každé zprávy, ceník
#                              podle rodiny modelu), od–do a délka, počet agentů, restarty, compacty orchestrátora i agentů,
#                              předávky, hotové a selhané bloky, výsledek a pokusy per řez, výsledek kolečka
#   co-dela.sh --session <dir>       ruční použití: adresář session ~/.claude/projects/<slug>/<session_id>
#   co-dela.sh --transcript <p.jsonl> ruční použití: transkript session (adresář = cesta bez .jsonl)
#
# Jak se pozná stav:
#   Workflow: <session>/subagents/workflows/<wf>/journal.jsonl (launched / started {agentId,label,phase} / result / failed);
#     stavový soubor <session>/workflows/<wf>.json vzniká až při doběhnutí (status completed|failed|killed),
#     takže Workflow bez stavového souboru běží; živý agent = POSLEDNÍ started daného key bez result/failed
#     (stall watchdog restartuje agenta se stejným key a novým agentId; starý started bez result není živý agent).
#     Restarty (po stallu a po usage limitu) se ukazují u běžícího i doběhlého bloku s odhadem ztraceného času.
#     Obnova přes resumeFromRunId píše do téhož journalu a stavový soubor přerušeného běhu přepíše až při doběhnutí:
#     journal o víc než 5 s novější než stavový soubor = obnovený běh, který běží.
#   Labely agentů (části, kontrakt, integrace, oprava, nástupce po předávce :nN; dluh:kolečko, obnova-stav:řez NN,
#     thermo:báze, krok na pozadí) se vypisují čitelně (implement řez 05 · část K2 (název části) · pokus 1 · nástupce 2);
#     název části z docs/.stavba-NN.json.
#   Předávky jen z docs/.kontext.jsonl (záznamy udalost predavka, hook hlídač kontextu): za běh a za řez přes všechny
#     bloky (PRD, stavba, obnova); součet výsledků bloků předávky obnovy nevidí. Bez logu (ruční --session mimo projekt)
#     labely nástupců a pole predavky výsledků.
#   Kontext agentů z docs/.kontext.jsonl v cwd (hook hlídač kontextu): u živého agenta poslední záznam jeho agent_id,
#     v souhrnu nejvyšší kontext podle typu agenta a compacty, jen za agenty této session; compacty orchestrátora
#     zvlášť ze záznamů hooku session-start při compactu (aid orchestrator), z nich je bere i závěrečná zpráva.
#   Fronta těžkých příkazů: scripts/tezky.py stav (co drží, co čeká); status line čte stavový soubor fronty napřímo
#     (bez podprocesu a zámku) a počítá jen čekající se živým PID.
#   Kontext běhu (název řezu, hotové řezy) z docs/handoff.md v cwd; fáze bloku ze skriptu workflows/scripts/<blok>-<wf>.js.
#   Samostatný agent: <session>/subagents/agent-<id>.jsonl (+ .meta.json); hotový končí záznamem assistant
#     se stop_reason end_turn; bez konce a s tichem přes 3 h se počítá za opuštěný (TaskStop, pád), ne za živý.
#   Čas od posledního zápisu = mtime transkriptu agenta. Čte se jen konec souborů (tail), ne celé transkripty.
# Návratový kód vždy 0; chybějící adresáře a rozbité řádky JSON degradují potichu.
set -uo pipefail

mode=full
sess=""
while [ $# -gt 0 ]; do
  case "$1" in
    --kratce) mode=kratce ;;
    --status) mode=status ;;
    --zprava) mode=zprava ;;
    --session) shift; sess="${1:-}" ;;
    --transcript) shift; sess="${1%.jsonl}" ;;
    -h|--help) awk 'NR > 1 && /^set /{exit} NR > 1' "$0"; exit 0 ;;
    *) echo "co-dela: neznámý argument $1" >&2; exit 0 ;;
  esac
  shift
done

cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

if [ "$mode" = status ]; then
  input=$(cat 2>/dev/null || true)
  tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  if [ -n "$tp" ]; then
    sess="${tp%.jsonl}"
  else
    sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
    cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
    [ -n "$sid" ] && [ -n "$cwd" ] && sess="$cfg/projects/$(printf '%s' "$cwd" | sed 's/[^a-zA-Z0-9]/-/g')/$sid"
  fi
  [ -n "$sess" ] || exit 0
fi

if [ -z "$sess" ]; then
  marker="docs/.orchestrator-run"
  if [ ! -f "$marker" ]; then
    echo "co-dela: v $(pwd) není docs/.orchestrator-run, běh vize tu neběží (ruční použití: --session <dir> nebo --transcript <p.jsonl>)"
    exit 0
  fi
  sid=$(jq -r '.session_id // empty' "$marker" 2>/dev/null)
  if [ -z "$sid" ]; then echo "co-dela: docs/.orchestrator-run nemá session_id"; exit 0; fi
  sess="$cfg/projects/$(pwd | sed 's/[^a-zA-Z0-9]/-/g')/$sid"
fi

if [ ! -d "$sess" ]; then
  [ "$mode" = status ] || echo "co-dela: adresář session $sess neexistuje (session zatím nespustila žádného agenta)"
  exit 0
fi

# adresář skriptů pluginu (tezky.py vedle) bez podprocesu: status line to volá každých 30 s
case "$0" in */*) skripty="${0%/*}" ;; *) skripty=. ;; esac

CO_DELA_SESSION="$sess" CO_DELA_MODE="$mode" CO_DELA_SKRIPTY="$skripty" python3 - <<'PY' 2>/dev/null || true
import glob, json, os, re, sys, time
from datetime import datetime, timezone

sess = os.environ["CO_DELA_SESSION"]
mode = os.environ["CO_DELA_MODE"]
skripty = os.environ.get("CO_DELA_SKRIPTY") or "."
now = time.time()
TERMINAL = {"completed", "failed", "killed", "cancelled"}
TICHO_VAROVANI = 20 * 60      # ⚠ pro agenty mlčící déle
OPUSTENY = 3 * 3600           # samostatný agent bez konce a s takovým tichem se nepočítá za živého
HOTOVO_OKNO = 30 * 60         # dokončené Workflow, které --kratce ještě připomene (jeden cron tah)
# Journal o víc sekund novější než stavový soubor = Workflow obnovený pod stejným ID a běží (stavový soubor přerušeného
# běhu leží do konce obnoveného); u doběhlých Workflow končí journal i stavový soubor do 1 s.
OBNOVA = 5
def _tezky_tmp():
    # Stejný adresář jako tezky.py: cron nemá TMPDIR, na macOS je uživatelský temp z getconf, jinak by fronta vypadala prázdná.
    t = os.environ.get("TMPDIR")
    if not t and sys.platform == "darwin":
        import subprocess
        try: t = subprocess.run(["getconf", "DARWIN_USER_TEMP_DIR"], capture_output=True, text=True).stdout.strip()
        except OSError: t = ""
    return t or "/tmp"
TEZKY_STAV = os.path.join(_tezky_tmp(), "dev-pipeline-tezky", "stav.json")

def tail_lines(path, nbytes):
    """Poslední řádky souboru bez čtení celku; první řádek zahodí, když je uříznutý."""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as fh:
            if size > nbytes:
                fh.seek(size - nbytes)
                data = fh.read()
                data = data.split(b"\n", 1)[1] if b"\n" in data else b""
            else:
                data = fh.read()
    except OSError:
        return []
    return data.decode("utf-8", "replace").splitlines()

def jsonl(lines):
    for l in lines:
        l = l.strip()
        if not l:
            continue
        try:
            yield json.loads(l)
        except ValueError:
            continue

def load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None

def read_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""

def mtime(path):
    try:
        return os.stat(path).st_mtime
    except OSError:
        return None

def birth(path):
    try:
        st = os.stat(path)
        return getattr(st, "st_birthtime", st.st_mtime)
    except OSError:
        return None

def ago(sec):
    sec = max(0, int(sec))
    if sec < 3600:
        return f"{sec // 60}:{sec % 60:02d}"
    return f"{sec // 3600} h {(sec % 3600) // 60:02d} min"

def doba(sec):
    sec = max(0, int(sec))
    return f"{sec // 3600} h {(sec % 3600) // 60:02d} min" if sec >= 3600 else f"{sec // 60} min"

def local_hm(ts):
    return datetime.fromtimestamp(ts).strftime("%H:%M")

def local_hms(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().strftime("%H:%M:%S")
    except (ValueError, AttributeError):
        return "--:--:--"

def one_line(s, n=70):
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s if len(s) <= n else s[: n - 1] + "…"

def tool_calls(path, n):
    """Posledních n volání nástrojů: (čas, jméno, první smysluplný argument). Bez výsledků a textu."""
    calls = []
    for e in jsonl(tail_lines(path, 256 * 1024)):
        if e.get("type") != "assistant":
            continue
        m = e.get("message") or {}
        content = m.get("content")
        if not isinstance(content, list):
            continue
        for b in content:
            if b.get("type") != "tool_use":
                continue
            i = b.get("input") or {}
            if not isinstance(i, dict):
                i = {}
            arg = ""
            for k in ("command", "file_path", "pattern", "description", "query", "url", "name_path", "relative_path", "task_id", "skill"):
                if i.get(k):
                    arg = i[k]
                    break
            calls.append((local_hms(e.get("timestamp", "")), b.get("name", "?"), one_line(arg)))
    return calls[-n:]

def last_record(path):
    recs = list(jsonl(tail_lines(path, 48 * 1024)))
    return recs[-1] if recs else None

def agent_finished(rec):
    """Samostatný agent skončil: poslední záznam je odpověď asistenta bez rozdělané práce."""
    if not rec or rec.get("type") != "assistant":
        return False
    m = rec.get("message") or {}
    if m.get("stop_reason") == "end_turn":
        return True
    c = m.get("content")
    return isinstance(c, list) and c and all(b.get("type") == "text" for b in c)

def rez_z(labels):
    for l in labels:
        m = re.search(r"řez\s*([0-9]+[a-z]?)", l or "")
        if m:
            return m.group(1)
    return None

def rez_int(x):
    m = re.match(r"0*(\d+)", str(x or ""))
    return int(m.group(1)) if m else None

def cislo(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else 0

def tisice(n):
    return f"{round(cislo(n) / 1000)}k"

# ---------- labely ----------
# typ:řez NN[:část K|:kontrakt|:integrace|:oprava][:číslo][:písmeno]; nástupce po předávce má na konci :n2 až :n4.
# Holé číslo znamená podle typu pokus, kolo review, běh nebo balíček oprav; za „oprava“ je to vždy pokus.
CISLO_JAKO = {"implement": "pokus", "review": "kolo", "prd-check": "kolo", "verify": "běh", "deploy": "běh", "e2e": "běh",
              "kriteria": "běh", "fix-e2e": "běh", "fix": "balíček", "dluh": "balíček", "fix-dluh": "balíček", "obnova-stav": "běh"}
NASTUPCE = re.compile(r":n\d+$")
POKUS = re.compile(r"implement:řez\s*[0-9a-z]+:(?:[^:]+:)?(\d+)(?::n\d+)?$")

_NAZVY_CASTI = {}

def nazvy_casti(rez):
    """{id části: název} z docs/.stavba-NN.json v cwd (pole casti[].nazev z bloku PRD); prázdné, když soubor není."""
    n = rez_int(rez)
    if n is None:
        return {}
    if n not in _NAZVY_CASTI:
        d = load_json(os.path.join(os.getcwd(), "docs", f".stavba-{n:02d}.json"))
        casti = d.get("casti") if isinstance(d, dict) else None
        _NAZVY_CASTI[n] = {str(c.get("id")): str(c.get("nazev") or "").strip() for c in (casti if isinstance(casti, list) else [])
                           if isinstance(c, dict) and c.get("id") and str(c.get("nazev") or "").strip()}
    return _NAZVY_CASTI[n]

def citelny(label):
    """implement:řez 05:část K2:1:n2 → implement řez 05 · část K2 (název) · pokus 1 · nástupce 2 (neznámé kusy beze změny).
    Holé „K2“ bez vize v ruce nikdo nepřečte: název části je z args stavby."""
    kusy = str(label or "").split(":")
    typ, hlava, dal, rez = kusy[0], kusy[0], [], None
    for i, k in enumerate(kusy[1:], 1):
        if i == len(kusy) - 1 and re.fullmatch(r"n\d+", k):
            dal.append(f"nástupce {k[1:]}")
        elif i == 1 and re.fullmatch(r"řez\s*\S+|kolečko|báze", k):
            hlava += " " + k
            rez = rez_int(k[3:].strip()) if k.startswith("řez") else None
        elif re.fullmatch(r"K\d+", k):
            nazev = nazvy_casti(rez).get(k) if rez is not None else None
            dal.append(f"část {k}" + (f" ({one_line(nazev, 30)})" if nazev else ""))
        elif re.fullmatch(r"\d+", k):
            co = "pokus" if kusy[i - 1] == "oprava" else CISLO_JAKO.get(typ)
            dal.append(f"{co} {k}" if co else k)
        elif typ == "fix" and re.fullmatch(r"\d+\.\d+", k):
            dal.append("kolo {} · balíček {}".format(*k.split(".")))
        elif typ == "e2e" and re.fullmatch(r"[a-z]", k):
            dal.append(f"skupina {k}")
        else:
            dal.append(k)
    return " · ".join([hlava] + dal)

def kratky(label):
    """Label do status line (28 znaků): dlouhé labely částí a nástupců bez slov „řez“ a „část“, krátké beze změny."""
    return label if len(label) <= 28 else re.sub(r"(řez|část)\s*", "", label)

def predavky_bloku(st):
    """Předávky doběhlého bloku: pole predavky výsledku, jinak řádky logu „předávka n/3“ a „n. předávka, strop…“."""
    res = st.get("result") if isinstance(st.get("result"), dict) else {}
    if cislo(res.get("predavky")):
        return int(res["predavky"])
    logs = st.get("logs") if isinstance(st.get("logs"), list) else []
    return sum(1 for l in logs if isinstance(l, str) and re.search(r": (předávka \d+/\d+|\d+\. předávka)", l))

# ---------- restarty agentů (stall watchdog, usage limit) ----------
# Claude Code restartuje agenta, který dlouho nedostal odpověď modelu (stall), a agenta přerušeného usage limitem; nový
# pokus má stejný key a nové agentId a začíná od nuly. Běžící blok: pokusy z journalu, časy ze vzniku transkriptů (journal
# časy nenese); pokus, jehož transkript končí syntetickou odpovědí (model <synthetic>), skončil na limitu. Doběhlý blok:
# řádky logu „[stall] agent "<label>" stalled … after Ns“ (N = jak dlouho přerušený pokus běžel) a lastAttemptReason throttled.
STALL_LOG = re.compile(r'\[stall\] agent "([^"]+)" stalled.*?after (\d+)s')

def restarty_bezici(d, poradi):
    pokusy = {}
    for e in poradi:
        pokusy.setdefault(e.get("key") or e.get("agentId"), []).append(e)
    r = {"stall": 0, "limit": 0, "ztrata": 0.0, "posledni": None}
    for xs in pokusy.values():
        for a, b in zip(xs, xs[1:]):
            pa = os.path.join(d, f"agent-{a.get('agentId')}.jsonl")
            ta, tb = birth(pa), birth(os.path.join(d, f"agent-{b.get('agentId')}.jsonl"))
            rec = last_record(pa)
            limit = bool(rec) and (rec.get("message") or {}).get("model") == "<synthetic>"
            if limit:
                r["limit"] += 1
            else:
                r["stall"] += 1
                if ta and tb and tb > ta:
                    r["ztrata"] += tb - ta
            if tb and (r["posledni"] is None or tb > r["posledni"][0]):
                r["posledni"] = (tb, b.get("label") or "")
    return r

def restarty_hotove(st):
    logs = st.get("logs") if isinstance(st.get("logs"), list) else []
    stall = [int(m.group(2)) for m in (STALL_LOG.search(l) for l in logs if isinstance(l, str)) if m]
    prog = st.get("workflowProgress") if isinstance(st.get("workflowProgress"), list) else []
    limit = sum(1 for x in prog if isinstance(x, dict) and x.get("lastAttemptReason") == "throttled")
    return {"stall": len(stall), "limit": limit, "ztrata": float(sum(stall)), "posledni": None}

def restarty_text(r, s_casem=True):
    kusy = []
    if r["stall"]:
        t = f"restartů po stallu {r['stall']} (ztráta {doba(r['ztrata'])}"
        if s_casem and r["posledni"]:
            t += f", poslední {local_hm(r['posledni'][0])} {one_line(citelny(r['posledni'][1]), 40)}"
        kusy.append(t + ")")
    if r["limit"]:
        kusy.append(f"po limitu {r['limit']}")
    return " · ".join(kusy)

# ---------- kontext běhu z handoffu (jen když běží v cwd projektu; jinak degraduje) ----------
def handoff_info():
    txt = read_text(os.path.join(os.getcwd(), "docs", "handoff.md"))
    if not txt:
        return None
    slug, rows, header = None, [], None
    for l in txt.splitlines():
        m = re.match(r"^#\s*Běh vize\s+(.+)$", l)
        if m:
            slug = m.group(1).strip()
        if l.startswith("|"):
            cells = [c.strip() for c in l.strip().strip("|").split("|")]
            if header is None and cells and cells[0] in ("#", "č.", "řez"):
                header = [c.lower() for c in cells]
            elif cells and re.fullmatch(r"\d+[a-z]?", cells[0]):
                rows.append(cells)
    def col(rx, default):
        if header:
            for i, h in enumerate(header):
                if re.search(rx, h):
                    return i
        return default
    i_nazev, i_stav = col(r"n[áa]zev", 1), col(r"stav", None)
    def hotovy(r):
        cell = r[i_stav] if i_stav is not None and i_stav < len(r) else " ".join(r)
        return bool(re.search(r"hotov|done|✓", cell, re.I))
    return {"slug": slug, "rows": rows, "hotovo": sum(1 for r in rows if hotovy(r)), "celkem": len(rows),
            "nazev": {rez_int(r[0]): (r[i_nazev] if i_nazev < len(r) else "") for r in rows}}

def phases_of(script_path):
    """Názvy fází z meta.phases skriptu Workflow (pořadí = pořadí v bloku)."""
    txt = read_text(script_path)
    m = re.search(r"phases:\s*\[(.*?)\n\s*\]", txt, re.S)
    return re.findall(r"title:\s*'([^']+)'", m.group(1)) if m else []

def blok_jmeno(name, rez):
    r = f" řezu {rez}" if rez else ""
    return {"blok-stavby": f"stavba{r}", "blok-prd": f"PRD{r}", "blok-kolecko": "kolečko"}.get(name, f"{name}{r}")

# ---------- kontext agentů (docs/.kontext.jsonl, zapisuje hook hlídač kontextu) ----------
def kontext_agentu():
    """(poslední záznam podle aid, nejvyšší kontext podle typu, compactů) za agenty této session; soubor bývá sdílený
    s dřívějšími běhy v projektu, proto jen aid, které mají transkript v adresáři session."""
    ids = {os.path.basename(p)[len("agent-"):-len(".jsonl")]
           for p in glob.glob(os.path.join(sess, "subagents", "agent-*.jsonl"))
           + glob.glob(os.path.join(sess, "subagents", "workflows", "wf_*", "agent-*.jsonl"))}
    posledni, podle_typu, compactu = {}, {}, {}
    for e in jsonl(tail_lines(os.path.join(os.getcwd(), "docs", ".kontext.jsonl"), 2 * 1024 * 1024)):
        aid = e.get("aid") if isinstance(e, dict) else None
        if aid not in ids:
            continue
        posledni[aid] = e
        typ = str(e.get("typ") or "?")
        podle_typu[typ] = max(podle_typu.get(typ, 0), cislo(e.get("max")), cislo(e.get("kontext")))
        compactu[aid] = max(compactu.get(aid, 0), cislo(e.get("compactu")))
    return posledni, podle_typu, sum(compactu.values())

def compacty_orchestratoru():
    """Compacty orchestrátorské session: záznamy hooku session-start při compactu (aid orchestrator, udalost compact; do
    1.6.x je psal pre-compact). Soubor patří běžící vizi (setup ho při nové vizi archivuje), proto se počítají všechny."""
    return sum(1 for e in jsonl(tail_lines(os.path.join(os.getcwd(), "docs", ".kontext.jsonl"), 2 * 1024 * 1024))
               if isinstance(e, dict) and e.get("aid") == "orchestrator" and e.get("udalost") == "compact")

def predavky_z_logu():
    """(předávek za běh, {řez: předávek}) ze záznamů udalost predavka v docs/.kontext.jsonl (hook hlídač píše jeden na
    agenta, který zapsal předávku); None, když log v cwd není. Jeden zdroj pro výpis i závěrečnou zprávu: počítá všechny
    bloky řezu (PRD, stavba, obnova), soubor patří běžící vizi."""
    cesta = os.path.join(os.getcwd(), "docs", ".kontext.jsonl")
    if not os.path.exists(cesta):
        return None
    podle_rezu = {}
    for e in jsonl(tail_lines(cesta, 8 * 1024 * 1024)):
        if isinstance(e, dict) and e.get("udalost") == "predavka":
            r = str(e.get("rez") or "-")
            k = rez_int(r) if rez_int(r) is not None else r
            podle_rezu[k] = podle_rezu.get(k, 0) + 1
    return sum(podle_rezu.values()), podle_rezu

# ---------- fronta těžkých příkazů (scripts/tezky.py) ----------
def pid_zije(pid):
    """Stejné pravidlo jako tezky.py: ProcessLookupError = mrtvý, PermissionError = živý."""
    try:
        pid = int(pid)
        if pid <= 0:
            return False
        os.kill(pid, 0)
    except PermissionError:
        return True
    except (ProcessLookupError, TypeError, ValueError, OSError):
        return False
    return True

def zive(xs):
    return [x for x in (xs if isinstance(xs, list) else []) if isinstance(x, dict) and pid_zije(x.get("pid"))]

def fronta_tezkych():
    """tezky.py stav ({drzi, fronta}) bez záznamů mrtvých PID; None, když fronta na stroji nikdy neběžela nebo plugin
    skript nemá."""
    skript = os.path.join(skripty, "tezky.py")
    if not (os.path.exists(TEZKY_STAV) and os.path.exists(skript)):
        return None
    import subprocess   # až tady: import stojí status line pár ms při každém obnovení
    try:
        st = json.loads(subprocess.run([sys.executable, skript, "stav"], capture_output=True, text=True, timeout=5).stdout)
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
    return {k: zive(st.get(k)) for k in ("drzi", "fronta")} if isinstance(st, dict) else None

def ceka_ve_fronte():
    """Pro status line stavový soubor fronty napřímo, bez podprocesu a zámku: obnovuje se každých 30 s a nesmí čekat
    na tezky.py. Čekající s mrtvým PID (shell zabitý timeoutem) se nepočítají, stejně jako je vyřadí tezky.py."""
    st = load_json(TEZKY_STAV)
    return len(zive(st.get("fronta"))) if isinstance(st, dict) else 0

def prikazy(xs):
    """Nejvýš tři příkazy fronty jako „popis (váha)“."""
    return ", ".join(f"{one_line(x.get('popis') or '?', 40)} ({x.get('vaha', '?')})" for x in xs[:3]) \
        + (f" a {len(xs) - 3} dalších" if len(xs) > 3 else "")

def od_ts(x):
    if cislo(x):
        return float(x) / 1000 if x > 1e11 else float(x)   # sekundy i milisekundy epochy
    try:
        return datetime.fromisoformat(str(x).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None

# ---------- Workflow ----------
running, finished = [], []
# Workflow s journalem (subagents/workflows/wf_*) i Workflow známé jen stavovým souborem (workflows/wf_*.json).
_wfs = {os.path.basename(d) for d in glob.glob(os.path.join(sess, "subagents", "workflows", "wf_*"))}
_wfs |= {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(sess, "workflows", "wf_*.json"))}
for wf in sorted(_wfs):
    d = os.path.join(sess, "subagents", "workflows", wf)
    state_path = os.path.join(sess, "workflows", wf + ".json")
    journal = os.path.join(d, "journal.jsonl")
    state_mt, journal_mt = mtime(state_path), mtime(journal)
    state = load_json(state_path) if state_mt is not None else None
    ukonceny = bool(state) and state.get("status", "completed") in TERMINAL
    # obnovený pod stejným ID: stavový soubor je z přerušeného běhu, journal píše běh obnovený
    obnoveny = ukonceny and journal_mt is not None and journal_mt - state_mt > OBNOVA
    if ukonceny and not obnoveny:
        finished.append((state_mt or 0, wf, state))
        continue
    if journal_mt is None:
        continue
    started_all, by_key, done, failed_ids, poradi = {}, {}, set(), set(), []
    for e in jsonl(tail_lines(journal, 4 * 1024 * 1024)):
        t, aid = e.get("type"), e.get("agentId")
        if t == "started" and aid:
            started_all[aid] = e
            poradi.append(e)
            # stall restart: stejný key, nový agentId; starý start bez result není živý agent
            by_key[e.get("key") or aid] = e
        elif t in ("result", "failed") and aid:
            done.add(aid)
            if t == "failed":
                failed_ids.add(aid)
    scripts = glob.glob(os.path.join(sess, "workflows", "scripts", f"*-{wf}.js"))
    name = os.path.basename(scripts[0])[: -len(f"-{wf}.js")] if scripts else "workflow"
    faze = phases_of(scripts[0]) if scripts else []
    live = []
    for aid, e in by_key.items():
        aid = e.get("agentId")
        if aid in done:
            continue
        tp = os.path.join(d, f"agent-{aid}.jsonl")
        meta_path = os.path.join(d, f"agent-{aid}.meta.json")
        tp_mt = mtime(tp)
        zapis = tp_mt or mtime(meta_path)
        if obnoveny and zapis is not None and zapis <= state_mt:
            continue   # agent přerušeného běhu bez result: skončil s ním, obnovený běh ho nepustil znovu
        meta = load_json(meta_path) or {}
        last = tp_mt or journal_mt or now
        raw = e.get("label") or ""
        live.append({
            "aid": aid,
            "label": citelny(raw) if raw else (meta.get("description") or aid),
            "stav_label": kratky(raw) if raw else (meta.get("description") or aid),
            "phase": e.get("phase") or meta.get("workflowPhase") or "",
            "model": meta.get("model") or "",
            "ticho": now - last,
            "transcript": tp if os.path.exists(tp) else None,
        })
    labels = [e.get("label") or "" for e in poradi]
    rez = rez_z(labels)
    # fáze: aktuální = fáze živých agentů (jinak posledního startu); hotová = má hotového agenta a žádného živého
    cur = (live[-1]["phase"] if live else (poradi[-1].get("phase") if poradi else "")) or ""
    live_phases = {a["phase"] for a in live}
    done_phases = []
    for e in poradi:
        ph = e.get("phase") or ""
        if e.get("agentId") in done and ph and ph not in live_phases and ph != cur and ph not in done_phases:
            done_phases.append(ph)
    if faze:
        done_phases.sort(key=lambda p: faze.index(p) if p in faze else 99)
    start = birth(journal) or now
    obnova = None
    if obnoveny:
        # začátek obnovy = první agent, který vznikl po stavovém souboru přerušeného běhu (journal časy nenese)
        po = [t for t in (birth(os.path.join(d, f"agent-{e.get('agentId')}.jsonl")) for e in poradi) if t and t > state_mt]
        start = min(po) if po else state_mt
        obnova = {"od": start, "po": {"failed": "selhání", "killed": "zastavení", "cancelled": "zrušení",
                                       "completed": "doběhnutí"}.get(state.get("status"), state.get("status") or "?")}
    starty = [birth(os.path.join(d, f"agent-{e.get('agentId')}.jsonl")) for e in poradi if (e.get("phase") or "") == cur]
    faze_start = max(min([t for t in starty if t] or [start]), start)   # obnovený běh: fáze nejdřív od obnovy
    kola = len({l for l in labels if re.match(r"review:řez\s*[0-9a-z]+:2", l)})
    hotove = [f"{p} 2 kola" if p == "Review" and kola else p for p in done_phases]
    pokusy = [int(m.group(1)) for m in (POKUS.match(l) for l in labels) if m]
    restarty = restarty_bezici(d, poradi)
    running.append({
        "wf": wf, "name": name, "rez": rez, "start": start, "hotovo": len(done), "live": live,
        "faze": faze, "cur": cur, "faze_start": faze_start, "hotove_faze": hotove, "pokus": max(pokusy) if pokusy else None,
        "restarty": restarty, "selhani": len(failed_ids), "obnova": obnova,
        "predavky": sum(1 for e in by_key.values() if NASTUPCE.search(e.get("label") or "")),
    })

# ---------- samostatní agenti ----------
standalone, opustene = [], 0
for tp in glob.glob(os.path.join(sess, "subagents", "agent-*.jsonl")):
    if agent_finished(last_record(tp)):
        continue
    last = mtime(tp) or now
    if now - last > OPUSTENY:
        opustene += 1
        continue
    meta = load_json(tp[: -len(".jsonl")] + ".meta.json") or {}
    popis = one_line(meta.get("description") or meta.get("agentType") or os.path.basename(tp), 60)
    standalone.append({
        "aid": os.path.basename(tp)[len("agent-"):-len(".jsonl")], "label": popis, "stav_label": popis,
        "phase": meta.get("agentType") or "", "model": meta.get("model") or "",
        "ticho": now - last, "transcript": tp,
    })

live_all = [a for w in running for a in w["live"]] + standalone

# ---------- --zprava: čísla běhu pro závěrečnou zprávu (scripts/zprava.py je vkládá do kostry) ----------
# Ceník za milion tokenů podle rodiny modelu: (vstup, výstup, čtení cache, zápis cache 5 min, zápis cache 1 h).
CENIK = (("fable", (8, 40, 0.8, 10, 16)), ("opus", (4, 20, 0.2, 5, 8)), ("sonnet", (2, 10, 0.1, 2.5, 4)), ("haiku", (1, 5, 0.1, 1.25, 2)))

def cenik_modelu(model):
    m = (model or "").lower()
    for k, c in CENIK:
        if k in m:
            return c
    return CENIK[1][1]

def usage_transkriptu(path):
    """{model: [vstup, zápis cache, čtení cache, výstup, zápis cache 1 h]}; usage z POSLEDNÍHO záznamu každé zprávy
    (message.id: agenti zapisují nejdřív blok thinking s průběžným usage), syntetické odpovědi (limit) se nepočítají."""
    zpravy, poradi = {}, []
    try:
        fh = open(path, encoding="utf-8", errors="replace")
    except OSError:
        return {}
    with fh:
        for line in fh:
            if '"usage"' not in line or '"assistant"' not in line:
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("type") != "assistant":
                continue
            m = d.get("message") or {}
            u = m.get("usage") or {}
            if not isinstance(u, dict) or not u:
                continue
            mid = m.get("id") or f"_{len(poradi)}"
            if mid not in zpravy:
                poradi.append(mid)
            zpravy[mid] = (m.get("model"), u)
    out = {}
    for mid in poradi:
        model, u = zpravy[mid]
        if not model or model == "<synthetic>":
            continue
        cc = u.get("cache_creation") if isinstance(u.get("cache_creation"), dict) else {}
        pm = out.setdefault(model, [0, 0, 0, 0, 0])
        pm[0] += cislo(u.get("input_tokens")); pm[1] += cislo(u.get("cache_creation_input_tokens"))
        pm[2] += cislo(u.get("cache_read_input_tokens")); pm[3] += cislo(u.get("output_tokens"))
        pm[4] += cislo(cc.get("ephemeral_1h_input_tokens"))
    return out

def cena_usd(pm, model):
    pi, po, pcr, p5, p1 = cenik_modelu(model)
    i, cc, cr, o, c1h = pm
    return (i * pi + o * po + cr * pcr + max(0, cc - c1h) * p5 + c1h * p1) / 1e6

if mode == "zprava":
    orch_t = sess + ".jsonl"
    agenti_t = sorted(glob.glob(os.path.join(sess, "subagents", "agent-*.jsonl"))
                      + glob.glob(os.path.join(sess, "subagents", "workflows", "wf_*", "agent-*.jsonl")))
    modely = {}
    for t in ([orch_t] if os.path.exists(orch_t) else []) + agenti_t:
        for model, pm in usage_transkriptu(t).items():
            m = modely.setdefault(model, [0, 0, 0, 0, 0])
            for k in range(5):
                m[k] += pm[k]
    cena_modelu = {m: round(cena_usd(pm, m), 2) for m, pm in modely.items()}
    marker = load_json(os.path.join(os.getcwd(), "docs", ".orchestrator-run")) or {}
    od = od_ts(marker.get("started")) if isinstance(marker, dict) else None
    casy = [t for t in (birth(p) for p in ([orch_t] if os.path.exists(orch_t) else []) + agenti_t) if t]
    if od is None and casy:
        od = min(casy)
    konce = [t for t in (mtime(p) for p in ([orch_t] if os.path.exists(orch_t) else []) + agenti_t
             + glob.glob(os.path.join(sess, "subagents", "workflows", "wf_*", "journal.jsonl"))) if t]
    do = max(konce) if konce else None
    restarty = {"stall": 0, "limit": 0, "ztrata": 0.0}
    for w in running:
        for k in restarty:
            restarty[k] += w["restarty"][k]
    for _, _, st in finished:
        r = restarty_hotove(st)
        for k in restarty:
            restarty[k] += r[k]
    _, _, compactu_ag = kontext_agentu()
    lp = predavky_z_logu()
    predavek_celkem = lp[0] if lp is not None else sum(w["predavky"] for w in running) + sum(predavky_bloku(st) for _, _, st in finished)
    bloky = {"hotovo": 0, "selhalo": 0, "podle_bloku": {}}
    rezy, kolecko = {}, None
    for end, wf, st in sorted(finished):
        args = st.get("args") if isinstance(st.get("args"), dict) else {}
        res = st.get("result") if isinstance(st.get("result"), dict) else {}
        jmeno = str(st.get("workflowName") or "workflow")
        selhal = st.get("status") != "completed" or res.get("ok") is False or res.get("vysledek") == "selhalo"
        bloky["selhalo" if selhal else "hotovo"] += 1
        pb = bloky["podle_bloku"].setdefault(jmeno, {"hotovo": 0, "selhalo": 0})
        pb["selhalo" if selhal else "hotovo"] += 1
        rez = res.get("rez") or args.get("rez")
        if "stavby" in jmeno and rez is not None:
            rezy[str(rez).zfill(2) if str(rez).isdigit() else str(rez)] = {
                "vysledek": res.get("vysledek") or ("selhalo" if selhal else "hotovo"), "pokusy": cislo(res.get("pokusy")) or None,
                "faze": res.get("faze") or None, "dvere": res.get("dvere") or None, "dosah": res.get("dosah") or None,
                "kriteria": cislo(res.get("kriteria")) or None}
        if "kolecko" in jmeno:
            kolecko = {"ok": not selhal, "faze": res.get("faze") or None, "detail": one_line(res.get("duvod") or res.get("detail") or "", 160) or None}
    def iso(t):
        return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None
    print(json.dumps({
        "session": os.path.basename(sess), "od": iso(od), "do": iso(do),
        "delka_h": round((do - od) / 3600, 1) if od and do and do > od else None,
        "cena_usd": round(sum(cena_modelu.values()), 2), "cena_podle_modelu": cena_modelu,
        "tokeny": {"vstup": sum(m[0] for m in modely.values()), "cache_zapis": sum(m[1] for m in modely.values()),
                   "cache_cteni": sum(m[2] for m in modely.values()), "vystup": sum(m[3] for m in modely.values())},
        "agentu": len(agenti_t), "orchestrator_transkript": os.path.exists(orch_t),
        "restartu_stall": restarty["stall"], "restartu_limit": restarty["limit"], "ztrata_restartu_min": round(restarty["ztrata"] / 60),
        "compactu_orchestratora": compacty_orchestratoru(), "compactu_agentu": compactu_ag, "predavek": predavek_celkem,
        "bloky": bloky, "rezy": rezy, "kolecko": kolecko,
    }, ensure_ascii=False, indent=1))
    sys.exit(0)

# ---------- --status ----------
if mode == "status":
    if not live_all:
        sys.exit(0)
    worst = max(live_all, key=lambda a: a["ticho"])
    col = "\033[31m" if worst["ticho"] > 1800 else ("\033[33m" if worst["ticho"] > 900 else "")
    end = "\033[0m" if col else ""
    ceka = ceka_ve_fronte()
    fronta = f" · fronta {ceka}" if ceka else ""
    sys.stdout.write(f"{col}▶ {len(live_all)} · {one_line(worst['stav_label'], 28)} · {ago(worst['ticho'])}{fronta}{end}")
    sys.exit(0)

# ---------- plný a krátký výpis ----------
out = []
kratce = mode == "kratce"
ctx = handoff_info()
kontext_posl, kontext_typ, compactu = kontext_agentu()
log_predavek = predavky_z_logu()
if log_predavek is not None:
    predavek = log_predavek[0]
    for w in running:   # na řádku bloku předávky celého řezu (všechny jeho bloky), kolečko pod klíčem kolecko
        klic = "kolecko" if w["name"] == "blok-kolecko" else rez_int(w["rez"])
        w["predavky"], w["predavky_rezu"] = log_predavek[1].get(klic, 0), klic != "kolecko"
else:
    predavek = sum(w["predavky"] for w in running) + sum(predavky_bloku(st) for _, _, st in finished)
compactu_orch = compacty_orchestratoru()

def vysledek_bloku(st):
    """Jedna věta o dokončeném Workflow: ✓ s výsledkem, nebo ✗ s důvodem (ne ok=False)."""
    args = st.get("args") if isinstance(st.get("args"), dict) else {}
    res = st.get("result") if isinstance(st.get("result"), dict) else {}
    jmeno = blok_jmeno(st.get("workflowName") or "workflow", args.get("rez"))
    if st.get("status") != "completed":
        return f"✗ {jmeno}: workflow {st.get('status')}"
    if res.get("ok") is False or res.get("vysledek") == "selhalo":
        duvod = res.get("duvod") or res.get("detail") or (f"fáze {res.get('faze')}" if res.get("faze") else "") or "bez důvodu"
        return f"✗ {jmeno} selhalo: {one_line(duvod, 90)}"
    detail = res.get("vysledek") or ("ok" if res.get("ok") else "")
    extra = []
    if res.get("pokusy"):
        extra.append(f"pokus {res['pokusy']}")
    if res.get("kriteria"):
        extra.append(f"{res['kriteria']} kritérií")
    rt = restarty_text(restarty_hotove(st), s_casem=False)
    return f"✓ {jmeno} {detail}".rstrip() + (f" ({', '.join(extra)})" if extra else "") + (f" · {rt}" if rt else "")

def agent_line(a, indent):
    hlava = f"{indent}{a['label']}"
    if a["model"]:
        hlava += f" · {a['model']}"
    if not a["transcript"]:
        return [hlava + " · startuje"]
    hlava += f" · píše před {ago(a['ticho'])}"
    k = kontext_posl.get(a["aid"])
    if k:
        hlava += f" · kontext {tisice(k.get('kontext'))}" + (f", compactů {k['compactu']}" if cislo(k.get("compactu")) else "")
    if kratce:
        return [hlava]
    hlava += f" · {a['phase']}" if a["phase"] else ""
    return [hlava] + [f"{indent}  {t}  {n}  {arg}".rstrip() for t, n, arg in tool_calls(a["transcript"], 5)]

if ctx and (ctx["slug"] or ctx["celkem"]):
    hl = f"Běh {ctx['slug'] or '?'} · hotovo {ctx['hotovo']} z {ctx['celkem']} řezů"
    out.append(hl)

for w in running:
    nazev = ctx["nazev"].get(rez_int(w["rez"])) if ctx and w["rez"] else None
    hl = f"▶ {blok_jmeno(w['name'], w['rez'])}" + (f" „{one_line(nazev, 40)}“" if nazev else "")
    if w["pokus"] and w["pokus"] > 1:
        hl += f" · pokus {w['pokus']}"
    if w["obnova"]:
        hl += f" · obnovený v {local_hm(w['obnova']['od'])} po {w['obnova']['po']}"
    hl += f" · běží {doba(now - w['start'])}"
    if w["cur"]:
        idx = f"{w['faze'].index(w['cur']) + 1}/{len(w['faze'])} " if w["faze"] and w["cur"] in w["faze"] else ""
        hl += f" · fáze {idx}{w['cur']} ({doba(now - w['faze_start'])})"
    if w["hotove_faze"]:
        hl += f" · hotové: {', '.join(w['hotove_faze'])}"
    rt = restarty_text(w["restarty"])
    if rt:
        hl += f" · {rt}"
    if w["predavky"]:
        hl += f" · předávek {'řezu ' if w.get('predavky_rezu') else ''}{w['predavky']}"
    out.append(hl)
    for a in sorted(w["live"], key=lambda a: -a["ticho"]):
        out.extend(agent_line(a, "    "))
    if not w["live"]:
        out.append("    žádný živý agent (mezi fázemi, nebo Workflow skončil bez stavového souboru)")

if standalone:
    out.append("Samostatní agenti mimo Workflow:")
    for a in sorted(standalone, key=lambda a: -a["ticho"]):
        out.extend(agent_line(a, "    "))

nedavne = [(end, wf, st) for end, wf, st in sorted(finished, reverse=True) if now - end <= HOTOVO_OKNO][:4]
for end, wf, st in nedavne:
    out.append(f"{vysledek_bloku(st)} · před {ago(now - end)}")

# „nic neběží“ jen bez běžícího Workflow; běžící blok mezi agenty má u sebe „žádný živý agent“
if not live_all and not running:
    veta = "nic neběží"
    if finished and not nedavne:
        end, wf, st = max(finished)
        veta += f" · poslední Workflow: {vysledek_bloku(st)}, skončil před {ago(now - end)}"
    if opustene:
        veta += f" · opuštěných transkriptů agentů bez konce (ticho > 3 h): {opustene}"
    out.insert(1 if out and out[0].startswith("Běh ") else 0, veta)
else:
    mlci = [a for a in live_all if a["ticho"] > TICHO_VAROVANI]
    if mlci:
        out.append("⚠ mlčí přes 20 min: " + ", ".join(f"{one_line(a['label'], 48)} ({ago(a['ticho'])})" for a in sorted(mlci, key=lambda a: -a["ticho"])))
    elif live_all and not kratce:
        out.append("žádný agent nemlčí déle než 20 min")
    if opustene and not kratce:
        out.append(f"(opuštěných transkriptů agentů bez konce a s tichem přes 3 h: {opustene}, nepočítají se)")

souhrn = []
if kontext_typ:
    souhrn.append("nejvýš " + ", ".join(f"{t} {tisice(v)}" for t, v in sorted(kontext_typ.items(), key=lambda x: -x[1])[:6]))
    souhrn.append(f"compactů {compactu}")
if kontext_typ or predavek:
    souhrn.append(f"předávek {predavek}")
if compactu_orch:
    souhrn.append(f"compactů orchestrátora {compactu_orch}")
if souhrn:
    out.append("kontext agentů: " + " · ".join(souhrn))

fr = fronta_tezkych()
if fr and (fr["drzi"] or fr["fronta"]):
    radek = "fronta těžkých příkazů: " + (f"drží {prikazy(fr['drzi'])}" if fr["drzi"] else "nic nedrží")
    if fr["fronta"]:
        cekani = [now - t for t in (od_ts(x.get("od")) for x in fr["fronta"]) if t]
        radek += f" · čeká {len(fr['fronta'])}" + (f", nejdéle {ago(max(cekani))}" if cekani else "")
    out.append(radek)

if kratce and len(out) > 12:
    out = out[:11] + [f"… a {len(out) - 11} dalších řádků (plný výpis: co-dela.sh bez --kratce)"]
print("\n".join(out))
PY
exit 0
