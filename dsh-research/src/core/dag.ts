// ResearchTask DAG：按「依赖已满足 + 信息增益最高」选择下一个可执行节点。
// t.consumesClaims 即 DAG 依赖边；仅当 done 任务的 produceClaims 覆盖了
// consumed claim，该节点才解除 blocked 进入 ready。
import type { ResearchTask } from './types.ts';

export function selectNext(tasks: ResearchTask[]): ResearchTask | undefined {
  const produced = new Set(tasks.filter((t) => t.status === 'done').flatMap((t) => t.produceClaims));
  return tasks
    .filter((t) => t.status === 'ready' && t.consumesClaims.every((c) => produced.has(c)))
    .sort((a, b) => b.gain - a.gain)[0];
}

// 把 finished 集合标记为 done/failed 并写回返回数组；produced 从 finished
// 回收（任务完成时 produceClaims 可能动态更新）。仅 blocked 节点被解锁。
export function unlock(tasks: ResearchTask[], finished: ResearchTask[]): ResearchTask[] {
  const status = new Map(tasks.map((t) => [t.id, t.status]));
  const produced = new Set<string>();
  for (const f of finished) {
    const ok = f.status !== 'failed';
    status.set(f.id, ok ? 'done' : 'failed');
    if (ok) for (const c of f.produceClaims) produced.add(c);
  }
  return tasks.map((t) => {
    const s = status.get(t.id);
    if (s === 'done' || s === 'failed') return { ...t, status: s }; // 写回终态
    if (t.status === 'blocked' && t.consumesClaims.every((c) => produced.has(c))) {
      return { ...t, status: 'ready' };
    }
    return t;
  });
}
