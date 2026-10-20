// 160 · PRD · 1.8.0 rozdělení před autory (spec 1.8.0 § 2.11): skutečnost bývá 1,5× odhad architekta. Šest částí po 1 000 ř.
// dává 1,5 × 6 000 = 9 000 > 8 000: blok skončí po architektovi i bez rozdelit_navrh, jedním levným voláním si návrh vyžádá
// (label prd-fix:řez NN:rozdělit, schéma jen rozdelit_navrh) a autory, kontroly ani zapracování nespustí.
import { argsPrd, kontrola, rozhrani, stub, casti } from '../stuby.mjs'

const CASTI6 = casti([['K1'], ['K2'], ['K3', ['K1']], ['K4'], ['K5', ['K2']], ['K6']])
export const NAVRH = 'NAVRH-160: K1+K2+K3 jako řez 05a, K4+K5+K6 jako 05b'

export default {
  nazev: 'PRD: 1,5× odhad částí nad stropem ukončí blok po architektovi',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 18, casti: CASTI6, odhad_radku: 6000, kontrakt_potreba: true })
    if (label === 'prd-fix:řez 05:rozdělit') return { rozdelit_navrh: NAVRH }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, faze: 'architekt', rozdelit_navrh: NAVRH, casti_pocet: 6, kontrola: null })
    k.pocet(/./, 2, 'architekt a návrh rozdělení')
    const n = k.jeden('prd-fix:řez 05:rozdělit')
    k.agent(n, 'dev-pipeline:prd', 'opus', 'high')
    k.pole(n, ['rozdelit_navrh', 'predavka'], 'ROZDELIT_SCHEMA')
    k.obsahuje(n, 'skutečnost bývá 1.5× odhad, takže řez vychází na ~9000 řádků (strop ~8000)', 'výpočet 1,5× v zadání')
    k.obsahuje(n, 'Vrať jen rozdelit_navrh', 'jen návrh, kostru needituje')
    k.nic(/^prd-část:|^prd-check:|^prd-fix:řez 05$/, 'autoři, kontroly a zapracování po rozdělení před autory')
    k.ok(logy.some(l => l.includes('rozdělení před autory: 1.5 × odhad částí 6000 ř. = 9000 ř. (strop 8000), částí 6 (strop 10)')), 'log výpočtu rozdělení')
    k.ok(logy.some(l => /návrh rozdělit řez: blok končí po architektovi/.test(l)), 'log o konci po architektovi')
    k.rovno(((v && v.stavba) || {}).casti && v.stavba.casti.map(c => c.id), ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'], 'návrat.stavba.casti pro pokračování')
    rozhrani(k, volani)
    return k.chyby
  },
}
