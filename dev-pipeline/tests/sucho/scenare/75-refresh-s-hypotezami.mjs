// 75 · stavba · 1.5.0 (spec § 1.13): refresh PRD dostane zbylé nálezy kontroly PRD (hypotezy z bloku PRD) k přeměření: platný
// blokující zapíše do reportu a zapracování ho opraví (běh web-podzim: 40 blokujících nálezů delta kontroly nikdo neopravil).
import { argsStavby, kontrola, CWD } from '../stuby.mjs'

export default {
  nazev: 'refresh PRD s hypotézami z bloku PRD',
  blok: 'blok-stavby',
  args: argsStavby({ prd_stale: ['řez 04 (sucho)'], hypotezy: { report: `${CWD}/docs/reviews/rez-05-prd-check-kolo-2.md`, ids: ['N3-75'] } }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const r = k.jeden('prd-refresh:řez 05')
    k.obsahuje(r, 'N3-75', 'id zbylého nálezu')
    k.obsahuje(r, 'rez-05-prd-check-kolo-2.md', 'report kontroly PRD')
    k.obsahuje(r, 'přeměř jako hypotézy', 'pokyn k přeměření')
    return k.chyby
  },
}
