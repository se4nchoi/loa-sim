import {describe,it,expect} from 'vitest';
import {sheetBounds} from './sheet-position';
describe('shared mobile sheet bounds',()=>{
 it('anchors below the CP bar',()=>expect(sheetBounds(0,844,150)).toEqual({top:150,height:694}));
 it('keeps the top while browser chrome shortens the visible viewport',()=>expect(sheetBounds(0,740,150)).toEqual({top:150,height:590}));
 it('uses the panned keyboard viewport',()=>expect(sheetBounds(80,400,150)).toEqual({top:150,height:330}));
 it('clamps when a bar is outside a very short viewport',()=>expect(sheetBounds(200,180,900)).toEqual({top:316,height:64}));
});
