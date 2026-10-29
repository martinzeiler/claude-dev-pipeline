// 119b · stavba · revize 1.7.0 (plan-check 9, code-review N2): když uzavření zastaveného bloku seznamy nezapíše, návrat je nese
// celé za celý blok (i follow-upy a odchylky neúspěšného pokusu 1), se seznamy_zapsane: false a bez zastaveno_soubor; zapíše je
// orchestrátor. Dřív nesl jen seznamy aktuálního pokusu a log tvrdil, že „jdou v návratu“.
import { argsStavby, kontrola, stub, e2ePass, oprava, pokusZ } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK3 Uložení formuláře: uložení neprojde'] })

export default {
  nazev: 'zastavení se selhaným zápisem nese seznamy celého bloku',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label === 'implement:řez 05:1') return stub(label, { follow_ups: ['FU-119b z pokusu 1'], odchylky_od_prd: ['ODCH-119b z pokusu 1'] })
    if (/^e2e:řez 05:[12]$/.test(label) && pokusZ(stav) === 1) return FAIL
    if (label === 'fix-e2e:řez 05:1' && pokusZ(stav) === 1) return oprava({ opraveno: 0, zmenena_mista: [] })
    if (label === 'implement:řez 05:2') return stub(label, { follow_ups: ['FU-119b z pokusu 2'] })
    if (label === 'deploy:řez 05:p2:1') return stub(label, { stav: 'failed', infra: true, duvod: 'railway: unauthorized' })
    if (label === 'uzavření:řez 05:zastaveno') return { ok: false, vysledek_soubor: '', poznamka: 'zápis selhal' }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', infra: true, pokusy: 2 })
    k.ok(v && v.seznamy_zapsane === false && !v.zastaveno_soubor, `seznamy_zapsane ${v && v.seznamy_zapsane}, zastaveno_soubor ${v && v.zastaveno_soubor}`)
    const fu = (v && v.follow_ups) || []
    k.ok(fu.some(x => /FU-119b z pokusu 1/.test(x)) && fu.some(x => /FU-119b z pokusu 2/.test(x)), `follow_ups: ${JSON.stringify(fu)}`)
    k.ok(((v && v.odchylky) || []).some(x => /ODCH-119b z pokusu 1/.test(x)), `odchylky: ${JSON.stringify(v && v.odchylky)}`)
    return k.chyby
  },
}
