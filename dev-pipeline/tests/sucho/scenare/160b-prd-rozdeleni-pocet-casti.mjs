// 160b · PRD · 1.8.0 rozdělení před autory podle počtu částí (spec 1.8.0 § 2.11; od 1.9.0 strop 12): 13 částí po 400 ř. je 1,5 × 5 200 =
// 7 800 ř. pod stropem řádků, ale přes strop 12 částí; architekt návrh vrátil sám, blok tedy žádné další volání nepouští.
import { argsPrd, kontrola, rozhrani, stub } from '../stuby.mjs'

const CASTI11 = Array.from({ length: 13 }, (_, i) => ({ id: `K${i + 1}`, nazev: `část ${i + 1}`, soubory: [`apps/sucho/k${i + 1}/**`], kriteria: [`AK${i + 1}`], odhad_radku: 400, zavisi_na: [] }))
const NAVRH = 'NAVRH-160b: podle oblastí na dva řezy'

export default {
  nazev: 'PRD: přes 12 částí ukončí blok po architektovi',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 13, casti: CASTI11, odhad_radku: 5200, kontrakt_potreba: true, rozdelit_navrh: NAVRH })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, faze: 'architekt', rozdelit_navrh: NAVRH, casti_pocet: 13 })
    k.pocet(/./, 1, 'jen architekt (návrh vrátil sám)')
    k.ok(logy.some(l => l.includes('rozdělení před autory: 1.5 × odhad částí 5200 ř. = 7800 ř. (strop 8000), částí 13 (strop 12)')), 'log výpočtu rozdělení')
    rozhrani(k, volani)
    return k.chyby
  },
}
