// 16 · stavba · fix odmítne blokující nález (§ 3 H a B): review 2 běží a jeho rozsah nese odmítnutí s důvodem k přeměření;
// oprava po review 2 je poslední várka (zúžením); odmítnuté jdou do návratu.
import { argsStavby, kontrola, oprava, CWD } from '../stuby.mjs'

const DUVOD = 'DUVOD-ODMITNUTI: volající hodnotu už validuje v parseRozpocet'

export default {
  nazev: 'odmítnutý blokující nález',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'review:řez 05:1') return { nalezu: 2, blokujicich: 1, report_path: `${CWD}/docs/reviews/rez-05-p1-code-review-kolo-1.md`, balicky: [{ soubory: ['apps/sucho/rez.ts'], nalezy: ['N1', 'N2'] }], follow_up_ids: [] }
    if (label === 'fix:řez 05:1.1') return oprava({ opraveno: 1, zmenena_mista: ['apps/sucho/rez.ts: uloz'], odmitnuto: [{ id: 'N1', duvod: DUVOD, blokuje: true }] })
    if (label === 'review:řez 05:2') return { nalezu: 1, blokujicich: 1, report_path: `${CWD}/docs/reviews/rez-05-p1-code-review-kolo-2.md`, balicky: [{ soubory: ['apps/sucho/rez.ts'], nalezy: ['N1'] }], follow_up_ids: [] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const f1 = k.jeden('fix:řez 05:1.1'), r2 = k.jeden('review:řez 05:2'), f2 = k.jeden('fix:řez 05:2.1')
    if (f1) {
      const odm = (f1.schema.properties || {}).odmitnuto
      k.ok(!!(odm && odm.items && odm.items.properties && odm.items.properties.blokuje), 'FIX: odmitnuto[] bez pole blokuje (§ 3 H)')
    }
    k.pole(f1, ['jinak_nez_nalez'], 'FIX')
    k.pred(f1, r2)
    k.obsahuje(r2, 'N1', 'id odmítnutého nálezu'); k.obsahuje(r2, DUVOD, 'důvod odmítnutí'); k.obsahuje(r2, 'obstojí odmítnutí')
    k.pred(r2, f2)
    k.obsahuje(f2, 'Poslední várka', 'větu B o poslední várce'); k.obsahuje(f2, 'zúžením')
    k.ok(JSON.stringify((v && v.odmitnute) || []).includes('DUVOD-ODMITNUTI'), `návrat.odmitnute bez odmítnutého nálezu: ${JSON.stringify(v && v.odmitnute)}`)
    return k.chyby
  },
}
