// 01 · stavba · malý řez, šťastná cesta: pořadí fází (§ 1.10), commit z uzavření (§ 3 Návrat: c.commit_overeny || d.commit),
// brána s poli § 1.9 a zadání deploye, E2E a uzavření podle § 3. Zároveň rozhraní všech volání: rámec § 1.8, pole predavka § 1.2, § 0.13.
import { argsStavby, kontrola, rozhrani, hash, S, NN } from '../stuby.mjs'

const OVERENY = hash('commit řezu ověřený uzavřením')
const bezDiakritiky = t => S(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export default {
  nazev: 'malý řez, šťastná cesta',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === `uzavření:řez ${NN}`) return { ok: true, thermo_nesesouhlaseno: 0, chybejici_doklady: [], commit_overeny: OVERENY, chybejici_commity: [], kontext: 'KONTEXT-SOUHRN implement 212 k, 0 compactů, 0 předávek' }
    return null
  },
  over(v, volani, logy, b) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })

    const im = k.jeden('implement:řez 05:1'), th = k.jeden('thermo:řez 05'), r1 = k.jeden('review:řez 05:1')
    const ve = k.jeden('verify:řez 05:1'), de = k.jeden('deploy:řez 05:1'), e2 = k.jeden('e2e:řez 05:1'), uz = k.jeden('uzavření:řez 05')
    k.pred(im, th); k.pred(im, r1); k.soubezne(th, r1); k.pred(th, ve); k.pred(r1, ve); k.pred(ve, de); k.pred(de, e2); k.pred(e2, uz)
    k.nic(/^(fix|fix-brana|fix-e2e|fix-security|fix-thermo|diagnose|doklad|prd-refresh|prd-refresh-fix):|^review:řez 05:2$|^implement:řez 05:(kontrakt|část|integrace|oprava)/, 'šťastná cesta malého řezu')
    k.agent(im, 'dev-pipeline:implement', 'opus', 'high')

    // Fáze v pořadí § 1.10 (bez refresh a dokladu, které se tu nekonají).
    const fz = b.faze.map(bezDiakritiky).filter((f, i, xs) => f !== xs[i - 1])
    k.rovno(fz, ['implementace', 'review', 'brana', 'deploy', 'e2e', 'uzavreni'], 'pořadí fází')

    // Brána § 1.9: zelená jen nad doloženým měřením.
    k.pole(ve, ['exit_kod', 'kontroly', 'kontroly_ok', 'meridla', 'meridla_ok', 'predavka'], 'VERIFY')
    if (ve) for (const p of ['exit_kod', 'kontroly_ok', 'meridla_ok']) k.ok(ve.povinne.includes(p), `VERIFY: pole ${p} má být povinné (§ 1.9)`)
    k.obsahuje(ve, 'EXIT=$?', 'návratový kód čtený zvlášť (EXIT=$?)')
    k.obsahuje(ve, 'pre-commit', 'kontroly pre-commit hooku')
    k.obsahuje(ve, '[měřidlo]', 'měřidla kritérií [měřidlo]')

    // Deploy § 3: commit doslova, zápis nasazení, kroky po nasazení, infra.
    k.pole(de, ['commit', 'commit_zapisu', 'kroky_po_nasazeni', 'infra', 'report_path', 'security_commity', 'predavka'], 'DEPLOY')
    k.obsahuje(de, `docs/e2e/rez-${NN}-nasazeni.md`, 'cestu zápisu nasazení')
    k.obsahuje(de, 'Nasazení a kroky po něm', 'kroky po nasazení z PRD')

    // E2E § 3: kód neověřuje, měřidla převezme z reportu poslední zelené brány.
    k.obsahuje(e2, 'agent-browser close'); k.obsahuje(e2, 'worktree', 'zákaz worktree'); k.obsahuje(e2, '[měřidlo]', 'kritéria [měřidlo] z brány')
    const repVerify = ve && (/\/\S*verify[^\s,;)]*\.md/.exec(ve.prompt) || [])[0]
    if (repVerify) k.obsahuje(e2, repVerify, `report zelené brány ${repVerify}`)

    // Uzavření § 3: ověření commitu a kontext z .kontext.jsonl.
    k.pole(uz, ['commit_overeny', 'chybejici_commity', 'kontext', 'predavka'], 'CLOSE')
    k.obsahuje(uz, 'git cat-file', 'ověření commitu přes git cat-file')
    if (de && de.odpoved) k.obsahuje(uz, de.odpoved.commit, 'commit z deploye k ověření')
    k.obsahuje(uz, 'docs/.kontext.jsonl')

    // Návrat bloku § 3.
    if (v) {
      k.rovno(v.commit, OVERENY, 'návrat.commit (má být commit_overeny z uzavření)')
      k.rovno(v.commit_zapisu, de && de.odpoved && de.odpoved.commit_zapisu, 'návrat.commit_zapisu')
      for (const p of ['kroky_po_nasazeni', 'security_commity', 'odmitnute']) k.ok(Array.isArray(v[p]), `návrat bez pole ${p}`)
      k.rovno(v.casti, [], 'návrat.casti malého řezu')
      k.rovno(v.predavky, 0, 'návrat.predavky')
      k.ok(S(v.kontext).includes('KONTEXT-SOUHRN'), 'návrat.kontext nenese kontext z uzavření')
      k.ok(JSON.stringify(v.meridla || '').includes('AK3'), 'návrat.meridla nenese měřidla brány')
    }
    rozhrani(k, volani)
    return k.chyby
  },
}
