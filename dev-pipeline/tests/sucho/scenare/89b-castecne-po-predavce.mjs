// 89b · stavba · 1.6.0 (review 1.6.0 N13): castecne bez předávky selže až dvakrát za sebou. Platná předávka mezi nimi je postup
// a počítadlo nuluje: řetěz castecne bez předávky → předávka → castecne bez předávky → hotovo část dokončí v pokusu 1.
import { argsStavby, casti, kontrola, stub, hash, CWD } from '../stuby.mjs'

export default {
  nazev: 'castecne bez předávky po platné předávce není selhání',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), max_pokusu: 2 }),
  odpoved(label) {
    if (label === 'implement:řez 05:část K1:1') return stub(label, { stav: 'castecne', predavka: '' })
    if (label === 'implement:řez 05:část K1:1:n2') return stub(label, { stav: 'castecne', predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md` })
    if (label === 'implement:řez 05:část K1:1:n3') return stub(label, { stav: 'castecne', predavka: '' })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.jeden('implement:řez 05:část K1:1:n4')
    k.nic(/^implement:řez 05:část K1:2/, 'K1 dokončil nástupce v pokusu 1')
    k.ok(!logy.some(l => /znovu castecne bez předávky/.test(l)), 'castecne oddělené předávkou se nepočítá jako dvakrát za sebou')
    return k.chyby
  },
}
