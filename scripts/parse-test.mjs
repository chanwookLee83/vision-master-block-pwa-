import { parseDimension } from '../src/lib/ocr.js';

const cases = [
  ['27.888±0.02', { nominal: 27.888, tolMode: 'sym', tolUpper: 0.02, tolLower: -0.02 }],
  ['27.888 ± 0.02', { nominal: 27.888, tolMode: 'sym' }],
  ['2/.888+0.02', { nominal: 27.888, tolMode: 'sym', tolUpper: 0.02 }],
  ['Ø27.888', { nominal: 27.888, tolMode: undefined }],
  ['27,888', { nominal: 27.888 }],
  ['12.5 +0.05/-0.01', { nominal: 12.5, tolMode: 'asym', tolUpper: 0.05, tolLower: -0.01 }],
  ['12.5 +0.05 -0.01', { nominal: 12.5, tolMode: 'asym', tolUpper: 0.05, tolLower: -0.01 }],
  ['100 -0.05', { nominal: 100, tolMode: 'asym', tolUpper: 0, tolLower: -0.05 }],
  ['R1O', { nominal: 10 }],
  ['50.00', { nominal: 50 }],
];

let bad = 0;
for (const [input, exp] of cases) {
  const got = parseDimension(input);
  const keys = Object.keys(exp);
  const ok = keys.every((k) => JSON.stringify(got[k]) === JSON.stringify(exp[k]));
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok ' : 'XX '} "${input}" → ${JSON.stringify({ nominal: got.nominal, tolMode: got.tolMode, tolUpper: got.tolUpper, tolLower: got.tolLower })}`);
}
console.log(bad ? `\n${bad} 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);
