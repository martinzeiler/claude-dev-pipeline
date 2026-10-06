// 108 · PRD · 1.6.0 části nad stropem a sekce E2E s dobou (spec 1.6.0 § 1.8, 1.9): kontrola části K2 vrátí ready s vlastním
// odhadem 1 700 řádků; část jde stavbě v casti_nad_stropem i při ready (delta K8 řezu 10 v běhu web-rijen předpověděla
// 1 650–1 800 řádků a stavba to nedostala). Sekce E2E nesou doba_min a bez_soubehu až do stavba.e2e_sekce.
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const SEKCE = [{ nazev: 'Výkon', kriterii: 3, doba_min: 25, bez_soubehu: true }, { nazev: 'Cizí firma', kriterii: 2, doba_min: 15, bez_soubehu: true }, { nazev: 'Admin', kriterii: 5, doba_min: 8 }, { nazev: 'Vzhled', kriterii: 4, doba_min: 0 }]

export default {
  nazev: 'PRD: části nad stropem a E2E sekce s dobou',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true, kontrakt_odhad_radku: 1800, e2e_sekce: SEKCE })
    if (label === 'prd-check:řez 05:část K2:1') return { verdikt: 'ready', nalezu: 0, blokujicich: 0, osy: [], report_path: `${CWD}/docs/reviews/rez-05-prd-check-cast-K2-kolo-1.md`, nalezy_ids: [], odhad_casti: 1700 }
    if (label === 'prd-check:řez 05:část K1:1') return { verdikt: 'ready', nalezu: 0, blokujicich: 0, osy: [], report_path: `${CWD}/docs/reviews/rez-05-prd-check-cast-K1-kolo-1.md`, nalezy_ids: [], odhad_casti: 900 }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, casti_nad_stropem: [{ id: 'K2', odhad: 1700 }] })
    k.rovno(v && v.stavba && v.stavba.kontrakt_odhad_radku, 1800, 'stavba.kontrakt_odhad_radku')
    k.rovno(v && v.stavba && v.stavba.casti_nad_stropem, [{ id: 'K2', odhad: 1700 }], 'stavba.casti_nad_stropem')
    k.rovno(v && v.stavba && v.stavba.e2e_sekce, [SEKCE[0], SEKCE[1], SEKCE[2], { nazev: 'Vzhled', kriterii: 4 }], 'stavba.e2e_sekce s doba_min a bez_soubehu')
    for (const id of ['K1', 'K2', 'K3']) { const c = k.jeden(`prd-check:řez 05:část ${id}:1`); k.pole(c, ['odhad_casti'], 'CHECK_SCHEMA'); k.obsahuje(c, 'vrať je v odhad_casti') }
    const ks = k.jeden('prd-check:řez 05:1')
    k.obsahuje(ks, 'odhad architekta 1800', 'odhad Kontraktu v kontrole kostry'); k.obsahuje(ks, 'přerostlý Kontrakt')
    k.ok(logy.some(l => /Kontrakt na 1800 ř\./.test(l)), 'log o Kontraktu nad stropem')
    const ar = k.jeden('prd:řez 05')
    k.pole(ar, ['kontrakt_odhad_radku', 'e2e_sekce'], 'PRD_SCHEMA')
    k.ok(ar && JSON.stringify(ar.schema.properties.e2e_sekce).includes('bez_soubehu') && JSON.stringify(ar.schema.properties.e2e_sekce).includes('doba_min'), 'e2e_sekce ve schématu s doba_min a bez_soubehu')
    rozhrani(k, volani)
    return k.chyby
  },
}
