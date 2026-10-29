import test from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactNode, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CfaPreview } from "../src/CfaPreview";
import { ProductAssembly } from "../src/ProductAssembly";
import { Button } from "../src/ui";
import express from "express";
import request from "supertest";

test("CFA preview labels fictional figures and every future feature leads to the product team", () => {
  const routes:string[]=[];
  const tree=CfaPreview({go:path=>routes.push(path)});
  const elements:ReactElement<{children?:ReactNode;className?:string;onClick?:()=>void}>[]=[];
  const walk=(node:ReactNode):void=>{if(Array.isArray(node)){node.forEach(walk);return;}if(isValidElement<{children?:ReactNode;className?:string;onClick?:()=>void}>(node)){elements.push(node);walk(node.props.children);}};
  walk(tree);
  const featureButtons=elements.filter(node=>(node.type==="button"||node.type===Button)&&node.props.onClick&&!["unstyled","cabinet-return"].includes(node.props.className||""));
  assert.ok(featureButtons.length>=15);
  featureButtons.forEach(node=>node.props.onClick!());
  assert.ok(routes.every(path=>path==="/about#team"));
  const html=renderToStaticMarkup(tree);
  assert.ok(html.includes("демонстрационные данные"));assert.ok(html.includes("вымышлены"));assert.ok(html.includes("Операции недоступны"));
  assert.ok(!html.includes("<iframe"));
});

test("Both gravity variants provide a static accessible description and an explicit pause", () => {
  const agents=renderToStaticMarkup(<ProductAssembly/>), pulse=renderToStaticMarkup(<ProductAssembly variant="pulse" controls={false}/>);
  assert.ok(agents.includes("Альфа и Омега"));assert.ok(agents.includes("Приостановить движение фигур"));
  assert.ok(pulse.includes("Пульс"));assert.ok(!pulse.includes("assembly-pause"));
});

test("CFA opens directly without authentication while private cabinet routes remain gated", async () => {
  process.env.DATABASE_PATH=":memory:";
  const {guardJourneyPage}=await import("../server/journey");
  const app=express();app.use(guardJourneyPage);app.use((_req,res)=>res.send("public preview"));
  await request(app).get("/cfa").expect(200);
  await request(app).get("/cabinet").expect(303).expect("Location","/onboarding");
});
