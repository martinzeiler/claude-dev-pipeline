// 216 · stavba a kolečko · 1.11.0 (spec C2): zelená celá suita po opakování je zelená i nad stropem flaky; testy z prvního běhu jdou do follow-ups,
// log uvede důvod. Bez opakovano zůstává strop (176b).
import { argsStavby, argsKolecko, kontrola, zelenaBrana } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const FLAKY = ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts', 'e.test.ts']

export default {
  nazev: 'zopakovaná celá suita je zelená i nad stropem flaky',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: l => l === 'verify:řez 05:1' ? zelenaBrana({ flaky: FLAKY, opakovano: true }) : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^fix-brana:/, 'oprava brány po zelené zopakované suitě')
    k.pole(k.jeden('verify:řez 05:1'), ['opakovano', 'suity', 'pomale'], 'VERIFY')
    k.ok(logy.some(l => /první běh suity byl červený, zopakovaná celá suita je zelená; testy z prvního běhu \(5\)/.test(l)), 'log důvodu')
    k.ok(logy.some(l => /brána zelená: 120 testů \(po zopakování celé suity\)/.test(l)), 'log zelené brány')
    k.obsahuje(k.jeden('uzavření:řez 05'), 'test a.test.ts padl v prvním běhu suity a v zopakované prošel', 'follow-up nestability')
    const kl = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'verify:kolečko:před nasazením:1' ? zelenaBrana({ flaky: FLAKY, opakovano: true }) : null })
    const m = kontrola(kl.volani)
    m.nic(/^fix-brana:/, 'oprava brány kolečka po zelené zopakované suitě')
    m.obsahuje(m.jeden('závěr:kolečko'), 'test a.test.ts padl v prvním běhu suity a v zopakované prošel', 'follow-up nestability v kolečku')
    k.chyby.push(...m.chyby.map(x => `kolečko: ${x}`))
    return k.chyby
  },
}
