// 80 · PRD · 1.5.0 delta od dvou blokujících (spec 1.5.0 § 1.14 bod 1): kostra s jediným blokujícím a část K2 s jediným
// blokujícím jdou bez delta kontroly stavbě jako hypotézy (report kola 1), část K1 se dvěma blokujícími delta kontrolu dostane.
// Běh web-podzim: dokument s jediným blokujícím dal v deltě 0,33 blokujícího, se dvěma a víc 0,62.
import { argsPrd, kontrola, rozhrani, stub, CWD, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const rep = id => `${CWD}/docs/reviews/rez-05-prd-check-${id ? `cast-${id}-` : ''}kolo-1.md`

export default {
  nazev: 'PRD: delta kontrola jen od dvou blokujících nálezů',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 3, blokujicich: 1, osy: ['C'], report_path: rep(''), nalezy_ids: ['N1', 'N2', 'N3'] }
    if (label === 'prd-check:řez 05:část K1:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['B'], report_path: rep('K1'), nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-check:řez 05:část K2:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 1, osy: ['B'], report_path: rep('K2'), nalezy_ids: ['N1', 'N2'] }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.jeden('prd-fix:řez 05')
    k.jeden('prd-fix:řez 05:část K1'); k.jeden('prd-fix:řez 05:část K2')
    k.nic(/^prd-check:řez 05:2$/, 'delta kostry s jediným blokujícím nálezem')
    k.jeden('prd-check:řez 05:část K1:2')
    k.nic(/^prd-check:řez 05:část K2:2$/, 'delta části s jediným blokujícím nálezem')
    k.ok(logy.some(l => /delta kontrola kostry se nekoná \(kolo 1 s jediným blokujícím nálezem, delta od 2\)/.test(l)), 'log o kostře bez delty (jediný blokující)')
    k.ok(logy.some(l => /část K2 zapracována; delta kontrola se nekoná \(kolo 1 s jediným blokujícím nálezem/.test(l)), 'log o části K2 bez delty')
    const h = v && v.hypotezy_pro_stavbu
    k.ok(h && S(h.report).includes(rep('')) && S(h.report).includes(rep('K2')), `hypotezy_pro_stavbu.report bez reportů kola 1 kostry a K2: ${JSON.stringify(h)}`)
    k.ok(h && h.ids.includes('N1') && h.ids.includes('K2/N1') && !h.ids.some(id => id.startsWith('K1/')), `hypotezy_pro_stavbu.ids: ${JSON.stringify(h && h.ids)}`)
    k.ok(v && v.kontrola && v.kontrola.kola === 2, `návrat.kontrola.kola: ${JSON.stringify(v && v.kontrola)}`)
    rozhrani(k, volani)
    return k.chyby
  },
}
