// 51 · stavba · revize 1.4.0 nález 14: kontrakt v pokusu 1 vrátí stav selhalo. Kontrakt pokusu 2 dostane důvod selhání
// stejně jako integrace a části.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'selhání kontraktu jde do pokusu 2',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }),
  odpoved(label) {
    if (label === 'implement:řez 05:kontrakt:1') return stub(label, { stav: 'selhalo', souhrn: 'KONTRAKT-SELHAL-51: migrace 0005 koliduje s 0004' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.obsahuje(k.jeden('implement:řez 05:kontrakt:2'), 'KONTRAKT-SELHAL-51', 'důvod selhání kontraktu z pokusu 1')
    k.neobsahuje(k.jeden('implement:řez 05:kontrakt:1'), 'Kontrakt v minulém pokusu selhal', 'selhání v pokusu 1')
    return k.chyby
  },
}
