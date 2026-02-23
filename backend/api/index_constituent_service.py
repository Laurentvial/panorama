"""
Index Constituent Service for fetching stock lists from market indices
Supports US indices via Financial Modeling Prep API and European indices via pytickersymbols
When FMP returns 403, falls back to free public CSV sources (S&P 500, NASDAQ-100)
"""
import csv
import io
import os
import re
import logging
import requests
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Get FMP API key from environment
FMP_API_KEY = os.getenv('FMP_API_KEY', '')
FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'
# Stable API (recommended since Aug 2025 - v3 legacy routes are auth-gated for free plans)
FMP_STABLE_BASE_URL = 'https://financialmodelingprep.com/stable'
# Map v3 endpoint names to stable endpoint paths (v3 uses underscore, stable uses hyphen)
FMP_STABLE_ENDPOINT_MAP = {
    'nasdaq_constituent': 'nasdaq-constituent',
    'sp500_constituent': 'sp500-constituent',
    'dowjones_constituent': 'dowjones-constituent',
}

# Static Euronext 100 constituents (main components, updated periodically)
# Symbols: .PA=Paris, .AS=Amsterdam, .BR=Brussels, .LS=Lisbon, .IR=Dublin, .OL=Oslo
EURONEXT_100_STATIC = [
    ('ASML.AS', 'ASML Holding'), ('MC.PA', 'LVMH'), ('SHEL.AS', 'Shell'), ('AIR.PA', 'Airbus'),
    ('PRX.AS', 'Prosus'), ('SU.PA', 'Schneider Electric'), ('EL.PA', 'EssilorLuxottica'),
    ('SAF.PA', 'Safran'), ('TTE.PA', 'TotalEnergies'), ('AI.PA', 'Air Liquide'),
    ('ABI.BR', 'AB InBev'), ('BNP.PA', 'BNP Paribas'), ('KER.PA', 'Kering'), ('SAN.PA', 'Sanofi'),
    ('INGA.AS', 'ING Groep'), ('PHIA.AS', 'Philips'), ('OR.PA', "L'Oréal"), ('DSY.PA', 'Dassault Systèmes'),
    ('VIV.PA', 'Vivendi'), ('BN.PA', 'Danone'), ('GLE.PA', 'Société Générale'), ('ACA.PA', 'Crédit Agricole'),
    ('EN.PA', 'Bouygues'), ('ENGI.PA', 'Engie'), ('ORA.PA', 'Orange'), ('SGO.PA', 'Saint-Gobain'),
    ('VIE.PA', 'Veolia'), ('RMS.PA', 'Hermès'), ('ML.PA', 'Michelin'), ('RI.PA', 'Pernod Ricard'),
    ('CS.PA', 'AXA'), ('SW.PA', 'Sodexo'), ('CAP.PA', 'Capgemini'), ('WLN.PA', 'Worldline'),
    ('ATO.PA', 'Atos'), ('ERF.PA', 'Eurofins'), ('DG.PA', 'Vinci'), ('ENR.PA', 'Siemens Energy'),
    ('FP.PA', 'TotalEnergies'), ('HO.PA', 'Thales'), ('MT.AS', 'ArcelorMittal'), ('AD.AS', 'Ahold Delhaize'),
    ('HEIA.AS', 'Heineken'), ('UNA.AS', 'Unilever'), ('ADYEN.AS', 'Adyen'), ('IMCD.AS', 'IMCD'),
    ('WKL.AS', 'Wolters Kluwer'), ('RAND.AS', 'Randstad'), ('KPN.AS', 'KPN'), ('AKZA.AS', 'Akzo Nobel'),
    ('ASM.AS', 'ASM International'), ('AGN.AS', 'Aegon'), ('NN.AS', 'NN Group'),
    ('SOLB.BR', 'Solvay'), ('UCB.BR', 'UCB'), ('KBC.BR', 'KBC Group'), ('PROX.BR', 'Proximus'),
    ('ELI.BR', 'Elia'), ('EDP.LS', 'EDP'), ('GALP.LS', 'Galp'), ('JMT.LS', 'Jerónimo Martins'),
    ('NOS.LS', 'NOS'), ('BCP.LS', 'Millennium bcp'), ('EDPR.LS', 'EDP Renováveis'),
    ('CRH.IR', 'CRH'), ('RYA.IR', 'Ryanair'), ('GL9.IR', 'Glanbia'),
    ('YAR.OL', 'Yara'), ('NHY.OL', 'Norsk Hydro'), ('EQNR.OL', 'Equinor'), ('DNB.OL', 'DNB'),
    ('TEL.OL', 'Telenor'), ('MOWI.OL', 'Mowi'), ('ORK.OL', 'Orkla'),
]

