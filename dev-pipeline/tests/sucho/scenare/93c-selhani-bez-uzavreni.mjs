// 93c · stavba · 1.6.0 (review 1.6.0 N3): když uzavření selhání nevrátí výsledek, jdou seznamy v návratu (zapíše je orchestrátor),
// ale zkrácené pod 6 000 znaků; podstatná pole stojí na začátku a hashe fix(security) se neztratí. Ubrané položky jdou do logu.
import { argsStavby, kontrola, NIC } from '../stuby.mjs'
import { odpovedSelhani } from './93b-selhani-pod-6000.mjs'

export default {
  nazev: 'selhání bez uzavření: návrat zkrácený pod 6 000 znaků',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'uzavření:řez 05:selhání') return NIC
    return odpovedSelhani(label)
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', pokusy: 3, seznamy_zapsane: false })
    const n = JSON.stringify(v || {}).length
    k.ok(n < 6000, `návrat selhání má ${n} znaků`)
    k.ok(v && (v.security_commity || []).length === 1, `security_commity: ${JSON.stringify(v && v.security_commity)}`)
    k.ok(v && Array.isArray(v.casti) && typeof v.predavky === 'number', 'části a předávky v návratu')
    k.ok(v && v.zkraceno && Object.keys(v.zkraceno).length > 0, `zkraceno: ${JSON.stringify(v && v.zkraceno)}`)
    k.ok(v && Object.keys(v).indexOf('security_commity') < Object.keys(v).indexOf('follow_ups'), 'hashe fix(security) před seznamy')
    return k.chyby
  },
}
