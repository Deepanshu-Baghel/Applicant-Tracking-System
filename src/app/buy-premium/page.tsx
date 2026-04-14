import { permanentRedirect } from "next/navigation";

export default function BuyPremiumPage() {
  permanentRedirect("/billing");
}
