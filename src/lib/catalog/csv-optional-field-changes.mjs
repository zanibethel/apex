// CSV import supports omitted optional columns (leave existing value alone)
// separately from included-but-blank optional columns (clear the old value).
// Source cost uses a different existing contract: blank keeps its old value.
export function csvEditableOptionalText(item,field,previous=""){
 if(!item||typeof item!=="object")return previous??"";
 return Object.prototype.hasOwnProperty.call(item,field)
  ?String(item[field]??"")
  :String(previous??"");
}
export function csvEditableCategoryId(item,previousId,categoryByName){
 if(!item||typeof item!=="object"||
  !Object.prototype.hasOwnProperty.call(item,"category"))return previousId??"";
 const name=String(item.category??"").trim().toLowerCase();
 return name?(categoryByName.get(name)??""):"";
}
