// A blank-SKU CSV row is assigned a random private draft SKU. On an
// intentional re-upload of the SAME filename, match that staged card by
// original CSV line and title so the second upload does not create a duplicate.
// This is session-local; different filenames, changed titles, saved products,
// errored/ambiguous imports and removed cards never cause silent replacement.
export function matchRepeatedBlankSkuCard(previousFileName,nextFileName,previousStaged,editorRows,line,title){
 if(typeof previousFileName!=="string"||!previousFileName||
    previousFileName!==nextFileName||!Number.isSafeInteger(line)||line<2||
    typeof title!=="string"||!title)return undefined;
 const candidates=(Array.isArray(previousStaged)?previousStaged:[]).filter(entry=>
  entry&&entry.originalBlankSku===true&&!entry.issue&&
  entry.line===line&&entry.row?.name===title&&!entry.row?.id&&
  typeof entry.row?.key==="string"&&Boolean(entry.row.key));
 if(candidates.length!==1)return undefined;
 const match=(Array.isArray(editorRows)?editorRows:[]).filter(row=>
  row?.key===candidates[0].row.key&&!row?.id);
 return match.length===1?match[0]:undefined;
}
