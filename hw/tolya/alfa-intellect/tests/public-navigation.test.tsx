import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { internalBackPath, PublicNavigation } from "../src/PublicNavigation";
test("Public pages expose real destinations, the team anchor and a named back control",()=>{
  const html=renderToStaticMarkup(<PublicNavigation current="/about" go={()=>{}}/>);
  for(const path of ["/","/#how","/about","/cfa","/jury","/about#team","/login"])assert.ok(html.includes(`href="${path}"`),path);
  assert.ok(html.includes("← Назад"));assert.ok(html.includes('aria-current="page"'));
  assert.ok(!html.includes('href="#"'));
});
test("Back destinations cannot leave the site or select unknown routes",()=>{
  for(const value of [null,undefined,"https://other.test/","//other.test/","/unknown","javascript:alert(1)","/about?redirect=elsewhere"])assert.equal(internalBackPath(value),null);
  for(const value of ["/","/about#team","/cfa","/cabinet#credit","/onboarding"])assert.equal(internalBackPath(value),value);
});
