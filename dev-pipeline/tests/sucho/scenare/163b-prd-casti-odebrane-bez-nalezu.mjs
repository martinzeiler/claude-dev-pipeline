// 163b · PRD · 1.8.0 casti_odebrane bez nálezu, který odebrání žádá (spec 1.8.0 § 2.4); od 1.9.0 (§ 5.2) blok nevrací stavbě části
// se smazaným PRD: končí ok: false s důvodem a orchestrátor rozhodne.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: casti_odebrane bez žádosti orchestrátora je ok: false',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['odchylka od plánu: doplň F3'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, casti_odebrane: ['K3'], zmenena_mista: ['AK7'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false, rez: '05', casti_odebrane: ['K3'] })
    k.ok(v && /zapracování odebralo části K3, které žádný nález nežádá/.test(v.duvod || ''), `návrat.duvod: ${v && v.duvod}`)
    k.ok(!v || !v.stavba, 'návrat bez pole stavba (orchestrátor rozhodne, stavba nesmí dostat části se smazaným PRD)')
    k.nic(/^prd-check:/, 'delta po odmítnutém odebrání')
    k.ok(logy.some(l => l.includes('zapracování odebralo části K3, které žádný nález orchestrátora nežádá odebrat; blok končí')), 'log odmítnutého odebrání')
    rozhrani(k, volani)
    return k.chyby
  },
}
