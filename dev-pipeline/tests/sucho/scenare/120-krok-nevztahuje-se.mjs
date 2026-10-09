// 120 · stavba · 1.7.0 (spec § 1.6): podmíněný krok, jehož podmínka nenastala, vrátí deploy jako nevztahuje-se s hodnotou podmínky.
// Není to selhání nasazení, pokus 2 se nespustí (běh sonnet-5-5: řez 04 spotřeboval pokus 2 na krocích 7, 10 a 11 jako vynechano).
// Zadání deploye nese taxonomii s nevztahuje-se; běžné uzavření připojí seznamy zastaveného běhu, když soubor existuje (§ 1.5).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'krok nevztahuje-se není selhání nasazení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { kroky_po_nasazeni: [
      { id: 6, krok: 'migrace evidence', stav: 'provedeno' },
      { id: 7, krok: 'jen když S5: snížit effort', stav: 'nevztahuje-se', duvod: 'S5 nenastalo: spotřeba 784 170 < 840 781' },
    ] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^(implement:řez 05:2|deploy:řez 05:2)$/, 'krok nevztahuje-se nespouští další pokus ani dorovnání')
    k.obsahuje(k.jeden('deploy:řez 05:1'), 'nevztahuje-se (podmínka kroku z PRD je vyhodnocená a nenastala', 'taxonomii nevztahuje-se')
    k.obsahuje(k.jeden('uzavření:řez 05'), 'Když existuje docs/.vysledek-stavba-05-zastaveno.json, připoj jeho seznamy ke svým s deduplikací podle textu.', 'připojení seznamů zastaveného běhu')
    return k.chyby
  },
}
