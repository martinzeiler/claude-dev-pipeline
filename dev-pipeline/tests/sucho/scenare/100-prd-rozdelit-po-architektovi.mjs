// 100 · PRD · 1.6.0 návrh rozdělit řez ukončí blok po architektovi (spec 1.6.0 § 1.8): žádní autoři ani kontroly, návrat nese
// faze „architekt“, rozdelit_navrh a pole stavby (casti) pro pokračování od_faze „autori“. Běh web-rijen: rozdělení řezu 10
// by zahodilo PRD za $125, orchestrátor ho proto odmítl a stavba trvala 309 min na 2 pokusy.
import { argsPrd, kontrola, rozhrani, stub } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export const NAVRH = 'ROZDELIT-100: K1+K2 jako řez 05a, K3 jako 05b'

export default {
  nazev: 'PRD: návrh rozdělit řez ukončí blok po architektovi',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 30, casti: CASTI3, odhad_radku: 13000, kontrakt_potreba: true, rozdelit_navrh: NAVRH })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, faze: 'architekt', rozdelit_navrh: NAVRH, casti_pocet: 3, kontrola: null })
    k.pocet(/./, 1, 'jen architekt')
    k.nic(/^prd-část:|^prd-check:|^prd-fix:/, 'autoři, kontroly a zapracování po návrhu rozdělit')
    k.rovno(((v && v.stavba) || {}).casti && v.stavba.casti.map(c => c.id), ['K1', 'K2', 'K3'], 'návrat.stavba.casti pro pokračování')
    k.obsahuje(k.jeden('prd:řez 05'), 'blok skončí po tobě a orchestrátor rozhodne', 'pokyn architektovi k návrhu rozdělit')
    k.ok(logy.some(l => /návrh rozdělit řez: blok končí po architektovi/.test(l)), 'log o konci po architektovi')
    rozhrani(k, volani)
    return k.chyby
  },
}
