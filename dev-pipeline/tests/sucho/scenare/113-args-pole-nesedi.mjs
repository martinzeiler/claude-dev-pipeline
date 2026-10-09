// 113 · stavba · 1.7.0 (spec § 1.4): kontrola opisu proti _pole. Načítací agent vynechá kontrakt_potreba a přidá vymyšlené pole
// (třída rezim: "config" z běhu sonnet-5-5); blok načte znovu se zadáním, co chybělo a co bylo navíc. Druhý rozdíl = ok: false,
// nic dalšího se nespustí. Prázdné navíc vrácené pole (prd_stale: []) rozdílem není.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const POLE = ['cwd', 'e2e_path', 'kontrakt_potreba', 'kriteria', 'plugin_root', 'prd_path', 'rez', 'runbook', 'runtime_dopad', 'vize', 'deploy_mode']

export default {
  nazev: 'opis args nesedí se _pole ani napodruhé',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '05', _pole: POLE, rezim: 'config', prd_stale: [] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(v && /opis nesedí/.test(v.duvod || '') && /kontrakt_potreba/.test(v.duvod) && /rezim/.test(v.duvod) && !/prd_stale/.test(v.duvod), `duvod: ${v && v.duvod}`)
    const a = k.pocet(/^args:řez 05$/, 2, 'načtení a jedno nové načtení')
    if (a.length === 2) { k.obsahuje(a[1], 'minule chybělo: kontrakt_potreba', 'co chybělo'); k.obsahuje(a[1], 'navíc bylo: rezim', 'co bylo navíc') }
    k.nic(/^(implement|prd-refresh|review|verify|deploy)/, 'blok po nesedícím opisu nic nespouští')
    return k.chyby
  },
}
