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

  // Convert DD/MM/YYYY to YYYY-MM-DD
  const parseFromDisplay = (displayValue: string): string => {
    if (!displayValue) return '';
    // Remove any non-digit characters except /
    const cleaned = displayValue.replace(/[^\d/]/g, '');
    const parts = cleaned.split('/');
    
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      
      // Validate and convert to YYYY-MM-DD
      if (day && month && year && year.length === 4) {
        const date = new Date(`${year}-${month}-${day}T00:00:00`);
        if (!isNaN(date.getTime())) {
          return `${year}-${month}-${day}`;
        }
      }
    }
    return value; // Return current value if parsing fails
  };

  const [displayValue, setDisplayValue] = React.useState(formatForDisplay(value));
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatForDisplay(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    
    // Remove any non-digit characters except /
    inputValue = inputValue.replace(/[^\d/]/g, '');
    
    // Auto-format as user types: dd/mm/yyyy
    if (inputValue.length > 0) {
      const digits = inputValue.replace(/\//g, '');
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
    
    // Try to parse if we have a complete date (dd/mm/yyyy = 10 chars)
    if (inputValue.length === 10) {
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
      setDisplayValue('');
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

