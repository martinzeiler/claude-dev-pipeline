// 48 · PRD · revize 1.4.0 nález 12: režim zapracování s puvodni (předchozí návrat bloku PRD). Zapracování vrátí části a počet
// kritérií, ne e2e_sekce, kontrakt_potreba ani doklad_pred (nepovinná pole): ty platí z puvodni, ne výchozí prázdné/true/false.
import { argsPrd, kontrola, stub, prdCasti, CWD } from '../stuby.mjs'

const CASTI = ['K1', 'K2', 'K3'].map(id => ({ id, nazev: id, soubory: [`apps/${id}/**`], kriteria: [`AK-${id}`], odhad_radku: 1200, zavisi_na: [], prd_path: prdCasti(id) }))
const SEKCE = [{ nazev: 'Sekce A', kriterii: 10 }, { nazev: 'Sekce B', kriterii: 10 }, { nazev: 'Sekce C', kriterii: 10 }]
const PUVODNI = { casti: CASTI, e2e_sekce: SEKCE, kontrakt_potreba: false, doklad_pred: true, doklad_popis: 'DOKLAD-48: počty řádků rozpocty', odhad_radku: 3600, kriteria: 30 }

export default {
  nazev: 'PRD zapracování s puvodni',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['chybí pokrytí bodu F3'], puvodni: PUVODNI }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 30, casti: CASTI.map(({ prd_path, ...c }) => (c.id === 'K2' ? { ...c, soubory: ['apps/K2/**', 'apps/K2b/**'] } : c)), zmenena_mista: ['AK7'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rezim: 'zapracovani', e2e_sekce: SEKCE, kontrakt_potreba: false, doklad_pred: true, doklad_popis: PUVODNI.doklad_popis, kriteria: 30 })
    if (v) {
      k.rovno((v.casti || []).map(c => [c.id, c.prd_path]), CASTI.map(c => [c.id, c.prd_path]), 'návrat.casti (id a PRD částí z puvodni)')
      k.rovno(((v.casti || []).find(c => c.id === 'K2') || {}).soubory, ['apps/K2/**', 'apps/K2b/**'], 'soubory K2 ze zapracování')
    }
    return k.chyby
  },
}
