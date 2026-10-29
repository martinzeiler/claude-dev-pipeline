// 200f · PRD · 1.10.0 (review N9): zapracování casti_v_kostre nevrátí a casti nemá id navíc. Chybějící pole se jen zaloguje a blok projde.
import { argsPrd, kontrola, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: zapracování bez casti_v_kostre jen zaloguje',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['chybí pokrytí bodu F2'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, zmenena_mista: ['AK2'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rez: '05' })
    k.ok(logy.some(l => l.includes('zapracování nevrátilo casti_v_kostre')), 'log chybějícího pole')
    return k.chyby
  },
}
