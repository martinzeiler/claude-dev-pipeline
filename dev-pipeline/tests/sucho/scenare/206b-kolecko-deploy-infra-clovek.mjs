// 206b · kolečko · 1.10.0 (spec H2): infra selhání třídy clovek (vypršelé přihlášení CLI) zůstává zastavením deploy-infra, které čeká
// na člověka; výpadek platformy se od něj liší jen třídou.
import { argsKolecko, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'kolečko: infra selhání třídy clovek zůstává deploy-infra',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'deploy:kolečko:1') return stub(label, { stav: 'failed', infra: true, infra_trida: 'clovek', duvod: 'railway: Unauthorized, run railway login' })
    return null
  },
  over(v) {
    const k = kontrola([])
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'deploy-infra', obnova_od: 'deploy', infra: true })
    return k.chyby
  },
}
