"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react@0.487.0";
import { DayPicker } from "react-day-picker@8.10.1";

import { cn } from "./utils";
import { buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const calendarId = React.useId().replace(/:/g, '-');
  
  return (
    <div id={`calendar-wrapper-${calendarId}`} style={{ minWidth: '600px', width: '100%' }}>
      <style>{`
        #calendar-wrapper-${calendarId} {
          min-width: 600px !important;
          width: 100% !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp {
          min-width: 600px !important;
          width: 100% !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-table {
          width: 100% !important;
          min-width: 600px !important;
          border-collapse: separate !important;
          border-spacing: 0 !important;
          display: table !important;
          table-layout: fixed !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-head_row {
          display: table-row !important;
          width: 100% !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-head_cell,
        #calendar-wrapper-${calendarId} .rdp-head_row th {
          display: table-cell !important;
          width: calc(100% / 7) !important;
          min-width: 80px !important;
          max-width: calc(100% / 7) !important;
          text-align: center !important;
          font-size: 0.875rem !important;
          font-weight: 500 !important;
          color: #6b7280 !important;
          padding: 0.75rem 0.75rem !important;
          box-sizing: border-box !important;
          vertical-align: middle !important;
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: normal !important;
          word-break: keep-all !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-row {
          display: table-row !important;
          width: 100% !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-cell,
        #calendar-wrapper-${calendarId} .rdp-row td {
          display: table-cell !important;
          width: calc(100% / 7) !important;
          min-width: 80px !important;
          max-width: calc(100% / 7) !important;
          position: relative !important;
          text-align: center !important;
          padding: 0.5rem !important;
          box-sizing: border-box !important;
          vertical-align: middle !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-day {
          width: 100% !important;
          min-width: 50px !important;
          height: 50px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 0.375rem !important;
          font-size: 0.875rem !important;
          font-weight: 400 !important;
          cursor: pointer !important;
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          margin: 0 auto !important;
          transition: background-color 0.2s !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-day:hover:not(.rdp-day_disabled):not(.rdp-day_outside) {
          background-color: #f3f4f6 !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-day_selected {
          background-color: #3b82f6 !important;
          color: white !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-day_today {
          background-color: #eff6ff !important;
          color: #1e40af !important;
          font-weight: 500 !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-day_outside {
          color: #9ca3af !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-day_disabled {
          color: #d1d5db !important;
          cursor: not-allowed !important;
          opacity: 0.5 !important;
        }
        
        /* Force table structure */
        #calendar-wrapper-${calendarId} .rdp-table thead,
        #calendar-wrapper-${calendarId} .rdp-table tbody {
          display: table-row-group !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-table tr {
          display: table-row !important;
        }
        
        #calendar-wrapper-${calendarId} .rdp-table th,
        #calendar-wrapper-${calendarId} .rdp-table td {
          display: table-cell !important;
          width: calc(100% / 7) !important;
          min-width: 60px !important;
          max-width: calc(100% / 7) !important;
        }
        
        /* Additional styles for header cell content */
        #calendar-wrapper-${calendarId} .rdp-head_cell > *,
        #calendar-wrapper-${calendarId} .rdp-head_cell abbr {
          display: inline-block !important;
          max-width: 100% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        
        /* Very specific targeting to override any conflicting styles */
        #calendar-wrapper-${calendarId} table.rdp-table {
          width: 100% !important;
          min-width: 600px !important;
          display: table !important;
          table-layout: fixed !important;
        }
        
        #calendar-wrapper-${calendarId} table.rdp-table thead {
          display: table-header-group !important;
        }
        
        #calendar-wrapper-${calendarId} table.rdp-table tbody {
          display: table-row-group !important;
        }
        
        #calendar-wrapper-${calendarId} table.rdp-table thead tr,
        #calendar-wrapper-${calendarId} table.rdp-table tbody tr {
          display: table-row !important;
        }
        
        #calendar-wrapper-${calendarId} table.rdp-table thead tr th,
        #calendar-wrapper-${calendarId} table.rdp-table tbody tr td {
          display: table-cell !important;
          width: calc(100% / 7) !important;
          min-width: 80px !important;
          max-width: calc(100% / 7) !important;
          box-sizing: border-box !important;
        }
        
        /* Prevent text concatenation in header cells */
        #calendar-wrapper-${calendarId} .rdp-head_cell abbr,
        #calendar-wrapper-${calendarId} .rdp-head_cell span,
        #calendar-wrapper-${calendarId} .rdp-head_row th abbr,
        #calendar-wrapper-${calendarId} .rdp-head_row th span {
          display: inline-block !important;
          white-space: nowrap !important;
          overflow: visible !important;
          text-overflow: clip !important;
          width: auto !important;
          max-width: none !important;
        }
      `}</style>
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("p-3", className)}
        classNames={{
          months: "",
          month: "",
          caption: "",
          caption_label: "",
          nav: "",
          nav_button: "",
          nav_button_previous: "",
          nav_button_next: "",
          table: "",
          head_row: "",
          head_cell: "",
          row: "",
          cell: "",
          day: "",
          day_range_start: "",
          day_range_end: "",
          day_selected: "",
          day_today: "",
          day_outside: "",
          day_disabled: "",
          day_range_middle: "",
          day_hidden: "",
          ...classNames,
        }}
        components={{
          IconLeft: ({ className, ...props }) => (
            <ChevronLeft className={cn("size-4", className)} {...props} />
          ),
          IconRight: ({ className, ...props }) => (
            <ChevronRight className={cn("size-4", className)} {...props} />
          ),
        }}
        {...props}
      />
    </div>
  );
}

export { Calendar };
