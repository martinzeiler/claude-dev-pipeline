// 173b · PRD · 1.9.0 (§ 2.2): část, která po rozdělení zůstane nad 800 ř., jde dál s logem, druhé kolo není; nad 1 200 jde stavbě
// v casti_nad_stropem (jen informace, strop předávek je jednotný).
import { argsPrd, kontrola, rozhrani, stub } from '../stuby.mjs'
import { PRED } from './173-prd-cast-nad-800-rozdeleni.mjs'

const PO = [{ ...PRED[0], odhad_radku: 1300 }, { ...PRED[1], id: 'K2', zavisi_na: ['K1'] }, { id: 'K3', nazev: 'Export', soubory: ['apps/sucho/export/**'], kriteria: ['AK-K3'], odhad_radku: 300, zavisi_na: [] }]

export default {
  nazev: 'PRD: část nad 800 ř. i po rozdělení jde dál (bez druhého kola)',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 6, casti: PRED, odhad_radku: 2100, kontrakt_potreba: true })
    if (label === 'prd-fix:řez 05:rozdělit-části') return stub(label, { casti: PO, zmenena_mista: ['Části'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, casti_pocet: 3, casti_nad_stropem: [{ id: 'K1', odhad: 1300 }] })
    k.pocet(/rozdělit-části$/, 1, 'jen jedno rozdělení')
    k.pocet(/^prd-část:/, 3, 'autoři nad novou tabulkou')
    k.ok(logy.some(l => /nad ~800 ř\. zůstávají K1 \(druhé kolo není, jdou dál\)/.test(l)), 'log o části nad stropem po rozdělení')
    rozhrani(k, volani)
    return k.chyby
  },
}
