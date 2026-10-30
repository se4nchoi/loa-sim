import { describe, expect, it } from 'vitest';
import { chartGeometry } from './stats-chart';

describe('activity chart', () => {
	it.each([[],[0],[0,0],[NaN,Infinity,-1],[100,120,20]].map(values=>[values]))('keeps empty/short series finite: %j', values => {
		const shape = chartGeometry(values);
		expect(shape.line+shape.area).not.toMatch(/NaN|Infinity/);
		expect(shape.points.every(p=>p.x>=0&&p.x<=1000&&p.y>=0&&p.y<=190)).toBe(true);
	});
	it('centers a single day instead of inventing a multi-day trend',()=>{
		expect(chartGeometry([4]).points[0].x).toBe(500);
	});
});
