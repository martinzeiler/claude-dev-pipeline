// 70 · stavba · 1.5.0 (spec § 1.6): když uzavření nevrátí ok, seznamy jdou orchestrátorovi celé a seznamy_zapsane je false
// (zapíše je orchestrátor).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'uzavření bez ok: seznamy celé',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'implement:řez 05:1') return stub(label, { follow_ups: ['FU-70 odstranit past X'], pasti_opravene: ['PAST-70'] })
    if (label === 'uzavření:řez 05') return stub(label, { ok: false, poznamka: 'journal nešel zapsat' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', follow_ups: ['FU-70 odstranit past X'], pasti_opravene: ['PAST-70'], follow_ups_pocet: 1, pasti_pocet: 1, seznamy_zapsane: false, uzavreni: false })
    return k.chyby
  },
}
