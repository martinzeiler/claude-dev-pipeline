// 230 · stavba a kolečko · 1.11.0 (spec I6): testy nad 70 % limitu jdou do follow-ups „zlevnit stráž“, za blok každý jednou; uzavření opakovanou položku
// nepřidává (stráže v běhu brief-a-provedeni běžely 4,0 až 4,3 s při limitu 5 s).
import { argsStavby, argsKolecko, kontrola, zelenaBrana, e2ePass, oprava } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const P = [{ test: 'x.test.ts > straz', ms: 4100, limit: 5000 }]

export default {
  nazev: 'testy u limitu do follow-ups',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: l => {
    if (/^verify:/.test(l)) return zelenaBrana({ pomale: P })
    if (l === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 A', selhani: 'x' }] })
    if (l === 'fix-e2e:řez 05:1') return oprava()
    return null
  },
  async over(v, volani, logy) {
    const k = kontrola(volani)
    const u = k.jeden('uzavření:řez 05')
    k.obsahuje(u, 'zlevnit stráž: x.test.ts > straz (4100 ms z limitu 5000 ms)', 'follow-up')
    k.obsahuje(u, 'Položku „zlevnit stráž: <test>“ vynech, když ji follow-ups pro tentýž test už otevřenou nesou', 'pravidlo uzavření')
    k.rovno(u ? u.prompt.split('zlevnit stráž: x.test.ts').length - 1 : 0, 1, 'dvě zelené brány, jedna položka')
    k.ok(logy.some(l => /1 testů nad 70 % limitu/.test(l)), 'log')
    const kl = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => /^verify:/.test(l) ? zelenaBrana({ pomale: P }) : null })
    const m = kontrola(kl.volani)
    m.obsahuje(m.jeden('závěr:kolečko'), 'zlevnit stráž: x.test.ts > straz (4100 ms z limitu 5000 ms)', 'follow-up v kolečku')
    k.chyby.push(...m.chyby)
    return k.chyby
  },
}
