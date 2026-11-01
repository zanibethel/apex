"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOutAccount } from "@/app/account/sign-out/actions";

export function AccountMenu({ signedIn, admin, supplier }: { signedIn: boolean; admin: boolean; supplier: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("scroll", closeScroll, true);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("scroll", closeScroll, true);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);
  return <div className="apex-menu" ref={menuRef}>
    <button type="button" className="apex-menu-toggle" aria-label="Navigation menu" aria-expanded={open} aria-controls="apex-menu-panel" onClick={() => setOpen(v => !v)}>☰</button>
    {open && <div className="apex-menu-panel" id="apex-menu-panel">
      <Link href="/catalog" onClick={() => setOpen(false)}>Catalog</Link>
      <Link href="/checkout/preview" onClick={() => setOpen(false)}>Try checkout preview</Link>
      <Link href="/#approach" onClick={() => setOpen(false)}>Approach</Link>
      {signedIn && <Link href="/account/profile" onClick={() => setOpen(false)}>My profile</Link>}
      {admin && <Link href="/admin" onClick={() => setOpen(false)}>Admin dashboard</Link>}
      {supplier && <Link href="/supplier" onClick={() => setOpen(false)}>Supplier workspace</Link>}
      {signedIn ? <form action={signOutAccount}><button type="submit" className="apex-menu-signout">Sign out</button></form> : <Link href="/account/sign-in" onClick={() => setOpen(false)}>Account sign in</Link>}
    </div>}
  </div>;
}
