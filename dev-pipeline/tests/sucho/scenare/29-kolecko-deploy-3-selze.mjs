// 29 · kolečko · revize 1.4.0 nález 2: bezpečnostní oprava po E2E projde bránou, deploy(3) selže mimo infra. Kolečko selže ve fázi
// deploy (review_passed false), závěr ani commit závěru neběží (oprava by skončila v „kolecko: závěr“ bez fix(security)),
// nález je ve follow_ups i v rozhodnuti.
import { argsKolecko, kontrola, e2ePass, oprava, stub, S } from '../stuby.mjs'

const SEC = 'SEC-IDOR-29: /api/org/:id vrací cizí organizaci'

export default {
  nazev: 'kolečko: deploy bezpečnostní opravy selže',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'e2e:kolečko:1') return e2ePass(5, { zavazne_mimo_ak: [SEC] })
    if (label === 'fix-security:kolečko:e2e') return oprava({ zmenena_mista: ['apps/api/org.ts: getOrg'] })
    if (label === 'deploy:kolečko:3') return stub(label, { stav: 'failed', infra: false, duvod: 'BUILD-PADL-29' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'deploy', obnova_od: 'deploy', review_passed: false })
    k.ok(S(v && v.detail).includes('BUILD-PADL-29'), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    k.ok(JSON.stringify((v && v.follow_ups) || []).includes('SEC-IDOR-29'), 'návrat.follow_ups bez nálezu')
    k.ok(JSON.stringify((v && v.rozhodnuti) || []).includes('SEC-IDOR-29'), 'návrat.rozhodnuti bez nálezu')
    k.nic(/^závěr:/, 'závěr po selhaném deployi bezpečnostní opravy')
    k.nic(/^commit:kolečko:závěr/, 'commit závěru by smetl nenasazenou bezpečnostní opravu')
    return k.chyby
  },
}
