// 210 · stavba a kolečko · 1.11.0 (spec A2): build verzi po bráně zvedá deploy jen přenosem markeru, nikdy sedem. Sed změnil strom a git commit
// pak pustil plnou suitu (běh brief-a-provedeni: 8,5 h z 15,2 h agentů deploye).
import { argsStavby, argsKolecko, kontrola, PLUGIN, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const PRIKAZ = `bash ${PLUGIN}/scripts/verify-marker.sh --zvedni ${CWD} <soubor> <stará> <nová>`

export default {
  nazev: 'deploy zvedá build verzi přenosem markeru',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: () => null,
  async over(v, volani) {
    const k = kontrola(volani)
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, PRIKAZ, 'příkaz přenosu markeru'); k.obsahuje(d, 'nikdy sedem', 'zákaz sedu')
    const kl = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: () => null })
    const m = kontrola(kl.volani)
    m.obsahuje(m.jeden('deploy:kolečko:1'), PRIKAZ, 'příkaz přenosu markeru v kolečku')
    k.chyby.push(...m.chyby)
    return k.chyby
  },
}
