// 183 · stavba · 1.10.0 (spec C2, C4): po integraci běží thermo celého řezu (thermo:řez NN:integrace). Čeká na thermo částí, jejichž
// nálezy přes hranici části (napric) dostane na vstup; jeho BLOCKER jde do téže opravné vlny jako review kolo 1. Integrační code-review
// bere pahýl v nasazovaném kódu jako BLOKUJE. Lehký profil thermo nepouští vůbec.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }
const N = 'T-NAPRIC-183 formatujCastku je v K1 i K2'

export default {
  nazev: 'thermo integrace s nálezy přes hranici částí',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'thermo:řez 05:část K1') return stub(label, { napric: [N] })
    if (label === 'thermo:řez 05:integrace') return stub(label, { blokeru: 1, nalezu: 1, soubory: ['apps/sucho/k2/modul.ts'], napravy: [{ id: 'T1-183', soubory: ['apps/sucho/k1/modul.ts', 'apps/sucho/k2/modul.ts'] }] })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const ti = k.jeden('thermo:řez 05:integrace')
    k.agent(ti, 'dev-pipeline:thermo-nuclear-review', 'opus', 'medium')
    k.obsahuje(ti, N, 'nález přes hranici z thermo části'); k.obsahuje(ti, 'švy mezi částmi K1, K2', 'rozsah integrace')
    for (const t of k.s(/^thermo:řez 05:část /)) { k.pred(t, ti); k.obsahuje(t, 'vrať v napric', 'pole napric v zadání thermo části'); k.pole(t, ['napric'], 'THERMO') }
    const fx = k.s(/^fix:řez 05:1\./)
    k.ok(fx.some(x => x.prompt.includes('T1-183')), 'BLOCKER thermo integrace v opravné vlně kola 1')
    k.obsahuje(k.jeden('review:řez 05:integrace:1'), 'je vždy BLOKUJE NASAZENÍ, i když patří části', 'pahýl jako BLOKUJE v integračním review')
    const lehky = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, profil: 'lehky' }), odpoved: () => null })
    k.ok(!lehky.volani.some(x => /^thermo:/.test(x.label)), 'lehký profil bez thermo')
    return k.chyby
  },
}
