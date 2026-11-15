import logoUrl from '../../assets/logo.svg';
import logoDarkUrl from '../../assets/logo-dark.svg';

/**
 * The #mvpFY wordmark, as it has always been.
 *
 * On the dark theme "#mvp" is drawn in the brand's lighter purple (#A25ED8,
 * the palette's own "brand light") instead of #623883, which is close to
 * invisible on near-black. Same artwork otherwise; the light theme shows the
 * original file untouched.
 */
export default function Logo() {
  return (
    <>
      <img src={logoDarkUrl} alt="#mvpFY" className="logo-on-dark h-6 w-auto" />
      <img src={logoUrl} alt="#mvpFY" className="logo-on-light h-6 w-auto" />
    </>
  );
}
