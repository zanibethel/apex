import CartPage from "../cart/page";

// Dedicated full checkout review screen. The canonical /cart review remains
// available for existing links. Both reuse the same server-side release gate
// and customer session checks; neither authorizes payment.
export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={
 title:"Checkout Review | Apex Anabolics",
 robots:{index:false,follow:false},
};
export default function CheckoutPage(){
 return <CartPage/>;
}
