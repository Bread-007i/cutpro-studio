import { cookies } from "next/headers";
import DownloadPage from "@/app/download/page";
import EditorEntry from "@/components/editor/EditorEntry";

export default async function Page() {
  const desktopToken = process.env.CUTPRO_DESKTOP_TOKEN;
  const sessionToken = (await cookies()).get("cutpro-desktop-session")?.value;

  if (desktopToken && sessionToken === desktopToken) {
    return <EditorEntry />;
  }

  return <DownloadPage />;
}
