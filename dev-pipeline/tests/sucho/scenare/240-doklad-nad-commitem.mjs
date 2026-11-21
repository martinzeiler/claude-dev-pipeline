// 240 · stavba · 1.12.0 (spec J1): u řezu s dokladem před nasazením jde nejdřív commit řezu bez nasazení (běh 0 deploye ve fázi Doklad), pak
// doklad se zadaným hashem commitu a teprve potom nasazení, které commit řezu už nedělá. Dřív doklad běžel před commitem a jeho hlavička
// nesla commit předchozího řezu a necommitnutý strom. Commit před dokladem není nasazený: do commit_hlavni nejde, dokud ho nenasadí běh 1.
// Řez bez dokladu se nemění ani o jedno volání.
import { argsStavby, kontrola, stub, hash, S } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const C0 = hash('commit řezu před dokladem 240')
// Věrný deploy: běh 0 jen commitne (commit-only), běh 1 vrátí týž commit řezu a nasadí.
const odpoved = l => (l === 'deploy:řez 05:0' ? stub(l, { stav: 'commit-only', commit: C0, commit_zapisu: '', report_path: '', health: '' }) : l === 'deploy:řez 05:1' ? stub(l, { commit: C0 }) : null)

export default {
  nazev: 'doklad nad commitem řezu: commit, doklad, deploy',
  blok: 'blok-stavby',
  args: argsStavby({ doklad_pred: true }),
  odpoved,
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1, commit: C0, commit_hlavni: C0 })
    const br = k.jeden('verify:řez 05:1'), d0 = k.jeden('deploy:řez 05:0'), dk = k.jeden('doklad:řez 05'), d1 = k.jeden('deploy:řez 05:1')
    k.pred(br, d0); k.pred(d0, dk); k.pred(dk, d1)
    k.pocet(/^deploy:/, 2, 'commit před dokladem a jedno nasazení'); k.pocet(/^doklad:/, 1, 'doklad jednou')
    k.ok(d0 && d0.phase === 'Doklad' && d1 && d1.phase === 'Deploy', `fáze běhů deploye: ${JSON.stringify([d0 && d0.phase, d1 && d1.phase])}`)
    k.obsahuje(d0, 'teď jen commitni řez, doklad vznikne nad tímto commitem a nasazení přijde potom', 'zadání commitu před dokladem')
    k.obsahuje(d0, 'stav commit-only', 'stav commit-only'); k.neobsahuje(d0, 'Commit řezu už existuje', 'větu o hotovém commitu'); k.neobsahuje(d0, 'migraci aplikuj jen když existuje', 'pokyn k migraci')
    k.obsahuje(dk, `Doklad vzniká nad commitem řezu ${C0}`, 'hash commitu řezu v zadání dokladu')
    k.obsahuje(dk, 'git rev-parse HEAD se s ním musí shodovat', 'shodu HEAD'); k.obsahuje(dk, 'git status --porcelain mimo docs/ musí být prázdný', 'čistý strom'); k.obsahuje(dk, 'vrať ok: false', 'ok: false při neshodě')
    k.obsahuje(d1, `Commit řezu už existuje (${C0})`, 'commit řezu už existuje'); k.obsahuje(d1, 'Nový commit řezu nedělej', 'zákaz nového commitu')
    k.obsahuje(d1, 'migraci aplikuj jen když existuje', 'pokyn k migraci s dokladem')
    const uz = k.jeden('uzavření:řez 05')
    k.obsahuje(uz, '"stav":"commit-pred-dokladem"', 'vlastní stav commitu před dokladem v historii nasazení')

    // Doklad po commitu selže: pokus selže jako dřív a nenasazený commit řezu není commit_hlavni.
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby({ doklad_pred: true, max_pokusu: 1 }), odpoved: l => (l === 'doklad:řez 05' ? { ok: false, path: '', duvod: 'DOKLAD-240 HEAD není commit řezu' } : odpoved(l)) })
    const b = kontrola(bez.volani)
    b.navrat(bez.vysledek, { ok: true, vysledek: 'selhalo', faze: 'doklad', commit_hlavni: '' })
    b.pocet(/^doklad:/, 2, 'doklad s jedním pokusem navíc'); b.nic(/^deploy:řez 05:1$/, 'nasazení bez dokladu')
    b.ok(JSON.stringify(bez.vysledek && bez.vysledek.nasazeni).includes('commit-pred-dokladem'), `historie nasazení: ${JSON.stringify(bez.vysledek && bez.vysledek.nasazeni)}`)
    k.chyby.push(...b.chyby.map(c => `doklad selhal: ${c}`))

    // Commit před dokladem selže: fáze doklad, doklad ani nasazení neběží.
    const com = await spust({ blok: 'blok-stavby', args: argsStavby({ doklad_pred: true, max_pokusu: 1 }), odpoved: l => (l === 'deploy:řez 05:0' ? stub(l, { stav: 'failed', commit: '', duvod: 'COMMIT-240 pre-commit hook červený' }) : null) })
    k.navrat(com.vysledek, { ok: true, vysledek: 'selhalo', faze: 'doklad' })
    k.ok(/commit řezu před dokladem selhal: COMMIT-240/.test(S(com.vysledek && com.vysledek.detail)) && !com.volani.some(x => /^doklad:|^deploy:řez 05:1$/.test(x.label)), `commit selhal: ${JSON.stringify(com.vysledek && com.vysledek.detail)}`)

    // Řez bez dokladu: žádný běh 0, žádná věta o hotovém commitu.
    const nic = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: () => null })
    const n = kontrola(nic.volani)
    n.nic(/^deploy:řez 05:0$|^doklad:/, 'řez bez dokladu')
    n.pocet(/^deploy:/, 1, 'řez bez dokladu: jedno nasazení'); n.neobsahuje(n.jeden('deploy:řez 05:1'), 'Commit řezu už existuje', 'větu o hotovém commitu')
    k.chyby.push(...n.chyby.map(c => `bez dokladu: ${c}`))
    return k.chyby
  },
}
