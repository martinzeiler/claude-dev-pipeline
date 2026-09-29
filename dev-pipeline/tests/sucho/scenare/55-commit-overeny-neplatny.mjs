// 55 · stavba · revize 1.4.0 nález 17: uzavření vrátí commit_overeny jako zkrácený hash. Návrat nese commit z deploye
// (plný hash), ne zkrácený, a log to řekne.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'commit_overeny jen jako plný hash',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'uzavření:řez 05') return stub(label, { commit_overeny: 'abc1234' })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const d = k.jeden('deploy:řez 05:1')
    k.rovno(v && v.commit, d && d.odpoved && d.odpoved.commit, 'návrat.commit (z deploye)')
    k.ok(logy.some(l => /není 40znakový hash/.test(l)), 'log o neplatném commit_overeny')
    return k.chyby
  },
}
