import { permanentRedirect } from "next/navigation";

export default function BuyCreditsPage() {
  permanentRedirect("/billing");
}
