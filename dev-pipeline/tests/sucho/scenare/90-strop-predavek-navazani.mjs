// 90 · stavba · 1.6.0 (spec § 1.2, § 1.8): část na stropu předávek předá dalšímu pokusu poslední předávku a follow-upy předchůdců
// jdou do uzavření (běh web-rijen: K8 řezu 10 postupovala, pokus 2 začal od nuly a 15 follow-upů se ztratilo). Od 1.9.0 je
// strop jednotných 8 předávek; část z casti_nad_stropem zvláštní strop nemá, jen log při startu.
import { argsStavby, casti, kontrola, stub, hash, parsujLabel, CWD } from '../stuby.mjs'

const predavka = label => `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md`

export default {
  nazev: 'strop předávek: navázání v dalším pokusu, jednotný strop 8',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), casti_nad_stropem: ['K2'], max_pokusu: 2 }),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ !== 'implement' || l.role !== 'cast') return null
    if (l.cast === 'K1' && l.pokus === 1) return stub(label, { stav: 'castecne', predavka: predavka(label), follow_ups: ['FU-90 z řetězu K1'] })
    if (l.cast === 'K2' && l.pokus === 1 && l.naslednik <= 4) return stub(label, { stav: 'castecne', predavka: predavka(label) })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.jeden('implement:řez 05:část K2:1:n5')
    k.jeden('implement:řez 05:část K1:1:n9'); k.nic(/^implement:řez 05:část K1:1:n10/, 'desátý agent řetězu K1')
    k.ok(logy.some(l => l.includes('část K2 start (odhad nad stropem)')), 'log startu části nad stropem')
    k.nic(/^implement:řez 05:část K2:2/, 'K2 nad stropem dokončila v pokusu 1')
    k.obsahuje(k.jeden('implement:řez 05:část K1:2'), `poslední zápis stavu je ${predavka('implement:řez 05:část K1:1:n9')}`, 'poslední předávku K1 z pokusu 1')
    k.obsahuje(k.jeden('uzavření:řez 05'), 'FU-90 z řetězu K1', 'follow-up předchůdců na stropu')
    return k.chyby
  },
}
