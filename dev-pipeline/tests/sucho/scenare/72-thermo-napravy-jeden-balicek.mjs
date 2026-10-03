// 72 · stavba · 1.5.0 (spec § 1.3): thermo nález, jehož náprava (napravy) leží v souborech dvou balíčků review, dostane jeden
// balíček (sloučený): fix agent smí jen soubory svého balíčku a tentýž nález nesmí opravovat dva agenti (běh web-podzim: ~35
// odmítnutí „mimo mé soubory“, řez 13 opravovali dva agenti souběžně).
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

const K1 = 'apps/sucho/k1/modul.ts', K2 = 'apps/sucho/k2/modul.ts'

export default {
  nazev: 'thermo náprava napříč balíčky jde jednomu agentovi',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: false }),
  odpoved(label) {
    if (label === 'review:řez 05:část K1:1') return stub(label, { nalezu: 1, blokujicich: 1, balicky: [{ soubory: [K1], nalezy: ['N1'] }] })
    if (label === 'review:řez 05:část K2:1') return stub(label, { nalezu: 1, blokujicich: 0, balicky: [{ soubory: [K2], nalezy: ['N2'] }] })
    if (label === 'thermo:řez 05:část K1') return stub(label, { blokeru: 1, nalezu: 1, soubory: [K1], napravy: [{ id: 'T1-72', soubory: [K1, K2] }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const fx = k.pocet(/^fix:řez 05:1\./, 1, 'jeden opravný balíček (náprava spojila balíčky K1 a K2)')
    const f = fx[0]
    k.obsahuje(f, K1); k.obsahuje(f, K2)
    k.obsahuje(f, 'T1-72', 'id thermo nálezu s nápravou')
    k.nic(/^fix-thermo:/, 'samostatná oprava thermo')
    const th = k.jeden('thermo:řez 05:část K1')
    k.pole(th, ['napravy'], 'THERMO')
    return k.chyby
  },
}
