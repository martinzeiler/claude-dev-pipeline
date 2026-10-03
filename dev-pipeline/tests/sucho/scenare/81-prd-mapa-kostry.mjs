// 81 · PRD · 1.5.0 mapa sekcí kostry (spec 1.5.0 § 1.14 bod 3): architekt vrátí mapa_kostry, autoři, kontroly a zapracování
// kostry ji dostanou v zadání; zapracování kostry vrátí novou mapu a zapracování částí i delta kostry dostanou tu novou;
// návrat bloku nese aktuální mapu (pro režim zapracování a stavbu).
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const MAPA1 = 'MAPA-KOSTRY-1: 1-30 ## Cíl · 31-90 ## Kontrakt · 91-120 ## Části'
const MAPA2 = 'MAPA-KOSTRY-2: 1-30 ## Cíl · 31-110 ## Kontrakt · 111-140 ## Části'
const IDS = CASTI3.map(c => c.id)

export default {
  nazev: 'PRD: mapa sekcí kostry jde čtenářům kostry',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true, mapa_kostry: MAPA1 })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-fix:řez 05') return stub(label, { zmenena_mista: ['Kontrakt: typ Rozpocet'], mapa_kostry: MAPA2 })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, mapa_kostry: MAPA2 })
    const ar = k.jeden('prd:řez 05')
    k.pole(ar, ['mapa_kostry'], 'PRD_SCHEMA')
    k.obsahuje(ar, 'mapa_kostry', 'pokyn vrátit mapu kostry')
    for (const id of IDS) { const a = k.jeden(`prd-část:řez 05:${id}`); k.obsahuje(a, MAPA1, 'mapu kostry od architekta'); k.obsahuje(a, 'jen sekce, které potřebuješ') }
    const ks = k.jeden('prd-check:řez 05:1')
    k.obsahuje(ks, MAPA1, 'mapu kostry v kontrole kostry')
    for (const id of IDS) k.obsahuje(k.jeden(`prd-check:řez 05:část ${id}:1`), MAPA1, 'mapu kostry v kontrole části')
    const fk = k.jeden('prd-fix:řez 05')
    k.obsahuje(fk, MAPA1, 'mapu kostry v zapracování kostry'); k.obsahuje(fk, 'aktuální mapa_kostry', 'pokyn vrátit aktuální mapu')
    for (const id of IDS) { const f = k.jeden(`prd-fix:řez 05:část ${id}`); k.obsahuje(f, MAPA2, 'novou mapu po zapracování kostry'); k.neobsahuje(f, MAPA1, 'starou mapu') }
    k.obsahuje(k.jeden('prd-check:řez 05:2'), MAPA2, 'novou mapu v delta kontrole kostry')
    rozhrani(k, volani)
    return k.chyby
  },
}
