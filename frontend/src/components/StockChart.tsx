import React, { useEffect, useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { apiCall } from '../utils/api';
import { Loader2 } from 'lucide-react';

interface ChartDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockChartProps {
  assetId: string;
  assetName?: string;
  assetType?: string;
  width?: string | number;
  height?: string | number;
  chartType?: 'line' | 'area' | 'candlestick';
  showVolume?: boolean;
  timeframe?: '1D' | '1W' | '1M' | '6M' | '1Y' | '3Y' | 'MAX';
  onPerformanceChange?: (performance: { percent: number; absolute: number; start: number; end: number } | null) => void;
}

export function StockChart({
  assetId,
  assetName,
  assetType,
  width = '100%',
  height = 500,
  chartType = 'area',
  showVolume = false,
  timeframe = '1W',
  onPerformanceChange,
}: StockChartProps) {
  const isCrypto = (assetType || '').toLowerCase() === 'crypto' || (assetType || '').toLowerCase() === 'cryptocurrency';
  const [allChartData, setAllChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metaData, setMetaData] = useState<any>(null);

  useEffect(() => {
    const fetchChartData = async () => {
      if (!assetId) {
        setError('Asset ID is required');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Request full data to support 1Y, 3Y, MAX timeframes (compact only returns ~100 days)
        const response = await apiCall(`/api/assets/${assetId}/chart-data/?outputsize=full`, {
          method: 'GET',
        });

        if (!response) {
          setError('Failed to fetch chart data');
          setLoading(false);
          return;
        }

        if (response.error) {
          setError(response.error || 'Failed to fetch chart data');
          setLoading(false);
          return;
        }

        if (response.data && Array.isArray(response.data)) {
          setAllChartData(response.data);
          setMetaData(response.meta_data || null);
        } else {
          setError('Invalid chart data format');
        }
      } catch (err: any) {
        const msg = err.message || 'Failed to fetch chart data';
        // Don't log expected "data unavailable" as error (API rate limit, symbol not found)
        if (msg !== 'Données indisponibles pour le moment' && !msg.includes('not found') && !msg.includes('rate limit')) {
          console.error('Error fetching chart data:', err);
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [assetId]);

  // Format date as YYYY-MM-DD for reliable date-only comparison (avoids timezone issues)
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Filter data based on timeframe
  const getFilteredData = (): ChartDataPoint[] => {
    if (!allChartData || allChartData.length === 0) {
      return [];
    }

    // Ensure consistent ordering (oldest -> newest) for slicing.
    const sortedAll = allChartData
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const now = new Date();
    let cutoffStr: string;

    switch (timeframe) {
      case '1D':
        // Backend provides daily candles (1 point/day). A strict "last 24h" filter
        // often returns 0 points. For 1D view, show the last 2 daily points
        // (yesterday -> today) so users always see a meaningful 1-day move.
        return sortedAll.length <= 2 ? sortedAll : sortedAll.slice(-2);
      case '1W': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        cutoffStr = toDateStr(d);
        break;
      }
      case '1M': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        cutoffStr = toDateStr(d);
        break;
      }
      case '6M': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 6);
        cutoffStr = toDateStr(d);
        break;
      }
      case '1Y': {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 1);
        cutoffStr = toDateStr(d);
        break;
      }
      case '3Y': {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 3);
        cutoffStr = toDateStr(d);
        break;
      }
      case 'MAX':
      default:
        return sortedAll;
    }

    return sortedAll.filter((point) => (point.date || '') >= cutoffStr);
  };

  // Use useMemo to recalculate filtered data when timeframe or allChartData changes
  const chartData = useMemo(() => getFilteredData(), [allChartData, timeframe]);

  // Y-axis domain: 10% below min, 5% above max for the selected period
  const yDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return undefined;
    const values = chartData.flatMap((p) => [
      p.low,
      p.high,
      p.open,
      p.close,
    ].filter((v) => typeof v === 'number' && Number.isFinite(v)));
    if (values.length === 0) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || min * 0.01 || 1;
    return [min - 0.1 * range, max + 0.05 * range] as [number, number];
  }, [chartData]);

  // Compute timeframe performance from the displayed series.
  useEffect(() => {
    if (!onPerformanceChange) return;

    const sorted = (chartData || [])
      .filter((p) => typeof p?.close === 'number' && Number.isFinite(p.close))
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sorted.length < 2) {
      onPerformanceChange(null);
      return;
    }

    const start = sorted[0].close;
    const end = sorted[sorted.length - 1].close;

    if (!Number.isFinite(start) || start === 0 || !Number.isFinite(end)) {
      onPerformanceChange(null);
      return;
    }

    const absolute = end - start;
    const percent = (absolute / start) * 100;
    onPerformanceChange({ percent, absolute, start, end });
  }, [chartData, onPerformanceChange]);

  // Format date for display (adapt format based on timeframe)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    
    // For 3Y and MAX: show year only (too many months otherwise)
    if (timeframe === '3Y' || timeframe === 'MAX') {
      return date.getFullYear().toString();
    }
    
    // For 1D we are showing daily points, so show day/month (not time).
    if (timeframe === '1D') {
      return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    }
    
    // For short timeframes (1W), show day and month
    if (timeframe === '1W') {
      return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    }
    
    // For medium timeframes (1M, 6M), show month and day
    if (timeframe === '1M' || timeframe === '6M') {
      return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    }
    
    // For 1Y we need 12 ticks: show month
    return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  };

  // For 3Y and MAX: show one tick per year (avoid clutter)
  const xAxisTicks = useMemo(() => {
    if ((timeframe !== '3Y' && timeframe !== 'MAX') || !chartData?.length) return undefined;
    const years = new Set<string>();
    chartData.forEach((p) => {
      if (p.date && p.date.length >= 4) years.add(p.date.slice(0, 4));
    });
    return Array.from(years)
      .sort()
      .map((y) => chartData.find((p) => p.date?.startsWith(y))?.date)
      .filter(Boolean) as string[];
  }, [chartData, timeframe]);

  // Format price for tooltip
  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format volume for tooltip
  const formatVolume = (value: number) => {
    if (value >= 1e9) {
      return `${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
      return `${(value / 1e6).toFixed(2)}M`;
    } else if (value >= 1e3) {
      return `${(value / 1e3).toFixed(2)}K`;
    }
    return value.toString();
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}>
          <p style={{ fontWeight: '600', marginBottom: '8px' }}>{data.date}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#6b7280' }}>{isCrypto ? 'Début période:' : 'Ouverture:'}</span>
              <span style={{ fontWeight: '600' }}>{formatPrice(data.open)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#6b7280' }}>Haut:</span>
              <span style={{ fontWeight: '600', color: '#10b981' }}>{formatPrice(data.high)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#6b7280' }}>Bas:</span>
              <span style={{ fontWeight: '600', color: '#ef4444' }}>{formatPrice(data.low)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#6b7280' }}>{isCrypto ? 'Fin période:' : 'Fermeture:'}</span>
              <span style={{ fontWeight: '600' }}>{formatPrice(data.close)}</span>
            </div>
            {showVolume && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Volume:</span>
                <span style={{ fontWeight: '600' }}>{formatVolume(data.volume)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Chargement des données du graphique...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const displayMessage = (error.includes('not found') || error.includes('rate limit') || error === 'Données indisponibles pour le moment')
      ? 'Données indisponibles pour le moment'
      : error;
    return (
      <div style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fef2f2',
        borderRadius: '8px',
        border: '1px solid #fecaca',
        padding: '20px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#991b1b', fontSize: '14px' }}>{displayMessage}</p>
        </div>
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          Aucune donnée disponible pour {assetName || 'cet actif'}
        </p>
      </div>
    );
  }

  const chartHeight = typeof height === 'number' ? height : parseInt(String(height).replace(/[^0-9]/g, '')) || 500;

  return (
    <div style={{
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
    }}>
      {chartType === 'line' && (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <XAxis
              dataKey="date"
              ticks={xAxisTicks}
              tickFormatter={formatDate}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              tickFormatter={(value) => formatPrice(value)}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="Prix de clôture"
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {chartType === 'area' && (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              ticks={xAxisTicks}
              tickFormatter={formatDate}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(value) => formatPrice(value)}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorClose)"
              name="Prix de clôture"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {chartType === 'candlestick' && (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <XAxis
              dataKey="date"
              ticks={xAxisTicks}
              tickFormatter={formatDate}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(value) => formatPrice(value)}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="high" fill="#10b981" name="Haut" />
            <Bar dataKey="low" fill="#ef4444" name="Bas" />
            <Bar dataKey="close" fill="#3b82f6" name={isCrypto ? 'Fin période' : 'Fermeture'} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {showVolume && chartData.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <XAxis
                dataKey="date"
                ticks={xAxisTicks}
                tickFormatter={formatDate}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                tickFormatter={formatVolume}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div style={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}>
                        <p style={{ fontWeight: '600', marginBottom: '4px' }}>{data.date}</p>
                        <p style={{ color: '#6b7280' }}>
                          Volume: <span style={{ fontWeight: '600' }}>{formatVolume(data.volume)}</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="volume" fill="#94a3b8" name="Volume" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
