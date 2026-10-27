// 174b · stavba · 1.9.0 (§ 2.4): Kontrakt na stropu předávek bez zbývajících souborů v posledním návratu selže jako dřív (strop 8).
import { argsStavby, casti, kontrola, stub, hash, parsujLabel, CWD, S } from '../stuby.mjs'

export default {
  nazev: 'Kontrakt na stropu předávek bez zbývajících souborů: selhání fáze',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, max_pokusu: 1 }),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ === 'implement' && l.role === 'kontrakt') return stub(label, { stav: 'castecne', predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md` })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'implementace', pokusy: 1 })
    k.ok(/strop předávek vyčerpán \(8 předávky/.test(S(v && v.detail)), `detail: ${v && v.detail}`)
    k.nic(/^implement:řez 05:kontrakt:1:[ab]$/, 'dělení Kontraktu bez zbývajících souborů')
    k.nic(/^implement:řez 05:část/, 'části po selhaném kontraktu')
    k.ok(logy.some(l => l.includes('kontrakt na stropu předávek: poslední návrat řetězu zbývající soubory nenese; fáze zůstává selhaná')), 'log')
    return k.chyby
  },
}
