// 207 · kolečko · 1.10.0 (spec D4, plan-check N9): follow-up „rozhodne orchestrátor: …“ dostane osud rozhodnutí a zadání závěru
// říká, že text položky s osudem rozhodnutí začíná „rozhodne majitel:“ nebo „rozhodne orchestrátor:“.
import { argsKolecko, kontrola, oprava, CWD } from '../stuby.mjs'

const FU = 'rozhodne orchestrátor: TTL úlohy 30 min, nebo 60 min FU-207'

export default {
  nazev: 'kolečko: follow-up s osudem rozhodnutí a předponou',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'review:kolečko:1') return { nalezu: 1, blokujicich: 0, balicky: [{ soubory: ['apps/a.ts'], nalezy: ['N1'] }], report_path: `${CWD}/docs/reviews/kolecko-code-review-kolo-1.md`, follow_up_ids: [] }
    if (label === 'fix:kolečko:kolo 1:1') return oprava({ opravene_ids: ['N1'], follow_ups: [FU] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, `[rozhodnutí] ${FU}`, 'osud rozhodnutí u položky „rozhodne orchestrátor:“')
    k.obsahuje(z, 'začni „rozhodne majitel:“ (Cíl, Ne-cíl, Rozhodnutí, Povolení, právní nebo obsahová věc) nebo „rozhodne orchestrátor:“', 'pravidlo D4 v zadání závěru')
    return k.chyby
  },
}
