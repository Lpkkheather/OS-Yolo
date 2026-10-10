"use client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@base-ui/react/separator";
import React, { useEffect, useState } from "react";
import { LogEvent } from "../types/eventTypes";
import formatDate from "../utils";

export function EventLog() {
  const [events, setEvents] = useState<LogEvent[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/data/eventlog.json", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setEvents(data.events))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    console.log(events);
  }, [events]);
  return (
    <div className="bg-[#1e1e1e] w-full backdrop-blur-md overflow-hidden shadow-lg rounded-xl border border-[#1f1f1f]">
      <div className="px-4 py-5 sm:p-6">
        <h4 className="mb-4 text-sm leading-none font-medium">Event Log</h4>
        <ScrollArea className="h-72 w-full  rounded-md">
          <div className="p-4 w-full">
            {events.map((event) => (
              <React.Fragment key={event.id}>
                <div className="flex gap-4">
                  <span className="text-[#929292] text-md">{formatDate(event.ts)}</span>
                  <span>
                  {event.message}
                  </span>
                </div>
                <Separator className="my-3 border border-[#454444]" />
              </React.Fragment>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
