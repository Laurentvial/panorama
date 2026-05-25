import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { SimpleCalendar } from "./simple-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

interface DateInputProps extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string; // Format: YYYY-MM-DD (for internal storage)
  onChange: (value: string) => void; // Returns YYYY-MM-DD format
  label?: string;
}

function DateInput({ value, onChange, className, label, ...props }: DateInputProps) {
  // Convert YYYY-MM-DD to DD/MM/YYYY for display
  const formatForDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const toIsoDate = (year: string, month: string, day: string): string | null => {
    if (!year || !month || !day || year.length !== 4) return null;
    const normalizedYear = year;
    const normalizedMonth = month.padStart(2, '0');
    const normalizedDay = day.padStart(2, '0');
    const date = new Date(`${normalizedYear}-${normalizedMonth}-${normalizedDay}T00:00:00`);
    if (isNaN(date.getTime())) return null;
    if (date.getFullYear() !== Number(normalizedYear)) return null;
    if (date.getMonth() + 1 !== Number(normalizedMonth)) return null;
    if (date.getDate() !== Number(normalizedDay)) return null;
    return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`;
  };

  // Convert common date formats to YYYY-MM-DD
  const parseFromDisplay = (displayValue: string): string | null => {
    const trimmed = displayValue.trim();
    if (!trimmed) return null;

    // Supports yyyy-mm-dd, yyyy/mm/dd, dd-mm-yyyy and dd/mm/yyyy
    const separated = trimmed.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/);
    if (separated) {
      const [, first, second, third] = separated;
      if (first.length === 4) {
        return toIsoDate(first, second, third);
      }
      if (third.length === 4) {
        return toIsoDate(third, second, first);
      }
    }

    // Supports raw digits ddmmyyyy or yyyymmdd
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 8) {
      const yearFirst = toIsoDate(digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8));
      if (yearFirst) return yearFirst;
      return toIsoDate(digits.slice(4, 8), digits.slice(2, 4), digits.slice(0, 2));
    }

    return null;
  };

  const [displayValue, setDisplayValue] = React.useState(formatForDisplay(value));
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused) {
      setDisplayValue((previousDisplayValue) => {
        // Do not clear visible input when external value is still empty.
        if (!value) return previousDisplayValue;
        return formatForDisplay(value);
      });
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;

    // Keep only numeric and common date separators
    inputValue = inputValue.replace(/[^\d/-]/g, '');

    const hasSeparator = inputValue.includes('/') || inputValue.includes('-');
    // Auto-format only pure digit input as dd/mm/yyyy
    if (!hasSeparator && inputValue.length > 0) {
      const digits = inputValue.replace(/\D/g, '');
      let formatted = '';

      for (let i = 0; i < digits.length && i < 8; i++) {
        if (i === 2 || i === 4) {
          formatted += '/';
        }
        formatted += digits[i];
      }

      inputValue = formatted;
    }
    
    setDisplayValue(inputValue);
    
    // Try to parse when enough characters are present
    if (inputValue.length >= 8) {
      const parsed = parseFromDisplay(inputValue);
      if (parsed && parsed !== value) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFromDisplay(displayValue);
    if (parsed) {
      onChange(parsed);
      setDisplayValue(formatForDisplay(parsed));
    } else if (value) {
      setDisplayValue(formatForDisplay(value));
    } else {
      // Keep user input visible if parsing failed to avoid "disappearing" dates.
      setDisplayValue(displayValue.trim());
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder="jj/mm/aaaa"
      maxLength={10}
      className={cn(className)}
      {...props}
    />
  );
}

interface DateInputWithCalendarProps extends Omit<DateInputProps, "className"> {
  className?: string;
}

function DateInputWithCalendar({ value, onChange, className, ...props }: DateInputWithCalendarProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const d = new Date(value + "T00:00:00");
    return isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      onChange(`${year}-${month}-${day}`);
      setIsOpen(false);
    }
  };

  return (
    <div className={cn("flex", className)}>
      <DateInput
        value={value}
        onChange={onChange}
        placeholder="jj/mm/aaaa"
        className="flex-1 rounded-r-none border-r-0"
        {...props}
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 rounded-none border-l-0 px-3"
            aria-label="Ouvrir le calendrier"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border shadow-lg" align="end">
          <SimpleCalendar
            selected={selectedDate}
            onSelect={handleSelect}
            className="min-w-[260px]"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { DateInput, DateInputWithCalendar };

