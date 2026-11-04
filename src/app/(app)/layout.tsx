import { AppHeader } from "@/components/shell/app-header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[1376px] flex-1 px-4 py-8 sm:px-8">{children}</main>
    </>
  );
}
