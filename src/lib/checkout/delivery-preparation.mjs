// Client-side format checks for a future delivery step. This module never
// authorizes sales, validates postal deliverability, or writes order records.
import {US_STATE_OPTIONS} from "./us-states.mjs";

export const EMPTY_DELIVERY_DETAILS=Object.freeze({
 firstName:"",lastName:"",email:"",phone:"",
 address1:"",address2:"",city:"",state:"TX",postalCode:"",
});

const fields=Object.keys(EMPTY_DELIVERY_DETAILS);
const states=new Set(US_STATE_OPTIONS.map(item=>item.code));
const hasControls=value=>/[\u0000-\u001F\u007F]/.test(value);
const bounded=(value,max)=>typeof value==="string"&&
 value.length<=max&&!hasControls(value);
const normalize=(value)=>value.trim().replace(/ {2,}/g," ");

export function validateDeliveryDetails(input){
 const errors={};
 if(!input||typeof input!=="object"||Array.isArray(input)||
  Object.keys(input).length!==fields.length||
  Object.keys(input).some(key=>!fields.includes(key)))
  return {valid:false,errors:{form:"Enter valid delivery details."},details:null};
 const values={};
 for(const field of fields){
  const value=input[field];
  if(!bounded(value,field==="email"?254:field==="address1"?140:
    field==="address2"?100:field==="phone"?25:75))
   return {valid:false,errors:{form:"Enter valid delivery details."},details:null};
  values[field]=normalize(value);
 }
 for(const name of ["firstName","lastName"]){
  if(values[name].length<1||values[name].length>75)
   errors[name]="Enter a name.";
 }
 if(!/^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/.test(values.email))
  errors.email="Enter a valid email.";
 if(values.phone){
  const digits=values.phone.replace(/\D/g,"");
  if(digits.length<10||digits.length>15||!/^[+()\-\d. ]+$/.test(values.phone))
   errors.phone="Enter a valid phone number or leave it blank.";
 }
 if(values.address1.length<4)errors.address1="Enter a street address.";
 if(values.city.length<2)errors.city="Enter a city.";
 const state=values.state.toUpperCase();
 if(!states.has(state))errors.state="Choose a U.S. state.";
 if(!/^\d{5}(?:-\d{4})?$/.test(values.postalCode))
  errors.postalCode="Enter a 5-digit ZIP code or ZIP+4.";
 if(Object.keys(errors).length)return {valid:false,errors,details:null};
 return {
  valid:true,errors:{},
  details:Object.freeze({...values,state,email:values.email.toLowerCase()}),
 };
}

// A validated address is NOT an order record. Even validated input is held
// in browser memory only and cannot be submitted to checkout in this pass.
export function summarizeDeliveryPreparation(input,cart){
 const delivery=validateDeliveryDetails(input);
 const cartValid=Array.isArray(cart)&&cart.length>0&&cart.length<=20&&
  cart.every(line=>line&&typeof line==="object"&&
   typeof line.product_id==="string"&&
   /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(line.product_id)&&
   Number.isInteger(line.quantity)&&line.quantity>=1&&line.quantity<=10);
 return Object.freeze({
  contactFormatValid:delivery.valid,
  cartStructureValid:cartValid,
  deliveryDetails:delivery.valid?delivery.details:null,
  errors:delivery.errors,
  status:"preparation_only",
  canSubmitOrder:false,
  canReserveStock:false,
  canCreateInvoice:false,
  canPay:false,
 });
}
