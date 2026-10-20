// 106b · PRD · 1.6.0 návrat pod 6 000 znaků v nejhorším případě (plan-check 1.6.0, nález 6): všechna textová pole na stropu
// (souhrn, cíl, popisy lešení, zápisu a dokladu, odchylky, návrh rozdělení ze zapracování; architekt s návrhem by blok ukončil), 14 dlouhých sporů, 30 nových UI ploch, 30 oblastí,
// 30 odmítnutých nálezů a 10 částí. Bez stupňovitého zkrácení měla část pro orchestrátora ~7,5 k a runtime by ji usekl.
// pokryte_body_vize se počtem nekrátí (orchestrátor podle nich kontroluje pokrytí řádku plánu); stavba zůstává celá a poslední.
import { argsPrd, kontrola, stub, CWD } from '../stuby.mjs'

const IDS = Array.from({ length: 10 }, (_, i) => `K${i + 1}`)
const CASTI10 = IDS.map((id, i) => ({
  id, nazev: `Část ${id} s delším názvem modulu rozpočtů a exportů`, soubory: [`apps/web/src/rozpocty/${id.toLowerCase()}/**`],
  kriteria: [`AK${3 * i + 1}`, `AK${3 * i + 2}`, `AK${3 * i + 3}`], odhad_radku: 500, zavisi_na: i ? ['K1'] : [],
}))
const dlouhe = (n, z) => z.repeat(Math.ceil(n / z.length)).slice(0, n)
const BODY = Array.from({ length: 25 }, (_, i) => `F${i + 1}.${i + 2}`)

export default {
  nazev: 'PRD: návrat pod 6 000 znaků i v nejhorším případě',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, {
      kriteria: 30, casti: CASTI10, odhad_radku: 5000, kontrakt_potreba: true,
      souhrn: dlouhe(4000, 'souhrn řezu '), cil: dlouhe(1000, 'cíl '), lesen: true, lesen_popis: dlouhe(1000, 'lešení '),
      zapis_do_ziveho: true, zapis_popis: dlouhe(1000, 'zápis '), doklad_pred: true, doklad_popis: dlouhe(1000, 'doklad '),
      odchylky_od_planu: dlouhe(2000, 'odchylka '),
      nove_ui_plochy: Array.from({ length: 30 }, (_, i) => `plocha ${i}: ${dlouhe(200, 'popis plochy ')}`),
      oblasti: Array.from({ length: 30 }, (_, i) => `apps/web/src/oblast-${i}-s-dlouhym-jmenem`),
      pokryte_body_vize: BODY,
      spory: Array.from({ length: 14 }, (_, i) => `spor ${i}: ${dlouhe(400, 'text sporu ')}`),
    })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 30, blokujicich: 3, osy: ['A'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: Array.from({ length: 30 }, (_, i) => `N${i + 1}`) }
    if (label === 'prd-fix:řez 05') return stub(label, { souhrn: dlouhe(4000, 'souhrn po zapracování '), rozdelit_navrh: dlouhe(2000, 'rozdělit '), doklad_popis: dlouhe(1000, 'doklad po zapracování '), zmenena_mista: ['AK2'], odmitnute: Array.from({ length: 30 }, (_, i) => ({ id: `N${i + 1}`, duvod: 'důvod' })) })
    return null
  },
  over(v) {
    const k = kontrola([])
    if (!v || !v.ok) { k.ok(false, `návrat: ${JSON.stringify(v).slice(0, 300)}`); return k.chyby }
    const { stavba, ...orchestrator } = v
    const delka = JSON.stringify(orchestrator).length
    k.ok(delka < 6000, `část návratu pro orchestrátora má ${delka} znaků (strop 6 000)`)
    k.rovno(Object.keys(v).slice(-1), ['stavba'], 'stavba je poslední pole návratu')
    // Případ je opravdu nejhorší: plné stropy stupně 0 se nevejdou, blok musel zkrátit (souhrn pod 1 200).
    k.ok(v.souhrn.length < 1200, `souhrn ${v.souhrn.length} znaků: zkrácení po stupních se nespustilo`)
    k.rovno(v.pokryte_body_vize, BODY, 'pokryte_body_vize celé (počtem se nekrátí)')
    k.rovno((stavba.casti || []).map(c => c.id), IDS, 'stavba.casti celé')
    k.ok((stavba.oblasti || []).length === 30, `stavba.oblasti celé: ${(stavba.oblasti || []).length}`)
    k.ok(v.odmitnute_nalezy === 30, `odmitnute_nalezy: ${v.odmitnute_nalezy}`)
    k.ok(v.spory.length >= 1 && /docs\/vize-spory.md/.test(v.spory[v.spory.length - 1]), `spory odkazují na vize-spory: ${JSON.stringify(v.spory).slice(0, 200)}`)
    return k.chyby
  },
}
