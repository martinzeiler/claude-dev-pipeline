// 176 · stavba · 1.9.0 (§ 4.3): test, který v bráně prošel až samostatně po timeoutu pod zátěží, vrátí brána ve flaky; zelená platí
// a každý takový test jde do follow-ups k zlevnění měření (nezvedat limit). Nad 3 testy ve flaky je brána červená (176b).
import { argsStavby, kontrola, zelenaBrana } from '../stuby.mjs'

export default {
  nazev: 'brána zelená s flaky: follow-up na zlevnění testu',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'verify:řez 05:1') return zelenaBrana({ flaky: ['apps/sucho/pomaly.test.ts'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.pole(k.jeden('verify:řez 05:1'), ['flaky'], 'VERIFY')
    k.nic(/^fix-brana:/, 'oprava brány u zelené s flaky')
    k.obsahuje(k.jeden('uzavření:řez 05'), '[řez 05 · testy] [oprava] test apps/sucho/pomaly.test.ts přesáhl limit pod zátěží, zlevni měření (nezvedej limit)', 'follow-up flaky v uzavření')
    k.ok(logy.some(l => l.includes('brána: 1 test prošel až samostatně po timeoutu pod zátěží (apps/sucho/pomaly.test.ts); jdou do follow-ups')), 'log flaky')
    return k.chyby
  },
}
