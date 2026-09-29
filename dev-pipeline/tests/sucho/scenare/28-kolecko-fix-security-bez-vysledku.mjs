// 28 · kolečko · revize 1.4.0 nález 2: E2E najde závažný nález mimo kritéria, fix-security nevrátí výsledek. Nález se nesmí ztratit:
// jde do follow_ups i do rozhodnuti (rozhodne majitel), kolečko doběhne.
import { argsKolecko, kontrola, e2ePass, NIC } from '../stuby.mjs'

const SEC = 'SEC-IDOR-28: /api/org/:id vrací cizí organizaci'

export default {
  nazev: 'kolečko: fix-security bez výsledku',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'e2e:kolečko:1') return e2ePass(5, { zavazne_mimo_ak: [SEC] })
    if (label === 'fix-security:kolečko:e2e') return NIC
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.ok(JSON.stringify((v && v.follow_ups) || []).includes('SEC-IDOR-28'), `návrat.follow_ups bez nálezu: ${JSON.stringify(v && v.follow_ups)}`)
    k.ok(JSON.stringify((v && v.rozhodnuti) || []).includes('SEC-IDOR-28'), `návrat.rozhodnuti bez nálezu: ${JSON.stringify(v && v.rozhodnuti)}`)
    k.nic(/^deploy:kolečko:3/, 'deploy bezpečnostní opravy bez opravy')
    return k.chyby
  },
}
