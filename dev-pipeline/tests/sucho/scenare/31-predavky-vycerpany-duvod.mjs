// 31 · stavba · revize 1.4.0 nález 3 (a doplnění koordinátora): implementace předává pořád dál (4 platné předávky). Důvod selhání
// v návratu je strop předávek, ne „agent nevrátil výsledek“, a log to řekne slovy „předávky vyčerpány“.
import { argsStavby, kontrola, stub, hash, CWD, S } from '../stuby.mjs'

export default {
  nazev: 'předávky vyčerpány: důvod selhání',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved(label) {
    if (label.startsWith('implement:řez 05:1')) return stub(label, { stav: 'castecne', predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md` })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'implementace', predavky: 4 })
    k.ok(/strop předávek vyčerpán/.test(S(v && v.detail)) && !/nevrátil výsledek/.test(S(v && v.detail)), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    k.ok(logy.some(l => /předávky vyčerpány/.test(l)), 'log „předávky vyčerpány“')
    return k.chyby
  },
}
