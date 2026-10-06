// 96 · stavba · 1.6.0 (spec § 1.6, § 1.1, § 2 A1): follow-upy a odchylky neúspěšného pokusu dojdou do uzavření (běh web-rijen: řez 2
// jich ztratil 19). Oprava po E2E, která nic nezměnila, nenasazuje. Deploy pokusu 2 dostane soubory oprav bloku jako soubory řezu.
import { argsStavby, kontrola, stub, e2ePass, oprava, pokusZ } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK3: uložení neprojde'] })

export default {
  nazev: 'seznamy neúspěšného pokusu, oprava po E2E bez změny',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label === 'implement:řez 05:1') return stub(label, { follow_ups: ['FU-96 z pokusu 1'], odchylky_od_prd: ['ODCH-96 z pokusu 1'] })
    if (/^e2e:řez 05:[12]$/.test(label) && pokusZ(stav) === 1) return FAIL
    if (label === 'fix-e2e:řez 05:1' && pokusZ(stav) === 1) return oprava({ opraveno: 0, zmenena_mista: [] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    const i2 = k.jeden('implement:řez 05:2')
    k.ok(!volani.some(x => x.label === 'deploy:řez 05:2' && i2 && x.start < i2.start), 'oprava bez změny v pokusu 1 nasazovala')
    const c = k.jeden('uzavření:řez 05')
    k.obsahuje(c, 'FU-96 z pokusu 1', 'follow-up neúspěšného pokusu')
    k.obsahuje(c, 'ODCH-96 z pokusu 1', 'odchylka neúspěšného pokusu')
    const d2 = volani.filter(x => x.label === 'deploy:řez 05:1').find(x => i2 && x.start > i2.start)
    k.obsahuje(d2, 'Změny pracovního stromu z oprav tohoto bloku (soubory: apps/sucho/rez.ts', 'soubory řezu v pokusu 2')
    return k.chyby
  },
}
