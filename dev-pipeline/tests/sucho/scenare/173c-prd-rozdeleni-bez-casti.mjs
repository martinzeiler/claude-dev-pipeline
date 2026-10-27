// 173c · PRD · 1.9.0 (§ 2.2): rozdělení, které tabulku nezmění (vrátí přerostlou část beze změny), tabulku architekta nechá a blok
// pokračuje autory nad ní; rozdělení se nekoná vůbec, když je každá část do ~800 ř.
import { argsPrd, kontrola, rozhrani, stub } from '../stuby.mjs'
import { PRED } from './173-prd-cast-nad-800-rozdeleni.mjs'

export default {
  nazev: 'PRD: rozdělení bez změny nechá tabulku architekta',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 6, casti: PRED, odhad_radku: 2100, kontrakt_potreba: true })
    if (label === 'prd-fix:řez 05:rozdělit-části') return stub(label, { casti: [PRED[0]], zmenena_mista: [] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, casti_pocet: 2, casti_nad_stropem: [{ id: 'K1', odhad: 1500 }] })
    k.pocet(/rozdělit-části$/, 1, 'jedno rozdělení')
    k.pocet(/^prd-část:/, 2, 'autoři nad tabulkou architekta')
    k.ok(logy.some(l => l.includes('rozdělení částí tabulku nezměnilo; tabulka architekta zůstává')), 'log')
    rozhrani(k, volani)
    return k.chyby
  },
}
