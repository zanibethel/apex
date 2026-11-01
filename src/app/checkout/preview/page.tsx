import {notFound} from "next/navigation";
import {CheckoutPreview} from "./checkout-preview";
import "./checkout-preview.css";

// Server-only public release gate: no setting can switch this demo to
// transactional checkout. Unrecognized modes (including "live") fail closed.
export const dynamic="force-dynamic";
export const metadata={
 title:"Demo Checkout — Test Mode | Apex",
 description:"Demo only: no actual orders or Bitcoin payments.",
 robots:{index:false,follow:false},
};

export default function CheckoutPreviewPage(){
 if(process.env.APEX_CHECKOUT_MODE!=="demo")notFound();
 return <CheckoutPreview/>;
}
