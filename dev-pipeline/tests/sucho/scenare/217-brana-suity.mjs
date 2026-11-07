// 217 · stavba a kolečko · 1.11.0 (spec C4): počty po okruzích sečte blok, ručně sečtené proslo agenta neplatí (3 z 11 návratů kolečka špatně);
// log uvede i počet souborů. Okruhy bez jediného prošlého testu jsou červená brána.
import { argsStavby, argsKolecko, kontrola, zelenaBrana } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const SUITY = [{ nazev: 'api', soubory: 10, testy: 100 }, { nazev: 'web', soubory: 3, testy: 20 }]

export default {
  nazev: 'počty brány sečte blok z okruhů',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: l => l === 'verify:řez 05:1' ? zelenaBrana({ proslo: 999, suity: SUITY }) : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.ok(logy.some(l => /agent hlásil 999 prošlých testů, součet okruhů je 120; platí součet/.test(l)), 'log rozdílu')
    k.ok(logy.some(l => /brána zelená: 120 testů v 13 souborech/.test(l)), 'log počtu souborů')
    const nula = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'verify:řez 05:1' ? zelenaBrana({ proslo: 50, suity: [{ nazev: 'api', soubory: 0, testy: 0 }] }) : null })
    k.ok(nula.volani.some(x => x.label === 'fix-brana:řez 05'), 'okruhy bez prošlého testu jsou červená brána')
    const kl = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'verify:kolečko:před nasazením:1' ? zelenaBrana({ proslo: 999, suity: SUITY }) : null })
    k.ok(kl.vysledek && kl.vysledek.verify && kl.vysledek.verify.proslo === 120, `kolečko: verify ${JSON.stringify(kl.vysledek && kl.vysledek.verify)}`)
    return k.chyby
  },
}
