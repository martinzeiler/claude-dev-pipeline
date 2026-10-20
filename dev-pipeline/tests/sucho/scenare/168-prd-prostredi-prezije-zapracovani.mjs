// 168 · PRD · review 1.8.0 N10: prostredi z architekta přežije zapracování, které vrátí prázdné pole a kritérium prostředí
// ve změněných místech nejmenuje (stejná třída jako dřívější ztráta cekani). Zapracování dostane pokyn „Pole prostredi vrať celé“.
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'

const PROSTREDI = [{ kriterium: 'AK3 Rychlost první odpovědi', duvod: 'projekt nemá měřicí stanoviště mimo stroj běhu' }]

export default {
  nazev: 'PRD: prázdné prostredi ze zapracování nepřepíše architekta',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { prostredi: PROSTREDI })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-fix:řez 05') return stub(label, { zmenena_mista: ['AK1', 'AK2'], prostredi: [] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, prostredi: PROSTREDI })
    const fk = k.jeden('prd-fix:řez 05')
    k.obsahuje(fk, 'Pole prostredi vrať celé: i kritéria, která architekt označil „prostředí“ a zapracování je nevyřešilo', 'pokyn vrátit prostredi celé')
    rozhrani(k, volani)
    return k.chyby
  },
}
