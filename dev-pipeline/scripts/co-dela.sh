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
#   co-dela.sh --session <dir>       ruční použití: adresář session ~/.claude/projects/<slug>/<session_id>
#   co-dela.sh --transcript <p.jsonl> ruční použití: transkript session (adresář = cesta bez .jsonl)
#
# Jak se pozná stav (ověřeno na Claude Code 2.1.274):
#   Workflow: <session>/subagents/workflows/<wf>/journal.jsonl (launched / started {agentId,label,phase} / result / failed);
#     stavový soubor <session>/workflows/<wf>.json vzniká až při doběhnutí (status completed|failed|killed),
#     takže Workflow bez stavového souboru běží; živý agent = POSLEDNÍ started daného key bez result/failed
#     (stall watchdog restartuje agenta se stejným key a novým agentId; starý started bez result není živý agent).
#     Obnova přes resumeFromRunId píše do téhož journalu a stavový soubor přerušeného běhu přepíše až při doběhnutí:
#     journal o víc než 5 s novější než stavový soubor = obnovený běh, který běží.
#   Labely agentů podle spec 1.4.0 § 1.1 (části, kontrakt, integrace, oprava, nástupce po předávce :nN) se vypisují
#     čitelně (implement řez 05 · část K2 · pokus 1 · nástupce 2); předávky = labely nástupců, u doběhlých bloků
#     pole predavky výsledku nebo log „předávka“.
#   Kontext agentů z docs/.kontext.jsonl v cwd (hook hlídač kontextu): u živého agenta poslední záznam jeho agent_id,
#     v souhrnu nejvyšší kontext podle typu agenta a compacty, jen za agenty této session.
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
# Journal o víc sekund novější než stavový soubor = Workflow obnovený pod stejným ID a běží. V běhu bez-dluhu ležel
# stavový soubor přerušeného kolečka (10:12) do konce obnoveného běhu (11:50) a co-dela 3× hlásil „nic neběží“;
# u doběhlých Workflow končí journal i stavový soubor do 1 s (78 Workflow ze dvou běhů Surya).
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

# ---------- labely (spec 1.4.0 § 1.1) ----------
# typ:řez NN[:část K|:kontrakt|:integrace|:oprava][:číslo][:písmeno]; nástupce po předávce má na konci :n2 až :n4.
# Holé číslo znamená podle typu pokus, kolo review, běh nebo balíček oprav; za „oprava“ je to vždy pokus.
CISLO_JAKO = {"implement": "pokus", "review": "kolo", "prd-check": "kolo", "verify": "běh", "deploy": "běh", "e2e": "běh",
              "kriteria": "běh", "fix-e2e": "běh", "fix": "balíček"}
NASTUPCE = re.compile(r":n\d+$")
POKUS = re.compile(r"implement:řez\s*[0-9a-z]+:(?:[^:]+:)?(\d+)(?::n\d+)?$")

def citelny(label):
    """implement:řez 05:část K2:1:n2 → implement řez 05 · část K2 · pokus 1 · nástupce 2 (neznámé kusy beze změny)."""
    kusy = str(label or "").split(":")
    typ, hlava, dal = kusy[0], kusy[0], []
    for i, k in enumerate(kusy[1:], 1):
        if i == len(kusy) - 1 and re.fullmatch(r"n\d+", k):
            dal.append(f"nástupce {k[1:]}")
        elif i == 1 and re.fullmatch(r"řez\s*\S+|kolečko", k):
            hlava += " " + k
        elif re.fullmatch(r"K\d+", k):
            dal.append(f"část {k}")
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
for d in sorted(glob.glob(os.path.join(sess, "subagents", "workflows", "wf_*"))):
    wf = os.path.basename(d)
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
    restarty = len(poradi) - len(by_key)
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
predavek = sum(w["predavky"] for w in running) + sum(predavky_bloku(st) for _, _, st in finished)

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
    return f"✓ {jmeno} {detail}".rstrip() + (f" ({', '.join(extra)})" if extra else "")

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
    if w["restarty"]:
        hl += f" · restartů po stallu {w['restarty']}"
    if w["predavky"]:
        hl += f" · předávek {w['predavky']}"
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
