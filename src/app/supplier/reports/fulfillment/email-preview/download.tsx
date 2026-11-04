"use client";

export default function ReviewEmailAttachmentDownload({
 csv,filename,
}:{csv:string;filename:string}){
 function download(){
  if(!/^[a-z0-9._-]+\.csv$/.test(filename)||
   !csv.startsWith("store_id,order_id,original_purchased_at_utc,")||
   csv.length>400000)return;
  const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=filename;
  document.body.appendChild(anchor);
  anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <button className="button secondary" type="button"
  onClick={download}>Download metadata-only attachment preview</button>;
}
