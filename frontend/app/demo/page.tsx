import { redirect } from "next/navigation";

/** 旧 demo 已并入全站改版，直接回首页 */
export default function DemoRedirect() {
  redirect("/");
}
