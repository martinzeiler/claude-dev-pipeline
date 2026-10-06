// 95 · stavba · 1.6.0 (spec § 1.6, § 2 A1 thermo): FOLLOW-UP nálezy zůstávají v balíčcích; do follow-upů jde ten, který fix neopravil
// (opravene_ids), odmítnutý s důvodem a ten mimo balíčky (běh web-rijen: 0 z 60). FOLLOW-UP z kola 2 bez blokujících jde do follow-upů
// celý (2 CONFIRMED se ztratily). Thermo jen s NOTE samostatnou opravu nedostane (6 agentů za $1,49 se 2 opravami).
import { argsStavby, kontrola, stub, oprava } from '../stuby.mjs'

export default {
  nazev: 'FOLLOW-UP neopravený fixem, kolo 2 bez blokujících, thermo jen NOTE',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'review:řez 05:1') return stub(label, { nalezu: 4, blokujicich: 1, balicky: [{ soubory: ['apps/sucho/rez.ts'], nalezy: ['N1', 'N2-95', 'N3-95'] }], follow_up_ids: ['N2-95', 'N3-95', 'N4-95'] })
    if (label === 'fix:řez 05:1.1') return oprava({ opravene_ids: ['N1'], odmitnuto: [{ id: 'N3-95', duvod: 'DUVOD-95 mimo rozsah' }] })
    if (label === 'review:řez 05:2') return stub(label, { nalezu: 1, blokujicich: 0, balicky: [{ soubory: ['apps/sucho/rez.ts'], nalezy: ['N9-95'] }], follow_up_ids: ['N9-95'] })
    if (label === 'thermo:řez 05') return stub(label, { nalezu: 3, blokeru: 0, soubory: [] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const c = k.jeden('uzavření:řez 05')
    k.shoda(c, /N2-95 \(FOLLOW-UP z [^;]*; fix ho neopravil\)/, 'neopravený FOLLOW-UP')
    k.shoda(c, /N3-95 \(FOLLOW-UP z [^;]*; fix odmítl: DUVOD-95/, 'odmítnutý FOLLOW-UP s důvodem')
    k.shoda(c, /N4-95 \(FOLLOW-UP z /, 'FOLLOW-UP mimo balíčky')
    k.shoda(c, /N9-95 \(FOLLOW-UP z /, 'FOLLOW-UP kola 2 bez blokujících')
    k.neobsahuje(c, 'N1 (FOLLOW-UP', 'opravený nález')
    k.nic(/^fix:řez 05:2/, 'kolo 2 bez blokujících se neopravuje')
    k.nic(/^fix-thermo:/, 'thermo jen s NOTE')
    k.pole(k.jeden('fix:řez 05:1.1'), ['opravene_ids'], 'FIX')
    // opravene_ids je povinné (plan-check 1.6.0): nepovinné pole by fix bez něj bral jako „všechno opraveno“.
    const f = k.jeden('fix:řez 05:1.1'); k.ok(f && f.povinne.includes('opravene_ids'), `FIX.required bez opravene_ids: ${JSON.stringify(f && f.povinne)}`)
    return k.chyby
  },
}
