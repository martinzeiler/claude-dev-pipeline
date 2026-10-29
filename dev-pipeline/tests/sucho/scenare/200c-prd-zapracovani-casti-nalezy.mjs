// 200c · PRD · 1.10.0 (spec B1): zapracování tabulku nezmění (casti_v_kostre sedí s částmi bloku) a přerostlou část nahlásí
// v casti_nalezy. Blok projde a nález jde orchestrátorovi v návratu; stavba dostane tytéž části.
import { argsPrd, kontrola, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))
const NALEZ = 'K1: odhad kontroly 1 320 ř., přerostlá'

export default {
  nazev: 'PRD: zapracování nahlásí přerostlou část, tabulka zůstane',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['rozděl části nad ~800 ř.'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, casti_v_kostre: ['K1', 'K2', 'K3'], casti_nalezy: [NALEZ], zmenena_mista: [] })
    return null
  },
  over(v) {
    const k = kontrola([])
    k.navrat(v, { ok: true, rez: '05', casti_nalezy: [NALEZ] })
    k.rovno(v && v.stavba && v.stavba.casti.map(c => c.id), ['K1', 'K2', 'K3'], 'stavba.casti')
    return k.chyby
  },
}
