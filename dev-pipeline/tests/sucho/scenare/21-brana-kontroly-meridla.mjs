// 21 · stavba · brána s prošlými testy, ale selhanou kontrolou pre-commitu a měřidlem (§ 1.9; v běhu bez-dluhu padl řez 20
// na verify:arch, který brána nespustila): červená, oprava brány dostane selhané kontroly i měřidla.
import { argsStavby, kontrola, zelenaBrana } from '../stuby.mjs'

export default {
  nazev: 'brána: selhaná kontrola a měřidlo jsou červená',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'verify:řez 05:1') return zelenaBrana({
      kontroly: ['KONTROLA-ARCH: pnpm verify:arch · FAIL'], kontroly_ok: false,
      meridla: ['MERIDLO-AK3 · node scripts/pocet.mjs · 9 · FAIL'], meridla_ok: false,
    })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const v1 = k.jeden('verify:řez 05:1'), fb = k.jeden('fix-brana:řez 05'), v2 = k.jeden('verify:řez 05:2'), de = k.jeden('deploy:řez 05:1')
    k.pred(v1, fb); k.pred(fb, v2); k.pred(v2, de)
    k.obsahuje(fb, 'KONTROLA-ARCH', 'selhanou kontrolu pre-commitu')
    k.obsahuje(fb, 'MERIDLO-AK3', 'selhané měřidlo')
    return k.chyby
  },
}
