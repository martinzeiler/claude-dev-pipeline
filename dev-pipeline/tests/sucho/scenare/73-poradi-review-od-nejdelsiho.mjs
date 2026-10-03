// 73 · stavba · 1.5.0 (spec § 1.9): review řezu s částmi startuje od nejdelšího: integrační review, review částí podle počtu
// souborů sestupně, pak thermo (běh web-podzim: integrační review čekalo ve frontě stropu souběhu až nakonec).
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'review od nejdelšího',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }),
  odpoved(label) {
    if (label === 'implement:řez 05:část K2:1') return stub(label, { soubory: ['apps/sucho/k2/a.ts', 'apps/sucho/k2/b.ts', 'apps/sucho/k2/c.ts', 'apps/sucho/k2/d.ts'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const ri = k.jeden('review:řez 05:integrace:1'), r1 = k.jeden('review:řez 05:část K1:1'), r2 = k.jeden('review:řez 05:část K2:1')
    const t1 = k.jeden('thermo:řez 05:část K1'), t2 = k.jeden('thermo:řez 05:část K2')
    if (ri && r1 && r2 && t1 && t2) {
      k.ok(ri.start < r2.start && r2.start < r1.start, `pořadí review: integrace ${ri.start}, K2 ${r2.start}, K1 ${r1.start}`)
      k.ok(r1.start < t2.start && t2.start < t1.start, `thermo po review, K2 před K1: K1 review ${r1.start}, thermo K2 ${t2.start}, thermo K1 ${t1.start}`)
    }
    k.vsechnySoubezne([ri, r1, r2, t1, t2], 'review a thermo dál souběžně')
    return k.chyby
  },
}
