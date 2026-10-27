// 177 · PRD · 1.9.0 (§ 5.2): nález orchestrátora „K2 a K3 vyjmi do řezu 19“ žádá odebrání jinými slovy než „odeber“; zapracování vrátí
// casti_odebrane a blok je uzná (pojistka odeb|vyjm|přesu|rozděl|do řezu|vyřaď). Zbývá jediná část: řez jde stavbě bez částí;
// casti_pocet, casti_prehled a casti_nad_stropem se skládají z filtrovaných částí.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'

const CASTI = [
  { id: 'K1', nazev: 'Model', soubory: ['packages/db/m/**'], kriteria: ['AK1'], odhad_radku: 700, zavisi_na: [], prd_path: prdCasti('K1') },
  { id: 'K2', nazev: 'API', soubory: ['apps/api/m/**'], kriteria: ['AK2'], odhad_radku: 600, zavisi_na: ['K1'], prd_path: prdCasti('K2') },
  { id: 'K3', nazev: 'UI', soubory: ['apps/web/m/**'], kriteria: ['AK3'], odhad_radku: 1500, zavisi_na: ['K2'], prd_path: prdCasti('K3') },
]
const args = nalezy => argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy, puvodni: { casti: CASTI, kriteria: 9 } })

export default {
  nazev: 'PRD: zapracování odebere části na nález „vyjmi do řezu“',
  blok: 'blok-prd',
  args: args(['K2 a K3 vyjmi do řezu 19: API a UI stavíme až nad hotovým modelem']),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 3, casti: [], casti_odebrane: ['K2', 'K3'], zmenena_mista: ['Části: K2 a K3 vyjmuty', 'AK2', 'AK3'], odhad_radku: 700 })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rezim: 'zapracovani', casti_pocet: 0, casti_prehled: '', casti_nad_stropem: [], kontrakt_potreba: false })
    k.rovno(((v && v.stavba) || {}).casti, [], 'stavba.casti bez částí')
    k.rovno(((v && v.stavba) || {}).casti_nad_stropem, [], 'stavba.casti_nad_stropem bez K3')
    k.ok(logy.some(l => l.includes('části odebrané na žádost nálezu orchestrátora: K2, K3; zbývají K1')), 'log odebrání')
    k.ok(logy.some(l => l.includes('zbývá jediná část K1: řez je bez částí')), 'log jediné části')
    k.ok(!logy.some(l => /ignoruji|blok končí/.test(l)), 'odebrání s nálezem se neodmítá')
    rozhrani(k, volani)
    return k.chyby
  },
}
