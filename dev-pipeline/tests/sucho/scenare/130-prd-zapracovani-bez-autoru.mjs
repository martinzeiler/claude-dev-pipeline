// 130 · PRD · 1.7.0 režim zapracování (spec 1.7.0, rozbor-prd návrhy 1a a 11): autoři částí se nepouští (v běhu sonnet-5-5 stáli
// $25,8 a dva přepsali PRD části Writem bez kontroly), zapracování kostry smí měnit soubory částí s předponou „K2: …“ a delta je
// hledá v souboru části. Delta zapracování píše do vlastního reportu (…-zapr-kolo-2.md, kolo 2 původního běhu nese hypotézy)
// a části, které původní běh zkontroloval, nejsou bez_kontroly.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: zapracování bez autorů částí, delta vidí části',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['odchylka od plánu: doplň F3'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, zmenena_mista: ['AK7', 'K2: postup API'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rezim: 'zapracovani' })
    k.nic(/^prd-část:/, 'režim zapracování pouští autory částí')
    const fx = k.jeden('prd-fix:řez 05')
    k.obsahuje(fx, 'smíš upravit i soubory částí', 'zapracování kostry smí měnit soubory částí')
    const d = k.jeden('prd-check:řez 05:2')
    k.obsahuje(d, 'Místa s předponou části (K2: …) leží v souboru té části', 'delta hledá místa částí v jejich souborech')
    k.obsahuje(d, `K2 ${prdCasti('K2')}`, 'cestu k souboru části K2')
    k.obsahuje(d, `${CWD}/docs/reviews/rez-05-prd-check-zapr-kolo-2.md`, 'vlastní report delty zapracování')
    k.rovno(v && v.kontrola && v.kontrola.bez_kontroly, [], 'kontrola.bez_kontroly (části zkontroloval původní běh, změny delta)')
    rozhrani(k, volani)
    return k.chyby
  },
}
