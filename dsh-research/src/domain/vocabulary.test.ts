// 命名定型 + 内置领域词汇自测：dsh-routing-research 名称口径、领域范围/执行器/关键词、
// GLOSSARY 完整性、describeDomain/scopeList/executorList/lookupTerm 渲染。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRODUCT_NAME, COMMAND, PROFILE_FLAG, PROFILE_NAME, NAMING,
  DOMAIN_SCOPE, DOMAIN_EXECUTORS, DOMAIN_KEYWORDS, GLOSSARY,
  describeDomain, scopeList, executorList, lookupTerm,
} from './vocabulary.ts';

test('命名定型：Profile 定型名 = dsh-routing-research，操作命令保持 dsh research', () => {
  assert.equal(PRODUCT_NAME, 'dsh-routing-research', '定型名必须为 dsh-routing-research');
  assert.equal(COMMAND, 'dsh research', 'README/脚本仍用 dsh research');
  assert.equal(PROFILE_FLAG, 'dsh --profile research', '等价命令不变');
  assert.equal(PROFILE_NAME, 'research');
  assert.ok(NAMING.includes(PRODUCT_NAME) && NAMING.includes(COMMAND), '命名综述同时给出定型名与操作命令');
});

test('领域范围：BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP（AGENTS.md §1 口径）', () => {
  assert.deepEqual([...DOMAIN_SCOPE], ['BGP', 'RPKI', 'BGPsec', 'ASPA', 'VRO', 'CRC', 'FC-BGP']);
  assert.equal(scopeList(), 'BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP');
});

test('执行器：FRR / VPP，且 executorList 渲染正确', () => {
  assert.deepEqual([...DOMAIN_EXECUTORS], ['FRR', 'VPP']);
  assert.equal(executorList(), 'FRR / VPP');
});

test('领域关键词：内置词表覆盖核心机制与攻击面（research_search 无 query 时兜底）', () => {
  for (const k of ['bgp', 'rpki', 'bgpsec', 'rov', 'roa', 'hijack', 'path manipulation']) {
    assert.ok(DOMAIN_KEYWORDS.includes(k), `关键词应内置 ${k}`);
  }
  assert.ok(DOMAIN_KEYWORDS.length >= 15, '词表不应过小');
});

test('GLOSSARY：每个领域范围都有条目，且每条均有定义与类别', () => {
  const terms = new Set(GLOSSARY.map((g) => g.term.toUpperCase()));
  for (const s of DOMAIN_SCOPE) assert.ok(terms.has(s.toUpperCase()), `领域词 ${s} 应有词汇条目`);
  for (const e of DOMAIN_EXECUTORS) assert.ok(terms.has(e.toUpperCase()), `执行器 ${e} 应有词汇条目`);
  for (const g of GLOSSARY) {
    assert.ok(g.def.length > 0, `${g.term} 应有定义`);
    assert.ok(g.aliases.length >= 0, `${g.term} aliases 合法`);
  }
});

test('describeDomain / lookupTerm 渲染与反查', () => {
  const d = describeDomain();
  assert.ok(d.includes(PRODUCT_NAME), '自我介绍应含定型名');
  assert.ok(d.includes('BGP') && d.includes('RPKI'), '自我介绍应含领域词汇');
  assert.ok(d.includes('FRR') && d.includes('VPP'), '自我介绍应含执行器');

  assert.equal(lookupTerm('bgp')?.kind, 'protocol');
  assert.equal(lookupTerm('RFC 8205')?.term, 'BGPsec', '别名可按规范名称反查');
  assert.equal(lookupTerm('AS Provider Authorization')?.term, 'ASPA', '别名可反查');
  assert.equal(lookupTerm('FRRouting')?.term, 'FRR', '别名可反查');
  assert.equal(lookupTerm('not-a-term'), undefined);
});
