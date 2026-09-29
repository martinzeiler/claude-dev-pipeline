// 35 · stavba · revize 1.4.0 nález 4: část K1 vrátí odchylku „security: …“, pokus 1 ji commitne (fix(security)) a padne v E2E.
// Pokus 2 sbírá výsledky hotových částí znovu, deploy ale tutéž opravu podruhé nedostane; hash z pokusu 1 zůstane v návratu.
import { argsStavby, casti, kontrola, stub, e2ePass, pokusZ } from '../stuby.mjs'

const SEC = 'a'.repeat(40)

export default {
  nazev: 'bezpečnostní odchylka části jde deployi jednou',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]) }),
  odpoved(label, p, o, stav) {
    if (label === 'implement:řez 05:část K1:1') return stub(label, { odchylky_od_prd: ['security: SEC-CSRF-35 token v apps/sucho/k1'] })
    if (label === 'deploy:řez 05:1' && pokusZ(stav) === 1) return stub(label, { security_commity: [SEC] })
    if (/^e2e:řez 05:[12]$/.test(label) && pokusZ(stav) === 1) return e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK1: tlačítko nic nedělá'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    const s = volani.filter(x => /^deploy:/.test(x.label) && x.prompt.includes('SEC-CSRF-35'))
    k.ok(s.length === 1, `bezpečnostní odchylka v zadání deploye ${s.length}× (${s.map(x => x.label).join(', ')})`)
    k.ok(v && (v.security_commity || []).includes(SEC), `návrat.security_commity: ${JSON.stringify(v && v.security_commity)}`)
    return k.chyby
  },
}
