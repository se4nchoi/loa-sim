// Bracer (완갑) honing costs, KR live. From Smilegate's patch notice "8월 5일(수) 업데이트 내역 안내", table
// "완갑 단계별 재련 성공률과 필요 재료": https://lostark.game.onstove.com/News/Notice/Views/13508
// The notice gives each step's success rate, the one-time growth (장비 성장: shards) and the per-tap cost
// (shards, crystallized destruction / guardian stones, Great Destiny Leapstones, Superior Abidos Fusion, gold).
// The notice names artisan's energy and both breaths without the numbers; those (+10% of the base per failure,
// up to 10 failures; Lava's and Glacier's Breath each adding up to half the base) are KR game facts as listed in
// LOPEC's enhancement calculator (https://www.lopec.kr/tool/enhancement, 2026-10-09), which matches every
// material, shard and gold figure of the notice.

import type { HoningTap } from './honing-cost-data';

const DESTRUCTION = '66102007'; // 운명의 파괴석 결정
const GUARDIAN = '66102107'; // 운명의 수호석 결정
const LEAPSTONE = '66110226'; // 위대한 운명의 돌파석
const FUSION = '6861013'; // 상급 아비도스 융화 재료
const LAVA = 66111131; // 용암의 숨결
const GLACIER = 66111132; // 빙하의 숨결
/** Breath per 5 steps: [chance per breath (1/10000), max per type]. Each type maxes at half the base chance. */
const BREATH: [number, number][] = [[37.5, 20], [20, 25], [10, 25], [5, 30], [2.5, 30]];

// step: [success %, growth shards, shards, destruction, guardian, leapstones, fusion, gold] (silver left out)
const ROWS: [number, number, number, number, number, number, number, number][] = [
	[15, 145000, 14500, 600, 1800, 30, 22, 5200],
	[15, 145000, 15000, 620, 1860, 31, 23, 5400],
	[15, 145000, 15630, 640, 1925, 32, 24, 5610],
	[15, 145000, 16280, 660, 1990, 33, 25, 5830],
	[15, 145000, 16960, 680, 2055, 34, 26, 6060],
	[10, 148000, 17670, 700, 2125, 36, 27, 6300],
	[10, 166000, 18410, 720, 2195, 38, 28, 6550],
	[10, 166000, 19180, 745, 2270, 40, 29, 6810],
	[10, 169000, 19980, 770, 2345, 42, 30, 7080],
	[10, 204000, 20810, 795, 2425, 44, 31, 7360],
	[5, 207000, 21680, 820, 2505, 46, 32, 7650],
	[5, 227000, 22590, 845, 2590, 48, 33, 7950],
	[5, 253000, 23530, 870, 2680, 50, 34, 8260],
	[5, 275000, 24510, 900, 2770, 53, 36, 8590],
	[5, 306000, 25530, 930, 2865, 56, 38, 8930],
	[3, 328000, 26600, 960, 2965, 59, 40, 9280],
	[3, 360000, 27710, 990, 3065, 62, 42, 9650],
	[3, 388000, 28870, 1020, 3170, 65, 44, 10030],
	[3, 420000, 30080, 1055, 3280, 68, 46, 10430],
	[3, 447000, 31340, 1090, 3390, 72, 48, 10840],
	[1.5, 480000, 32650, 1125, 3505, 76, 50, 11270],
	[1.5, 513000, 34020, 1160, 3625, 80, 53, 11720],
	[1.5, 541000, 35440, 1200, 3750, 84, 56, 12180],
	[1.5, 574000, 36920, 1240, 3880, 89, 59, 12660],
	[1.5, 607000, 38470, 1280, 4015, 94, 62, 13160]
];

/** Honing to bracer step 1…25 (index 0 = step 1), in the gear table's shape. */
export const BRACER_TAPS: HoningTap[] = ROWS.map(([pct, growth, shards, destruction, guardian, leapstones, fusion, gold], i) => ({
	growth,
	success: pct * 100,
	failBonus: pct * 10,
	failMax: pct * 100,
	energy: 21500,
	breath: { id: LAVA, rate: BREATH[Math.floor(i / 5)][0], max: BREATH[Math.floor(i / 5)][1] },
	moreBreath: { id: GLACIER, rate: BREATH[Math.floor(i / 5)][0], max: BREATH[Math.floor(i / 5)][1] },
	gold,
	silver: 0,
	shards,
	mats: { [LEAPSTONE]: leapstones, [DESTRUCTION]: destruction, [GUARDIAN]: guardian, [FUSION]: fusion }
}));
