// 54 · stavba · revize 1.4.0 nález 16: oprava brány vrátí security: true (bezpečnostní oprava bez commitu). Jde deployi jako
// fix(security) stejně jako oprava z review, jinak ji deploy commitne bez rozlišení nebo vůbec.
import { argsStavby, kontrola, zelenaBrana, oprava } from '../stuby.mjs'

export default {
  nazev: 'bezpečnostní oprava z opravy brány',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'verify:řez 05:1') return zelenaBrana({ selhalo: 1, exit_kod: 1 })
    if (label === 'fix-brana:řez 05') return oprava({ security: true, zmenena_mista: ['apps/sucho/session.ts: SEC-BRANA-54'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, 'SEC-BRANA-54', 'bezpečnostní opravu z opravy brány')
    k.obsahuje(d, 'apps/sucho/session.ts', 'soubor bezpečnostní opravy')
    k.obsahuje(d, 'fix(security)')
    return k.chyby
  },
}
