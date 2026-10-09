// 119 · stavba · 1.7.0 (spec § 1.5): i infra zastavení pustí uzavření v režimu zastaveno; běžné uzavření (a uzavření selhaného
// bloku) má větu, že seznamy zastaveného běhu připojí. Bez seznamů se uzavření zastaveného bloku nepouští (36 ho nemá).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'infra zastavení zapíše seznamy, uzavření je připojí',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, prompt, opts, stav) {
    if (label === 'implement:řez 05:1') return { ...stub(label), pasti_opravene: ['PAST-119'] }
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, duvod: 'wrangler: not logged in' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', infra: true })
    k.obsahuje(k.jeden('uzavření:řez 05:zastaveno'), 'PAST-119', 'pasti přerušeného běhu')
    // Revize 1.7.0: seznamy zapsané blokem jdou v návratu jen počtem se zastaveno_soubor a seznamy_zapsane: true (orchestrátor je neopisuje).
    k.ok(v && v.seznamy_zapsane === true && /\.vysledek-stavba-05-zastaveno\.json$/.test(v.zastaveno_soubor || '') && v.pasti_pocet === 1 && !(v.pasti_opravene || []).length,
      `seznamy_zapsane ${v && v.seznamy_zapsane}, zastaveno_soubor ${v && v.zastaveno_soubor}, pasti ${JSON.stringify(v && v.pasti_opravene)}`)
    return k.chyby
  },
}
