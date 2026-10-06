// 101 · PRD · 1.6.0 pokračování od autorů (spec 1.6.0 § 1.8): orchestrátor řez nerozdělil a pustí blok s od_faze „autori“
// a puvodni = návrat bloku po architektovi (pole stavby v podobjektu stavba). Architekt se znovu nespouští, autoři píšou nad
// kostrou z puvodni, návrat už rozdělení nenavrhuje a nese příznaky architekta. Neznámé od_faze nebo chybějící puvodni = ok: false.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const KOSTRA = `${CWD}/docs/prd/rez-05-kostra-101.md`
export const PUVODNI = {
  ok: true, rez: '05', faze: 'architekt', prd_path: KOSTRA, e2e_path: `${CWD}/docs/e2e/rez-05.md`, cil: 'CIL-101', kriteria: 30,
  souhrn: 'SOUHRN-101', lesen: false, zapis_do_ziveho: true, zapis_popis: 'ZAPIS-101', runtime_dopad: true, oblasti: ['rozpocty'],
  doklad_pred: true, doklad_popis: 'DOKLAD-101', odhad_radku: 13000, rozdelit_navrh: 'ROZDELIT-101', kontrakt_potreba: true,
  stavba: { rez: '05', prd_path: KOSTRA, e2e_path: `${CWD}/docs/e2e/rez-05.md`, casti: CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) })), kontrakt_potreba: true, kontrakt_odhad_radku: 900, e2e_sekce: [{ nazev: 'A', kriterii: 15 }, { nazev: 'B', kriterii: 15 }] },
}

export default {
  nazev: 'PRD: od_faze autori pokračuje nad kostrou z puvodni',
  blok: 'blok-prd',
  args: argsPrd({ od_faze: 'autori', puvodni: PUVODNI }),
  odpoved() { return null },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, prd_path: KOSTRA, cil: 'CIL-101', zapis_do_ziveho: true, doklad_pred: true, rozdelit_navrh: '', kontrakt_potreba: true })
    k.nic(/^prd:řez 05(:n\d+)?$/, 'architekt při pokračování od autorů')
    k.pocet(/^prd-část:/, 3, 'autoři částí')
    for (const id of ['K1', 'K2', 'K3']) k.obsahuje(k.jeden(`prd-část:řez 05:${id}`), KOSTRA, 'kostru z puvodni')
    k.jeden('prd-check:řez 05:1')
    k.rovno(v && v.stavba && v.stavba.e2e_sekce, PUVODNI.stavba.e2e_sekce, 'návrat.stavba.e2e_sekce z puvodni')
    k.rovno(v && v.stavba && v.stavba.kontrakt_odhad_radku, 900, 'návrat.stavba.kontrakt_odhad_radku z puvodni')
    rozhrani(k, volani)
    return k.chyby
  },
}
