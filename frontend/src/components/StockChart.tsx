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
  width = '100%',
  height = 500,
  chartType = 'area',
  showVolume = false,
  timeframe = '1W',
  onPerformanceChange,
}: StockChartProps) {
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
        const response = await apiCall(`/api/assets/${assetId}/chart-data/`, {
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
        console.error('Error fetching chart data:', err);
        setError(err.message || 'Failed to fetch chart data');
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [assetId]);

  // Filter data based on timeframe
  const getFilteredData = (): ChartDataPoint[] => {
    if (!allChartData || allChartData.length === 0) {
      return [];
    }

    // Ensure consistent ordering (oldest -> newest) for slicing.
    const sortedAll = allChartData
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case '1D':
        // Backend provides daily candles (1 point/day). A strict "last 24h" filter
        // often returns 0 points. For 1D view, show the last 2 daily points
        // (yesterday -> today) so users always see a meaningful 1-day move.
        return sortedAll.length <= 2 ? sortedAll : sortedAll.slice(-2);
      case '1W':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1M':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '6M':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '1Y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case '3Y':
        startDate = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
        break;
      case 'MAX':
      default:
        return sortedAll;
    }

    return sortedAll.filter((point) => {
      const pointDate = new Date(point.date);
      return pointDate >= startDate;
    });
  };

  // Use useMemo to recalculate filtered data when timeframe or allChartData changes
  const chartData = useMemo(() => getFilteredData(), [allChartData, timeframe]);

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
    
    // For long timeframes (1Y, 3Y, MAX), show month and year or just month
    return date.toLocaleDateString('fr-FR', { month: 'short', year: timeframe === 'MAX' ? 'numeric' : undefined });
  };

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
              <span style={{ color: '#6b7280' }}>Ouverture:</span>
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
              <span style={{ color: '#6b7280' }}>Fermeture:</span>
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
          <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
            Erreur de chargement
          </p>
          <p style={{ color: '#991b1b', fontSize: '12px' }}>{error}</p>
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
            <Bar dataKey="high" fill="#10b981" name="Haut" />
            <Bar dataKey="low" fill="#ef4444" name="Bas" />
            <Bar dataKey="close" fill="#3b82f6" name="Fermeture" />
          </BarChart>
        </ResponsiveContainer>
      )}

      {showVolume && chartData.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <XAxis
                dataKey="date"
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
