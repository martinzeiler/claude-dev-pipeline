// 106 · PRD · 1.6.0 návrat pod 6 000 znaků (spec 1.6.0 § 1.4): řez s 10 částmi, dlouhým souhrnem, 14 spory a odmítnutými nálezy.
// Část pro orchestrátora (vše kromě stavba) je pod 6 000 znaků, stavba je poslední pole návratu a nese celé části a hypotézy;
// kontrola a odmítnuté nálezy jen počtem a cestou. Odhady částí jsou pod stropem rozdělení 1,5× (1.8.0), aby blok došel až k návratu.
import { argsPrd, kontrola, stub, prdCasti, CWD } from '../stuby.mjs'

const IDS = Array.from({ length: 10 }, (_, i) => `K${i + 1}`)
const CASTI10 = IDS.map((id, i) => ({
  id, nazev: `Část ${id} s delším názvem modulu rozpočtů a exportů`, soubory: [`apps/web/src/rozpocty/${id.toLowerCase()}/**`, `apps/api/src/rozpocty/${id.toLowerCase()}/**`, `packages/db/rozpocty/${id.toLowerCase()}/**`],
  kriteria: [`AK${3 * i + 1}`, `AK${3 * i + 2}`, `AK${3 * i + 3}`], odhad_radku: 500, zavisi_na: i ? ['K1'] : [],
}))
const dlouhe = (n, z) => z.repeat(Math.ceil(n / z.length)).slice(0, n)

export default {
  nazev: 'PRD: návrat pod 6 000 znaků i u 10 částí',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 30, casti: CASTI10, odhad_radku: 5000, kontrakt_potreba: true, souhrn: dlouhe(4000, 'souhrn řezu '), odchylky_od_planu: dlouhe(2000, 'odchylka '), spory: Array.from({ length: 14 }, (_, i) => `spor ${i}: ${dlouhe(400, 'text sporu ')}`) })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 12, blokujicich: 3, osy: ['A', 'C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: Array.from({ length: 12 }, (_, i) => `N${i + 1}`) }
    if (label === 'prd-fix:řez 05') return stub(label, { souhrn: dlouhe(3000, 'souhrn po zapracování '), zmenena_mista: ['AK2'], odmitnute: Array.from({ length: 8 }, (_, i) => ({ id: `N${i + 1}`, duvod: dlouhe(500, 'důvod odmítnutí ') })) })
    if (/^prd-check:řez 05:část K\d+:1$/.test(label)) return { verdikt: 'needs-fixes', nalezu: 4, blokujicich: 1, osy: ['B'], report_path: `${CWD}/docs/reviews/${label.replace(/\W+/g, '-')}.md`, nalezy_ids: ['N1', 'N2', 'N3', 'N4'] }
    return null
  },
  over(v) {
    const k = kontrola([])
    k.navrat(v, { ok: true, casti_pocet: 10, odmitnute_nalezy: 8 })
    if (!v) return k.chyby
    const { stavba, ...orchestrator } = v
    const delka = JSON.stringify(orchestrator).length
    k.ok(delka < 6000, `část návratu pro orchestrátora má ${delka} znaků (strop 6 000)`)
    k.rovno(Object.keys(v).slice(-1), ['stavba'], 'stavba je poslední pole návratu')
    k.rovno((stavba.casti || []).map(c => [c.id, c.prd_path]), IDS.map(id => [id, prdCasti(id)]), 'stavba.casti celé')
    // Kostra prošla deltou (stub delty je ready), části s jediným blokujícím jdou bez delty: 10 × 4 nálezy kola 1.
    k.ok(stavba.hypotezy && stavba.hypotezy.ids.length === 40, `stavba.hypotezy.ids: ${stavba.hypotezy && stavba.hypotezy.ids.length}`)
    k.ok(v.souhrn.length <= 1200, `souhrn ${v.souhrn.length} znaků`)
    k.ok(v.spory.length === 11 && /a 4 dalších v docs\/vize-spory.md/.test(v.spory[10]), `spory: ${v.spory.length}`)
    k.ok(typeof v.kontrola.reporty === 'string' && v.kontrola.reporty_pocet === 11, `kontrola.reporty: ${JSON.stringify(v.kontrola)}`)
    k.ok(!('odmitnute_detail' in v) && v.odmitnute_ids.length === 8, 'odmítnuté jen počtem a identifikátory')
    return k.chyby
  },
}
