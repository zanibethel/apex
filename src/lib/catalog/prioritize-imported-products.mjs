// Preserve all unrelated draft and saved cards, but make newly imported CSV
// rows visible immediately at the top of the editor.
export function prioritizeImportedProducts(previous,imported){
 const keys=new Set(imported.map(row=>row.key));
 return [...imported,...previous.filter(row=>!keys.has(row.key))];
}
