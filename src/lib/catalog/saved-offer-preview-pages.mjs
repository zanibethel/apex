// Private offer preview pagination is presentation-only. Query predicates
// for ownership and unpublished products still live in the server route.
export const SAVED_PREVIEW_PAGE_SIZE=50;
export const SAVED_PREVIEW_MAX_PAGE=1000;

export function parseSavedPreviewPage(input){
 if(input===undefined)return 1;
 if(typeof input!=="string"||!/^[1-9][0-9]{0,3}$/.test(input))return null;
 const page=Number(input);
 return Number.isSafeInteger(page)&&page<=SAVED_PREVIEW_MAX_PAGE?page:null;
}

export function savedPreviewWindow(page,total){
 if(!Number.isSafeInteger(page)||page<1||page>SAVED_PREVIEW_MAX_PAGE||
  !Number.isSafeInteger(total)||total<0)return null;
 const pages=Math.max(1,Math.ceil(total/SAVED_PREVIEW_PAGE_SIZE));
 if(page>pages)return null;
 const offset=(page-1)*SAVED_PREVIEW_PAGE_SIZE;
 return {
  page,pages,total,offset,end:offset+SAVED_PREVIEW_PAGE_SIZE-1,
  first:total?offset+1:0,last:Math.min(total,offset+SAVED_PREVIEW_PAGE_SIZE),
  previous:page>1?page-1:null,next:page<pages?page+1:null,
 };
}

export function savedPreviewPageHref(page){
 if(!Number.isSafeInteger(page)||page<1||page>SAVED_PREVIEW_MAX_PAGE)return null;
 return "/supplier/catalog/bulk/preview?all=1&page="+page;
}
