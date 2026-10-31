const central=new Intl.DateTimeFormat("en-US",{
 timeZone:"America/Chicago",month:"short",day:"numeric",year:"numeric",
 hour:"numeric",minute:"2-digit",timeZoneName:"short",
});
export function formatReviewTime(value) {
 if(!value)return "Not yet";
 const date=new Date(value);
 return Number.isFinite(date.getTime())?central.format(date):"Unavailable";
}
