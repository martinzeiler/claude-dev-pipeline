// 59 · kolečko · doplnění revize (E, A): bezpečnostní oprava z E2E kolečka jde deployi(3) s cestami ze zmenena_mista, text místa
// jen v popisu; E2E kolečka uzná jako shodu i pozdější commit, který mění jen docs/.
import { argsKolecko, kontrola, e2ePass, oprava } from '../stuby.mjs'

export default {
  nazev: 'kolečko: soubory bezpečnostní opravy z E2E',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'e2e:kolečko:1') return e2ePass(5, { zavazne_mimo_ak: ['SEC-59: /api/org/:id vrací cizí organizaci'] })
    if (label === 'fix-security:kolečko:e2e') return oprava({ zmenena_mista: ['apps/api/org.ts: getOrg'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const d = k.jeden('deploy:kolečko:3')
    k.obsahuje(d, '(apps/api/org.ts)', 'soubory bezpečnostní opravy jako cesty')
    k.obsahuje(d, 'apps/api/org.ts: getOrg', 'změněné místo v popisu')
    k.obsahuje(k.jeden('e2e:kolečko:1'), 'mění jen docs/', 'shodu i s pozdějším commitem jen v docs/')
    return k.chyby
  },
}
