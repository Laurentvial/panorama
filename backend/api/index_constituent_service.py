"""
Index Constituent Service for fetching stock lists from market indices
Supports US indices via Financial Modeling Prep API and European indices via pytickersymbols
"""
import os
import logging
import requests
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Get FMP API key from environment
FMP_API_KEY = os.getenv('FMP_API_KEY', '')
FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'

# Import pytickersymbols with error handling
try:
    from pytickersymbols import PyTickerSymbols
    PYTICKERSYMBOLS_AVAILABLE = True
except ImportError:
    PYTICKERSYMBOLS_AVAILABLE = False
    logger.warning("pytickersymbols package not installed. Install it with: pip install pytickersymbols")

# Manual mapping for stocks missing symbols in pytickersymbols
# These are common French stocks that lack symbol information
MANUAL_SYMBOL_MAPPING = {
    'Air France-KLM': 'AF.PA',
    'Argan': 'ARG.PA',
    'Atos SE': 'ATO.PA',
    'Atos': 'ATO.PA',
    'ALD Automotive': 'ALD.PA',
    'ALD': 'ALD.PA',
    'Bénéteau': 'BEN.PA',
    'Coface': 'COFA.PA',
    'Esso S.A.F.': 'ES.PA',
    'Française des Jeux': 'FDJ.PA',
    'Française des Jeux (Lotterie)': 'FDJ.PA',
    'Forvia': 'FRVIA.PA',
    'ID Logistics': 'IDL.PA',
    'Maurel et Prom': 'MAU.PA',
    'Maurel & Prom': 'MAU.PA',
    'Medincell': 'MEDCL.PA',
    'Mersen': 'MRN.PA',
    'Métropole Télévision': 'MMT.PA',
    'M6': 'MMT.PA',
    'Planisware': 'PLNW.PA',
    'Pluxee': 'PLUX.PA',
    'Rémy Cointreau': 'RCO.PA',
    'Remy Cointreau': 'RCO.PA',
    'Robertet': 'RBT.PA',
    'Ubisoft': 'UBI.PA',
    'Ubisoft Entertainment': 'UBI.PA',
    'Vicat': 'VCT.PA',
    'VusionGroup': 'VU.PA',
    'Vusion Group': 'VU.PA',
}


