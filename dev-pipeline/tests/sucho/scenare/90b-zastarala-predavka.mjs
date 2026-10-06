// 90b · stavba · 1.6.0 (review 1.6.0 N11): poslední předávka ze stropu v pokusu 1 platí jen pro pokus 2. Když fáze v pokusu 2 doběhne
// a pokus selže jinde (E2E), pokus 3 už na zastaralou předávku nenavazuje.
import { argsStavby, kontrola, stub, parsujLabel, e2ePass, hash, CWD } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK2: uložení padá'] })

export default {
  nazev: 'zastaralá předávka ze stropu se nepředává pokusu 3',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ === 'implement' && l.pokus === 1) return stub(label, { stav: 'castecne', predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md` })
    if (l.typ === 'e2e') return FAIL
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', pokusy: 3 })
    k.obsahuje(k.jeden('implement:řez 05:2'), 'poslední zápis stavu', 'navázání na předávku ze stropu v pokusu 2')
    k.neobsahuje(k.jeden('implement:řez 05:3'), 'poslední zápis stavu', 'zastaralou předávku z pokusu 1')
    return k.chyby
  },
}
