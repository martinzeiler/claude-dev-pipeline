// 58 · stavba · doplnění revize (E): bezpečnostní oprava z E2E jde deployi s cestami odvozenými ze zmenena_mista („soubor: symbol“
// → soubor); místo, které cestou není, zůstane jen v popisu. Deploy podle souborů pozná, zda jde o samostatný commit.
import { argsStavby, kontrola, e2ePass, oprava } from '../stuby.mjs'

export default {
  nazev: 'bezpečnostní oprava z E2E: soubory jako cesty',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { zavazne_mimo_ak: ['SEC-58: /api/org/:id vrací cizí organizaci'] })
    if (label === 'fix-security:řez 05') return oprava({ security: true, zmenena_mista: ['apps/api/org.ts: getOrg', 'ověření vlastníka v middleware'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const d = k.jeden('deploy:řez 05:3')
    k.obsahuje(d, '(soubory: apps/api/org.ts)', 'soubory bezpečnostní opravy jako cesty')
    k.obsahuje(d, 'ověření vlastníka v middleware', 'místo bez cesty v popisu')
    return k.chyby
  },
}