class IndexConstituentService:
    """Service class for fetching index constituents from various sources"""
    
    # Mapping of index names to their respective endpoints/identifiers
    INDEX_MAPPING = {
        # US indices (via FMP)
        'nasdaq': {
            'source': 'fmp',
            'endpoint': 'nasdaq_constituent',
            'name': 'NASDAQ Composite',
            'region': 'US'
        },
        'sp500': {
            'source': 'fmp',
            'endpoint': 'sp500_constituent',
            'name': 'S&P 500',
            'region': 'US'
        },
        'dowjones': {
            'source': 'fmp',
            'endpoint': 'dowjones_constituent',
            'name': 'Dow Jones Industrial Average',
            'region': 'US'
        },
        # European indices (via pytickersymbols)
        'cac40': {
            'source': 'pytickersymbols',
            'index_name': 'CAC_40',
            'name': 'CAC 40',
            'region': 'France'
        },
        'dax': {
            'source': 'pytickersymbols',
            'index_name': 'DAX',
            'name': 'DAX',
            'region': 'Germany'
        },
        'ftse100': {
            'source': 'pytickersymbols',
            'index_name': 'FTSE 100',
            'name': 'FTSE 100',
            'region': 'UK'
        },
        'cacmid60': {
            'source': 'pytickersymbols',
            'index_name': 'CAC Mid 60',
            'name': 'CAC Mid 60',
            'region': 'France'
        }
    }
    
    def __init__(self):
        """Initialize the service"""
        self.fmp_api_key = FMP_API_KEY
        if not self.fmp_api_key:
            logger.warning("FMP_API_KEY not set. FMP features will be unavailable.")
        
        if not PYTICKERSYMBOLS_AVAILABLE:
            logger.warning("pytickersymbols not available. European indices will be unavailable.")
    
    def get_supported_indices(self) -> List[Dict]:
        """
        Get list of all supported indices
        
        Returns:
            List of dicts with index information
        """
        indices = []
        for key, config in self.INDEX_MAPPING.items():
            indices.append({
                'id': key,
                'name': config['name'],
                'region': config['region'],
                'source': config['source']
            })
        return indices
    
    def get_index_constituents(self, index_name: str) -> List[Dict]:
        """
        Get constituents for a specific index
        
        Args:
            index_name: Index identifier (e.g., 'nasdaq', 'cac40')
        
        Returns:
            List of dicts with stock information: [{'symbol': 'AAPL', 'name': 'Apple Inc.', ...}]
        """
        index_name_lower = index_name.lower()
        
        if index_name_lower not in self.INDEX_MAPPING:
            logger.error(f"Unsupported index: {index_name}")
            raise ValueError(f"Unsupported index: {index_name}. Supported indices: {list(self.INDEX_MAPPING.keys())}")
        
        config = self.INDEX_MAPPING[index_name_lower]
        source = config['source']
        
        if source == 'fmp':
            return self._fetch_from_fmp(config['endpoint'])
        elif source == 'pytickersymbols':
            return self._fetch_from_pytickersymbols(config['index_name'])
        else:
            raise ValueError(f"Unknown source: {source}")
    
    def _fetch_from_fmp(self, endpoint: str) -> List[Dict]:
        """
        Fetch index constituents from Financial Modeling Prep API
        
        Args:
            endpoint: FMP endpoint name (e.g., 'sp500_constituent')
        
        Returns:
            List of stock dictionaries
        """
        if not self.fmp_api_key:
            logger.error("FMP_API_KEY not configured")
            raise ValueError("FMP_API_KEY is required for US indices")
        
        url = f"{FMP_BASE_URL}/{endpoint}"
        params = {'apikey': self.fmp_api_key}
        
        try:
            logger.info(f"Fetching constituents from FMP: {endpoint}")
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            # Check for API errors
            if isinstance(data, dict) and 'Error Message' in data:
                logger.error(f"FMP API error: {data['Error Message']}")
                raise ValueError(f"FMP API error: {data['Error Message']}")
            
            # FMP returns a list of constituents
            if not isinstance(data, list):
                logger.error(f"Unexpected FMP response format: {type(data)}")
                return []
            
            # Transform FMP response to standardized format
            constituents = []
            for item in data:
                constituent = {
                    'symbol': item.get('symbol', ''),
                    'name': item.get('name', ''),
                    'sector': item.get('sector', ''),
                    'subSector': item.get('subSector', ''),
                    'headQuarter': item.get('headQuarter', ''),
                    'dateFirstAdded': item.get('dateFirstAdded', ''),
                    'cik': item.get('cik', ''),
                    'founded': item.get('founded', '')
                }
                constituents.append(constituent)
            
            logger.info(f"Successfully fetched {len(constituents)} constituents from FMP")
            return constituents
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching from FMP: {str(e)}")
            raise ValueError(f"Error fetching from FMP: {str(e)}")
    
    def _fetch_from_pytickersymbols(self, index_name: str) -> List[Dict]:
        """
        Fetch index constituents from pytickersymbols library
        
        Args:
            index_name: Index name as used by pytickersymbols (e.g., 'CAC 40')
        
        Returns:
            List of stock dictionaries
        """
        if not PYTICKERSYMBOLS_AVAILABLE:
            logger.error("pytickersymbols library not available")
            raise ValueError("pytickersymbols library is required for European indices")
        
        try:
            logger.info(f"Fetching constituents from pytickersymbols: {index_name}")
            stock_data = PyTickerSymbols()
            
            # Get stocks for the specified index - returns an iterator, convert to list
            stocks_iterator = stock_data.get_stocks_by_index(index_name)
            stocks = list(stocks_iterator)
            
            if not stocks:
                logger.warning(f"No stocks found for index: {index_name}")
                return []
            
            logger.info(f"Found {len(stocks)} stocks for index: {index_name}")
            
            # Determine exchange suffix for Alpha Vantage based on index
            exchange_suffix = ''
            if 'CAC' in index_name:
                exchange_suffix = '.PA'  # Paris
            elif 'DAX' in index_name:
                exchange_suffix = '.DE'  # Frankfurt/Germany
            elif 'FTSE' in index_name:
                exchange_suffix = '.L'   # London
            
            # Transform pytickersymbols response to standardized format
            constituents = []
            for stock in stocks:
                primary_symbol = None
                stock_name = stock.get('name', '')
                
                # First, try to get the base symbol (single 'symbol' field)
                if stock.get('symbol'):
                    primary_symbol = stock['symbol']
                
                # If no base symbol, try to extract from 'symbols' list
                if not primary_symbol and stock.get('symbols'):
                    symbols_list = stock.get('symbols', [])
                    
                    # Try to find Yahoo symbol first
                    for sym_dict in symbols_list:
                        if isinstance(sym_dict, dict) and sym_dict.get('yahoo'):
                            yahoo_symbol = sym_dict['yahoo']
                            # Extract base symbol (remove exchange suffix like .F, .L, etc)
                            if '.' in yahoo_symbol:
                                primary_symbol = yahoo_symbol.split('.')[0]
                            else:
                                primary_symbol = yahoo_symbol
                            break
                    
                    # If no Yahoo symbol, try Google
                    if not primary_symbol:
                        for sym_dict in symbols_list:
                            if isinstance(sym_dict, dict) and sym_dict.get('google'):
                                google_symbol = sym_dict['google']
                                # Google format is "EXCHANGE:SYMBOL"
                                if ':' in google_symbol:
                                    primary_symbol = google_symbol.split(':')[1]
                                else:
                                    primary_symbol = google_symbol
                                break
                
                # If still no symbol, try manual mapping
                if not primary_symbol and stock_name:
                    primary_symbol = MANUAL_SYMBOL_MAPPING.get(stock_name)
                    if primary_symbol:
                        logger.info(f"Using manual mapping for {stock_name}: {primary_symbol}")
                
                # Skip if no symbol found
                if not primary_symbol:
                    logger.warning(f"No valid symbol found for stock: {stock_name or 'Unknown'}")
                    continue
                
                # Add exchange suffix for Alpha Vantage (only if not already present)
                if exchange_suffix and '.' not in primary_symbol:
                    primary_symbol = f"{primary_symbol}{exchange_suffix}"
                
                # Get sector from industries (list of strings)
                industries = stock.get('industries', [])
                sector = industries[0] if industries and len(industries) > 0 else ''
                
                constituent = {
                    'symbol': primary_symbol,
                    'name': stock.get('name', ''),
                    'sector': sector,
                    'subSector': '',
                    'headQuarter': stock.get('country', ''),
                    'dateFirstAdded': '',
                    'cik': '',
                    'founded': stock.get('metadata', {}).get('founded', '') if isinstance(stock.get('metadata'), dict) else ''
                }
                constituents.append(constituent)
            
            logger.info(f"Successfully fetched {len(constituents)} constituents from pytickersymbols")
            return constituents
            
        except Exception as e:
            logger.error(f"Error fetching from pytickersymbols: {str(e)}")
            raise ValueError(f"Error fetching from pytickersymbols: {str(e)}")


# Create a singleton instance
index_service = IndexConstituentService()


# Convenience functions for direct use
def get_supported_indices() -> List[Dict]:
    """Get list of all supported indices"""
    return index_service.get_supported_indices()


def get_index_constituents(index_name: str) -> List[Dict]:
    """Get constituents for a specific index"""
    return index_service.get_index_constituents(index_name)
