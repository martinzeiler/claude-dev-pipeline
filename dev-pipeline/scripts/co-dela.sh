#!/usr/bin/env bash
# dev-pipeline: co právě dělají agenti běžící session Claude Code.
# Čte jen soubory session na disku (journal Workflow, metadata a konce transkriptů agentů); žádný model nevolá,
# žádný obsah odpovědí, diffů ani výsledků nevypisuje: jen labely, fáze, modely, časy a jména volání nástrojů.
#
#   co-dela.sh                 orchestrátor v cronu: session z docs/.orchestrator-run v aktuálním cwd, plný výpis
#   co-dela.sh --kratce        totéž do 12 řádků (cron „zkontroluj stav běhu“); dokončené Workflow jedním řádkem
#   co-dela.sh --status        segment pro status line; JSON status line na stdin (transcript_path), bez nového řádku
#   co-dela.sh --session <dir>       ruční použití: adresář session ~/.claude/projects/<slug>/<session_id>
#   co-dela.sh --transcript <p.jsonl> ruční použití: transkript session (adresář = cesta bez .jsonl)
#
# Jak se pozná stav (ověřeno na Claude Code 2.1.274):
#   Workflow: <session>/subagents/workflows/<wf>/journal.jsonl (launched / started {agentId,label,phase} / result / failed);
#     stavový soubor <session>/workflows/<wf>.json vzniká až při doběhnutí (status completed|failed|killed),
#     takže Workflow bez stavového souboru běží; živý agent = started bez result/failed.
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
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
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

CO_DELA_SESSION="$sess" CO_DELA_MODE="$mode" python3 - <<'PY' 2>/dev/null || true
import glob, json, os, re, sys, time
from datetime import datetime, timezone

sess = os.environ["CO_DELA_SESSION"]
mode = os.environ["CO_DELA_MODE"]
now = time.time()
TERMINAL = {"completed", "failed", "killed", "cancelled"}
TICHO_VAROVANI = 20 * 60      # ⚠ pro agenty mlčící déle
OPUSTENY = 3 * 3600           # samostatný agent bez konce a s takovým tichem se nepočítá za živého
HOTOVO_OKNO = 2 * 3600        # dokončené Workflow, které --kratce ještě připomene

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

