// 37 · stavba · revize 1.4.0 nález 5: obnova od deploye (s pokusem). Deploy dostane k větě obnovy i to, že commit řezu nebo
// fix(security) z přerušeného běhu může už existovat; ostatní fáze tu větu nemají (necommitují).
import { argsStavby, kontrola } from '../stuby.mjs'

const VETA = 'může už existovat (git log --grep): nový nedělej, vrať jejich hashe'

export default {
  nazev: 'obnova deploye: commit z přerušeného běhu',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'deploy', znacka: 'Z37', pokus: 1 } }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, 'Z37', 'značku obnovy'); k.obsahuje(d, VETA, 'větu o existujícím commitu')
    for (const l of ['e2e:řez 05:1', 'uzavření:řez 05']) k.neobsahuje(k.jeden(l), VETA, 'větu o commitu (fáze necommituje)')
    return k.chyby
  },
}
