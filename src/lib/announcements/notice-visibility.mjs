// Pure, clock-explicit visibility predicate for scheduled public banner notices.
export function visibleNoticeAt(value,now){
 if(!value||typeof value!=="object"||!Number.isFinite(now))return false;
 const start=value.starts_at===null?null:Date.parse(value.starts_at);
 const end=value.ends_at===null?null:Date.parse(value.ends_at);
 return (start===null||Number.isFinite(start)&&start<=now)&&
  (end===null||Number.isFinite(end)&&end>now);
}
