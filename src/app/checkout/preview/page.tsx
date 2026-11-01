import {CheckoutPreview} from "./checkout-preview";
import "./checkout-preview.css";

export const metadata={
 title:"Interactive Checkout Preview | Apex",
 description:"A client-only, non-transactional preview of the Apex guest checkout and Bitcoin payment status experience.",
 robots:{index:false,follow:false},
};

export default function CheckoutPreviewPage(){
 return <CheckoutPreview/>;
}
