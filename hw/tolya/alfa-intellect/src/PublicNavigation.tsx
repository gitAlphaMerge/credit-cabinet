import { NavigationLink } from "./NavigationLink";
export const publicLinks = [
  ["/", "Главная"], ["/#how", "Как это работает"], ["/about", "О продукте"],
  ["/cfa", "ЦФА"], ["/jury", "Пример кабинета"], ["/about#team", "Команда"], ["/login", "Войти"],
] as const;
export function internalBackPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  return ["/","/about","/cfa","/jury","/login","/onboarding","/apply","/cabinet","/credit","/chat","/profile"].includes(value.split("#")[0]) ? value : null;
}
export function PublicNavigation({go,current,mobileOnly=false}:{go(path:string):void;current:string;mobileOnly?:boolean}) {
  return <nav className={"public-section-nav"+(mobileOnly?" nav-mobile-only":"")} aria-label="Разделы сайта">
    {current!=="/"&&<button type="button" className="public-nav-back" onClick={()=>{
      const previous=internalBackPath(history.state?.alfaPrevious);
      if(history.state?.alfaNavigated===true&&previous&&previous!==location.pathname+location.hash)history.back();else go("/");
    }}>← Назад</button>}
    {publicLinks.map(([path,label])=><NavigationLink key={path} to={path} go={go} aria-current={path===current?"page":undefined}>{label}</NavigationLink>)}
  </nav>;
}
