"use client";
import {useActionState} from "react";
import {recordPrivateMediaEvidence} from "./actions";

export function MediaEvidenceForm({storeId,productId,submissionId,imagePath}:{storeId:string;productId:string;submissionId:string;imagePath:string}){
 const [state,action,pending]=useActionState(recordPrivateMediaEvidence,{ok:false,message:""});
 return <form className="apex-admin-media-evidence-form" action={action}>
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  <input type="hidden" name="submissionId" value={submissionId}/>
  <input type="hidden" name="imagePath" value={imagePath}/>
  <label>Review outcome
   <select name="reviewStatus" defaultValue="needs_correction" required disabled={pending}>
    <option value="needs_correction">Needs image or evidence correction</option>
    <option value="evidence_recorded">Image identity and use-rights evidence checked</option>
   </select>
  </label>
  <label>Identity evidence reference
   <input type="text" name="identityReference" maxLength={300} disabled={pending}
    placeholder="Source document, label record or internal evidence ID"/>
  </label>
  <label>Image-use-rights evidence reference
   <input type="text" name="rightsReference" maxLength={300} disabled={pending}
    placeholder="License, authorization or original-photography record"/>
  </label>
  <label>Review note (required)
   <textarea name="note" rows={3} minLength={10} maxLength={1000} required disabled={pending}
    placeholder="Record what was checked or which correction is required."/>
  </label>
  <button type="submit" className="button secondary" disabled={pending}>
   {pending?"Saving private evidence…":"Save evidence review"}
  </button>
  {state.message&&<p role="status" className="notice">{state.message}</p>}
  <p className="notice">This records evidence only. It does not approve the product,
   publish an image, or enable a customer purchase.</p>
 </form>;
}
