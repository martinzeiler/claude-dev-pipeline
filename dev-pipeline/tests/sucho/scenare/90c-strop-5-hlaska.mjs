// 90c · stavba · 1.6.0 (plan-check 8): část nad stropem, která vyčerpá 5 předávek, hlásí skutečný strop své fáze, ne pevné 3.
import { argsStavby, casti, kontrola, stub, parsujLabel, hash, CWD } from '../stuby.mjs'

export default {
  nazev: 'hláška stropu předávek uvádí strop části',
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
    k.ok(v && /strop předávek vyčerpán \(5 předávky/.test(v.detail || ''), `detail: ${v && v.detail}`)
    return k.chyby
  },
}
