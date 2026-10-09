// 134e · PRD · 1.7.0 kontrola opisu args (review 1.7.0, N1): první opis ztratí kontrakt_rez a druhé načtení vrátí návrat bez _pole
// a pořád bez kontrakt_rez. Druhé načtení se měří proti _pole prvního, takže blok skončí ok: false a nic nespustí (stavba a
// kolečko dřív rozdíl bez _pole tiše přijaly a běžely bez pole).
import { kontrola, CWD, PLUGIN, S } from '../stuby.mjs'
import { ARGS_134, POLE_134 } from './134-prd-args-pole.mjs'

const { kontrakt_rez, ...BEZ } = ARGS_134

export default {
  nazev: 'PRD: druhé načtení bez _pole s chybějícím polem, blok skončí',
  blok: 'blok-prd',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.prd-05.json' },
  odpoved(label, prompt, opts, stav) {
    if (label === 'args:řez 05') return stav.pocty[label] === 1 ? { ...BEZ, _pole: POLE_134 } : { ...BEZ }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(/args_file: opis nesedí \(chybí: kontrakt_rez; navíc: –\)/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.pocet(/./, 2, 'jen dvě načtení args')
    return k.chyby
  },
}
