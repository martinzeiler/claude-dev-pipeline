// 76 · stavba · 1.5.0 (spec § 1.4): návrat nese všechna nasazení bloku (nasazeni) a commit_hlavni z prvního úspěšného nasazení;
// health se neusekává na 300 znaků (řádek aplikací). Běh web-podzim: orchestrátor u řezu 03 viděl jen health posledního nasazení.
import { argsStavby, kontrola, stub, e2ePass } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK2: tlačítko nic neuloží'] })
const HEALTH = `aplikace: web@abc123 nasazeno | api@v42 nasazeno | admin nenasazeno (diff od báze se ho netýká); ${'z'.repeat(400)}`

export default {
  nazev: 'historie nasazení a commit_hlavni',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return FAIL
    if (label === 'deploy:řez 05:1') return stub(label, { commit: 'a'.repeat(40), health: HEALTH })
    if (label === 'deploy:řez 05:2') return stub(label, { commit: 'b'.repeat(40) })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', commit: 'b'.repeat(40), commit_hlavni: 'a'.repeat(40) })
    const n = (v && v.nasazeni) || []
    k.rovno(n.map(x => [x.k, x.stav, x.commit]), [[1, 'success', 'a'.repeat(40)], [2, 'success', 'b'.repeat(40)]], 'návrat.nasazeni')
    k.ok(n[0] && n[0].health === HEALTH, 'nasazeni[0].health celé')
    k.ok(n[1] && n[1].pozn === 'oprava po E2E', `nasazeni[1].pozn: ${n[1] && n[1].pozn}`)
    const d1 = k.jeden('deploy:řez 05:1')
    k.obsahuje(d1, "git log --grep 'zápis nasazení'", 'bázi diffu')
    k.obsahuje(d1, 'aplikace: <app>', 'řádek aplikací v health')
    return k.chyby
  },
}
