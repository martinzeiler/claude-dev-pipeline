// 77 · stavba · 1.5.0: mapa sekcí kostry z bloku PRD (mapa_kostry) jde refreshi, kontraktu, částem, integraci a opravě s pokynem
// číst kostru po sekcích (běh web-podzim: 92 celých čtení kostry v bloku PRD).
import { argsStavby, casti, kontrola } from '../stuby.mjs'

const MAPA = '1-40 ## Kontrakt\n41-90 ## Části\n91-120 ## Nasazení a kroky po něm'

export default {
  nazev: 'mapa kostry v zadáních stavby',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, mapa_kostry: MAPA, prd_stale: ['řez 04 (sucho)'] }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const l of ['prd-refresh:řez 05', 'implement:řez 05:kontrakt:1', 'implement:řez 05:část K1:1', 'implement:řez 05:část K2:1', 'implement:řez 05:integrace:1']) {
      const x = k.jeden(l)
      k.obsahuje(x, 'čti po sekcích podle mapy', 'pokyn číst kostru po sekcích')
      k.obsahuje(x, '41-90 ## Části', 'mapu kostry')
    }
    return k.chyby
  },
}
