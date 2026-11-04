"use client";
import {useState,type FormEvent} from "react";
import {EMPTY_DELIVERY_DETAILS,summarizeDeliveryPreparation}
 from "@/lib/checkout/delivery-preparation.mjs";
import {US_STATE_OPTIONS} from "@/lib/checkout/us-states.mjs";

type Field="firstName"|"lastName"|"email"|"phone"|"address1"|
 "address2"|"city"|"state"|"postalCode";
type Contact=Record<Field,string>;
const FIELD_LIST:ReadonlyArray<{
 key:Field;label:string;autoComplete:string;type?:string;optional?:boolean;
}>= [
 {key:"firstName",label:"First name",autoComplete:"given-name"},
 {key:"lastName",label:"Last name",autoComplete:"family-name"},
 {key:"email",label:"Email",autoComplete:"email",type:"email"},
 {key:"phone",label:"Phone (optional)",autoComplete:"tel",type:"tel",optional:true},
 {key:"address1",label:"Street address",autoComplete:"address-line1"},
 {key:"address2",label:"Apartment / unit (optional)",autoComplete:"address-line2",optional:true},
 {key:"city",label:"City",autoComplete:"address-level2"},
 {key:"postalCode",label:"ZIP code",autoComplete:"postal-code"},
];

export function DeliveryDetailsForm({items,shippingMethod}:{
 items:{product_id:string;quantity:number}[];shippingMethod:"small"|"medium";
}){
 const [fields,setFields]=useState<Contact>({...EMPTY_DELIVERY_DETAILS});
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [confirmed,setConfirmed]=useState<Contact|null>(null);
 const setField=(key:Field,value:string)=>{
  setFields(previous=>({...previous,[key]:value}));
  setErrors(previous=>({...previous,[key]:"",form:""}));
  setConfirmed(null);
 };
 const submit=(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();
  const result=summarizeDeliveryPreparation(fields,items);
  setErrors(result.errors as Record<string,string>);
  setConfirmed(result.contactFormatValid&&result.cartStructureValid?
   result.deliveryDetails as Contact:null);
 };
 return <section className="apex-delivery-panel" aria-labelledby="delivery-details-heading">
  <p className="eyebrow">DELIVERY INFORMATION</p>
  <h2 id="delivery-details-heading">Contact &amp; shipping address</h2>
  <p className="apex-cart-note">Enter your details to review their format.
   They remain in this browser tab and are not saved, transmitted or used to create an order.</p>
  <form onSubmit={submit} noValidate>
   <div className="apex-delivery-fields">
    {FIELD_LIST.slice(0,7).map(field=><label key={field.key} htmlFor={"apex-delivery-"+field.key}>
     <span>{field.label}</span>
     <input id={"apex-delivery-"+field.key} type={field.type??"text"}
      autoComplete={field.autoComplete} required={!field.optional}
      maxLength={field.key==="email"?254:field.key==="address1"?140:field.key==="address2"?100:field.key==="phone"?25:75}
      value={fields[field.key]} onChange={e=>setField(field.key,e.target.value)}
      aria-invalid={Boolean(errors[field.key])}
      aria-describedby={errors[field.key]?"apex-delivery-error-"+field.key:undefined}/>
     {errors[field.key]&&<small id={"apex-delivery-error-"+field.key} role="alert">
      {errors[field.key]}</small>}
    </label>)}
    <label htmlFor="apex-delivery-state">
     <span>State</span>
     <select id="apex-delivery-state" value={fields.state}
      autoComplete="address-level1" onChange={e=>setField("state",e.target.value)}
      aria-invalid={Boolean(errors.state)}>
      {US_STATE_OPTIONS.map(item=><option key={item.code} value={item.code}>
       {item.name}</option>)}
     </select>
     {errors.state&&<small role="alert">{errors.state}</small>}
    </label>
    {FIELD_LIST.slice(7).map(field=><label key={field.key} htmlFor={"apex-delivery-"+field.key}>
     <span>{field.label}</span>
     <input id={"apex-delivery-"+field.key} type="text"
      autoComplete={field.autoComplete} required maxLength={10}
      value={fields[field.key]} onChange={e=>setField(field.key,e.target.value)}
      aria-invalid={Boolean(errors[field.key])}/>
     {errors[field.key]&&<small role="alert">{errors[field.key]}</small>}
    </label>)}
   </div>
   {errors.form&&<p className="apex-cart-validation" role="alert">{errors.form}</p>}
   <button type="submit" className="apex-delivery-review-button">Review delivery details</button>
  </form>
  {confirmed&&<div className="apex-delivery-confirmation" aria-live="polite">
   <h3>Delivery details reviewed</h3>
   <p><strong>Contact:</strong> {confirmed.firstName} {confirmed.lastName}</p>
   <p>{confirmed.email}</p>
   {confirmed.phone&&<p>{confirmed.phone}</p>}
   <p><strong>Shipping to:</strong> {confirmed.address1}
    {confirmed.address2?", "+confirmed.address2:""}, {confirmed.city},
    {" "}{confirmed.state} {confirmed.postalCode}</p>
   <p><strong>Packaging:</strong> {shippingMethod==="small"?
    "USPS Padded Flat Rate Envelope":"USPS Medium Flat Rate Box"}</p>
   <p className="apex-cart-validation">Format checked only. Address delivery, stock,
    and order eligibility have not been confirmed. No order was placed.</p>
  </div>}
 </section>;
}
