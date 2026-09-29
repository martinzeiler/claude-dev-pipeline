// 06 · stavba · předávka (§ 1.2): část K1 vrátí predavka, nástupce :n2 dostane totéž zadání, cestu předávky a stejného agenta;
// jeho návrat platí za celé zadání a blok pokračuje integrací.
import { argsStavby, casti, kontrola, stub, CWD } from '../stuby.mjs'

const C = casti([['K1'], ['K2']])
const PREDAVKA = `${CWD}/docs/reviews/predavka-agent-k1.md`

export default {
  nazev: 'předávka části K1 a nástupce :n2',
  blok: 'blok-stavby',
  args: argsStavby({ casti: C, kontrakt_potreba: false }),
  odpoved(label) {
    if (label === 'implement:řez 05:část K1:1') return stub(label, { stav: 'castecne', predavka: PREDAVKA })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1, predavky: 1 })
    const o = k.jeden('implement:řez 05:část K1:1'), n2 = k.jeden('implement:řez 05:část K1:1:n2')
    k.pred(o, n2)
    k.obsahuje(n2, PREDAVKA, 'cestu předávky')
    if (o) k.obsahuje(n2, o.prompt, 'celé původní zadání')
    if (o && n2) {
      k.ok(o.agentType === n2.agentType && o.model === n2.model && o.effort === n2.effort, `nástupce jiný agent: ${n2.agentType} ${n2.model}/${n2.effort}`)
      k.rovno(n2.klice, o.klice, 'schéma nástupce')
    }
    k.pole(o, ['predavka'], 'IMPL')
    k.nic(/:n3$/, 'další nástupce bez předávky')
    k.pocet(/^implement:řez 05:část K1:/, 2, 'K1 jen předchůdce a nástupce')
    const inte = k.jeden('implement:řez 05:integrace:1')
    k.pred(n2, inte)
    if (v) k.rovno((v.casti || []).map(c => [c.id, c.hotovo]), [['K1', true], ['K2', true]], 'návrat.casti')
    return k.chyby
  },
}
