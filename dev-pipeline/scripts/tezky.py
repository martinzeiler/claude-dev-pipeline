#!/usr/bin/env python3
"""dev-pipeline: fronta těžkých příkazů s rozpočtem vah.

Obal z hooku hooks/fronta-tezkych.sh volá `vezmi` před těžkým příkazem (suita testů, typecheck celého repa, instalace,
build, git commit s pre-commit branou) a `vrat` po něm. Souběžné části řezu tak stroj nezahltí: myšlení agentů běží na
serverech, 8 jader a 16 GB zatěžují jen místní příkazy (analýza běhu bez-dluhu 5.14). Váhy dává hook, rozpočet 6 z 8 jader.

  tezky.py vezmi --vaha N --pid PID [--popis TEXT]   čeká na místo (přísné FIFO); 0 = drží místo, 75 = vypršelo čekání
  tezky.py vrat --pid PID                             uvolní místo i frontu toho PID
  tezky.py stav                                       JSON {"drzi": [...], "fronta": [...]} pro co-dela.sh

Záznam: {pid, vaha, popis, od}, od = epoch v sekundách (drzi: od kdy drží, fronta: od kdy čeká). PID je shell obalu:
když ho zabije timeout Bash nástroje, jeho záznam se uvolní sám při dalším volání (mrtvý PID).
Stav: ${TMPDIR:-/tmp}/dev-pipeline-tezky/stav.json pod fcntl.flock nad souborem zamek.
Parametry z prostředí: DEV_PIPELINE_TEZKY_ROZPOCET (6), DEV_PIPELINE_TEZKY_MAX_CEKANI v sekundách (300),
DEV_PIPELINE_TEZKY_KROK v sekundách (2; menší jen pro testy). Jen standardní knihovna, python3 z macOS je 3.9.
"""
import argparse
import fcntl
import json
import os
import subprocess
import sys
import time
from contextlib import contextmanager


def _adresar():
    tmp = os.environ.get('TMPDIR')
    if not tmp and sys.platform == 'darwin':
        # Cron TMPDIR nemá; hooky a Bash nástroj Claude Code mají uživatelský temp z launchd a co-dela.sh z cronu
        # musí číst tentýž stav, jinak by frontu ukazoval vždy prázdnou.
        try:
            tmp = subprocess.run(['getconf', 'DARWIN_USER_TEMP_DIR'], capture_output=True, text=True).stdout.strip()
        except OSError:
            tmp = ''
    return os.path.join(tmp or '/tmp', 'dev-pipeline-tezky')


def _cislo(jmeno, vychozi):
    try:
        return float(os.environ.get(jmeno) or vychozi)
    except ValueError:
        return float(vychozi)


ADR = _adresar()
STAV = os.path.join(ADR, 'stav.json')
ROZPOCET = max(1, int(_cislo('DEV_PIPELINE_TEZKY_ROZPOCET', 6)))
MAX_CEKANI = _cislo('DEV_PIPELINE_TEZKY_MAX_CEKANI', 300)
KROK = max(0.05, _cislo('DEV_PIPELINE_TEZKY_KROK', 2))
VYPRSELO = 75


