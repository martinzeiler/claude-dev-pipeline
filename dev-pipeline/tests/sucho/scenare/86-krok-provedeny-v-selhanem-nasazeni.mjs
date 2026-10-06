// 86 · stavba · 1.6.0 (spec § 1.1): krok, který proběhl v nasazení, jež jako celek selhalo na jiném kroku, se zapíše jako provedený.
// Dorovnání ho vrátí jako vynechaný (provedeno dříve) a není to selhání (běh web-rijen: řez 2 provedené kroky nezapsal a opakoval je).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'provedený krok ze selhaného nasazení se neopakuje',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label !== 'deploy:řez 05:1') return null
    if (stav.pocty[label] === 1) return stub(label, { kroky_po_nasazeni: [{ id: 1, krok: 'MIGRACE-86 dat', stav: 'provedeno', duvod: '' }, { id: 2, krok: 'PURGE-86 keše', stav: 'selhalo', duvod: '403 z API' }] })
    return stub(label, { kroky_po_nasazeni: [{ id: 1, krok: 'migrace dat 86', stav: 'vynechano', duvod: 'provedeno v předchozím nasazení' }, { id: 2, krok: 'PURGE-86 keše', stav: 'provedeno', duvod: '' }] })
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.rovno(v && v.nasazeni && v.nasazeni.length, 2, 'návrat.nasazeni (dvě nasazení)')
    k.rovno(v && v.nasazeni && v.nasazeni[0].kroky_po_nasazeni.map(x => x.id), [1, 2], 'čísla kroků v historii nasazení')
    const d2 = volani.filter(x => x.label === 'deploy:řez 05:1')[1]
    k.obsahuje(d2, 'už provedlo: 1. MIGRACE-86', 'krok provedený v nasazení, které selhalo')
    return k.chyby
  },
}
