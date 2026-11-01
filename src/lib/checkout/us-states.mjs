/**
 * Fictional-checkout address picker. No geolocation or external APIs.
 * Fifty US states + the District of Columbia; suggestions remain local.
 */
export const US_STATE_OPTIONS=Object.freeze([
 ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],
 ["CA","California"],["CO","Colorado"],["CT","Connecticut"],
 ["DE","Delaware"],["DC","District of Columbia"],["FL","Florida"],
 ["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],
 ["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],
 ["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],
 ["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
 ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],
 ["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],
 ["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
 ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],
 ["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],
 ["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
 ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],
 ["WI","Wisconsin"],["WY","Wyoming"],
].map(([code,name])=>Object.freeze({code,name})));

export function resolveDemoState(value){
 const needle=typeof value==="string"?value.trim().toLowerCase():"";
 return US_STATE_OPTIONS.find(option=>
  option.code.toLowerCase()===needle||option.name.toLowerCase()===needle)??null;
}
export function filterDemoStates(raw){
 const query=typeof raw==="string"?raw.trim().toLowerCase():"";
 if(!query)return US_STATE_OPTIONS;
 return US_STATE_OPTIONS.filter(item=>
  item.name.toLowerCase().includes(query)||item.code.toLowerCase().startsWith(query));
}
export function displayDemoState(code){
 const option=resolveDemoState(code);
 return option?`${option.name} (${option.code})`:"Choose a state";
}
