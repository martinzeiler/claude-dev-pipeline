// 129b · kolečko · revize 1.7.0 (plan-check 1, code-review N4): totéž jako 129 v kolečku. Rozhodnutí majitele zapsané po složení
// docs/.kolecko.json projde bez nového načtení a dojde do rámce všech agentů kolečka.
import { argsKolecko, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const R = '2026-10-09 10:00 „nečekat, spouštět ručně podle Povolení“'

export default {
  nazev: 'kolečko: stálé pole mimo _pole projde bez nového načtení',
  blok: 'blok-kolecko',
  args: { cwd: CWD, plugin_root: PLUGIN, args_file: 'docs/.kolecko.json' },
  odpoved(label) {
    if (label === 'args:kolečko') return { ...argsKolecko(), rez: 'kolecko', rozhodnuti_majitele: [R], _pole: ['base', 'cwd', 'deploy_mode', 'plugin_root', 'rez', 'runbook', 'vize'] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^args:kolečko$/, 1, 'jedno načtení, stálé pole rozdílem není')
    for (const x of volani.filter(x => !/^args:/.test(x.label))) k.obsahuje(x, R, 'rozhodnutí majitele v rámci')
    return k.chyby
  },
}