# ---------- Workflow ----------
running, finished = [], []
for d in sorted(glob.glob(os.path.join(sess, "subagents", "workflows", "wf_*"))):
    wf = os.path.basename(d)
    state_path = os.path.join(sess, "workflows", wf + ".json")
    state = load_json(state_path) if os.path.exists(state_path) else None
    if state and state.get("status", "completed") in TERMINAL:
        finished.append((mtime(state_path) or 0, wf, state))
        continue
    journal = os.path.join(d, "journal.jsonl")
    if not os.path.exists(journal):
        continue
    started, done = {}, set()
    for e in jsonl(tail_lines(journal, 4 * 1024 * 1024)):
        t, aid = e.get("type"), e.get("agentId")
        if t == "started" and aid:
            started[aid] = e
        elif t in ("result", "failed") and aid:
            done.add(aid)
    live = []
    for aid, e in started.items():
        if aid in done:
            continue
        tp = os.path.join(d, f"agent-{aid}.jsonl")
        meta = load_json(os.path.join(d, f"agent-{aid}.meta.json")) or {}
        last = mtime(tp) or mtime(journal) or now
        live.append({
            "label": e.get("label") or meta.get("description") or aid,
            "phase": e.get("phase") or meta.get("workflowPhase") or "",
            "model": meta.get("model") or "",
            "ticho": now - last,
            "transcript": tp if os.path.exists(tp) else None,
        })
    scripts = glob.glob(os.path.join(sess, "workflows", "scripts", f"*-{wf}.js"))
    name = os.path.basename(scripts[0])[: -len(f"-{wf}.js")] if scripts else "workflow"
    running.append({
        "wf": wf, "name": name, "rez": rez_z([a["label"] for a in live] + [e.get("label") for e in started.values()]),
        "start": birth(journal) or now, "hotovo": len(done), "live": live,
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
    standalone.append({
        "label": one_line(meta.get("description") or meta.get("agentType") or os.path.basename(tp), 60),
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
    sys.stdout.write(f"{col}▶ {len(live_all)} · {one_line(worst['label'], 28)} · {ago(worst['ticho'])}{end}")
    sys.exit(0)

# ---------- plný a krátký výpis ----------
out = []
kratce = mode == "kratce"
calls_n = 1 if kratce else 5

def agent_lines(a, indent="  "):
    hlava = f"{indent}{a['label']}"
    if a["phase"]:
        hlava += f"  ·  {a['phase']}"
    if a["model"]:
        hlava += f"  ·  {a['model']}"
    hlava += f"  ·  poslední zápis před {ago(a['ticho'])}" if a["transcript"] else "  ·  startuje"
    calls = tool_calls(a["transcript"], calls_n) if a["transcript"] else []
    if kratce:
        if calls:
            hlava += f"  ·  {calls[-1][1]} {calls[-1][2]}".rstrip()
        return [hlava]
    return [hlava] + [f"{indent}  {t}  {n}  {arg}".rstrip() for t, n, arg in calls]

for w in running:
    rez = f" řez {w['rez']}" if w["rez"] else ""
    out.append(f"▶ {w['name']}{rez} ({w['wf'][:11]})  běží {doba(now - w['start'])} · {w['hotovo']} agentů hotovo, {len(w['live'])} běží")
    for a in sorted(w["live"], key=lambda a: -a["ticho"]):
        out.extend(agent_lines(a))
    if not w["live"]:
        out.append("  žádný živý agent (mezi fázemi, nebo Workflow skončil bez stavového souboru)")

if standalone:
    out.append("Samostatní agenti mimo Workflow:")
    for a in sorted(standalone, key=lambda a: -a["ticho"]):
        out.extend(agent_lines(a))

if kratce:
    for end, wf, st in sorted(finished, reverse=True)[:3]:
        if now - end > HOTOVO_OKNO:
            continue
        args = st.get("args") if isinstance(st.get("args"), dict) else {}
        res = st.get("result") if isinstance(st.get("result"), dict) else {}
        rez = f" řez {args.get('rez')}" if args.get("rez") else ""
        vys = f"ok={res.get('ok')}" + (f" vysledek={res.get('vysledek')}" if "vysledek" in res else "")
        if st.get("status") != "completed":
            vys = st.get("status")
        out.append(f"hotovo: {st.get('workflowName') or 'workflow'}{rez} (task {st.get('taskId')}, {wf[:11]}) → {vys} (před {ago(now - end)})")

if not live_all:
    veta = "nic neběží"
    if finished:
        end, wf, st = max(finished)
        args = st.get("args") if isinstance(st.get("args"), dict) else {}
        res = st.get("result") if isinstance(st.get("result"), dict) else {}
        rez = f" řez {args.get('rez')}" if args.get("rez") else ""
        vys = f"ok={res.get('ok')}" + (f", vysledek={res.get('vysledek')}" if "vysledek" in res else "")
        if st.get("status") != "completed":
            vys = f"status={st.get('status')}"
        veta += f" · poslední Workflow: {st.get('workflowName') or 'workflow'}{rez} ({wf[:11]}, task {st.get('taskId')}) → {vys}, skončil před {ago(now - end)}"
    if opustene:
        veta += f" · opuštěných transkriptů agentů bez konce (ticho > 3 h): {opustene}"
    out.insert(0, veta)
else:
    mlci = [a for a in live_all if a["ticho"] > TICHO_VAROVANI]
    if mlci:
        out.append("⚠ mlčí přes 20 min: " + ", ".join(f"{one_line(a['label'], 30)} ({ago(a['ticho'])})" for a in sorted(mlci, key=lambda a: -a["ticho"])))
    else:
        out.append("žádný agent nemlčí déle než 20 min")
    if opustene and not kratce:
        out.append(f"(opuštěných transkriptů agentů bez konce a s tichem přes 3 h: {opustene}, nepočítají se)")

if kratce and len(out) > 12:
    out = out[:11] + [f"… a {len(out) - 11} dalších řádků (plný výpis: co-dela.sh bez --kratce)"]
print("\n".join(out))
PY
exit 0
