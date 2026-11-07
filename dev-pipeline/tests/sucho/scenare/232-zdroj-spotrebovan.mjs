// 232 · stavba · 1.11.0 (spec I3; řez 11): zadání E2E rozlišuje vadné kritérium „zdroj spotřebován vlastní chybou“ od chybějícího credentialu.
import { argsStavby, kontrola } from '../stuby.mjs'

export default {
  nazev: 'druh vadného kritéria: zdroj spotřebován vlastní chybou',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    const e = k.jeden('e2e:řez 05:1')
    k.obsahuje(e, 'druh „zdroj spotřebován vlastní chybou“, credential nechybí', 'druh v zadání')
    k.ok(e && /zdroj spotřebován vlastní chybou/.test(e.schema.properties.vadna_kriteria.description), 'druh ve schématu')
    return k.chyby
  },
}
