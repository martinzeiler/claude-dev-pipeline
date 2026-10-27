// 177b · PRD · 1.9.0 (§ 5.2, review N2): pojistka odebrání je per část. Nález žádá vyjmout K2, zapracování odebere K3: K3 žádný nález
// nejmenuje, blok končí ok: false s výčtem částí bez nálezu.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: odebrání části, kterou nález nejmenuje, je ok: false',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['K2 vyjmi do řezu 19'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 12, casti: CASTI3.slice(0, 2), casti_odebrane: ['K3'], zmenena_mista: ['Části: K3 odebrána'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false, rez: '05', casti_odebrane: ['K3'] })
    k.ok(v && /zapracování odebralo části K3, které žádný nález nežádá/.test(v.duvod || ''), `návrat.duvod: ${v && v.duvod}`)
    k.ok(!v || !v.stavba, 'návrat bez pole stavba')
    k.ok(logy.some(l => l.includes('zapracování odebralo části K3, které žádný nález orchestrátora nežádá odebrat')), 'log')
    rozhrani(k, volani)
    return k.chyby
  },
}
