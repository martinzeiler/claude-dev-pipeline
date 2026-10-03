// 74 · stavba · 1.5.0 (spec § 1.11): FOLLOW-UP nálezy code-review (follow_up_ids), které nejdou do opravného balíčku, jdou do
// follow-upů s odkazem na report; dosud zůstávaly jen v gitignorovaném reportu.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'FOLLOW-UP nálezy review do follow-upů',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'review:řez 05:1') return stub(label, { nalezu: 2, blokujicich: 0, balicky: [{ soubory: ['apps/sucho/rez.ts'], nalezy: ['N1'] }], follow_up_ids: ['N7-74', 'N1'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const c = k.jeden('uzavření:řez 05')
    k.shoda(c, /N7-74 \(FOLLOW-UP z [^)]*sucho-review-řez-05-1\.md\)/, 'FOLLOW-UP nález s reportem')
    k.neobsahuje(c, 'N1 (FOLLOW-UP', 'nález, který šel do opravy')
    return k.chyby
  },
}
