// Headless golden-scenario harness for the Coverage deal screener.
//
// Pattern (per HANDOFF §3.1 / §7): extract the <script id="deal-math"> block
// from coverage.html by id, eval it in an isolated VM, then run the 10 golden
// scenarios. Expected values are FROZEN from an independent reference oracle
// (Python), so this proves the in-page JS math matches the spec, not itself.
//
// Run:  node test/harness.mjs
// Exit: 0 = all pass, 1 = any fail.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dir = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dir, "..", "index.html");
const html = readFileSync(htmlPath, "utf8");

// --- extract the math block by id ---
const m = html.match(/<script id="deal-math">([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: could not find <script id=\"deal-math\"> in coverage.html"); process.exit(1); }
const context = { module: { exports: {} }, Math, console };
vm.createContext(context);
vm.runInContext(m[1], context, { filename: "deal-math" });
const DealMath = context.DealMath || context.module.exports;
if (!DealMath || typeof DealMath.evaluate !== "function") {
  console.error("FAIL: deal-math block did not expose DealMath.evaluate"); process.exit(1);
}

// --- 10 golden scenarios: inputs + frozen expected outputs ---
// null trueDSCR means all-cash (no debt service). cannot=true means unqualifiable.
const CASES = [
  { name: "1  baseline qualifies",
    in:{price:600000,down:180000,rate:7.5,term:30,rent:4200,ins:180,hoa:0,target:1.15,ltv:0.75},
    exp:{loan:420000, PI:2936.70, taxes:600, pitia:3716.70, qualDSCR:1.1301, trueDSCR:0.9071, noiMonthly:2664, capRate:0.0533, cashFlowMonthly:-272.70, cannot:false, bind:"DSCR", minDown:189228.50, minDownPct:0.3154} },
  { name: "2  zero interest (i=0)",
    in:{price:400000,down:100000,rate:0.0,term:30,rent:3000,ins:120,hoa:0,target:1.15,ltv:0.75},
    exp:{loan:300000, PI:833.33, taxes:400, pitia:1353.33, qualDSCR:2.2167, trueDSCR:2.3280, noiMonthly:1940, capRate:0.0582, cashFlowMonthly:1106.67, cannot:false, bind:"LTV", minDown:100000, minDownPct:0.25} },
  { name: "3  all cash (PI=0, true DSCR N/A)",
    in:{price:350000,down:350000,rate:7.5,term:30,rent:2600,ins:110,hoa:0,target:1.15,ltv:0.75},
    exp:{loan:0, PI:0, taxes:350, pitia:460, qualDSCR:5.6522, trueDSCR:null, noiMonthly:1672, capRate:0.0573, cashFlowMonthly:1672, cannot:false, bind:"DSCR", minDown:92443.91, minDownPct:0.2641} },
  { name: "4  cannot qualify (piMax<=0)",
    in:{price:500000,down:150000,rate:7.5,term:30,rent:500,ins:150,hoa:0,target:1.25,ltv:0.75},
    exp:{loan:350000, PI:2447.25, taxes:500, pitia:3097.25, qualDSCR:0.1614, trueDSCR:-0.0981, noiMonthly:-240, capRate:-0.0058, cashFlowMonthly:-2687.25, cannot:true, bind:null, minDown:null, minDownPct:null} },
  { name: "5  LTV binds",
    in:{price:300000,down:30000,rate:6.5,term:30,rent:4500,ins:100,hoa:0,target:1.10,ltv:0.75},
    exp:{loan:270000, PI:1706.58, taxes:300, pitia:2106.58, qualDSCR:2.1362, trueDSCR:1.9278, noiMonthly:3290, capRate:0.1316, cashFlowMonthly:1583.42, cannot:false, bind:"LTV", minDown:75000, minDownPct:0.25} },
  { name: "6  DSCR binds",
    in:{price:800000,down:200000,rate:8.0,term:30,rent:4000,ins:250,hoa:0,target:1.20,ltv:0.80},
    exp:{loan:600000, PI:4402.59, taxes:800, pitia:5452.59, qualDSCR:0.7336, trueDSCR:0.5065, noiMonthly:2230, capRate:0.0335, cashFlowMonthly:-2172.59, cannot:false, bind:"DSCR", minDown:488819.36, minDownPct:0.6110} },
  { name: "7  reverse-solve round-trip",
    in:{price:550000,down:0,rate:7.25,term:30,rent:3800,ins:170,hoa:0,target:1.15,ltv:0.75},
    exp:{loan:550000, PI:3751.97, taxes:550, pitia:4471.97, qualDSCR:0.8497, trueDSCR:0.6386, noiMonthly:2396, capRate:0.0523, cashFlowMonthly:-1355.97, cannot:false, bind:"DSCR", minDown:171161.29, minDownPct:0.3112} },
  { name: "8  condo w/ HOA",
    in:{price:450000,down:135000,rate:7.0,term:30,rent:3200,ins:90,hoa:420,target:1.10,ltv:0.75},
    exp:{loan:315000, PI:2095.70, taxes:450, pitia:3055.70, qualDSCR:1.0472, trueDSCR:0.7940, noiMonthly:1664, capRate:0.0444, cashFlowMonthly:-431.70, cannot:false, bind:"DSCR", minDown:157036.89, minDownPct:0.3490} },
  { name: "9  tax override (manual)",
    in:{price:500000,down:125000,rate:7.5,term:30,rent:3600,ins:160,hoa:0,target:1.15,ltv:0.75,taxesOverride:350},
    exp:{loan:375000, PI:2622.05, taxes:350, pitia:3132.05, qualDSCR:1.1494, trueDSCR:0.9313, noiMonthly:2442, capRate:0.0586, cashFlowMonthly:-180.05, cannot:false, bind:"DSCR", minDown:125231.63, minDownPct:0.2505} },
  { name: "10 15-year term",
    in:{price:480000,down:144000,rate:6.75,term:15,rent:3900,ins:140,hoa:0,target:1.05,ltv:0.75},
    exp:{loan:336000, PI:2973.30, taxes:480, pitia:3593.30, qualDSCR:1.0854, trueDSCR:0.8671, noiMonthly:2578, capRate:0.0644, cashFlowMonthly:-395.30, cannot:false, bind:"DSCR", minDown:130327.42, minDownPct:0.2715} },
];

// tolerances: dollars to a cent, ratios to 4dp
const TOL = { money: 0.01, ratio: 1e-4 };
const isMoney = k => ["loan","PI","taxes","pitia","noiMonthly","minDown","maxLoan","cashFlowMonthly"].includes(k);

function near(got, want, key){
  if (want === null) return got === null;
  if (typeof want === "boolean" || typeof want === "string") return got === want;
  if (got === null || got === undefined || !isFinite(got)) return false;
  const tol = isMoney(key) ? TOL.money : TOL.ratio;
  return Math.abs(got - want) <= tol + 1e-9;
}

let pass = 0, fail = 0;
for (const c of CASES){
  const r = DealMath.evaluate(c.in);
  const bad = [];
  for (const k of Object.keys(c.exp)){
    if (!near(r[k], c.exp[k], k)) bad.push(`${k}: got ${fmt(r[k])} want ${fmt(c.exp[k])}`);
  }
  if (bad.length === 0){ pass++; console.log(`PASS  ${c.name}`); }
  else { fail++; console.log(`FAIL  ${c.name}\n        ${bad.join("\n        ")}`); }
}

// extra invariant, scenario 7 round-trip: feeding minDown back in yields the target DSCR
const rt = CASES[6];
const solved = DealMath.evaluate(rt.in);
const back = DealMath.evaluate({ ...rt.in, down: solved.minDown });
if (Math.abs(back.qualDSCR - rt.in.target) <= 1e-6){ pass++; console.log("PASS  7b round-trip: minDown → qualDSCR == target"); }
else { fail++; console.log(`FAIL  7b round-trip: qualDSCR ${fmt(back.qualDSCR)} != target ${rt.in.target}`); }

function fmt(v){ return v === null ? "null" : (typeof v === "number" ? v.toFixed(4).replace(/\.?0+$/,"") : String(v)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
