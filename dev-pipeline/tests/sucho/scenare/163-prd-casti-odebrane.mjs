// 163 · PRD · 1.8.0 odebrání části v režimu zapracování (spec 1.8.0 § 2.4, návrh 10): nález orchestrátora výslovně žádá
// odebrat K3, zapracování vrátí casti_odebrane ['K3'] a blok část vyjme z návratu stavby; ostatní části sloučí jako dřív.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: zapracování odebere část na žádost nálezu orchestrátora',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['odeber část K3: UI už postavil řez 04, kritéria AK4 a AK5 jsou splněná'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 12, casti: CASTI3.slice(0, 2), casti_odebrane: ['K3'], zmenena_mista: ['Části: K3 odebrána', 'AK4', 'AK5'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rezim: 'zapracovani', casti_pocet: 2 })
    const fx = k.jeden('prd-fix:řez 05')
    k.obsahuje(fx, 'Část odeber (vrať její id v casti_odebrane a vyjmi ji z tabulky) jen tehdy, když to nález orchestrátora výslovně žádá', 'pokyn k odebrání části')
    k.pole(fx, ['casti_odebrane'], 'PRD_SCHEMA')
    k.rovno(((v && v.stavba) || {}).casti && v.stavba.casti.map(c => c.id), ['K1', 'K2'], 'stavba.casti bez K3')
    k.ok(logy.some(l => l.includes('části odebrané na žádost nálezu orchestrátora: K3; zbývají K1, K2')), 'log odebrání')
    rozhrani(k, volani)
    return k.chyby
  },
}
