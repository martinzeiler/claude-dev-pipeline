// 66 · stavba · 1.5.0 (spec § 1.4): krok, který nasazení 1 provedlo, vrátí nasazení 2 (oprava po E2E) jako vynechano. Není to
// selhání: blok ho zná ze svého záznamu kroků (běh web-podzim: řez 04 padl na krocích „provedeno v nasazení 1“, pokus 2 stál
// 94 min a přepsal doklad). Deploy 2 dostane seznam kroků provedených předchozím nasazením.
import { argsStavby, kontrola, stub, e2ePass } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK2: tlačítko nic neuloží'] })

export default {
  nazev: 'krok provedený v nasazení 1 není v nasazení 2 selhání',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return FAIL
    if (label === 'deploy:řez 05:1') return stub(label, { kroky_po_nasazeni: [{ krok: 'IMPORT-66 knihy.py --zapis', stav: 'provedeno', duvod: '' }] })
    if (label === 'deploy:řez 05:2') return stub(label, { kroky_po_nasazeni: [{ krok: ' import-66 KNIHY.py --zapis ', stav: 'vynechano', duvod: 'provedeno v předchozím nasazení' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const d1 = k.jeden('deploy:řez 05:1'), d2 = k.jeden('deploy:řez 05:2')
    k.neobsahuje(d1, 'Předchozí nasazení tohoto řezu', 'seznam provedených kroků v prvním nasazení')
    k.obsahuje(d2, 'Předchozí nasazení tohoto řezu už provedlo: IMPORT-66', 'kroky provedené nasazením 1')
    k.nic(/^implement:řez 05:2$/, 'pokus 2 kvůli kroku provedenému v nasazení 1')
    return k.chyby
  },
}
