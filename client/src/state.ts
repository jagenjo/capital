import type { View, Action } from '../../shared/types.js';
import { api } from './api.js';
import { toast } from './util.js';

export const S = {
  gameId: '', token: '', view: null as View | null,
  tab: 'map' as string, cfgTab: 'Production',
  city: 0, costField: null as string | null, showRoutes: true, sel: null as number | null, buildingId: null as string | null,
  world: null as null | { id: string; rev: number; w: number; h: number; tiles: string; qual?: string; rails: { a: number; b: number; tiles: number[] }[]; img: HTMLCanvasElement; res: number[] },
  offset: 0, render: (() => {}) as () => void,
};

export async function act(a: Action): Promise<string | null> {
  try {
    const r = await api.action(S.gameId, S.token, a);
    S.view = r.view; S.render(); return r.info ?? 'ok';
  } catch (e: any) { toast(e.message, 'err'); return null; }
}
export const myBuilding = (id: string | null) => (id ? S.view!.buildings.find(b => b.id === id) ?? null : null);
export const companyOf = (id: string) => S.view!.companies.find(c => c.id === id);
