import React, { useEffect, useRef, useState } from 'react';

// TradingView Symbol Overview Widget - Shows chart and data table
// Uses TradingView embed widget via iframe for better reliability
export function TradingViewSymbolOverview({
  symbols,
  width = '100%',
  height = '600',
  theme = 'light',
  locale = 'fr',
  chartType = 'area',
  showVolume = true,
}: {
  symbols: Array<{ symbol: string; displayName?: string }>;
  width?: string | number;
  height?: string | number;
  theme?: 'light' | 'dark';
  locale?: string;
  chartType?: 'area' | 'candles' | 'bars';
  showVolume?: boolean;
}) {
  const containerIdRef = useRef(`tradingview_overview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!symbols || symbols.length === 0) {
      setError('No symbols provided');
      setIsLoading(false);
      return;
    }

    // Get first symbol (TradingView widgets support multiple symbols)
    const firstSymbol = symbols[0]?.symbol || '';
    
    // TradingView embed widgets REQUIRE exchange prefix format (e.g., "NASDAQ:INTC")
    // Keep symbols exactly as provided - don't remove exchange prefixes
    const formattedSymbols = symbols.map(s => {
      // If symbol already has exchange prefix, use it as-is
      if (s.symbol.includes(':')) {
        console.log(`[TradingViewWidget] Using symbol with exchange prefix: ${s.symbol}`);
        return [s.symbol, s.displayName || s.symbol];
      }
      // If no exchange prefix, use as-is (widgets may auto-resolve)
      console.log(`[TradingViewWidget] Using symbol without exchange prefix: ${s.symbol}`);
      return [s.symbol, s.displayName || s.symbol];
    });

    console.log('[TradingViewWidget] Symbol Overview - Original symbols:', symbols);
    console.log('[TradingViewWidget] Symbol Overview - Formatted symbols:', formattedSymbols);

    // Clear previous error
    setError(null);
    setIsLoading(true);

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const container = document.getElementById(containerIdRef.current);
      if (!container) {
        console.error('[TradingViewWidget] Container not found:', containerIdRef.current);
        setError('Container not found');
        setIsLoading(false);
        return;
      }

      // Clear container
      container.innerHTML = '';

      // Calculate widget height
      const widgetHeight = typeof height === 'number' ? height : parseInt(String(height).replace(/[^0-9]/g, '')) || 600;

      // Create widget configuration
      const widgetConfig = {
        symbols: formattedSymbols,
        chartOnly: false,
        width: '100%',
        height: widgetHeight,
        locale: locale,
        colorTheme: theme,
        autosize: true,
        showVolume: showVolume,
        hideDateRanges: false,
        scalePosition: 'right',
        scaleMode: 'Normal',
        fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
        fontSize: '10',
        noTimeScale: false,
        valuesTracking: '1',
        changeMode: 'price-and-percent',
        chartType: chartType,
      };

      console.log('[TradingViewWidget] Creating Symbol Overview widget with config:', widgetConfig);

      // Create script element with widget configuration
      // TradingView widgets require the script to be added with innerHTML containing the config
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
      script.async = true;
      
      // Set the widget configuration as innerHTML (TradingView reads this)
      script.innerHTML = JSON.stringify(widgetConfig);
      
      console.log('[TradingViewWidget] Script element created:', {
        src: script.src,
        innerHTML: script.innerHTML.substring(0, 200) + '...',
        containerId: containerIdRef.current
      });
      
      script.onload = () => {
        console.log('[TradingViewWidget] Symbol Overview script loaded successfully');
        console.log('[TradingViewWidget] Container after script load:', container.innerHTML.substring(0, 200));
        // Give widget time to render
        setTimeout(() => {
          setIsLoading(false);
          // Check if widget actually rendered
          const widgetContent = container.querySelector('.tradingview-widget-container__widget') || 
                               container.querySelector('iframe') ||
                               container.querySelector('div[class*="tradingview"]');
          if (!widgetContent) {
            console.warn('[TradingViewWidget] Widget script loaded but no widget content found in container');
            setError('Widget loaded but content not rendered. Check symbol format.');
          } else {
            console.log('[TradingViewWidget] Widget content found:', widgetContent);
          }
        }, 2000);
      };
      
      script.onerror = (error) => {
        console.error('[TradingViewWidget] Error loading Symbol Overview script:', error);
        setError('Failed to load TradingView widget script');
        setIsLoading(false);
      };

      container.appendChild(script);
      console.log('[TradingViewWidget] Script appended to container');

      // Set loading to false after a reasonable timeout
      setTimeout(() => {
        if (isLoading) {
          console.warn('[TradingViewWidget] Timeout reached, widget may not have loaded');
          setIsLoading(false);
        }
      }, 8000);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      const container = document.getElementById(containerIdRef.current);
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [symbols, width, height, theme, locale, chartType, showVolume]);

  return (
    <div
      className="tradingview-widget-container"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: '400px',
        position: 'relative',
      }}
    >
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#6b7280',
          fontSize: '14px',
          zIndex: 10,
        }}>
          Chargement du graphique...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ef4444',
          fontSize: '14px',
          textAlign: 'center',
          padding: '20px',
          zIndex: 10,
        }}>
          <div>Erreur: {error}</div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: '#6b7280' }}>
            Symbole utilisé: {symbols[0]?.symbol}
          </div>
        </div>
      )}
      <div
        id={containerIdRef.current}
        style={{
          width: '100%',
          height: '100%',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.3s',
        }}
      />
    </div>
  );
}

// TradingView Advanced Chart Widget
export function TradingViewAdvancedChart({
  symbol,
  width = '100%',
  height = '500',
  interval = 'D',
  theme = 'light',
  locale = 'fr',
  autosize = true,
  hideTopToolbar = false,
}: {
  symbol: string;
  width?: string | number;
  height?: string | number;
  interval?: string;
  theme?: 'light' | 'dark';
  locale?: string;
  autosize?: boolean;
  hideTopToolbar?: boolean;
}) {
  const containerIdRef = useRef(`tradingview_chart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!symbol || !symbol.trim()) {
      setError('No symbol provided');
      setIsLoading(false);
      return;
    }

    // TradingView embed widgets REQUIRE exchange prefix format (e.g., "NASDAQ:INTC")
    // Keep the symbol exactly as provided - don't remove exchange prefixes
    const symbolToUse = symbol.trim();
    
    console.log('[TradingViewWidget] Advanced Chart - Using symbol:', symbolToUse);
    console.log('[TradingViewWidget] Symbol has exchange prefix:', symbolToUse.includes(':'));

    // Clear previous error
    setError(null);
    setIsLoading(true);

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const container = document.getElementById(containerIdRef.current);
      if (!container) {
        console.error('[TradingViewWidget] Container not found:', containerIdRef.current);
        setError('Container not found');
        setIsLoading(false);
        return;
      }

      // Clear container
      container.innerHTML = '';

      const widgetHeight = typeof height === 'number' ? height : parseInt(String(height).replace(/[^0-9]/g, '')) || 500;

      // Create widget configuration
      const widgetConfig = {
        autosize: autosize,
        symbol: symbolToUse,
        interval: interval,
        timezone: 'Europe/Paris',
        theme: theme,
        style: '1',
        locale: locale,
        backgroundColor: theme === 'light' ? 'rgba(255, 255, 255, 1)' : 'rgba(19, 23, 34, 1)',
        gridColor: theme === 'light' ? 'rgba(42, 46, 57, 0.06)' : 'rgba(42, 46, 57, 0.06)',
        width: '100%',
        height: widgetHeight,
        hide_top_toolbar: hideTopToolbar,
        hide_legend: false,
        save_image: false,
        allow_symbol_change: true,
        calendar: false,
        support_host: 'https://www.tradingview.com',
      };

      console.log('[TradingViewWidget] Creating Advanced Chart widget with config:', widgetConfig);

      // Create script element with widget configuration
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      script.innerHTML = JSON.stringify(widgetConfig);
      
      console.log('[TradingViewWidget] Advanced Chart script element created:', {
        src: script.src,
        innerHTML: script.innerHTML.substring(0, 200) + '...',
        containerId: containerIdRef.current,
        symbol: symbolToUse
      });
      
      script.onload = () => {
        console.log('[TradingViewWidget] Advanced Chart script loaded successfully');
        console.log('[TradingViewWidget] Container after script load:', container.innerHTML.substring(0, 200));
        // Give widget time to render
        setTimeout(() => {
          setIsLoading(false);
          // Check if widget actually rendered
          const widgetContent = container.querySelector('.tradingview-widget-container__widget') || 
                               container.querySelector('iframe') ||
                               container.querySelector('div[class*="tradingview"]');
          if (!widgetContent) {
            console.warn('[TradingViewWidget] Widget script loaded but no widget content found in container');
            setError('Widget loaded but content not rendered. Check symbol format.');
          } else {
            console.log('[TradingViewWidget] Widget content found:', widgetContent);
          }
        }, 2000);
      };
      
      script.onerror = (error) => {
        console.error('[TradingViewWidget] Error loading Advanced Chart script:', error);
        setError('Failed to load TradingView widget script');
        setIsLoading(false);
      };

      container.appendChild(script);
      console.log('[TradingViewWidget] Advanced Chart script appended to container');

      // Set loading to false after a reasonable timeout
      setTimeout(() => {
        if (isLoading) {
          console.warn('[TradingViewWidget] Timeout reached, widget may not have loaded');
          setIsLoading(false);
        }
      }, 8000);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      const container = document.getElementById(containerIdRef.current);
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [symbol, interval, theme, locale, autosize, hideTopToolbar, height]);

  return (
    <div
      className="tradingview-widget-container"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: '400px',
        position: 'relative',
      }}
    >
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#6b7280',
          fontSize: '14px',
          zIndex: 10,
        }}>
          Chargement du graphique...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ef4444',
          fontSize: '14px',
          textAlign: 'center',
          padding: '20px',
          zIndex: 10,
        }}>
          <div>Erreur: {error}</div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: '#6b7280' }}>
            Symbole utilisé: {symbol}
          </div>
        </div>
      )}
      <div
        id={containerIdRef.current}
        style={{
          width: '100%',
          height: '100%',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.3s',
        }}
      />
    </div>
  );
}

