// 19 · kolečko · obnova {od_faze: 'kolo 2', znacka} (§ 1.10, § 4): značku dostane jen zadání brány, commitu, deploye a E2E,
// a to od kola 2 dál; brána a commit po thermo a kole 1 ji nemají, review, čočky, triáž, bezpečnost, opravy a závěr nikdy
// (mají se vrátit z cache). Výklad: fix-brana, fix-e2e a sestavení E2E scénářů spec nejmenuje, proto se tu neověřují.
import { argsKolecko, kontrola, parsujLabel, rozhrani, CWD } from '../stuby.mjs'

const Z = 'ZNACKA-KOLECKO-Y'
const PRED_KOLEM_2 = ['thermo', 'kolo 1']
const rp = co => `${CWD}/docs/reviews/kolecko-${co}.md`

export const odpovedVlny = (label, stav) => {
  if (label === 'thermo:kolečko') return { blokeru: 1, nalezu: 1, report_path: rp('thermo'), soubory: ['apps/sucho/a.ts'], souhrn: 'stub' }
  if (label === 'review:kolečko:1') return { nalezu: 1, blokujicich: 1, report_path: rp('code-review-kolo-1'), balicky: [{ soubory: ['apps/sucho/b.ts'], nalezy: ['N1'] }], follow_up_ids: [] }
  // První čočka kola 2 najde nález, aby kolo 2 mělo triáž, opravnou vlnu, bránu a commit.
  if (/^review:kolečko:2:/.test(label) && !stav.data.cocka) { stav.data.cocka = label; return { nalezu: 1, blokujicich: 0, report_path: rp('code-review-kolo-2-cocka'), balicky: [{ soubory: ['apps/sucho/c.ts'], nalezy: ['N1'] }], follow_up_ids: [] } }
  if (label === 'triáž:kolečko:2') return { nalezu: 1, opravit_ted: 1, follow_up: 0, odmitnuto: 0, balicky: [{ soubory: ['apps/sucho/c.ts'], nalezy: ['cocka/N1'] }], report_path: rp('code-review-kolo-2'), follow_ups: [], odmitnute: [], sporne: [] }
  return null
}

export default {
  nazev: 'obnova od kola 2',
  blok: 'blok-kolecko',
  args: argsKolecko({ obnova: { od_faze: 'kolo 2', znacka: Z } }),
  odpoved: (label, prompt, opts, stav) => odpovedVlny(label, stav),
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const faze = x => parsujLabel(x.label).dalsi[0] || ''
    const brany = k.s(/^(verify|commit):kolečko:/)
    for (const f of ['thermo', 'kolo 1', 'kolo 2']) k.ok(brany.some(x => faze(x) === f), `chybí brána a commit po fázi ${f}`)
    for (const x of brany) (PRED_KOLEM_2.includes(faze(x)) ? k.neobsahuje : k.obsahuje)(x, Z, `značku obnovy (fáze ${faze(x)})`)
    const nasazeni = k.s(/^(deploy|e2e):kolečko:/)
    k.ok(nasazeni.some(x => /^deploy:/.test(x.label)) && nasazeni.some(x => /^e2e:/.test(x.label)), 'chybí deploy nebo E2E kolečka')
    for (const x of nasazeni) k.obsahuje(x, Z, 'značku obnovy')
    for (const x of k.s(/^(thermo|fix-thermo|review|triáž|security|fix|závěr):kolečko/)) k.neobsahuje(x, Z, 'značku obnovy (review a opravy jdou z cache)')
    rozhrani(k, volani)
    return k.chyby
  },
}
