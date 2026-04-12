"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [engineStatus, setEngineStatus] = useState<string>("starting");

  useEffect(() => {
    // Auto-start the content engine when dashboard is opened
    fetch("/api/system/start")
      .then((res) => res.json())
      .then((data) => {
        if (data.running) {
          setEngineStatus("running");
          console.log(
            `[Content Empire] Engine LIVE — ${data.totalJobs} background jobs active`
          );
        }
      })
      .catch(() => {
        setEngineStatus("offline");
        console.warn("[Content Empire] Engine failed to start — running in UI-only mode");
      });
  }, []);

  return (
    <DashboardLayout>
      {/* Engine status indicator */}
      {engineStatus === "starting" && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-gray-300 shadow-lg animate-pulse">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          Starting engine...
        </div>
      )}
      {engineStatus === "running" && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-800/80 border border-gray-700/50 rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-gray-400 shadow-lg transition-opacity duration-1000">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Engine live
        </div>
      )}
      {children}
    </DashboardLayout>
  );
}
