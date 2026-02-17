import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { X, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/Modal.css';

interface Index {
  id: string;
  name: string;
  region: string;
  source: string;
}

interface ImportError {
  symbol: string;
  error: string;
}

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: ImportError[];
  index: string;
}

interface BulkImportFromIndexModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'select' | 'importing' | 'complete';

export function BulkImportFromIndexModal({
  isOpen,
  onClose,
  onSuccess
}: BulkImportFromIndexModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [selectedIndex, setSelectedIndex] = useState<string>('');
  const [selectedExchange, setSelectedExchange] = useState<string>('');
  const [fetchFullDetails, setFetchFullDetails] = useState<boolean>(true);
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);
  const [indices, setIndices] = useState<Index[]>([]);
  const [loadingIndices, setLoadingIndices] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch supported indices when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSupportedIndices();
    }
  }, [isOpen]);

  const fetchSupportedIndices = async () => {
    setLoadingIndices(true);
    setError(null);
    try {
      const response = await apiCall('/api/assets/supported-indices/');
      if (response.indices) {
        setIndices(response.indices);
      }
    } catch (err: any) {
      console.error('Error fetching supported indices:', err);
      setError(err.message || 'Failed to fetch supported indices');
      toast.error('Failed to load supported indices');
    } finally {
      setLoadingIndices(false);
    }
  };

  const handleImport = async () => {
    if (!selectedIndex) {
      toast.error('Please select an index');
      return;
    }

    setImporting(true);
    setError(null);
    setStep('importing');

    try {
      const response = await apiCall('/api/assets/bulk-import-from-index/', {
        method: 'POST',
        body: JSON.stringify({
          index: selectedIndex,
          exchange: selectedExchange || undefined,
          fetchFullDetails,
          skipDuplicates
        })
      });

      setImportResult(response);
      setStep('complete');
      
      if (response.imported > 0) {
        toast.success(`Successfully imported ${response.imported} assets`);
        onSuccess();
      } else if (response.skipped === response.total) {
        toast.info('All assets already exist in the system');
      } else {
        toast.warning('Import completed with errors');
      }
    } catch (err: any) {
      console.error('Error during bulk import:', err);
      setError(err.message || 'Failed to import assets');
      toast.error('Failed to import assets');
      setStep('select');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep('select');
    setSelectedIndex('');
    setSelectedExchange('');
    setFetchFullDetails(true);
    setSkipDuplicates(true);
    setImportResult(null);
    setError(null);
    onClose();
  };

  const getSelectedIndexName = () => {
    const index = indices.find(idx => idx.id === selectedIndex);
    return index ? index.name : selectedIndex;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '100%' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {step === 'select' && 'Bulk Import from Index'}
            {step === 'importing' && 'Importing Assets...'}
            {step === 'complete' && 'Import Complete'}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="modal-close"
            onClick={handleClose}
          >
            <X size={20} />
          </Button>
        </div>

        <div style={{ marginTop: '1rem' }}>
          {/* Step 1: Select Index */}
          {step === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {error && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#fee',
                  border: '1px solid #fcc',
                  borderRadius: '6px',
                  color: '#c33'
                }}>
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="index-select">Select Market Index</Label>
                <select
                  id="index-select"
                  value={selectedIndex}
                  onChange={(e) => setSelectedIndex(e.target.value)}
                  disabled={loadingIndices}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    marginTop: '8px'
                  }}
                >
                  <option value="">-- Select an index --</option>
                  {indices.map((index) => (
                    <option key={index.id} value={index.id}>
                      {index.name} ({index.region})
                    </option>
                  ))}
                </select>
                {loadingIndices && (
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    Loading indices...
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="exchange-select">Exchange (Bourse)</Label>
                <select
                  id="exchange-select"
                  value={selectedExchange}
                  onChange={(e) => setSelectedExchange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    marginTop: '8px'
                  }}
                >
                  <option value="">-- Sélectionner une bourse (optionnel) --</option>
                  <option value="NASDAQ">NASDAQ</option>
                  <option value="NYSE">NYSE (New York Stock Exchange)</option>
                  <option value="EURONEXT">EURONEXT (Paris, Amsterdam, Brussels)</option>
                  <option value="LSE">LSE (London Stock Exchange)</option>
                  <option value="XETR">XETR (Deutsche Börse)</option>
                  <option value="TSE">TSE (Tokyo Stock Exchange)</option>
                  <option value="HKEX">HKEX (Hong Kong)</option>
                  <option value="SSE">SSE (Shanghai)</option>
                  <option value="TSX">TSX (Toronto)</option>
                  <option value="ASX">ASX (Australian Securities Exchange)</option>
                  <option value="SWX">SWX (Swiss Exchange)</option>
                  <option value="BINANCE">BINANCE (Crypto)</option>
                </select>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Spécifiez la bourse pour tous les actifs importés depuis cet indice
                </p>
              </div>

              <div>
                <Label style={{ marginBottom: '12px', display: 'block' }}>Import Options</Label>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    id="fetch-details"
                    checked={fetchFullDetails}
                    onChange={(e) => setFetchFullDetails(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="fetch-details" style={{ fontSize: '14px', cursor: 'pointer' }}>
                    Fetch full company details (slower but complete)
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="skip-duplicates"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="skip-duplicates" style={{ fontSize: '14px', cursor: 'pointer' }}>
                    Skip existing assets
                  </label>
                </div>
              </div>

              {fetchFullDetails && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  <strong>Note:</strong> Fetching full details uses Alpha Vantage API which has rate limits 
                  (5 requests/minute). Large indices may take significant time to import.
                </div>
              )}

              {selectedIndex && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#e3f2fd',
                  border: '1px solid #2196f3',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  <strong>Selected:</strong> {getSelectedIndexName()}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Importing */}
          {step === 'importing' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              padding: '40px 20px'
            }}>
              <Loader2 size={48} className="animate-spin" style={{ color: '#2196f3' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
                  Importing assets from {getSelectedIndexName()}...
                </p>
                <p style={{ fontSize: '14px', color: '#666' }}>
                  This may take several minutes depending on the index size and options selected.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 'complete' && importResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{
                  padding: '16px',
                  backgroundColor: '#e8f5e9',
                  border: '1px solid #4caf50',
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <CheckCircle size={24} style={{ color: '#4caf50', marginBottom: '8px' }} />
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2e7d32' }}>
                    {importResult.imported}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Imported</div>
                </div>

                <div style={{
                  padding: '16px',
                  backgroundColor: '#fff3e0',
                  border: '1px solid #ff9800',
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <AlertCircle size={24} style={{ color: '#ff9800', marginBottom: '8px' }} />
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e65100' }}>
                    {importResult.skipped}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Skipped</div>
                </div>

                <div style={{
                  padding: '16px',
                  backgroundColor: importResult.errors.length > 0 ? '#ffebee' : '#f5f5f5',
                  border: `1px solid ${importResult.errors.length > 0 ? '#f44336' : '#ccc'}`,
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <XCircle size={24} style={{ 
                    color: importResult.errors.length > 0 ? '#f44336' : '#999',
                    marginBottom: '8px'
                  }} />
                  <div style={{ 
                    fontSize: '24px',
                    fontWeight: 'bold',
                    color: importResult.errors.length > 0 ? '#c62828' : '#666'
                  }}>
                    {importResult.errors.length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Errors</div>
                </div>
              </div>

              {/* Total */}
              <div style={{
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                textAlign: 'center',
                fontSize: '14px'
              }}>
                Total symbols processed: <strong>{importResult.total}</strong>
              </div>

              {/* Errors List */}
              {importResult.errors.length > 0 && (
                <div>
                  <Label style={{ marginBottom: '8px', display: 'block' }}>
                    Errors ({importResult.errors.length})
                  </Label>
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: '#fff'
                  }}>
                    {importResult.errors.map((err, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 12px',
                          borderBottom: idx < importResult.errors.length - 1 ? '1px solid #eee' : 'none',
                          fontSize: '13px'
                        }}
                      >
                        <strong>{err.symbol}:</strong> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-form-actions" style={{ marginTop: '1.5rem' }}>
          {step === 'select' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedIndex || importing || loadingIndices}
              >
                {importing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" style={{ marginRight: '8px' }} />
                    Importing...
                  </>
                ) : (
                  'Start Import'
                )}
              </Button>
            </>
          )}

          {step === 'importing' && (
            <div style={{ width: '100%', textAlign: 'center', color: '#666', fontSize: '14px' }}>
              Please wait while assets are being imported...
            </div>
          )}

          {step === 'complete' && (
            <Button onClick={handleClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