// TradingView Mini Chart Widget (kept for backward compatibility)
export function TradingViewMiniChart({
  symbol,
  width = 350,
  height = 220,
  dateRange = '1D',
  theme = 'light',
  locale = 'fr',
}: {
  symbol: string;
  width?: number;
  height?: number;
  dateRange?: '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
  theme?: 'light' | 'dark';
  locale?: string;
}) {
  const containerIdRef = useRef(`tradingview_mini_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const initWidget = () => {
      if (!window.TradingView) {
        const checkInterval = setInterval(() => {
          if (window.TradingView) {
            clearInterval(checkInterval);
            createWidget();
          }
        }, 100);
        return () => clearInterval(checkInterval);
      } else {
        createWidget();
      }
    };

    const createWidget = () => {
      const container = document.getElementById(containerIdRef.current);
      if (!container || !window.TradingView) {
        return;
      }

      // Clean up previous widget
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (e) {
          console.error('Error removing widget:', e);
        }
        widgetRef.current = null;
      }

      try {
        widgetRef.current = new window.TradingView.widget({
          symbol: symbol,
          width: width,
          height: height,
          locale: locale,
          dateRange: dateRange,
          colorTheme: theme,
          isTransparent: false,
          autosize: false,
          largeChartUrl: '',
          container_id: containerIdRef.current,
        });
      } catch (error) {
        console.error('Error creating TradingView mini chart:', error);
      }
    };

    initWidget();

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (e) {
          console.error('Error cleaning up widget:', e);
        }
        widgetRef.current = null;
      }
    };
  }, [symbol, width, height, dateRange, theme, locale]);

  return (
    <div
      id={containerIdRef.current}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
}
