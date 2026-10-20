// 19 · kolečko · obnova {od_faze: 'kolo 2', znacka} (§ 1.10, § 4; 1.7.0 spec § 1.7): kolo 2 pěti čoček je zrušené, obnova od něj
// (starší orchestrátor) jde od bezpečnosti s logem. Značku dostane jen zadání brány, commitu, deploye a E2E, a to od bezpečnosti dál;
// brána a commit po thermo a kole 1 ji nemají, review, bezpečnostní review, opravy a závěr nikdy (mají se vrátit z cache).
// Brána před nasazením se nepouští: zelená brána bezpečnosti je přeměřená v této obnově a od ní žádná oprava nesahala do stromu.
// Výklad: fix-brana, fix-e2e a sestavení E2E scénářů spec nejmenuje, proto se tu neověřují.
import { argsKolecko, kontrola, parsujLabel, rozhrani, CWD } from '../stuby.mjs'

const Z = 'ZNACKA-KOLECKO-Y'
const PRED_BEZPECNOSTI = ['thermo', 'kolo 1']
const rp = co => `${CWD}/docs/reviews/kolecko-${co}.md`

export const odpovedVlny = label => {
  if (label === 'thermo:kolečko') return { blokeru: 1, nalezu: 1, report_path: rp('thermo'), soubory: ['apps/sucho/a.ts'], souhrn: 'stub' }
  if (label === 'review:kolečko:1') return { nalezu: 1, blokujicich: 1, report_path: rp('code-review-kolo-1'), balicky: [{ soubory: ['apps/sucho/b.ts'], nalezy: ['N1'] }], follow_up_ids: [] }
  // Bezpečnostní čočka najde nález, aby fáze bezpečnost měla opravnou vlnu, bránu a commit.
  if (label === 'security:kolečko:čočka') return { nalezu: 1, blokujicich: 1, report_path: rp('bezpecnost'), balicky: [{ soubory: ['apps/sucho/c.ts'], nalezy: ['S1'], security: true }], follow_up_ids: [] }
  return null
}

export default {
  nazev: 'obnova od zrušeného kola 2 jde od bezpečnosti',
  blok: 'blok-kolecko',
  args: argsKolecko({ obnova: { od_faze: 'kolo 2', znacka: Z } }),
  odpoved: label => odpovedVlny(label),
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^(review:kolečko:2|triáž:kolečko)/, 'kolo 2 je zrušené')
    k.ok(logy.some(l => /fáze kolo 2 už neexistuje/.test(l)), 'log o obnově od zrušeného kola 2')
    const faze = x => parsujLabel(x.label).dalsi[0] || ''
    const brany = k.s(/^(verify|commit):kolečko:/)
    for (const f of ['thermo', 'kolo 1', 'bezpečnost']) k.ok(brany.some(x => faze(x) === f), `chybí brána a commit po fázi ${f}`)
    for (const x of brany) (PRED_BEZPECNOSTI.includes(faze(x)) ? k.neobsahuje : k.obsahuje)(x, Z, `značku obnovy (fáze ${faze(x)})`)
    k.nic(/^verify:kolečko:před nasazením/, 'brána před nasazením nad stromem po zelené bráně bezpečnosti')
    const nasazeni = k.s(/^(deploy|e2e):kolečko:/)
    k.ok(nasazeni.some(x => /^deploy:/.test(x.label)) && nasazeni.some(x => /^e2e:/.test(x.label)), 'chybí deploy nebo E2E kolečka')
    for (const x of nasazeni) k.obsahuje(x, Z, 'značku obnovy')
    for (const x of k.s(/^(thermo|fix-thermo|review|security|fix|závěr):kolečko/)) k.neobsahuje(x, Z, 'značku obnovy (review a opravy jdou z cache)')
    rozhrani(k, volani)
    return k.chyby
  },
}
