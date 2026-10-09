// 132 · PRD · 1.7.0 zbylé blokující nálezy (spec 1.7.0 § 1.11, rozhodnutí majitele 9. 10.): když delta nechá blokující nálezy,
// blok je zapracuje ještě jednou bez další kontroly, kostru i části souběžně. Nálezy zůstanou v hypotezy.blokujici
// a zapracovano_bez_kontroly je označí (bez nálezů, které zapracování odmítlo); třetí prd-check není.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const rep = (kolo, c) => `${CWD}/docs/reviews/rez-05-prd-check-${c ? `cast-${c}-` : ''}kolo-${kolo}.md`

export default {
  nazev: 'PRD: zbylé blokující zapracované bez kontroly',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 3, blokujicich: 2, osy: ['C'], report_path: rep(1), nalezy_ids: ['N1', 'N2', 'N3'] }
    if (label === 'prd-check:řez 05:část K1:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['B'], report_path: rep(1, 'K1'), nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-check:řez 05:2') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 1, osy: ['C'], report_path: rep(2), nalezy_ids: ['N1', 'N5'] }
    if (label === 'prd-check:řez 05:část K1:2') return { verdikt: 'needs-fixes', nalezu: 1, blokujicich: 1, osy: ['B'], report_path: rep(2, 'K1'), nalezy_ids: ['N2'] }
    if (label === 'prd-fix:řez 05:část K1:zbylé') return stub(label, { zmenena_mista: [], odmitnute: [{ id: 'N2', duvod: 'míří vedle' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.nic(/^prd-check:.*:3$/, 'třetí kolo kontroly')
    k.pocet(/^prd-check:/, 6, 'kontroly: kostra a tři části v kole 1, dvě delty')
    const zk = k.jeden('prd-fix:řez 05:zbylé'), zc = k.jeden('prd-fix:řez 05:část K1:zbylé')
    k.soubezne(zk, zc)
    for (const x of [zk, zc]) { k.agent(x, 'dev-pipeline:prd', 'opus', 'high'); k.ok(!x || x.phase === 'Zbylé blokující', `${x && x.label}: fáze ${x && x.phase}`) }
    k.obsahuje(zk, `report ${rep(2)} (nálezy N1;`, 'jen blokující nálezy delty kostry')
    k.obsahuje(zk, 'Další kontrola nebude', 'že zapracování přeměří až refresh stavby')
    k.obsahuje(zk, 'Počet, id, soubory, kritéria ani závislosti částí neměň', 'tabulka Části zůstává')
    k.obsahuje(zk, 'Pole cekani vrať celé', 'cekani celé po zapracování kostry')
    k.obsahuje(zc, `PRD části: ${prdCasti('K1')}`)
    k.nic(/^prd-fix:řez 05:část K[23]:zbylé/, 'části bez blokujících po deltě')
    const h = v && v.stavba && v.stavba.hypotezy
    k.rovno(h && h.blokujici, ['N1', 'K1/N2'], 'hypotezy.blokujici zůstávají')
    k.rovno(h && h.zapracovano_bez_kontroly, ['N1'], 'hypotezy.zapracovano_bez_kontroly (K1/N2 odmítnut)')
    k.rovno(v && v.kontrola && v.kontrola.zapracovano_bez_kontroly, 1, 'kontrola.zapracovano_bez_kontroly')
    rozhrani(k, volani)
    return k.chyby
  },
}
