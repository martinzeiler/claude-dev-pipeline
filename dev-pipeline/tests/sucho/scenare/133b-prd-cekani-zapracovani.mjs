// 133b · PRD · 1.7.0 cekani po zapracování (spec 1.7.0 § 1.1): zapracování, které pole cekani vrátí (i prázdné, majitel rozšířil
// Povolení), přebije původní; kroky_po_nasazeni platí z původního. Dlouhý výčet je ve scénáři 133c.
import { argsPrd, kontrola, stub, CWD } from '../stuby.mjs'

export default {
  nazev: 'PRD: zapracování vyprázdní cekani z původního běhu',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, nalezy: ['majitel rozšířil P2 o ruční běh: AK2 měř nad ním'], puvodni: { kriteria: 8, cekani: [{ kriterium: 'AK2 Útrata dne', potreba: 'den', odhad_h: 14 }], kroky_po_nasazeni: { pocet: 2, doba_min: 20 } } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { cekani: [] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, cekani: [], kroky_po_nasazeni: { pocet: 2, doba_min: 20 } })
    return k.chyby
  },
}
