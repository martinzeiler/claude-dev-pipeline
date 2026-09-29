// 41 · stavba · revize 1.4.0 nález 8: deploy_mode commit-only, PRD má kroky po nasazení a deploy je poctivě vrátí jako vynechané
// (nasazuje majitel). To není selhání deploye: řez je hotový a kroky jdou do rozhodnuti jako práce majitele po nasazení.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'commit-only: vynechané kroky jdou majiteli',
  blok: 'blok-stavby',
  args: argsStavby({ deploy_mode: 'commit-only' }),
  odpoved(label) {
    if (label.startsWith('deploy:')) return stub(label, { stav: 'commit-only', kroky_po_nasazeni: [{ krok: 'RESEED-41 pnpm db:reseed', stav: 'vynechano', duvod: 'commit-only, nasazuje uživatel' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.ok(JSON.stringify((v && v.rozhodnuti) || []).includes('RESEED-41'), `návrat.rozhodnuti bez kroku pro majitele: ${JSON.stringify(v && v.rozhodnuti)}`)
    k.pocet(/^deploy:/, 1, 'jediný deploy')
    return k.chyby
  },
}
