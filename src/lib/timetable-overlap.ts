export interface TimedBlock { id: string; start: number; end: number }
export interface BlockPosition { lane: number; lanes: number; left: number; width: number }

/** Partition each connected overlap group. Touching endpoints share a lane. */
export function layoutTimedBlocks(blocks: TimedBlock[]): Map<string, BlockPosition> {
  const sorted = blocks.filter(block => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .slice().sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const positions = new Map<string, BlockPosition>();
  let group: (TimedBlock & { lane: number })[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  function finishGroup() {
    const lanes = laneEnds.length;
    for (const block of group) positions.set(block.id, { lane: block.lane, lanes, left: block.lane * 100 / lanes, width: 100 / lanes });
    group = []; laneEnds = []; groupEnd = -Infinity;
  }
  for (const block of sorted) {
    if (group.length && block.start >= groupEnd) finishGroup();
    let lane = laneEnds.findIndex(end => end <= block.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = block.end;
    group.push({ ...block, lane });
    groupEnd = Math.max(groupEnd, block.end);
  }
  finishGroup();
  return positions;
}
