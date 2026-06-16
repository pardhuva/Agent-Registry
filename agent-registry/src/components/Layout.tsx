import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex min-h-screen bg-[#f0f2f7]">
      <Sidebar />
      <main className="ml-[260px] flex-1 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
