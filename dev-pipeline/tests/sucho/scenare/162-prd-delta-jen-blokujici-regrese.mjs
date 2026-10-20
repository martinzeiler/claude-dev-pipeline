// 162 · PRD · 1.8.0 delta jen nad blokujícími a počet regresí (spec 1.8.0 § 2.11): kolo 1 vrátí 6 nálezů, 3 blokující (N1–N3);
// delta dostane změněná místa s pokynem prověřit jen ta, která řeší blokující nálezy kola 1, a vrací regrese (nálezy vzniklé
// zapracováním); blok počet loguje a vrací v kontrola.regrese. Zapracování dostane pokyn aplikovat navržené znění z reportu.
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'

const REP1 = `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`

export default {
  nazev: 'PRD: delta jen nad blokujícími, regrese do návratu',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 6, blokujicich: 3, osy: ['B', 'C'], report_path: REP1, nalezy_ids: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'] }
    if (label === 'prd-fix:řez 05') return stub(label, { zmenena_mista: ['AK1', 'AK2', 'Postup: migrace'], odmitnute: [] })
    if (label === 'prd-check:řez 05:2') return { verdikt: 'ready', nalezu: 2, blokujicich: 0, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-2.md`, nalezy_ids: ['N1', 'N2'], regrese: 2 }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const fk = k.jeden('prd-fix:řez 05')
    k.obsahuje(fk, 'U blokujícího nálezu aplikuj navržené znění z reportu a ověř ho proti kódu', 'zapracování aplikuje navržené znění')
    const d = k.jeden('prd-check:řez 05:2')
    for (const t of ['prověř VÝHRADNĚ změněná místa, která řeší blokující nálezy kola 1 (N1, N2, N3): AK1 | AK2 | Postup: migrace; ostatní změny a co prošlo kolem 1 znovu nekontroluj',
      'Nález, který vznikl až zapracováním, počítej jako regresi a jejich počet vrať v regrese', 'Vracíš jen BLOKUJE a OVĚŘIT PRVNÍ', 'třetí kolo kontroly nebude']) k.obsahuje(d, t)
    k.ok(v && v.kontrola && v.kontrola.regrese === 2, `kontrola.regrese: ${JSON.stringify(v && v.kontrola)}`)
    k.ok(v && v.kontrola && v.kontrola.kola === 2 && v.kontrola.verdikt === 'ready', 'kontrola po deltě ready')
    k.ok(logy.some(l => /prd-check 2 \(delta\): ready, 2 nálezů, 0 blokujících, regresí 2/.test(l)), 'log delty s regresemi')
    rozhrani(k, volani)
    return k.chyby
  },
}
