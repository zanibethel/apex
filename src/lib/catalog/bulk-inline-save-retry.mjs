// In a single-card save, never discard other failures from a previous
// selected batch. Only attempted keys can be marked complete or re-added.
export function mergeBulkSaveRetryKeys(previous=[],attempted=[],unfinished=[]){
 const scope=new Set(attempted.map(row=>row.key));
 const pending=new Set(unfinished);
 return [...new Set([...previous.filter(key=>!scope.has(key)),...pending])];
}
