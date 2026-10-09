// 126 · stavba · 1.7.0 (spec § 1.11): blok PRD zapracoval zbylé blokující nálezy bez další kontroly (zapracovano_bez_kontroly).
// Refresh se spustí i bez prd_stale a jeho zadání je jmenuje zvlášť, aby ověřil zapracování a jeho nové chyby hlásil jako blokující.
import { argsStavby, kontrola, CWD } from '../stuby.mjs'

export default {
  nazev: 'refresh ověří nálezy zapracované bez kontroly',
  blok: 'blok-stavby',
  args: argsStavby({ hypotezy: { report: `${CWD}/docs/reviews/rez-05-prd-check-kolo-2.md`, ids: ['N4'], blokujici: ['N1'], zapracovano_bez_kontroly: ['N1', 'N2'] } }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const r = k.jeden('prd-refresh:řez 05')
    k.obsahuje(r, 'Tyto nálezy zapracoval blok PRD bez kontroly: ověř, že zapracování platí, a nové chyby v něm hlas jako blokující.', 'větu o zapracování bez kontroly')
    k.obsahuje(r, 'Nálezy: N1, N2.', 'jména nálezů zapracovaných bez kontroly')
    k.obsahuje(r, 'blokující N1, N2 jako první', 'zapracované bez kontroly mezi blokujícími')
    return k.chyby
  },
}
