import { redirect } from "next/navigation";

/** Old address of the profile page. */
export default function AccountPage() {
  redirect("/member/profile");
}
