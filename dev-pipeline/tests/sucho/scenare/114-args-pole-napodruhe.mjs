// 114 · stavba · 1.7.0 (spec § 1.4): první opis nesedí se _pole, druhé načtení sedí a blok proběhne; soubor bez _pole (starší
// skript) projde s logem bez kontroly (pokrývají ho i všechny starší scénáře s args_file).
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const POLE = ['cwd', 'e2e_path', 'kriteria', 'max_pokusu', 'plugin_root', 'prd_path', 'rez', 'runbook', 'runtime_dopad', 'vize', 'deploy_mode']

export default {
  nazev: 'opis args sedí napodruhé',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label, prompt, opts, stav) {
    if (label !== 'args:řez 05') return null
    stav.data.n = (stav.data.n || 0) + 1
    return stav.data.n === 1 ? { ...argsStavby(), rez: '05', _pole: POLE } : { ...argsStavby({ max_pokusu: 1 }), rez: '05', _pole: POLE }
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^args:řez 05$/, 2, 'načtení a jedno nové načtení')
    k.obsahuje(k.jeden('implement:řez 05:1'), 'Pokus 1 z 1', 'max_pokusu z druhého načtení')
    return k.chyby
  },
}
