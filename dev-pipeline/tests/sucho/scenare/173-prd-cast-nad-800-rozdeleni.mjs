// 173 · PRD · 1.9.0 (§ 2.2): architekt vrátí část nad ~800 ř. odhadu; blok ji jedním voláním prd-fix:řez NN:rozdělit-části nechá rozdělit
// dřív, než autoři začnou psát; autoři a kontroly pak jedou nad novou tabulkou. Návrat se slučuje s tabulkou architekta (review N1):
// agent vrátí jen části, které měnil (K1 a nová K3), K2 zůstává podle architekta, kontrakt_potreba: false a kontrakt_odhad_radku 0
// z návratu architektovy hodnoty nepřepíšou. Druhé kolo není: část, která zůstane nad 800 (173b), jde dál s logem; návrat, který
// tabulku nezmění, ji nechá (173c).
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'

const c = (id, nazev, soubor, odhad, zavisi = []) => ({ id, nazev, soubory: [`apps/sucho/${soubor}/**`], kriteria: [`AK-${id}`], odhad_radku: odhad, zavisi_na: zavisi })
export const PRED = [c('K1', 'Import', 'import', 1500), c('K2', 'Výpočet', 'vypocet', 600, ['K1'])]
export const PO = [c('K1', 'Import: čtení', 'import/cteni', 700), c('K3', 'Import: zápis', 'import/zapis', 800, ['K1'])]
const SLOUCENE = [PO[0], PRED[1], PO[1]]

export default {
  nazev: 'PRD: část nad 800 ř. rozdělí jedno volání před autory',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 6, casti: PRED, odhad_radku: 2100, kontrakt_potreba: true, kontrakt_odhad_radku: 400 })
    if (label === 'prd-fix:řez 05:rozdělit-části') return stub(label, { casti: PO, zmenena_mista: ['Části: K1 rozdělena na K1 a K3'], odhad_radku: 2100, kontrakt_potreba: false, kontrakt_odhad_radku: 0 })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, casti_pocet: 3, casti_nad_stropem: [], kontrakt_potreba: true })
    const r = k.jeden('prd-fix:řez 05:rozdělit-části')
    k.pocet(/rozdělit-části$/, 1, 'jedno rozdělení')
    k.agent(r, 'dev-pipeline:prd', 'opus', 'high')
    k.pred(k.jeden('prd:řez 05'), r)
    k.obsahuje(r, 'části K1 (Import, ~1500 ř.) na části do ~800 řádků odhadu', 'které části a strop')
    k.obsahuje(r, 'skutečnost bývá 2× odhad'); k.obsahuje(r, 'disjunktní soubory'); k.obsahuje(r, 'Ostatní části neměň')
    k.pole(r, ['casti', 'zmenena_mista', 'kontrakt_potreba', 'odhad_radku'], 'PRD_SCHEMA')
    k.rovno(((v && v.stavba) || {}).casti && v.stavba.casti.map(x => [x.id, x.odhad_radku, x.zavisi_na]), SLOUCENE.map(x => [x.id, x.odhad_radku, x.zavisi_na]), 'stavba.casti po rozdělení (K2 podle architekta)')
    k.rovno(((v && v.stavba) || {}).kontrakt_odhad_radku, 400, 'stavba.kontrakt_odhad_radku architekta (návrat 0 nepřepisuje)')
    k.rovno(((v && v.stavba) || {}).kontrakt_potreba, true, 'stavba.kontrakt_potreba architekta (návrat false nepřepisuje)')
    k.pocet(/^prd-část:/, 3, 'autoři nad novou tabulkou'); for (const id of ['K1', 'K2', 'K3']) { const a = k.jeden(`prd-část:řez 05:${id}`); k.pred(r, a) }
    k.pocet(/^prd-check:/, 4, 'kontroly kostry a tří částí')
    k.ok(logy.some(l => l.includes('části nad ~800 ř. odhadu: K1 1500 ř.; jedno rozdělení před autory')), 'log před rozdělením')
    k.ok(logy.some(l => l.includes('části po rozdělení: K1 700 ř. · K2 600 ř. ← K1 · K3 800 ř. ← K1')), 'log po rozdělení')
    rozhrani(k, volani)
    return k.chyby
  },
}
