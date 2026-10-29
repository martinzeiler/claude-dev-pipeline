// 87 · stavba · 1.6.0 (spec § 1.1): selže-li i dorovnání deploye malého řezu, další pokus jde celý (implementace, review, brána)
// a před ním diagnóza.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'dorovnání deploye selže, pokus 3 jde celý',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (/^deploy:řez 05:(p2:)?1$/.test(label)) return stub(label, { kroky_po_nasazeni: [{ id: 4, krok: 'OVERENI-87 health', stav: 'selhalo', duvod: '500 z /api/health' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 3 })
    k.nic(/^implement:řez 05:2$/, 'dorovnání (pokus 2) nepouští implementaci')
    k.jeden('implement:řez 05:3'); k.jeden('diagnose:řez 05')
    k.pocet(/^verify:/, 2, 'brána v pokusu 1 a 3')
    return k.chyby
  },
}
