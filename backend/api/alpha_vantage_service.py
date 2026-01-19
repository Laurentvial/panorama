"""
Alpha Vantage API service for fetching stock market data
"""
import os
from typing import Dict, List, Optional
from django.conf import settings
import logging
import requests

logger = logging.getLogger(__name__)

# Try to import Alpha Vantage libraries
try:
    from alpha_vantage.timeseries import TimeSeries
    from alpha_vantage.cryptocurrencies import CryptoCurrencies
    from alpha_vantage.foreignexchange import ForeignExchange
    ALPHA_VANTAGE_AVAILABLE = True
except ImportError:
    ALPHA_VANTAGE_AVAILABLE = False
    logger.warning("alpha_vantage package not installed. Install it with: pip install alpha_vantage")

# Get API key from environment
ALPHA_VANTAGE_API_KEY = os.getenv('ALPHA_VANTAGE_API_KEY', '')

if not ALPHA_VANTAGE_API_KEY:
    logger.warning("ALPHA_VANTAGE_API_KEY not set. Alpha Vantage features will be limited.")

# Alpha Vantage API base URL
ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query'


class AlphaVantageService:
    """Service class for interacting with Alpha Vantage API"""
    
    def __init__(self):
        if not ALPHA_VANTAGE_AVAILABLE:
            raise ValueError("alpha_vantage package is not installed. Install it with: pip install alpha_vantage")
        self.api_key = ALPHA_VANTAGE_API_KEY
        if not self.api_key:
            raise ValueError("ALPHA_VANTAGE_API_KEY environment variable is required")
    
    def search_symbol(self, keywords: str) -> List[Dict]:
        """
        Search for symbols matching keywords using Alpha Vantage SYMBOL_SEARCH endpoint
        
        Args:
            keywords: Search keywords (e.g., "Apple", "Microsoft")
        
        Returns:
            List of matching symbols with metadata
        """
        try:
            params = {
                'function': 'SYMBOL_SEARCH',
                'keywords': keywords,
                'apikey': self.api_key
            }
            
            response = requests.get(ALPHA_VANTAGE_BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Check for API errors
            if 'Error Message' in data:
                logger.error(f"Alpha Vantage API error: {data['Error Message']}")
                return []
            
            if 'Note' in data:
                logger.warning(f"Alpha Vantage API note: {data['Note']}")
                return []
            
            # Extract best matches
            matches = data.get('bestMatches', [])
            results = []
            
            for match in matches:
                results.append({
                    'symbol': match.get('1. symbol', ''),
                    'name': match.get('2. name', ''),
                    'type': match.get('3. type', ''),
                    'region': match.get('4. region', ''),
                    'market_open': match.get('5. marketOpen', ''),
                    'market_close': match.get('6. marketClose', ''),
                    'timezone': match.get('7. timezone', ''),
                    'currency': match.get('8. currency', ''),
                    'match_score': float(match.get('9. matchScore', 0))
                })
            
            return results
        except Exception as e:
            logger.error(f"Error searching symbols for '{keywords}': {str(e)}")
            return []
    
    def get_quote(self, symbol: str, outputsize: str = 'compact') -> Optional[Dict]:
        """
        Get real-time quote for a symbol
        
        Args:
            symbol: Stock symbol (e.g., "AAPL", "MSFT")
            outputsize: 'compact' for last 100 data points, 'full' for full historical data
        
        Returns:
            Dictionary with quote data or None if error
        """
        try:
            ts = TimeSeries(key=self.api_key, output_format='json')
            data, meta_data = ts.get_quote_endpoint(symbol=symbol)
            
            if not data:
                return None
            
            # Extract the quote data (Alpha Vantage returns it in a specific format)
            quote_data = data.get('Global Quote', {})
            
            if not quote_data:
                return None
            
            return {
                'symbol': quote_data.get('01. symbol', symbol),
                'open': float(quote_data.get('02. open', 0)),
                'high': float(quote_data.get('03. high', 0)),
                'low': float(quote_data.get('04. low', 0)),
                'price': float(quote_data.get('05. price', 0)),
                'volume': int(quote_data.get('06. volume', 0)),
                'latest_trading_day': quote_data.get('07. latest trading day', ''),
                'previous_close': float(quote_data.get('08. previous close', 0)),
                'change': float(quote_data.get('09. change', 0)),
                'change_percent': quote_data.get('10. change percent', '0%').replace('%', '')
            }
        except Exception as e:
            logger.error(f"Error fetching quote for {symbol}: {str(e)}")
            return None
    
    def get_intraday_data(self, symbol: str, interval: str = '1min', outputsize: str = 'compact') -> Optional[Dict]:
        """
        Get intraday time series data
        
        Args:
            symbol: Stock symbol
            interval: Time interval ('1min', '5min', '15min', '30min', '60min')
            outputsize: 'compact' or 'full'
        
        Returns:
            Dictionary with time series data
        """
        try:
            ts = TimeSeries(key=self.api_key, output_format='json')
            data, meta_data = ts.get_intraday(symbol=symbol, interval=interval, outputsize=outputsize)
            
            return {
                'data': data,
                'meta_data': meta_data
            }
        except Exception as e:
            logger.error(f"Error fetching intraday data for {symbol}: {str(e)}")
            return None
    
    def get_daily_data(self, symbol: str, outputsize: str = 'compact') -> Optional[Dict]:
        """
        Get daily time series data
        
        Args:
            symbol: Stock symbol
            outputsize: 'compact' or 'full'
        
        Returns:
            Dictionary with daily time series data
        """
        try:
            ts = TimeSeries(key=self.api_key, output_format='json')
            data, meta_data = ts.get_daily(symbol=symbol, outputsize=outputsize)
            
            return {
                'data': data,
                'meta_data': meta_data
            }
        except Exception as e:
            logger.error(f"Error fetching daily data for {symbol}: {str(e)}")
            return None
    
    def get_crypto_quote(self, symbol: str, market: str = 'USD') -> Optional[Dict]:
        """
        Get cryptocurrency quote
        
        Args:
            symbol: Cryptocurrency symbol (e.g., "BTC", "ETH")
            market: Market currency (default: "USD")
        
        Returns:
            Dictionary with crypto quote data
        """
        try:
            cc = CryptoCurrencies(key=self.api_key, output_format='json')
            data, meta_data = cc.get_currency_exchange_rate(
                from_currency=symbol,
                to_currency=market
            )
            
            if not data:
                return None
            
            rate_data = data.get('Realtime Currency Exchange Rate', {})
            
            return {
                'symbol': symbol,
                'market': market,
                'exchange_rate': float(rate_data.get('5. Exchange Rate', 0)),
                'bid_price': float(rate_data.get('8. Bid Price', 0)),
                'ask_price': float(rate_data.get('9. Ask Price', 0)),
                'last_refreshed': rate_data.get('6. Last Refreshed', ''),
            }
        except Exception as e:
            logger.error(f"Error fetching crypto quote for {symbol}: {str(e)}")
            return None
    
    def get_forex_quote(self, from_currency: str, to_currency: str) -> Optional[Dict]:
        """
        Get foreign exchange quote
        
        Args:
            from_currency: Base currency (e.g., "USD")
            to_currency: Quote currency (e.g., "EUR")
        
        Returns:
            Dictionary with forex quote data
        """
        try:
            fe = ForeignExchange(key=self.api_key, output_format='json')
            data, meta_data = fe.get_currency_exchange_rate(
                from_currency=from_currency,
                to_currency=to_currency
            )
            
            if not data:
                return None
            
            rate_data = data.get('Realtime Currency Exchange Rate', {})
            
            return {
                'from_currency': from_currency,
                'to_currency': to_currency,
                'exchange_rate': float(rate_data.get('5. Exchange Rate', 0)),
                'bid_price': float(rate_data.get('8. Bid Price', 0)),
                'ask_price': float(rate_data.get('9. Ask Price', 0)),
                'last_refreshed': rate_data.get('6. Last Refreshed', ''),
            }
        except Exception as e:
            logger.error(f"Error fetching forex quote for {from_currency}/{to_currency}: {str(e)}")
            return None


def get_alpha_vantage_service() -> Optional[AlphaVantageService]:
    """Factory function to get Alpha Vantage service instance"""
    try:
        return AlphaVantageService()
    except ValueError:
        return None
