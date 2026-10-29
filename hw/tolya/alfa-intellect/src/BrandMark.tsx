import { ALPHA_PATH, OMEGA_PATH, BRAND_BASE } from "./brand-identity";

export function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 72 46" width="62" height="40" fill="none" aria-hidden="true">
    <path className="brand-alpha" d={ALPHA_PATH} stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path className="brand-omega" d={OMEGA_PATH} stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path className="brand-bridge" d={BRAND_BASE} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>;
}
