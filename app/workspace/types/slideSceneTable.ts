export type SceneTableCell={text:string;fill?:string;color?:string;fontSize?:number;fontFamily?:string;bold?:boolean;italic?:boolean;underline?:boolean;align?:"left"|"center"|"right";verticalAlign?:"top"|"middle"|"bottom"};
export type SceneTableMerge={row:number;column:number;rowSpan:number;colSpan:number};
export type SceneTableData={rows:SceneTableCell[][];columnWidths:number[];rowHeights:number[];merges:SceneTableMerge[];headerRow:boolean};
export const SCENE_TABLE_LIMITS={rows:30,columns:15,cellText:2000,totalText:20000} as const;
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const cssColor=(v:unknown)=>typeof v==="string"&&(/^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]{2,20})$/i.test(v)||/^(?:rgb|rgba|hsl|hsla)\([\d\s,%.+-]+\)$/i.test(v))?v:undefined;
function weights(input:unknown,count:number):number[]|undefined{
  if(input===undefined)return Array.from({length:count},()=>1);
  if(!Array.isArray(input)||input.length!==count||input.some(v=>typeof v!=="number"||!Number.isFinite(v)||v<=0||v>1e12))return;
  return [...input];
}
export function normalizeSceneTable(input:unknown):SceneTableData|undefined{
  const data=record(input),raw=data.rows;
  if(!Array.isArray(raw)||raw.length<1||raw.length>SCENE_TABLE_LIMITS.rows)return;
  const columns=Array.isArray(raw[0])?raw[0].length:0;if(columns<1||columns>SCENE_TABLE_LIMITS.columns)return;
  let totalText=0;const rows:SceneTableCell[][]=[];
  for(const rawRow of raw){
    if(!Array.isArray(rawRow)||rawRow.length!==columns)return;
    const row:SceneTableCell[]=[];
    for(const value of rawRow){
      const cell:Record<string,unknown>=typeof value==="string"||typeof value==="number"||typeof value==="boolean"?{text:String(value)}:record(value);
      if(typeof cell.text!=="string"||cell.text.length>SCENE_TABLE_LIMITS.cellText)return;
      totalText+=cell.text.length;if(totalText>SCENE_TABLE_LIMITS.totalText)return;
      const next:SceneTableCell={text:cell.text},fill=cssColor(cell.fill),color=cssColor(cell.color);
      if(cell.fill!==undefined&&!fill||cell.color!==undefined&&!color)return;
      if(fill)next.fill=fill;if(color)next.color=color;
      if(typeof cell.fontSize==="number"&&Number.isFinite(cell.fontSize))next.fontSize=Math.min(120,Math.max(8,cell.fontSize));
      if(typeof cell.fontFamily==="string"&&/^[\w\s,'"-]{1,100}$/.test(cell.fontFamily))next.fontFamily=cell.fontFamily;
      for(const key of ["bold","italic","underline"] as const){const value=cell[key];if(typeof value==="boolean")next[key]=value;}
      if(["left","center","right"].includes(String(cell.align)))next.align=cell.align as SceneTableCell["align"];
      if(["top","middle","bottom"].includes(String(cell.verticalAlign)))next.verticalAlign=cell.verticalAlign as SceneTableCell["verticalAlign"];
      row.push(next);
    }
    rows.push(row);
  }
  const columnWidths=weights(data.columnWidths,columns),rowHeights=weights(data.rowHeights,rows.length);
  if(!columnWidths||!rowHeights)return;
  const rawMerges=data.merges??[];if(!Array.isArray(rawMerges)||rawMerges.length>rows.length*columns)return;
  const merges:SceneTableMerge[]=[],covered=new Set<string>();
  for(const value of rawMerges){
    const m=record(value),keys=["row","column","rowSpan","colSpan"] as const;
    if(keys.some(key=>typeof m[key]!=="number"||!Number.isInteger(m[key])))return;
    const merge:SceneTableMerge={row:m.row as number,column:m.column as number,rowSpan:m.rowSpan as number,colSpan:m.colSpan as number};
    if(merge.row<0||merge.column<0||merge.rowSpan<1||merge.colSpan<1||merge.row+merge.rowSpan>rows.length||merge.column+merge.colSpan>columns)return;
    if(merge.rowSpan===1&&merge.colSpan===1)continue;
    for(let r=merge.row;r<merge.row+merge.rowSpan;r++)for(let c=merge.column;c<merge.column+merge.colSpan;c++){const key=`${r}:${c}`;if(covered.has(key))return;covered.add(key);}
    merges.push(merge);
  }
  merges.sort((a,b)=>a.row-b.row||a.column-b.column);
  return {rows,columnWidths,rowHeights,merges,headerRow:data.headerRow===true};
}
export function createSceneTable(rows=4,columns=3):SceneTableData{
  if(!Number.isFinite(rows)||!Number.isFinite(columns))throw new Error("Table dimensions must be finite numbers.");
  const r=Math.max(1,Math.min(SCENE_TABLE_LIMITS.rows,Math.round(rows))),c=Math.max(1,Math.min(SCENE_TABLE_LIMITS.columns,Math.round(columns)));
  return {rows:Array.from({length:r},(_,row)=>Array.from({length:c},(_,column)=>({text:row===0?`Column ${column+1}`:""}))),columnWidths:Array(c).fill(1),rowHeights:Array(r).fill(1),merges:[],headerRow:true};
}
export function tableMergeAt(table:SceneTableData,row:number,column:number):SceneTableMerge|undefined{return table.merges.find(m=>row>=m.row&&row<m.row+m.rowSpan&&column>=m.column&&column<m.column+m.colSpan);}
export type SceneTableCellFrame={row:number;column:number;rowSpan:number;colSpan:number;x:number;y:number;w:number;h:number;cell:SceneTableCell};
/** Relative object-frame geometry, shared by canvas/PDF; covered cell values remain in the table data. */
export function sceneTableLayout(table:SceneTableData):SceneTableCellFrame[]{
  const sumW=table.columnWidths.reduce((a,b)=>a+b,0),sumH=table.rowHeights.reduce((a,b)=>a+b,0),xs=[0],ys=[0];
  table.columnWidths.forEach(w=>xs.push(xs[xs.length-1]+w/sumW));table.rowHeights.forEach(h=>ys.push(ys[ys.length-1]+h/sumH));
  const result:SceneTableCellFrame[]=[];
  table.rows.forEach((row,r)=>row.forEach((cell,c)=>{
    const merge=tableMergeAt(table,r,c);if(merge&&(merge.row!==r||merge.column!==c))return;
    const rowSpan=merge?.rowSpan??1,colSpan=merge?.colSpan??1;
    result.push({row:r,column:c,rowSpan,colSpan,x:xs[c],y:ys[r],w:xs[c+colSpan]-xs[c],h:ys[r+rowSpan]-ys[r],cell});
  }));return result;
}
