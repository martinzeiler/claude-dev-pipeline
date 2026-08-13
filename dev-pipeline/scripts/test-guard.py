#!/usr/bin/env python3
"""Test guard-blast-radius.sh: datový heredoc projde, skutečná akce blokuje."""
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

    ("holy railway up", f"{RAILWAY} --service API", True),
    ("railway up za &&", f"cd apps/api && {RAILWAY}", True),
    ("deploy skryty v heredocu do shellu",
     f"bash <<'{D}'\n{RAILWAY} --service API\n{D}\n", True),
    ("wrangler pages deploy", f"npx {WRANGLER} dist --project-name x", True),
    ("force push", "git push --force origin main", True),
]

fails = 0
for popis, cmd, ma_blokovat in CASES:
    payload = json.dumps({"tool_input": {"command": cmd}, "cwd": proj})
    r = subprocess.run(["bash", HOOK], input=payload, capture_output=True, text=True,
                       env={**os.environ, "CLAUDE_PROJECT_DIR": proj})
    blokoval = (r.returncode == 2)
    ok = (blokoval == ma_blokovat)
    if not ok:
        fails += 1
    stav = "BLOK  " if blokoval else "projde"
    print(f"{'OK ' if ok else 'CHYBA'}  {stav}  {popis}" + ("" if ok else f"   [ocekavano {'BLOK' if ma_blokovat else 'projde'}]"))
    if not ok and r.stderr:
        print("        stderr:", r.stderr.strip()[:160])

shutil.rmtree(proj, ignore_errors=True)
print()
print("VSE OK" if fails == 0 else f"SELHALO {fails} pripadu")
sys.exit(1 if fails else 0)
