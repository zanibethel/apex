// Client-side bookkeeping for a supplier's explicitly selected private drafts.
// Successful saved rows remain selected for preview but are not re-saved on retry.
export function bulkRowsRequiringSave(selectedRows,lastSave={}){
 return selectedRows.filter(row=>!row.id||row.needsSave===true||lastSave[row.key]?.ok===false);
}

// A response to a 20-row chunk may be incomplete after an upstream failure.
// Accept only uniquely identified outcomes belonging to the submitted chunk,
// and never silently mark a missing or malformed outcome as successful.
export function reconcileBulkSaveBatch(submittedRows,outcomes){
 const expected=new Set(submittedRows.map(r=>r.key));
 const seen=new Set();
 const results=[];
 for(const item of Array.isArray(outcomes)?outcomes:[]){
  if(!item||typeof item!=="object"||typeof item.key!=="string"||
     !expected.has(item.key)||seen.has(item.key)||typeof item.ok!=="boolean")
    continue;
  seen.add(item.key);
  results.push(item);
 }
 return {results,complete:results.length===submittedRows.length};
}

export function bulkSaveProgress(submittedRows,results,stopped=false){
 const accepted=new Set(results.map(item=>item.key));
 const saved=results.filter(item=>item.ok&&Boolean(item.id)).length;
 const failed=results.filter(item=>!item.ok||!item.id).length;
 const unfinished=submittedRows.filter(row=>!accepted.has(row.key)).length;
 const complete=!stopped&&failed===0&&unfinished===0;
 let message=`${saved} of ${submittedRows.length} changes saved.`;
 if(failed)message+=` ${failed} failed.`;
 if(unfinished)message+=` ${unfinished} not completed.`;
 if(failed||unfinished)message+=" Correct remaining rows and choose Save selected again. Confirmed rows will not be resubmitted.";
 return {ok:complete,message,saved,failed,unfinished};
}


// Exact keys from the most recent explicit save action that still need
// correction or retry, including rows omitted by a partial network response.
// A successful result requires both ok=true and the persisted product ID.
export function bulkUnfinishedSaveKeys(submittedRows,outcomes){
 const successful=new Set(
  outcomes.filter(item=>item?.ok===true&&typeof item.id==="string"&&item.id.length>0)
   .map(item=>item.key)
 );
 return submittedRows.filter(row=>!successful.has(row.key)).map(row=>row.key);
}
