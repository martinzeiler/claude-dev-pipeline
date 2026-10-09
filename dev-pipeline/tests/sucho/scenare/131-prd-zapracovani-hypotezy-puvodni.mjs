// 131 · PRD · 1.7.0 režim zapracování převezme hypotézy původního běhu (spec 1.7.0, rozbor-prd návrh 1b): v běhu sonnet-5-5
// 04 zapr. zahodilo pět blokujících nálezů PRD 04 a jeden stál stavbu pokus 2. Report se spojí, id se sjednotí (nové s předponou
// zapr/, aby se N1 nového reportu neslilo s N1 původního), overit_prvni podle id; id, které nález orchestrátora ruší tvarem
// „ruší: N2“, vypadne; volná zmínka („N3 neplatí“, „poruší“) nic neruší (review 1.7.0, N8). Blokující, který delta zapracování nechá, projde zapracováním bez kontroly (§ 1.11).
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'

const REP_PU = `${CWD}/docs/reviews/rez-05-prd-check-kolo-2.md`
const REP_ZAPR = `${CWD}/docs/reviews/rez-05-prd-check-zapr-kolo-2.md`
const PUVODNI = {
  ok: true, rez: '05', kriteria: 8, casti: [],
  stavba: { rez: '05', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, casti: [], hypotezy: { report: REP_PU, ids: ['N1', 'N2', 'N3'], blokujici: ['N1', 'N2'], overit_prvni: [{ id: 'N3', kriterium: 'AK5', hypoteza: 'písmo jen s preloadem' }], zapracovano: false } },
}

export default {
  nazev: 'PRD: zapracování převezme hypotézy původního běhu',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['odchylka: doplň F3', 'měřidlo N2 už existuje, ruší: N2', 'N3 neplatí pro AK5, oprava ho poruší'], puvodni: PUVODNI }),
  odpoved(label) {
    if (label === 'prd-check:řez 05:2') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 1, osy: ['C'], report_path: REP_ZAPR, nalezy_ids: ['N1', 'N4'] }
    if (label === 'prd-fix:řez 05:zbylé') return stub(label, { zmenena_mista: ['AK3'], odmitnute: [] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rezim: 'zapracovani' })
    const h = v && v.stavba && v.stavba.hypotezy
    k.rovno(h && h.report, `${REP_PU} + ${REP_ZAPR}`, 'hypotezy.report (původní + zapracování)')
    k.rovno(h && h.ids, ['N1', 'N3', 'zapr/N1', 'zapr/N4'], 'hypotezy.ids (N2 zrušil orchestrátor)')
    k.rovno(h && h.blokujici, ['N1', 'zapr/N1'], 'hypotezy.blokujici')
    k.rovno(h && h.overit_prvni.map(o => o.id), ['N3'], 'hypotezy.overit_prvni z původního běhu')
    k.rovno(h && h.zapracovano_bez_kontroly, ['zapr/N1'], 'hypotezy.zapracovano_bez_kontroly')
    k.ok(logy.some(l => /hypotézy z původního běhu převzaty: 2 id, 1 blokujících; zrušené nálezem orchestrátora: N2/.test(l)), 'log převzetí hypotéz')
    const z = k.jeden('prd-fix:řez 05:zbylé')
    k.obsahuje(z, `report ${REP_ZAPR} (nálezy N1;`, 'zbylé blokující s reportem delty zapracování')
    rozhrani(k, volani)
    return k.chyby
  },
}
