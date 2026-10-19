import { normalizeSceneTable, SCENE_TABLE_LIMITS, type SceneTableCell, type SceneTableData, type SceneTableMerge } from "../types/slideSceneTable";
export type TableRange={row:number;column:number;endRow:number;endColumn:number};
export function tableRange(a:{row:number;column:number},b=a):TableRange{return {row:Math.min(a.row,b.row),column:Math.min(a.column,b.column),endRow:Math.max(a.row,b.row),endColumn:Math.max(a.column,b.column)};}
const intersects=(m:SceneTableMerge,r:TableRange)=>m.row<=r.endRow&&m.row+m.rowSpan>r.row&&m.column<=r.endColumn&&m.column+m.colSpan>r.column;
const validate=(table:SceneTableData)=>{const result=normalizeSceneTable(table);if(!result)throw new Error("Table data exceeds the supported size, text or merge limits.");return result;};
function checkRange(table:SceneTableData,r:TableRange):void{
  if(Object.values(r).some(v=>!Number.isInteger(v))||r.row<0||r.column<0||r.endRow<r.row||r.endColumn<r.column||r.endRow>=table.rows.length||r.endColumn>=table.rows[0].length)throw new Error("Select a valid rectangular cell range.");
}
export function patchSceneTable(table:SceneTableData,range:TableRange,patch:Partial<SceneTableCell>):SceneTableData{
  checkRange(table,range);
  const rows=table.rows.map((row,r)=>row.map((cell,c)=>r>=range.row&&r<=range.endRow&&c>=range.column&&c<=range.endColumn?{...cell,...patch}:cell));
  return validate({...table,rows});
}
/** Only display geometry is merged; covered values remain stored and recoverable on unmerge. */
export function mergeSceneTable(table:SceneTableData,range:TableRange):SceneTableData{
  checkRange(table,range);
  if(range.row===range.endRow&&range.column===range.endColumn)return table;
  for(const merge of table.merges)if(intersects(merge,range)&&!(merge.row>=range.row&&merge.column>=range.column&&merge.row+merge.rowSpan-1<=range.endRow&&merge.column+merge.colSpan-1<=range.endColumn))throw new Error("Selection crosses an existing merge. Unmerge those cells first.");
  const merges=table.merges.filter(m=>!intersects(m,range));
  merges.push({row:range.row,column:range.column,rowSpan:range.endRow-range.row+1,colSpan:range.endColumn-range.column+1});
  return validate({...table,merges});
}
export function unmergeSceneTable(table:SceneTableData,range:TableRange):SceneTableData{
  checkRange(table,range);return {...table,merges:table.merges.filter(m=>!intersects(m,range))};
}
export function insertSceneTableAxis(table:SceneTableData,axis:"row"|"column",index:number):SceneTableData{
  const count=axis==="row"?table.rows.length:table.rows[0].length,max=axis==="row"?SCENE_TABLE_LIMITS.rows:SCENE_TABLE_LIMITS.columns;
  if(!Number.isInteger(index)||index<0||index>count||count>=max)throw new Error(`Table limit: ${SCENE_TABLE_LIMITS.rows} rows and ${SCENE_TABLE_LIMITS.columns} columns.`);
  const rows=table.rows.map(row=>row.map(cell=>({...cell}))),columnWidths=[...table.columnWidths],rowHeights=[...table.rowHeights];
  if(axis==="row"){rows.splice(index,0,Array.from({length:rows[0].length},()=>({text:""})));rowHeights.splice(index,0,rowHeights[Math.min(index,count-1)]??1);}
  else{rows.forEach(row=>row.splice(index,0,{text:""}));columnWidths.splice(index,0,columnWidths[Math.min(index,count-1)]??1);}
  const merges=table.merges.map(m=>{
    const next={...m},start=axis==="row"?"row":"column",span=axis==="row"?"rowSpan":"colSpan";
    if(index<=next[start])next[start]+=1;else if(index<next[start]+next[span])next[span]+=1;
    return next;
  });
  return validate({...table,rows,columnWidths,rowHeights,merges});
}
export function deleteSceneTableAxis(table:SceneTableData,axis:"row"|"column",index:number):SceneTableData{
  const count=axis==="row"?table.rows.length:table.rows[0].length;
  if(!Number.isInteger(index)||index<0||index>=count||count<=1)throw new Error("A table must keep at least one row and one column.");
  const rows=table.rows.map(row=>row.map(cell=>({...cell}))),columnWidths=[...table.columnWidths],rowHeights=[...table.rowHeights];
  if(axis==="row"){rows.splice(index,1);rowHeights.splice(index,1);}else{rows.forEach(row=>row.splice(index,1));columnWidths.splice(index,1);}
  const merges=table.merges.map(m=>{
    const next={...m},start=axis==="row"?"row":"column",span=axis==="row"?"rowSpan":"colSpan";
    if(index<next[start])next[start]-=1;else if(index<next[start]+next[span])next[span]-=1;
    return next;
  }).filter(m=>m.rowSpan>0&&m.colSpan>0&&(m.rowSpan>1||m.colSpan>1));
  return validate({...table,rows,columnWidths,rowHeights,merges});
}
export function setSceneTableWeight(table:SceneTableData,axis:"row"|"column",index:number,value:number):SceneTableData{
  if(!Number.isFinite(value)||value<=0||value>1e12)throw new Error("Use a positive row/column size.");
  const key=axis==="row"?"rowHeights":"columnWidths",weights=[...table[key]];
  if(!Number.isInteger(index)||index<0||index>=weights.length)throw new Error("Invalid row or column.");
  weights[index]=value;return {...table,[key]:weights};
}
/** TSV/plain text only; spreadsheet formulas remain inert text, never executed. */
export function pasteSceneTable(table:SceneTableData,row:number,column:number,text:string):SceneTableData{
  if(text.length>SCENE_TABLE_LIMITS.totalText)throw new Error("Pasted table text is too large.");
  if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||column<0)throw new Error("Invalid paste position.");
  const values=text.replace(/\r\n?/g,"\n").replace(/\n$/,"").split("\n").map(line=>line.split("\t"));
  const rowsNeeded=row+values.length,colsNeeded=column+Math.max(...values.map(v=>v.length));
  if(rowsNeeded>SCENE_TABLE_LIMITS.rows||colsNeeded>SCENE_TABLE_LIMITS.columns)throw new Error("Pasted values exceed the table dimensions limit.");
  let next=table;
  while(next.rows.length<rowsNeeded)next=insertSceneTableAxis(next,"row",next.rows.length);
  while(next.rows[0].length<colsNeeded)next=insertSceneTableAxis(next,"column",next.rows[0].length);
  const range={row,column,endRow:rowsNeeded-1,endColumn:colsNeeded-1};
  if(next.merges.some(m=>intersects(m,range)))throw new Error("Unmerge the paste destination before pasting a grid.");
  const rows=next.rows.map(cells=>cells.map(cell=>({...cell})));
  values.forEach((cells,r)=>cells.forEach((value,c)=>{rows[row+r][column+c].text=value;}));
  return validate({...next,rows});
}
