// 65 · stavba · 1.5.0 (spec § 1.4): krok po nasazení se stavem pro-majitele (ruční nebo neblokující krok z PRD, chybí oprávnění)
// není selhání nasazení: řez je hotový na pokus 1 a krok jde do rozhodnutí (běh web-podzim: řez 11 padl na ručním kroku RUM).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'krok pro majitele není selhání nasazení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { kroky_po_nasazeni: [
      { krok: 'RESEED-65 pnpm db:reseed', stav: 'provedeno', duvod: '' },
      { krok: 'RUM-65 vypnout auto_install', stav: 'pro-majitele', duvod: 'token bez oprávnění RUM Edit' },
    ] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.pocet(/^deploy:/, 1, 'jediný deploy')
    k.nic(/^implement:řez 05:2$/, 'pokus 2 kvůli kroku pro majitele')
    k.ok(JSON.stringify((v && v.rozhodnuti) || []).includes('RUM-65'), `návrat.rozhodnuti bez kroku pro majitele: ${JSON.stringify(v && v.rozhodnuti)}`)
    return k.chyby
  },
}
