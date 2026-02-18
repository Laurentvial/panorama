"use client";

import * as React from "react";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { CalendarIcon, Clock } from "lucide-react";
import { format, parse } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "./utils";

interface DateTimePickerProps {
  value?: string; // Format: YYYY-MM-DDTHH:mm
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Sélectionner une date et heure",
  className,
  required = false,
}: DateTimePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    value ? parse(value, "yyyy-MM-dd'T'HH:mm", new Date()) : undefined
  );
  
  // Parse time value into hours and minutes
  const initialTime = value ? value.split('T')[1] || '00:00' : '00:00';
  const [hours, setHours] = React.useState<string>(initialTime.split(':')[0]);
  const [minutes, setMinutes] = React.useState<string>(initialTime.split(':')[1]);
  const [isOpen, setIsOpen] = React.useState(false);

  // Update internal state when value prop changes
  React.useEffect(() => {
    if (value) {
      const parsedDate = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
      if (!isNaN(parsedDate.getTime())) {
        setDate(parsedDate);
        const timePart = value.split('T')[1] || '00:00';
        const [h, m] = timePart.split(':');
        setHours(h);
        setMinutes(m);
      }
    } else {
      setDate(undefined);
      setHours('00');
      setMinutes('00');
    }
  }, [value]);

  const updateDateTime = (newDate: Date | undefined, newHours: string, newMinutes: string) => {
    if (newDate) {
      const year = newDate.getFullYear();
      const month = String(newDate.getMonth() + 1).padStart(2, '0');
      const day = String(newDate.getDate()).padStart(2, '0');
      const dateTimeString = `${year}-${month}-${day}T${newHours}:${newMinutes}`;
      onChange?.(dateTimeString);
    }
  };

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      setDate(selectedDate);
      updateDateTime(selectedDate, hours, minutes);
      setIsOpen(false);
    }
  };

  const handleHourChange = (newHours: string) => {
    setHours(newHours);
    if (date) {
      updateDateTime(date, newHours, minutes);
    }
  };

  const handleMinuteChange = (newMinutes: string) => {
    setMinutes(newMinutes);
    if (date) {
      updateDateTime(date, hours, newMinutes);
    }
  };

  const displayValue = React.useMemo(() => {
    if (!date) return '';
    
    // Format: JJ/MM/AAAA HH:mm (format 24h)
    const dateStr = format(date, 'dd/MM/yyyy', { locale: fr });
    return `${dateStr} ${hours}:${minutes}`;
  }, [date, hours, minutes]);

  return (
    <div className={cn("w-full", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen} modal={true}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-start px-3 py-2 text-sm",
              "bg-white border border-slate-300 rounded-md",
              "hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500",
              "transition-colors cursor-pointer",
              !date && "text-slate-400"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">
              {displayValue || placeholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-0 bg-white border border-slate-200 shadow-lg" 
          align="start"
          style={{ zIndex: 99999 }}
        >
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-600 font-medium">Heure:</span>
              <select
                value={hours}
                onChange={(e) => handleHourChange(e.target.value)}
                className="h-8 w-16 text-sm border border-slate-300 rounded px-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const hour = String(i).padStart(2, '0');
                  return (
                    <option key={i} value={hour}>
                      {hour}h
                    </option>
                  );
                })}
              </select>
              <span className="text-slate-600 font-medium">:</span>
              <select
                value={minutes}
                onChange={(e) => handleMinuteChange(e.target.value)}
                className="h-8 w-16 text-sm border border-slate-300 rounded px-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 60 }, (_, i) => {
                  const min = String(i).padStart(2, '0');
                  return (
                    <option key={i} value={min}>
                      {min}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div className="p-3">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              locale={fr}
              initialFocus
              formatters={{
                formatWeekdayName: (date) => {
                  // Retourner seulement la première lettre du jour
                  const dayName = format(date, 'EEEEEE', { locale: fr });
                  return dayName.charAt(0).toUpperCase();
                }
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      {required && !value && (
        <input
          type="text"
          required
          value=""
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
