// 202 · kolečko · 1.10.0 (spec H1): stálá pole běhu vkládá do docs/.kolecko.json args-bloku.py; kolečko čte jedním agentem jen
// svůj soubor. Agent napoprvé vynechá runbook ze _pole, druhé načtení ho opíše; prázdná hodnota z opisu (ne_cile: "") do args nejde.
import { kontrola, CWD, PLUGIN } from '../stuby.mjs'

const SOUBOR = { cwd: CWD, plugin_root: PLUGIN, rez: 'kolecko', base: 'main', vize: `${CWD}/docs/vize/kolecko-202.md`, runbook: 'docs/runbook-202.md', deploy_mode: 'config' }
const POLE = Object.keys(SOUBOR).sort()

export default {
  nazev: 'kolečko: stálá pole v souboru kolečka, jeden načítací agent',
  blok: 'blok-kolecko',
  args: { cwd: CWD, plugin_root: PLUGIN, args_file: 'docs/.kolecko.json' },
  odpoved(label, prompt, opts, stav) {
    if (label === 'args:kolečko') { if (stav.pocty[label] === 1) { const { runbook, ...bez } = SOUBOR; return { ...bez, ne_cile: '', _pole: POLE } } return { ...SOUBOR, ne_cile: '', _pole: POLE } }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const a = k.pocet(/^args:/, 2, 'jen soubor kolečka, dvakrát')
    k.obsahuje(a[1], 'minule chybělo: runbook', 'druhé načtení jmenuje chybějící pole')
    for (const x of a) k.neobsahuje(x, '.run-args.json', 'druhý soubor v zadání načtení')
    k.obsahuje(k.jeden('thermo:kolečko'), `${CWD}/docs/vize/kolecko-202.md`, 'vize ze souboru kolečka')
    k.obsahuje(k.jeden('verify:kolečko:před nasazením:1'), 'docs/runbook-202.md', 'runbook z druhého opisu')
    k.nic(/^args:kolečko:run$/, 'načtení .run-args.json')
    return k.chyby
  },
}
