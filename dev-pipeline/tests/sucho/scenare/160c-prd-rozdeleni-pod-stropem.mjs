// 160c · PRD · 1.8.0 rozdělení před autory se nespustí pod stropem: pět částí po 1 000 ř. je 1,5 × 5 000 = 7 500 < 8 000
// a částí 5 < 10; blok pokračuje autory částí a kontrolami jako dřív, bez volání návrhu rozdělení.
import { argsPrd, kontrola, rozhrani, stub, casti } from '../stuby.mjs'

const CASTI5 = casti([['K1'], ['K2'], ['K3', ['K1']], ['K4'], ['K5']])

export default {
  nazev: 'PRD: 1,5× odhad pod stropem pokračuje autory',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI5, odhad_radku: 5000, kontrakt_potreba: true })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, casti_pocet: 5, rozdelit_navrh: '' })
    k.ok(v && v.faze !== 'architekt', 'blok nemá skončit po architektovi')
    k.nic(/^prd-fix:řez 05:rozdělit$/, 'návrh rozdělení pod stropem')
    k.pocet(/^prd-část:/, 5, 'autoři částí')
    k.pocet(/^prd-check:/, 6, 'kontroly kola 1 (kostra a pět částí)')
    k.ok(!logy.some(l => l.includes('rozdělení před autory:')), 'log rozdělení pod stropem')
    rozhrani(k, volani)
    return k.chyby
  },
}
