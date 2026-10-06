// 77 · stavba · 1.6.0 (spec § 1.3): mapa sekcí kostry se blokům nepředává (běh web-rijen: ručně přepsané args stavby 8 nesly mapu
// řezu 7). Refresh, kontrakt, části a integrace řezu s částmi dostanou pokyn udělat si mapu sami přes rg; pole mapa_kostry od starého
// volajícího blok ignoruje.
import { argsStavby, casti, kontrola, CWD } from '../stuby.mjs'

const MAPA = '1-40 ## Kontrakt\n41-90 ## Části-77\n91-120 ## Nasazení a kroky po něm'

export default {
  nazev: 'mapa kostry si agenti dělají sami',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, mapa_kostry: MAPA, prd_stale: ['řez 04 (sucho)'] }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const l of ['prd-refresh:řez 05', 'implement:řez 05:kontrakt:1', 'implement:řez 05:část K1:1', 'implement:řez 05:část K2:1', 'implement:řez 05:integrace:1']) {
      const x = k.jeden(l)
      k.obsahuje(x, `Mapu sekcí kostry si udělej sám: \`rg -n '^## ' ${CWD}/docs/prd/rez-05-sucho.md\``, 'pokyn udělat si mapu kostry')
      k.neobsahuje(x, 'Části-77', 'mapu z args')
    }
    return k.chyby
  },
}
