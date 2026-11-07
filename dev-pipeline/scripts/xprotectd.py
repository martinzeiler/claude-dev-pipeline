#!/usr/bin/env python3
"""Řádek do výpisu co-dela.sh: velikost xprotectd na macOS a jestli je tato session pod jeho sledováním.

xprotectd restartuje jen restart počítače a ukončení session jeho paměť nevrací, proto rada zní na restart počítače.
Sledování se pozná z ceny spuštění procesu: ve sledované session je příkaz s dlouhým argumentem řádově pomalejší
než krátký, mimo ni stejně rychlý. Měří se ve stromu procesů volajícího, tedy session, ze které skript běží.

  xprotectd.py                          změří a vypíše řádek; mimo macOS, bez procesu a po chybě měření velikosti nic
  xprotectd.py --hodnoty <mem> <pomer>  řádek pro zadané hodnoty (testy): sloupec mem z top, poměr, nebo - bez poměru
"""
import os
import re
import secrets
import statistics
import subprocess
import sys
import time

PRAH_PAUZA_GB = 8
PRAH_HNED_GB = 16
POMER_SLEDOVANI = 3
VZORKU = 15
DELKA_ARGUMENTU_BAJTU = 1024   # hexadecimálně 2 kB
GB_ZA_JEDNOTKU = {"B": 1 / 1024**3, "K": 1 / 1024**2, "M": 1 / 1024, "G": 1, "T": 1024}


def gigabajty(mem):
    """Sloupec mem z top (56M, 117M+, 2.4G) v GB; nečitelná hodnota dá None."""
    m = re.match(r"(\d+(?:\.\d+)?)([BKMGT])", mem or "")
    return float(m.group(1)) * GB_ZA_JEDNOTKU[m.group(2)] if m else None


def zmer_mem():
    """Footprint z top, ne RSS z ps: RSS nezahrnuje komprimovanou a odloženou paměť."""
    try:
        pid = subprocess.run(["/usr/bin/pgrep", "-x", "xprotectd"], capture_output=True, text=True, timeout=3).stdout.split()
        if not pid:
            return None
        vystup = subprocess.run(
            ["/usr/bin/top", "-l", "1", "-pid", pid[0], "-stats", "mem"], capture_output=True, text=True, timeout=6
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    radky = vystup.strip().splitlines()
    return radky[-1].strip() if radky else None


def doba_spusteni(argv):
    zacatek = time.perf_counter()
    pid = os.posix_spawn(argv[0], argv, {})
    os.waitpid(pid, 0)
    return time.perf_counter() - zacatek


def zmer_pomer():
    """Poměr mediánů doby spuštění s dlouhým a krátkým argumentem. Vzorky se střídají, aby přechodná zátěž stroje
    dopadla na oba; argument je pokaždé jiný, aby výsledek nezkreslila případná keš."""
    kratke, dlouhe = [], []
    try:
        for _ in range(VZORKU):
            kratke.append(doba_spusteni(["/usr/bin/true"]))
            dlouhe.append(doba_spusteni(["/usr/bin/true", secrets.token_hex(DELKA_ARGUMENTU_BAJTU)]))
    except OSError:
        return None
    return statistics.median(dlouhe) / statistics.median(kratke)


def velikost(gb):
    return f"{gb:.1f} GB".replace(".", ",") if gb >= 1 else f"{round(gb * 1024)} MB"


def radek(gb, pomer):
    casti = [f"xprotectd {velikost(gb)}"]
    if pomer is not None:
        casti.append(
            f"session sledovaná (dlouhé příkazy {round(pomer)}× pomalejší; pomůže ji ukončit a obnovit v nové záložce)"
            if pomer >= POMER_SLEDOVANI
            else "session nesledovaná"
        )
    if gb >= PRAH_HNED_GB:
        casti.append("restartuj počítač co nejdřív")
    elif gb >= PRAH_PAUZA_GB:
        casti.append("restartuj počítač při nejbližší pauze mezi bloky")
    return ("⚠ " if gb >= PRAH_PAUZA_GB else "") + " · ".join(casti)


def main():
    if sys.argv[1:2] == ["--hodnoty"]:
        gb, pomer = gigabajty(sys.argv[2]), None if sys.argv[3] == "-" else float(sys.argv[3])
    elif sys.platform == "darwin":
        gb = gigabajty(zmer_mem())
        pomer = zmer_pomer() if gb is not None else None
    else:
        return
    if gb is not None:
        print(radek(gb, pomer))


if __name__ == "__main__":
    main()
