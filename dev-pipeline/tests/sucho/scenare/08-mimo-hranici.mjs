// 08 · stavba · požadavek mimo hranici (§ 3 Implementace): část K1 vrátí mimo_hranici, integrace ho dostane v zadání k provedení.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

const C = casti([['K1'], ['K2']])

export default {
  nazev: 'mimo_hranici z části jde do integrace',
  blok: 'blok-stavby',
  args: argsStavby({ casti: C, kontrakt_potreba: false }),
  odpoved(label) {
    if (label === 'implement:řez 05:část K1:1') return stub(label, { mimo_hranici: [{ soubor: 'packages/shared/typy.ts', co: 'MIMO-HRANICI: přidat typ Rozpocet do sdíleného modulu, čte ho K2' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const p1 = k.jeden('implement:řez 05:část K1:1'), inte = k.jeden('implement:řez 05:integrace:1')
    k.pole(p1, ['mimo_hranici'], 'IMPL')
    k.pred(p1, inte)
    k.obsahuje(inte, 'packages/shared/typy.ts', 'soubor požadavku mimo hranici')
    k.obsahuje(inte, 'MIMO-HRANICI', 'co požadavek mimo hranici chce')
    return k.chyby
  },
}
