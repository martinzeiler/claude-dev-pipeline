// 168b · PRD · review 1.8.0 N10: zapracování kritérium prostředí vyřešilo (jmenuje ho ve změněných místech) a vrátí prázdné
// prostredi: z návratu zmizí jen to kritérium, ostatní architektova zůstávají; neprázdné pole od zapracování platí celé.
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'

const PROSTREDI = [
  { kriterium: 'AK3 Rychlost první odpovědi', duvod: 'bez stanoviště' },
  { kriterium: 'AK5 Doba exportu', duvod: 'cizí služba bez testovacího účtu' },
]

export default {
  nazev: 'PRD: zapracování vyřadí jen vyřešené kritérium prostředí',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { prostredi: PROSTREDI })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-fix:řez 05') return stub(label, { zmenena_mista: ['AK3: stanoviště CI běžec', 'AK1'], prostredi: [] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, prostredi: [PROSTREDI[1]] })
    rozhrani(k, volani)
    return k.chyby
  },
}
