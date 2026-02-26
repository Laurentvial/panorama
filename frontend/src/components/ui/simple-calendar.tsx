"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fr } from "date-fns/locale";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from "date-fns";
import { cn } from "./utils";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface SimpleCalendarProps {
  selected?: Date;
  onSelect: (date: Date) => void;
  className?: string;
}

export function SimpleCalendar({ selected, onSelect, className }: SimpleCalendarProps) {
  const [month, setMonth] = React.useState(selected || new Date());

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = startDate;
  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between px-2 py-2 border-b">
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-slate-800 capitalize">
          {format(month, "MMMM yyyy", { locale: fr })}
        </span>
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="p-2">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-[11px] font-medium text-slate-500 text-center py-1"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d) => {
            const isOutside = !isSameMonth(d, month);
            const isSelected = selected && isSameDay(d, selected);
            const isTodayDate = isToday(d);

            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => onSelect(d)}
                className={cn(
                  "h-8 w-8 text-sm rounded-md transition-colors font-medium",
                  isOutside && "text-slate-300 cursor-default",
                  !isOutside && "text-slate-700 hover:bg-slate-100",
                  isSelected && "bg-slate-900 text-white hover:bg-slate-800",
                  isTodayDate && !isSelected && "bg-slate-100 text-slate-900 font-semibold"
                )}
              >
                {format(d, "d")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