@contextmanager
def zamceno():
    os.makedirs(ADR, exist_ok=True)
    with open(os.path.join(ADR, 'zamek'), 'a') as z:
        fcntl.flock(z, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(z, fcntl.LOCK_UN)


def nacti():
    try:
        with open(STAV, encoding='utf-8') as f:
            s = json.load(f)
        if isinstance(s, dict) and isinstance(s.get('drzi'), list) and isinstance(s.get('fronta'), list):
            return s
    except (OSError, ValueError):
        pass
    return {'drzi': [], 'fronta': []}


def uloz(s):
    obsah = json.dumps(s, ensure_ascii=False)
    try:  # beze změny se nepíše: stav volá status line co-dela.sh každých 30 s, čekající vezmi každý krok
        with open(STAV, encoding='utf-8') as f:
            if f.read() == obsah:
                return
    except (OSError, ValueError):
        pass
    docasny = '%s.%d' % (STAV, os.getpid())
    with open(docasny, 'w', encoding='utf-8') as f:
        f.write(obsah)
    os.replace(docasny, STAV)


def zije(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except (OSError, OverflowError):
        return False
    return True


def uklid(s):
    """Smaže záznamy mrtvých PID (shell zabitý timeoutem nebo obal, který nedošel k vrat) a poškozené záznamy."""
    for k in ('drzi', 'fronta'):
        s[k] = [z for z in s[k] if isinstance(z, dict) and isinstance(z.get('pid'), int) and z['pid'] > 0
                and isinstance(z.get('vaha'), int) and zije(z['pid'])]


def vezmi(vaha, pid, popis, max_cekani=MAX_CEKANI):
    vaha = max(1, min(vaha, ROZPOCET))  # váha nad rozpočtem by nikdy nedostala místo
    zacatek = time.time()
    while True:
        with zamceno():
            s = nacti()
            uklid(s)
            if any(z['pid'] == pid for z in s['drzi']):  # tentýž shell už místo drží
                uloz(s)
                break
            ja = next((z for z in s['fronta'] if z['pid'] == pid), None)
            if ja is None:
                ja = {'pid': pid, 'vaha': vaha, 'popis': popis, 'od': int(time.time())}
                s['fronta'].append(ja)
            obsazeno = sum(z['vaha'] for z in s['drzi'])
            # Přísné FIFO: místo dostane jen první ve frontě, když se vejde, nebo když nic neběží.
            if s['fronta'][0] is ja and (obsazeno + ja['vaha'] <= ROZPOCET or not s['drzi']):
                s['fronta'].pop(0)
                ja['od'] = int(time.time())
                s['drzi'].append(ja)
                uloz(s)
                break
            cekam = time.time() - zacatek
            if cekam >= max_cekani:
                s['fronta'] = [z for z in s['fronta'] if z['pid'] != pid]
                uloz(s)
                bezi = ', '.join('%s (váha %s)' % (z.get('popis') or '?', z['vaha']) for z in s['drzi']) or 'nic'
                print('fronta těžkých příkazů: po %d s pořád běží %s; příkaz se nespustil, zopakuj ho' % (cekam, bezi),
                      file=sys.stderr)
                return VYPRSELO
            uloz(s)
        time.sleep(KROK)
    cekal = time.time() - zacatek
    if cekal > 5:
        print('fronta těžkých příkazů: čekal jsem %d s' % cekal, file=sys.stderr)
    return 0


def vrat(pid):
    with zamceno():
        s = nacti()
        for k in ('drzi', 'fronta'):
            s[k] = [z for z in s[k] if not (isinstance(z, dict) and z.get('pid') == pid)]
        uklid(s)
        uloz(s)
    return 0


def stav():
    with zamceno():
        s = nacti()
        uklid(s)
        uloz(s)
    print(json.dumps({'drzi': s['drzi'], 'fronta': s['fronta']}, ensure_ascii=False))
    return 0


def main():
    p = argparse.ArgumentParser(description='dev-pipeline: fronta těžkých příkazů')
    sub = p.add_subparsers(dest='prikaz')
    pv = sub.add_parser('vezmi')
    pv.add_argument('--vaha', type=int, required=True)
    pv.add_argument('--pid', type=int, required=True)
    pv.add_argument('--popis', default='')
    pv.add_argument('--max-cekani', type=int, default=0, help='strop čekání v s; menší z něj a z prostředí')
    pr = sub.add_parser('vrat')
    pr.add_argument('--pid', type=int, required=True)
    sub.add_parser('stav')
    a = p.parse_args()
    if a.prikaz is None:
        p.print_help(sys.stderr)
        return 2
    try:
        if a.prikaz == 'vezmi':
            if a.pid <= 0:
                return 0
            return vezmi(a.vaha, a.pid, a.popis, min(MAX_CEKANI, a.max_cekani) if a.max_cekani > 0 else MAX_CEKANI)
        if a.prikaz == 'vrat':
            return vrat(a.pid)
        return stav()
    except OSError as e:
        # Fail-open: rozbitá fronta (plný disk, práva k TMPDIR) nesmí zastavit práci; příkaz poběží bez fronty.
        print('fronta těžkých příkazů: nefunguje (%s), příkaz běží bez fronty' % e, file=sys.stderr)
        return 0


if __name__ == '__main__':
    sys.exit(main())
