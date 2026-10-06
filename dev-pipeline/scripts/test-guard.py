#!/usr/bin/env python3
"""Test guard-blast-radius.sh: datový heredoc a text v příkazu (commit message, grep) projdou, skutečná akce blokuje."""
import json, os, subprocess, sys, tempfile, shutil

HOOK = "/Users/martinzeiler/claude-dev-pipeline/dev-pipeline/hooks/guard-blast-radius.sh"
proj = tempfile.mkdtemp(prefix="guardtest")
os.makedirs(os.path.join(proj, "docs"), exist_ok=True)
open(os.path.join(proj, "docs", ".orchestrator-run"), "w").close()

D = "EOF"
RAILWAY = "railway" + " up"          # skládané, ať to není literál v tomhle souboru omylem spuštěné
WRANGLER = "wrangler pages " + "deploy"
RESET = "git reset " + "--hard"

CASES = [
    # (popis, příkaz, ma_blokovat)
    ("zápis do journalu o nasazení",
     f"cat >> docs/journal.md <<'{D}'\nRez 07: nasazeno pres {RAILWAY} na 3. pokus.\nRollback: {RESET} abc123.\n{D}\n", False),
    ("follow-ups s textem o deployi",
     f"cat >> docs/follow-ups.md <<'{D}'\n- zvazit {WRANGLER} pro portal\n{D}\n", False),
    ("tee do reportu",
     f"tee docs/reviews/r.md <<'{D}'\nnalez: {RAILWAY} selhal 13x\n{D}\n", False),
    ("heredoc s odsazenym ukoncenim (<<-)",
     f"cat >> docs/journal.md <<-{D}\n  text o {RAILWAY}\n  {D}\n", False),
    ("herestring neni heredoc",
     "grep -q neco <<< \"jen text\"", False),
    ("bezny prikaz", "git status --short", False),
    # třída F: gate čte spouštěný příkaz, ne text (commit message, grep runbooku, výpis nasazení z deploy.md)
    ("commit message o nasazeni", f'git commit -m "rez 07: nasazeno pres {RAILWAY}"', False),
    ("grep runbooku", f'grep "{RAILWAY}" docs/dev-runbook.md', False),
    ("wrangler pages deployment list", "npx wrangler pages " + "deployment list --project-name web", False),

    ("holy railway up", f"{RAILWAY} --service API", True),
    ("railway up za &&", f"cd apps/api && {RAILWAY}", True),
    ("deploy skryty v heredocu do shellu",
     f"bash <<'{D}'\n{RAILWAY} --service API\n{D}\n", True),
    ("wrangler pages deploy", f"npx {WRANGLER} dist --project-name x", True),
    ("wrangler deploy (Workers)", "npx wrangler " + "deploy", True),
    ("deploy s promennou prostredi a pnpm exec", f"CLOUDFLARE_ACCOUNT_ID=x pnpm --filter web exec {WRANGLER} dist", True),
    ("deploy v retezci pro shell", f"bash -c '{RAILWAY} --service API'", True),
    ("force push", "git push --force origin main", True),
    # 1.6.0: checkout/restore v klonu mimo projekt (po cd nebo git -C) není vracení cizí práce; v projektu ano
    ("checkout v klonu po cd s promennou",
     "S=/private/tmp/claude-501/x/scratchpad/sim; cd $S && git checkout -q -- docs scripts", False),
    ("checkout v klonu po absolutnim cd", "cd /private/tmp/claude-501/x/scratchpad/klon; git checkout -q docs/vize/a.md", False),
    ("restore pres git -C mimo projekt", "git -C /tmp/dp-klon restore .", False),
    ("checkout docs v projektu", "git checkout -- docs/vize-spory.md", True),
    ("cd mimo a zpet do projektu", "cd /tmp/dp-klon && cd {proj} && git restore docs/handoff.md", True),
    ("stash v projektu", "git stash push -m x -- eslint.config.js", True),
    # review 1.6.0, N1: stav „mimo projekt“ nepřežije konec subshellu ani cd zpět; neznámý adresář blokuje
    ("cd v subshellu, pak stash v projektu", "(cd /tmp && ls); git stash", True),
    ("cd - zpet do projektu", "cd /tmp; cd -; git checkout -- docs/", True),
    ("cd na $CLAUDE_PROJECT_DIR", "cd /tmp && cd \"$CLAUDE_PROJECT_DIR\" && git stash", True),
    ("stash v subshellu v klonu", "(cd /tmp/klon && git stash)", False),
    # review 1.6.0, N6: samoodkazující přiřazení nesmí rozvoj zacyklit (timeout níž = selhání, ne visící test)
    ("samoodkazujici prirazeni", "S=$S/x; cd $S; git stash", True),
]

fails = 0
for popis, cmd, ma_blokovat in CASES:
    cmd = cmd.replace("{proj}", proj)
    payload = json.dumps({"tool_input": {"command": cmd}, "cwd": proj})
    try:
        r = subprocess.run(["/bin/bash", HOOK], input=payload, capture_output=True, text=True, timeout=5,
                           env={**os.environ, "CLAUDE_PROJECT_DIR": proj})
        blokoval = (r.returncode == 2)
    except subprocess.TimeoutExpired:
        r, blokoval = None, None  # hook visí: v Claude Code by po timeoutu příkaz prošel bez kontroly
    ok = (blokoval == ma_blokovat)
    if not ok:
        fails += 1
    stav = "VISI  " if blokoval is None else "BLOK  " if blokoval else "projde"
    print(f"{'OK ' if ok else 'CHYBA'}  {stav}  {popis}" + ("" if ok else f"   [ocekavano {'BLOK' if ma_blokovat else 'projde'}]"))
    if not ok and r is not None and r.stderr:
        print("        stderr:", r.stderr.strip()[:160])

shutil.rmtree(proj, ignore_errors=True)
print()
print("VSE OK" if fails == 0 else f"SELHALO {fails} pripadu")
sys.exit(1 if fails else 0)
