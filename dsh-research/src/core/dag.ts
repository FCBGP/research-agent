// ResearchTask DAG：按「依赖已满足 + 信息增益最高」选择下一个可执行节点。
// 语义：task.consumesClaims 即 DAG 依赖边；仅当 done 任务的 produceClaims
// 覆盖了 consumed claim，该节点才解除 blocked 进入 ready。
import type { ResearchTask } from './types.ts';

function producedClaimIds(tasks: ResearchTask[]): Set<string> {
  return new Set(tasks.filter((t) => t.status === 'done').flatMap((t) => t.produceClaims));
}

export function selectNext(tasks: ResearchTask[]): ResearchTask | undefined {
  const produced = producedClaimIds(tasks);
  return tasks
    .filter((t) => t.status === 'ready' && t.consumesClaims.every((c) => produced.has(c)))
    .sort((a, b) => b.gain - a.gain)[0];
}

// 把 finished 集合标记为 done/failed，并立即重算依赖使他们解锁。
export function unlock(tasks: ResearchTask[], finished: ResearchTask[]): ResearchTask[] {
  const status = new Map(tasks.map((t) => [t.id, t.status]));
  for (const f of finished) status.set(f.id, f.status === 'failed' ? 'failed' : 'done');
  const produced = new Set(tasks.filter((t) => status.get(t.id) === 'done').flatMap((t) => t.produceClaims));
  return tasks.map((t) => {
    if (status.get(t.id) !== 'blocked') return t;
    return t.consumesClaims.every((c) => produced.has(c)) ? { ...t, status: 'ready' } : t;
  });
}
