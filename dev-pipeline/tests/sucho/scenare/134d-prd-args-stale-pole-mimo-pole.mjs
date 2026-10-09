// 134d · PRD · 1.7.0 kontrola opisu args (review 1.7.0, N4 a plan-check 1): orchestrátor připíše rozhodnutí majitele do
// .run-args.json (args-bloku.py rozhodnuti) až po složení souboru bloku, takže _pole souboru rozhodnuti_majitele nezná. Stálé pole
// mimo _pole není „navíc“: blok načte jednou, rozhodnutí jde do rámce agentů. Dřív blok skončil ok: false a nic nespustil.
import { kontrola, CWD, PLUGIN } from '../stuby.mjs'
import { ARGS_134 } from './134-prd-args-pole.mjs'

const { rozhodnuti_majitele: ROZH, ...BEZ } = ARGS_134
const POLE_STARE = Object.keys(BEZ).sort()

export default {
  nazev: 'PRD: stálé pole mimo _pole projde bez nového načtení',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...ARGS_134, _pole: POLE_STARE }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rez: '05' })
    k.pocet(/^args:/, 1, 'jedno načtení args')
    k.obsahuje(k.jeden('prd:řez 05'), ROZH[0], 'rozhodnutí majitele v rámci')
    return k.chyby
  },
}
