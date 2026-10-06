// 93b · stavba · 1.6.0 (review 1.6.0 N3): selhaný blok po třech pokusech nese seznamy všech pokusů. Zapíše je uzavření v režimu
// selhání (návrat pak nese počty) a návrat je pod 6 000 znaků; podstatná pole (fix(security) hashe, části) se neztratí ani tehdy,
// když uzavření selhání neproběhne (simulace review: 13,4 k znaků, hashe až na konci).
import { argsStavby, kontrola, stub, parsujLabel, e2ePass, hash, CWD } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK2: uložení padá'] })
const dlouhe = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${i} ${'z'.repeat(200)}`)
const SEC = hash('fix(security) 93b')

export const odpovedSelhani = label => {
  const l = parsujLabel(label)
  if (l.typ === 'implement') return stub(label, { follow_ups: dlouhe(`FU-93b-p${l.pokus}`, 6), odchylky_od_prd: dlouhe(`ODCH-93b-p${l.pokus}`, 2) })
  if (l.typ === 'e2e') return FAIL
  if (l.typ === 'deploy') return { ...stub(label), health: `aplikace: sucho@1 nasazeno | ${'h'.repeat(1000)}`, security_commity: [SEC] }
  return null
}

export default {
  nazev: 'selhání po třech pokusech: uzavření selhání a návrat pod 6 000 znaků',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'uzavření:řez 05:selhání') return stub('uzavření:řez 05', { vysledek_soubor: `${CWD}/docs/.vysledek-stavba-05.json` })
    return odpovedSelhani(label)
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', pokusy: 3, seznamy_zapsane: true, follow_ups: [], vysledek_soubor: `${CWD}/docs/.vysledek-stavba-05.json` })
    const n = JSON.stringify(v || {}).length
    k.ok(n < 6000, `návrat selhání má ${n} znaků`)
    k.ok(v && v.follow_ups_pocet === 18, `follow_ups_pocet: ${v && v.follow_ups_pocet}`)
    k.ok(v && (v.security_commity || []).includes(SEC), `security_commity: ${JSON.stringify(v && v.security_commity)}`)
    const c = k.jeden('uzavření:řez 05:selhání')
    k.obsahuje(c, 'uzavření SELHANÉHO bloku', 'režim selhání')
    for (const p of [1, 2, 3]) k.obsahuje(c, `FU-93b-p${p}-5`, `follow-up pokusu ${p}`)
    k.obsahuje(c, `${CWD}/docs/.vysledek-stavba-05.json`, 'soubor výsledku')
    k.nic(/^uzavření:řez 05$/, 'běžné uzavření u selhání')
    return k.chyby
  },
}
