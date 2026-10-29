// 200d · PRD · 1.10.0 (review N9): casti_v_kostre se normalizuje (položky „k1,K2“, mezery, velká písmena, duplicity) a porovná
// jako množina s tabulkou bloku. Stejná tabulka zapsaná jinak není rozdíl, blok projde.
import { argsPrd, kontrola, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: casti_v_kostre jinak zapsaná, stejná množina',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['chybí pokrytí bodu F2'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, casti_v_kostre: ['k1,K2', ' K3 ', 'K2'], zmenena_mista: ['AK2'] })
    return null
  },
  over(v) {
    const k = kontrola([])
    k.navrat(v, { ok: true, rez: '05' })
    return k.chyby
  },
}
