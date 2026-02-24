import * as React from "react";

// Treat tablets as "mobile" for layout purposes (<= 1000px).
const MOBILE_BREAKPOINT = 1000;
// Phone breakpoint for extra compact layouts (<= 640px).
const PHONE_BREAKPOINT = 640;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

export function useIsPhone() {
  const [isPhone, setIsPhone] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${PHONE_BREAKPOINT}px)`);
    const onChange = () => {
      setIsPhone(window.innerWidth <= PHONE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsPhone(window.innerWidth <= PHONE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isPhone;
}
