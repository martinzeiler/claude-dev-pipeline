// 129 · stavba i kolečko · revize 1.7.0 (plan-check 1, code-review N4): stálé pole z docs/.run-args.json, které orchestrátor zapsal
// po složení souboru bloku (rozhodnutí majitele), _pole souboru nezná. Navíc se nepočítá: blok nenačítá znovu a rozhodnutí dojde
// do rámce agentů. Dřív by ho druhé načtení „podle _pole“ vypustilo (stavba), nebo blok zastavil.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const R = '2026-10-09 10:00 „nečekat, spouštět ručně podle Povolení“'
const POLE = ['cwd', 'deploy_mode', 'e2e_path', 'kriteria', 'plugin_root', 'prd_path', 'rez', 'runbook', 'runtime_dopad', 'vize']

export default {
  nazev: 'stálé pole mimo _pole projde bez nového načtení',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '05', _pole: POLE, rozhodnuti_majitele: [R] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^args:řez 05$/, 1, 'jedno načtení, stálé pole rozdílem není')
    for (const x of volani.filter(x => !/^args:/.test(x.label))) k.obsahuje(x, R, 'rozhodnutí majitele v rámci')
    return k.chyby
  },
}
