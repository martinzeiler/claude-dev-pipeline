// 133 · PRD · 1.7.0 čekání na rozhodnutí majitele a kroky po nasazení (spec 1.7.0 § 1.1 a § 1.12): architekt vrátí kritérium,
// jehož data vznikají časem a Povolení je nepokrývá (cekani), a rozsah kroků po nasazení. Obojí jde v části pro orchestrátora
// (ten se před stavbou zeptá majitele a pět řádků před řezem uvede kroky), ne ve stavba. cekani je v PRD_SCHEMA povinné.
import { argsPrd, kontrola, rozhrani, stub } from '../stuby.mjs'

const CEKANI = [{ kriterium: 'AK2 Útrata dne podle modelu', potreba: 'den provozu po nasazení; ruční běhy Povolení nepokrývá', odhad_h: 14 }]

export default {
  nazev: 'PRD: cekani a kroky_po_nasazeni pro orchestrátora',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { cekani: CEKANI, kroky_po_nasazeni: { pocet: 3, doba_min: 45 } })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, cekani: CEKANI, kroky_po_nasazeni: { pocet: 3, doba_min: 45 } })
    k.ok(v && v.stavba && !('cekani' in v.stavba) && !('kroky_po_nasazeni' in v.stavba), 'cekani a kroky_po_nasazeni nepatří do stavba')
    const ar = k.jeden('prd:řez 05')
    k.pole(ar, ['cekani', 'kroky_po_nasazeni'], 'PRD_SCHEMA')
    k.ok(ar && ar.povinne.includes('cekani'), 'PRD_SCHEMA: cekani povinné')
    rozhrani(k, volani)
    return k.chyby
  },
}