# Free fallback URLs when FMP returns 403 (no API key required)
FALLBACK_CSV_URLS = {
    'sp500_constituent': 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv',
    'nasdaq_constituent': 'https://raw.githubusercontent.com/mhyavas/SP500-NASDAQ100/main/nasdaq100.csv',
    # Dow Jones: no reliable free CSV found; will show clear error
}

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
            'region': 'Allemagne'
        },
        'ibex35': {
            'source': 'pytickersymbols',
            'index_name': 'IBEX 35',
            'name': 'IBEX 35',
            'region': 'Espagne'
        },
        'euronext100': {
            'source': 'static',
            'name': 'Euronext 100',
            'region': 'Europe'
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
        elif source == 'static':
            return self._fetch_from_static(index_name_lower)
        else:
            raise ValueError(f"Unknown source: {source}")
    
    def _sanitize_fmp_error(self, msg: str) -> str:
        """Remove API key from error messages to avoid exposure."""
        return re.sub(r'apikey=[^&\s]+', 'apikey=[REDACTED]', str(msg))

    def _fetch_from_fmp(self, endpoint: str) -> List[Dict]:
        """
        Fetch index constituents from Financial Modeling Prep API.
        Tries stable endpoint first (free plan), falls back to v3 (legacy), then free CSV when FMP returns 403.
        For S&P 500 and NASDAQ-100, works without FMP_API_KEY using free public CSV.
        """
        # When no FMP key and fallback exists, use free CSV directly
        if not self.fmp_api_key and endpoint in FALLBACK_CSV_URLS:
            logger.info(f"No FMP_API_KEY; using free CSV fallback for {endpoint}")
            return self._fetch_from_fallback_csv(endpoint)
        if not self.fmp_api_key:
            raise ValueError(
                "FMP_API_KEY is required for Dow Jones. For S&P 500 and NASDAQ, a free CSV fallback is used. "
                "Get a key at https://site.financialmodelingprep.com/developer/docs"
            )
        
        params = {'apikey': self.fmp_api_key}
        last_error = None
        
        # Try stable endpoint first (available on free plan since Aug 2025)
        stable_path = FMP_STABLE_ENDPOINT_MAP.get(endpoint)
        if stable_path:
            url = f"{FMP_STABLE_BASE_URL}/{stable_path}"
            try:
                logger.info(f"Fetching constituents from FMP stable: {stable_path}")
                response = requests.get(url, params=params, timeout=30)
                response.raise_for_status()
                data = response.json()
                constituents = self._parse_fmp_constituents(data, endpoint)
                if constituents:
                    return constituents
            except requests.exceptions.RequestException as e:
                last_error = e
                logger.warning(f"FMP stable endpoint failed: {self._sanitize_fmp_error(str(e))}")
            except ValueError as e:
                last_error = e
                logger.warning(f"FMP stable parse error: {e}")
        
        # Fall back to v3 legacy endpoint
        url = f"{FMP_BASE_URL}/{endpoint}"
        try:
            logger.info(f"Fetching constituents from FMP v3: {endpoint}")
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            return self._parse_fmp_constituents(data, endpoint)
        except requests.exceptions.RequestException as e:
            last_error = e
        except ValueError as e:
            last_error = e
            logger.warning(f"FMP v3 parse error: {e}")
        
        # Try free CSV fallback when FMP returns 403 or error in response body (e.g. invalid API key)
        can_fallback = endpoint in FALLBACK_CSV_URLS
        is_403 = (
            last_error is not None
            and hasattr(last_error, 'response')
            and last_error.response is not None
            and last_error.response.status_code == 403
        )
        is_parse_error = isinstance(last_error, ValueError)
        if last_error and can_fallback and (is_403 or is_parse_error):
            try:
                logger.info(f"FMP returned error, using free CSV fallback for {endpoint}")
                return self._fetch_from_fallback_csv(endpoint)
            except Exception as fallback_err:
                logger.warning(f"Fallback CSV also failed: {fallback_err}")
        
        # Raise with helpful message (never expose API key)
        err_msg = self._sanitize_fmp_error(str(last_error)) if last_error else "Unknown error"
        logger.error(f"FMP fetch failed: {err_msg}")
        if last_error and hasattr(last_error, 'response') and last_error.response is not None:
            status = last_error.response.status_code
            if status == 403:
                if endpoint in FALLBACK_CSV_URLS:
                    raise ValueError(
                        "FMP API returned 403 and the free fallback also failed. "
                        "For S&P 500 and NASDAQ-100, ensure GitHub is accessible. "
                        "Or set a valid FMP_API_KEY: https://site.financialmodelingprep.com/developer/docs"
                    )
                raise ValueError(
                    "FMP API returned 403 Forbidden. Dow Jones requires a valid FMP API key. "
                    "Set FMP_API_KEY in your environment: https://site.financialmodelingprep.com/developer/docs"
                )
        raise ValueError(f"Error fetching from FMP: {err_msg}")

    def _fetch_from_fallback_csv(self, endpoint: str) -> List[Dict]:
        """Fetch index constituents from free public CSV when FMP returns 403."""
        url = FALLBACK_CSV_URLS.get(endpoint)
        if not url:
            raise ValueError(f"No fallback available for {endpoint}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        content = response.text
        reader = csv.DictReader(io.StringIO(content))
        rows = list(reader)
        constituents = []
        if endpoint == 'sp500_constituent':
            # datasets/s-and-p-500-companies: Symbol, Security, GICS Sector, GICS Sub-Industry, Headquarters Location, ...
            for row in rows:
                symbol = (row.get('Symbol') or '').strip()
                if not symbol:
                    continue
                constituents.append({
                    'symbol': symbol,
                    'name': (row.get('Security') or '').strip(),
                    'sector': (row.get('GICS Sector') or '').strip(),
                    'subSector': (row.get('GICS Sub-Industry') or '').strip(),
                    'headQuarter': (row.get('Headquarters Location') or '').strip(),
                    'dateFirstAdded': (row.get('Date added') or '').strip(),
                    'cik': (row.get('CIK') or '').strip(),
                    'founded': (row.get('Founded') or '').strip(),
                })
        elif endpoint == 'nasdaq_constituent':
            # mhyavas/SP500-NASDAQ100: Symbol, Description, GICS Sector, ...
            for row in rows:
                symbol = (row.get('Symbol') or '').strip().strip('"')
                if not symbol:
                    continue
                name = (row.get('Description') or '').strip().strip('"')
                sector = (row.get('GICS Sector') or row.get('GICS sector') or '').strip().strip('"')
                constituents.append({
                    'symbol': symbol,
                    'name': name,
                    'sector': sector,
                    'subSector': '',
                    'headQuarter': '',
                    'dateFirstAdded': '',
                    'cik': '',
                    'founded': '',
                })
        logger.info(
            f"Fetched {len(constituents)} constituents from free CSV fallback ({endpoint}). "
            "Note: NASDAQ fallback uses NASDAQ-100 list."
        )
        return constituents

    def _parse_fmp_constituents(self, data: any, endpoint: str) -> List[Dict]:
        """Parse FMP API response into standardized constituent format."""
        if isinstance(data, dict) and 'Error Message' in data:
            raise ValueError(f"FMP API error: {data['Error Message']}")
        if not isinstance(data, list):
            logger.error(f"Unexpected FMP response format: {type(data)}")
            return []
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
        logger.info(f"Successfully fetched {len(constituents)} constituents from FMP ({endpoint})")
        return constituents
    
    def _fetch_from_static(self, index_id: str) -> List[Dict]:
        """Fetch index constituents from static list (e.g. Euronext 100)."""
        if index_id == 'euronext100':
            constituents = [
                {'symbol': sym, 'name': name, 'sector': '', 'subSector': '', 'headQuarter': '',
                 'dateFirstAdded': '', 'cik': '', 'founded': ''}
                for sym, name in EURONEXT_100_STATIC
            ]
            logger.info(f"Loaded {len(constituents)} constituents from static Euronext 100 list")
            return constituents
        raise ValueError(f"No static data for index: {index_id}")

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
            elif 'IBEX' in index_name:
                exchange_suffix = '.MC'  # Madrid/Spain
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
