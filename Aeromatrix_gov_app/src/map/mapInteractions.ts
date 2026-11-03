import { useTwinStore } from '../store/useTwinStore';
import { cellAtLonLat } from '../utils/grid';
import { nearestRoad } from '../utils/roads';
import { areaContains } from '../services/industryData';
import type { MapClickEvent } from './TwinMap';

let lastAreaCell: { row: number; col: number } | null = null;

/** Routes a map click according to the current interaction mode. */
export function handleMapClick(e: MapClickEvent) {
  const s = useTwinStore.getState();
  const base = s.base;
  if (!base) return;

  if (e.pickedId?.startsWith('ind:')) {
    s.selectIndustry(e.pickedId.slice(4));
    return;
  }
  if (e.pickedId?.startsWith('cand:')) {
    s.selectCandidate(e.pickedId.slice(5));
    return;
  }
  if (e.pickedId?.startsWith('stn:')) {
    s.selectStation(e.pickedId.slice(4));
    return;
  }
  if (e.pickedId?.startsWith('site:')) {
    s.selectSite(e.pickedId.slice(5));
    return;
  }
  const { lon, lat } = e;

  switch (s.interactionMode) {
    case 'add-industry': {
      if (!s.addIndustryAt(lon, lat)) s.setNotice('Click inside the Pune analysis area to place the industry.');
      return;
    }
    case 'pick-candidate': {
      if (!s.addCandidate([lon, lat])) {
        s.setNotice(
          s.candidates.length >= 5
            ? 'You already have five candidate sites. Remove one to add another.'
            : 'Click inside the Pune analysis area to place a candidate site.',
        );
      }
      return;
    }
    case 'select-area': {
      const cell = cellAtLonLat(base, lon, lat);
      if (!cell) return;
      const current = new Set(s.params.targetCells);
      if (e.shift && lastAreaCell) {
        const r0 = Math.min(lastAreaCell.row, cell.row);
        const r1 = Math.max(lastAreaCell.row, cell.row);
        const c0 = Math.min(lastAreaCell.col, cell.col);
        const c1 = Math.max(lastAreaCell.col, cell.col);
        for (const c of base.cells) if (c.row >= r0 && c.row <= r1 && c.col >= c0 && c.col <= c1) current.add(c.id);
      } else if (current.has(cell.id)) {
        current.delete(cell.id);
      } else {
        current.add(cell.id);
      }
      lastAreaCell = { row: cell.row, col: cell.col };
      s.setTargetCells([...current]);
      return;
    }
    default: {
      if (s.layers.roads || s.layers.traffic) {
        const maxKm = Math.min(0.8, Math.max(0.06, e.cameraHeight / 112000));
        const hit = nearestRoad(base.roads, [lon, lat], maxKm);
        if (hit) {
          s.selectRoad(hit.road.id);
          return;
        }
      }
      if (s.layers.midcAreas && s.industry?.status === 'loaded') {
        const area = s.industry.data.areas.find((a) => areaContains(a, [lon, lat]));
        if (area) {
          s.selectArea(area.code);
          return;
        }
      }
      const cell = cellAtLonLat(base, lon, lat);
      if (cell) s.selectCell(cell.id);
    }
  }
}
