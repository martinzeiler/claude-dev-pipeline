// 90c · stavba · 1.6.0 (plan-check 8), od 1.9.0 jednotný strop: část nad stropem vyčerpá 8 předávek jako každá fáze a hláška uvádí 8.
import { argsStavby, casti, kontrola, stub, parsujLabel, hash, CWD } from '../stuby.mjs'

export default {
  nazev: 'hláška stropu předávek uvádí jednotný strop 8',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1']]), casti_nad_stropem: [{ id: 'K1', odhad: 1800 }], max_pokusu: 1 }),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ === 'implement' && l.role === 'cast') return stub(label, { stav: 'castecne', predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md` })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', pokusy: 1 })
    k.ok(v && /strop předávek vyčerpán \(8 předávky/.test(v.detail || ''), `detail: ${v && v.detail}`)
    k.jeden('implement:řez 05:část K1:1:n9'); k.nic(/:n10$/, 'desátý agent')
    return k.chyby
  },
}
