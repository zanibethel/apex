// Status selection is independent of checkout/payment activation.
// An active code may be managed even when the store cannot accept orders.
export function newPromotionActive(status){
 if(status===null||status===undefined||status==="active")return true;
 if(status==="inactive")return false;
 return null;
}
