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

# Finnhub API for company logos (free tier available)
FINNHUB_API_KEY = os.getenv('FINNHUB_API_KEY', '')
FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'


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
            
            # Check for API errors first
            if 'Error Message' in data:
                logger.error(f"Alpha Vantage API error: {data['Error Message']}")
                return []
            
            # Extract best matches first (they might exist even with Information/Note)
            matches = data.get('bestMatches', [])
            
            # Check for rate limit warnings (but don't return empty if we have matches)
            # Alpha Vantage sometimes returns "Information" or "Note" messages that are NOT rate limits
            # Only treat as rate limit if the message explicitly mentions rate limit AND we have no matches
            if 'Note' in data:
                note_msg = data['Note']
                logger.warning(f"Alpha Vantage API note: {note_msg}")
                # Only treat as rate limit if explicitly mentioned AND no matches
                note_lower = note_msg.lower()
                is_rate_limit = ('rate limit' in note_lower or 'api call frequency' in note_lower or 
                                'call per day' in note_lower or '25 calls' in note_lower)
                if is_rate_limit and not matches:
                    # This is a real rate limit - return empty
                    logger.warning("Rate limit detected from Note message")
                    return []
                # If we have matches, continue processing even with Note message
            
            if 'Information' in data:
                info_msg = data['Information']
                logger.warning(f"Alpha Vantage API information: {info_msg}")
                # Only treat as rate limit if explicitly mentioned AND no matches
                info_lower = info_msg.lower()
                is_rate_limit = ('rate limit' in info_lower or 'api call frequency' in info_lower or 
                                'call per day' in info_lower or '25 calls' in info_lower)
                if is_rate_limit and not matches:
                    # This is a real rate limit - return empty
                    logger.warning("Rate limit detected from Information message")
                    return []
                # If we have matches, continue processing them even with Information message
                # Many "Information" messages are just warnings, not rate limits
            
            results = []
            
            for match in matches:
                symbol = match.get('1. symbol', '')
                result = {
                    'symbol': symbol,
                    'name': match.get('2. name', ''),
                    'type': match.get('3. type', ''),
                    'region': match.get('4. region', ''),
                    'market_open': match.get('5. marketOpen', ''),
                    'market_close': match.get('6. marketClose', ''),
                    'timezone': match.get('7. timezone', ''),
                    'currency': match.get('8. currency', ''),
                    'match_score': float(match.get('9. matchScore', 0))
                }
                
                # Try to get logo URL
                logo_url = self.get_company_logo(symbol)
                if logo_url:
                    result['logo_url'] = logo_url
                
                results.append(result)
            
            return results
        except Exception as e:
            logger.error(f"Error searching symbols for '{keywords}': {str(e)}")
            return []
    
    def get_quote(self, symbol: str, outputsize: str = 'compact') -> Optional[Dict]:
        """
        Get real-time quote for a symbol using GLOBAL_QUOTE endpoint
        
        Args:
            symbol: Stock symbol (e.g., "AAPL", "MSFT")
            outputsize: Not used for GLOBAL_QUOTE, kept for compatibility
        
        Returns:
            Dictionary with quote data or None if error
        """
        try:
            params = {
                'function': 'GLOBAL_QUOTE',
                'symbol': symbol,
                'apikey': self.api_key
            }
            
            response = requests.get(ALPHA_VANTAGE_BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Check for API errors
            if 'Error Message' in data:
                logger.error(f"Alpha Vantage API error: {data['Error Message']}")
                return None
            
            if 'Note' in data:
                logger.warning(f"Alpha Vantage API note: {data['Note']}")
                return None
            
            if 'Information' in data:
                info_msg = data['Information']
                logger.warning(f"Alpha Vantage API information: {info_msg}")
                # Check if it's a rate limit message
                if 'rate limit' in info_msg.lower():
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

    def get_company_overview(self, symbol: str) -> Optional[Dict]:
        """
        Get company overview data using Alpha Vantage OVERVIEW endpoint.

        Returns a raw dict (best-effort) or None.
        """
        try:
            params = {
                'function': 'OVERVIEW',
                'symbol': symbol,
                'apikey': self.api_key
            }
            response = requests.get(ALPHA_VANTAGE_BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json() or {}

            # If Alpha Vantage returns an empty dict, it's usually a missing symbol or rate-limit.
            if not isinstance(data, dict) or not data:
                return None

            if 'Error Message' in data or 'Note' in data or 'Information' in data:
                return None

            return data
        except Exception as e:
            logger.error(f"Error fetching company overview for {symbol}: {str(e)}")
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
            Dictionary with daily time series data formatted for charts
        """
        try:
            params = {
                'function': 'TIME_SERIES_DAILY',
                'symbol': symbol,
                'outputsize': outputsize,
                'apikey': self.api_key
            }
            
            response = requests.get(ALPHA_VANTAGE_BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Check for API errors
            if 'Error Message' in data:
                logger.error(f"Alpha Vantage API error: {data['Error Message']}")
                return None
            
            if 'Note' in data:
                logger.warning(f"Alpha Vantage API note: {data['Note']}")
                return None
            
            if 'Information' in data:
                info_msg = data['Information']
                logger.warning(f"Alpha Vantage API information: {info_msg}")
                if 'rate limit' in info_msg.lower():
                    return None
            
            # Extract time series data
            time_series_key = 'Time Series (Daily)'
            if time_series_key not in data:
                return None
            
            time_series = data[time_series_key]
            meta_data = data.get('Meta Data', {})
            
            # Format data for charts: convert to array sorted by date
            chart_data = []
            for date_str, values in time_series.items():
                chart_data.append({
                    'date': date_str,
                    'open': float(values.get('1. open', 0)),
                    'high': float(values.get('2. high', 0)),
                    'low': float(values.get('3. low', 0)),
                    'close': float(values.get('4. close', 0)),
                    'volume': int(values.get('5. volume', 0))
                })
            
            # Sort by date (oldest first)
            chart_data.sort(key=lambda x: x['date'])
            
            return {
                'data': chart_data,
                'meta_data': {
                    'symbol': meta_data.get('2. Symbol', symbol),
                    'last_refreshed': meta_data.get('3. Last Refreshed', ''),
                    'timezone': meta_data.get('5. Time Zone', '')
                }
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
    
    def get_company_logo(self, symbol: str) -> Optional[str]:
        """
        Get company logo URL using Finnhub API or fallback services
        
        Args:
            symbol: Stock symbol (e.g., "AAPL", "MSFT")
        
        Returns:
            Logo URL or None if not found
        """
        # Try Finnhub API first (if API key is configured)
        if FINNHUB_API_KEY:
            try:
                response = requests.get(
                    f"{FINNHUB_BASE_URL}/stock/profile2",
                    params={'symbol': symbol, 'token': FINNHUB_API_KEY},
                    timeout=5
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get('logo'):
                        return data['logo']
            except Exception as e:
                logger.debug(f"Error fetching logo from Finnhub for {symbol}: {str(e)}")
        
        # Fallback 1: Try Finnhub without API key (limited but works for US stocks)
        try:
            response = requests.get(
                f"{FINNHUB_BASE_URL}/stock/profile2",
                params={'symbol': symbol},
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                if data.get('logo'):
                    return data['logo']
        except Exception:
            pass
        
        # Fallback 2: Use clearbit logo service (works for many companies)
        try:
            # Try common domain patterns
            domains_to_try = [
                f"{symbol.lower()}.com",
                f"www.{symbol.lower()}.com"
            ]
            
            for domain in domains_to_try:
                logo_url = f"https://logo.clearbit.com/{domain}"
                test_response = requests.head(logo_url, timeout=2, allow_redirects=True)
                if test_response.status_code == 200:
                    return logo_url
        except Exception:
            pass
        
        return None


def get_crypto_logo(symbol: str) -> Optional[str]:
    """
    Get cryptocurrency logo URL
    
    Args:
        symbol: Crypto symbol (e.g., "BTC", "ETH")
    
    Returns:
        Logo URL or None if not found
    """
    try:
        # Try CoinGecko API (free, no API key needed for basic usage)
        # First, try to get coin by ID (symbol as ID)
        try:
            gecko_response = requests.get(
                f"https://api.coingecko.com/api/v3/coins/{symbol.lower()}",
                timeout=5
            )
            
            if gecko_response.status_code == 200:
                coin_data = gecko_response.json()
                image_url = coin_data.get('image', {}).get('large') or coin_data.get('image', {}).get('small')
                if image_url:
                    return image_url
        except Exception:
            pass
        
        # If direct ID lookup fails, search by symbol
        try:
            search_response = requests.get(
                f"https://api.coingecko.com/api/v3/search?query={symbol.lower()}",
                timeout=5
            )
            
            if search_response.status_code == 200:
                search_data = search_response.json()
                coins = search_data.get('coins', [])
                
                # Find exact symbol match
                for coin in coins[:10]:  # Check first 10 results
                    if coin.get('symbol', '').upper() == symbol.upper():
                        # CoinGecko search already returns logo URLs
                        logo_url = coin.get('large') or coin.get('thumb')
                        if logo_url:
                            return logo_url
                        
                        # If not in search result, get full coin data
                        coin_id = coin.get('id', '')
                        if coin_id:
                            coin_response = requests.get(
                                f"https://api.coingecko.com/api/v3/coins/{coin_id}",
                                timeout=5
                            )
                            if coin_response.status_code == 200:
                                coin_data = coin_response.json()
                                image_url = coin_data.get('image', {}).get('large') or coin_data.get('image', {}).get('small')
                                if image_url:
                                    return image_url
                        break
        except Exception as e:
            logger.debug(f"CoinGecko search failed for {symbol}: {str(e)}")
            pass
        
        # Fallback: Try cryptoicons.org
        try:
            cryptoicons_url = f"https://cryptoicons.org/api/icon/{symbol.lower()}/200"
            test_response = requests.head(cryptoicons_url, timeout=3, allow_redirects=True)
            if test_response.status_code == 200:
                return cryptoicons_url
        except Exception:
            pass
        
        # Fallback 2: Use CoinGecko static images (if we know the coin ID)
        # Common crypto mappings
        crypto_id_map = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'BNB': 'binancecoin',
            'ADA': 'cardano',
            'SOL': 'solana',
            'XRP': 'ripple',
            'DOT': 'polkadot',
            'DOGE': 'dogecoin',
            'MATIC': 'matic-network',
            'AVAX': 'avalanche-2',
            'LINK': 'chainlink',
            'LTC': 'litecoin',
            'UNI': 'uniswap',
            'USDT': 'tether',
            'USDC': 'usd-coin',
            'SHIB': 'shiba-inu',
            'ALGO': 'algorand',
            'XLM': 'stellar',
            'ATOM': 'cosmos'
        }
        
        coin_id = crypto_id_map.get(symbol.upper())
        if coin_id:
            try:
                gecko_response = requests.get(
                    f"https://api.coingecko.com/api/v3/coins/{coin_id}",
                    timeout=5
                )
                if gecko_response.status_code == 200:
                    coin_data = gecko_response.json()
                    image_url = coin_data.get('image', {}).get('large') or coin_data.get('image', {}).get('small')
                    if image_url:
                        return image_url
            except Exception:
                pass
        
        return None
    except Exception as e:
        logger.debug(f"Error fetching crypto logo for {symbol}: {str(e)}")
        return None


def get_crypto_candles_finnhub(symbol: str, resolution: str = 'D', days: int = 100) -> Optional[Dict]:
    """
    Get cryptocurrency historical candles (OHLCV) from Finnhub API
    
    Args:
        symbol: Crypto symbol (e.g., "BTC", "ETH")
        resolution: Time resolution ('D' for daily, 'W' for weekly, 'M' for monthly, '1', '5', '15', '30', '60' for minutes)
        days: Number of days of historical data to fetch (max depends on resolution and API tier)
    
    Returns:
        Dictionary with candle data formatted for charts or None if error
    """
    try:
        import time
        from datetime import datetime, timedelta
        
        # Format symbol for Finnhub (BINANCE:SYMBOLUSDT)
        symbol_for_quote = f"BINANCE:{symbol}USDT"
        
        # Calculate start and end timestamps (Unix timestamps)
        end_time = int(time.time())
        start_time = int((datetime.now() - timedelta(days=days)).timestamp())
        
        params = {
            'symbol': symbol_for_quote,
            'resolution': resolution,
            'from': start_time,
            'to': end_time
        }
        if FINNHUB_API_KEY:
            params['token'] = FINNHUB_API_KEY
        
        response = requests.get(
            f"{FINNHUB_BASE_URL}/stock/candle",
            params=params,
            timeout=10
        )
        
        if response.status_code == 200:
            candle_data = response.json()
            
            # Finnhub candle format: {'c': [close prices], 'h': [high prices], 'l': [low prices], 'o': [open prices], 's': 'ok', 't': [timestamps], 'v': [volumes]}
            if candle_data.get('s') == 'ok' and candle_data.get('c'):
                closes = candle_data.get('c', [])
                opens = candle_data.get('o', [])
                highs = candle_data.get('h', [])
                lows = candle_data.get('l', [])
                volumes = candle_data.get('v', [])
                timestamps = candle_data.get('t', [])
                
                # Format data for charts
                chart_data = []
                for i in range(len(closes)):
                    # Convert Unix timestamp to date string
                    date_str = datetime.fromtimestamp(timestamps[i]).strftime('%Y-%m-%d')
                    chart_data.append({
                        'date': date_str,
                        'open': float(opens[i]) if i < len(opens) else float(closes[i]),
                        'high': float(highs[i]) if i < len(highs) else float(closes[i]),
                        'low': float(lows[i]) if i < len(lows) else float(closes[i]),
                        'close': float(closes[i]),
                        'volume': int(volumes[i]) if i < len(volumes) else 0
                    })
                
                # Sort by date (oldest first)
                chart_data.sort(key=lambda x: x['date'])
                
                return {
                    'data': chart_data,
                    'meta_data': {
                        'symbol': symbol,
                        'resolution': resolution,
                        'last_refreshed': datetime.now().isoformat()
                    }
                }
        
        return None
    except Exception as e:
        logger.error(f"Error fetching crypto candles from Finnhub for {symbol}: {str(e)}")
        return None


def get_crypto_quote_finnhub(symbol: str) -> Optional[Dict]:
    """
    Get cryptocurrency quote from Finnhub API
    
    Args:
        symbol: Crypto symbol (e.g., "BTC", "ETH")
    
    Returns:
        Dictionary with quote data or None if error
    """
    try:
        # Format symbol for Finnhub (BINANCE:SYMBOLUSDT)
        symbol_for_quote = f"BINANCE:{symbol}USDT"
        quote_params = {'symbol': symbol_for_quote}
        if FINNHUB_API_KEY:
            quote_params['token'] = FINNHUB_API_KEY
        
        response = requests.get(
            f"{FINNHUB_BASE_URL}/quote",
            params=quote_params,
            timeout=10
        )
        
        if response.status_code == 200:
            quote_data = response.json()
            
            # Finnhub quote format: {'c': current_price, 'd': change, 'dp': change_percent, 'h': high, 'l': low, 'o': open, 'pc': previous_close, 't': timestamp}
            if quote_data.get('c') is not None:
                return {
                    'symbol': symbol,
                    'price': float(quote_data.get('c', 0)),
                    'change': float(quote_data.get('d', 0)),
                    'change_percent': str(quote_data.get('dp', 0)),
                    'high': float(quote_data.get('h', 0)),
                    'low': float(quote_data.get('l', 0)),
                    'open': float(quote_data.get('o', 0)),
                    'previous_close': float(quote_data.get('pc', 0))
                }
        
        return None
    except Exception as e:
        logger.error(f"Error fetching crypto quote from Finnhub for {symbol}: {str(e)}")
        return None


def search_crypto_finnhub(keywords: str) -> List[Dict]:
    """
    Search for cryptocurrencies using Finnhub API
    
    Args:
        keywords: Search keywords (e.g., "Bitcoin", "BTC", "Ethereum")
    
    Returns:
        List of matching cryptocurrencies with metadata
    """
    try:
        keywords_lower = keywords.lower()
        results = []
        seen_symbols = set()  # Track symbols we've already added to avoid duplicates
        
        # First, try Finnhub search endpoint (if API key is available)
        if FINNHUB_API_KEY:
            try:
                search_params = {
                    'q': keywords,
                    'token': FINNHUB_API_KEY
                }
                search_response = requests.get(
                    f"{FINNHUB_BASE_URL}/search",
                    params=search_params,
                    timeout=10
                )
                
                if search_response.status_code == 200:
                    search_data = search_response.json()
                    # Filter for crypto results
                    for item in search_data.get('result', []):
                        if item.get('type') == 'Crypto':
                            symbol = item.get('symbol', '')
                            description = item.get('description', '')
                            
                            # Normalize symbol (remove exchange prefix and USDT/USD suffix)
                            normalized_symbol = symbol.replace('BINANCE:', '').replace('COINBASE:', '').replace('KRAKEN:', '').replace('USDT', '').replace('USD', '').upper()
                            
                            # Skip if we've already seen this symbol
                            if normalized_symbol in seen_symbols:
                                continue
                            
                            seen_symbols.add(normalized_symbol)
                            
                            # Get quote for this symbol
                            quote_params = {'symbol': symbol, 'token': FINNHUB_API_KEY}
                            try:
                                quote_response = requests.get(
                                    f"{FINNHUB_BASE_URL}/quote",
                                    params=quote_params,
                                    timeout=5
                                )
                                quote_data = quote_response.json() if quote_response.status_code == 200 else {}
                                
                                # Get logo URL
                                logo_url = get_crypto_logo(normalized_symbol)
                                
                                result_item = {
                                    'symbol': normalized_symbol,
                                    'name': description or normalized_symbol,
                                    'type': 'Crypto',
                                    'region': 'Global',
                                    'currency': 'USD',
                                    'price': quote_data.get('c', 0),
                                    'change': quote_data.get('d', 0),
                                    'change_percent': quote_data.get('dp', 0),
                                    'match_score': 1.0
                                }
                                
                                if logo_url:
                                    result_item['logo_url'] = logo_url
                                
                                results.append(result_item)
                                
                                if len(results) >= 10:
                                    break
                            except Exception:
                                # Still add it even if quote fails, but mark it
                                # Get logo URL
                                logo_url = get_crypto_logo(normalized_symbol)
                                
                                result_item = {
                                    'symbol': normalized_symbol,
                                    'name': description or normalized_symbol,
                                    'type': 'Crypto',
                                    'region': 'Global',
                                    'currency': 'USD',
                                    'match_score': 0.9
                                }
                                
                                if logo_url:
                                    result_item['logo_url'] = logo_url
                                
                                results.append(result_item)
                                if len(results) >= 10:
                                    break
            except Exception as e:
                logger.debug(f"Finnhub search API failed: {str(e)}")
        
        # Fallback: Use a comprehensive crypto mapping
        crypto_map = {
            'bitcoin': {'symbol': 'BTC', 'name': 'Bitcoin'},
            'btc': {'symbol': 'BTC', 'name': 'Bitcoin'},
            'ethereum': {'symbol': 'ETH', 'name': 'Ethereum'},
            'eth': {'symbol': 'ETH', 'name': 'Ethereum'},
            'binance': {'symbol': 'BNB', 'name': 'Binance Coin'},
            'bnb': {'symbol': 'BNB', 'name': 'Binance Coin'},
            'cardano': {'symbol': 'ADA', 'name': 'Cardano'},
            'ada': {'symbol': 'ADA', 'name': 'Cardano'},
            'solana': {'symbol': 'SOL', 'name': 'Solana'},
            'sol': {'symbol': 'SOL', 'name': 'Solana'},
            'ripple': {'symbol': 'XRP', 'name': 'Ripple'},
            'xrp': {'symbol': 'XRP', 'name': 'Ripple'},
            'polkadot': {'symbol': 'DOT', 'name': 'Polkadot'},
            'dot': {'symbol': 'DOT', 'name': 'Polkadot'},
            'dogecoin': {'symbol': 'DOGE', 'name': 'Dogecoin'},
            'doge': {'symbol': 'DOGE', 'name': 'Dogecoin'},
            'matic': {'symbol': 'MATIC', 'name': 'Polygon'},
            'polygon': {'symbol': 'MATIC', 'name': 'Polygon'},
            'avalanche': {'symbol': 'AVAX', 'name': 'Avalanche'},
            'avax': {'symbol': 'AVAX', 'name': 'Avalanche'},
            'chainlink': {'symbol': 'LINK', 'name': 'Chainlink'},
            'link': {'symbol': 'LINK', 'name': 'Chainlink'},
            'litecoin': {'symbol': 'LTC', 'name': 'Litecoin'},
            'ltc': {'symbol': 'LTC', 'name': 'Litecoin'},
            'uniswap': {'symbol': 'UNI', 'name': 'Uniswap'},
            'uni': {'symbol': 'UNI', 'name': 'Uniswap'},
            'tether': {'symbol': 'USDT', 'name': 'Tether'},
            'usdt': {'symbol': 'USDT', 'name': 'Tether'},
            'usdc': {'symbol': 'USDC', 'name': 'USD Coin'},
            'usd coin': {'symbol': 'USDC', 'name': 'USD Coin'},
            'shiba': {'symbol': 'SHIB', 'name': 'Shiba Inu'},
            'shib': {'symbol': 'SHIB', 'name': 'Shiba Inu'},
            'algorand': {'symbol': 'ALGO', 'name': 'Algorand'},
            'algo': {'symbol': 'ALGO', 'name': 'Algorand'},
            'stellar': {'symbol': 'XLM', 'name': 'Stellar'},
            'xlm': {'symbol': 'XLM', 'name': 'Stellar'},
            'cosmos': {'symbol': 'ATOM', 'name': 'Cosmos'},
            'atom': {'symbol': 'ATOM', 'name': 'Cosmos'},
        }
        
        # Check if we already have results from Finnhub search
        # If not, use fallback crypto mapping
        if not results:
            for key, value in crypto_map.items():
                if keywords_lower in key or keywords_lower in value['name'].lower():
                    symbol_upper = value['symbol'].upper()
                    
                    # Skip if we've already seen this symbol
                    if symbol_upper in seen_symbols:
                        continue
                    
                    seen_symbols.add(symbol_upper)
                    
                    # Try to get quote from Finnhub using Binance format
                    symbol_for_quote = f"BINANCE:{value['symbol']}USDT"
                    quote_params = {'symbol': symbol_for_quote}
                    if FINNHUB_API_KEY:
                        quote_params['token'] = FINNHUB_API_KEY
                    
                    try:
                        quote_response = requests.get(
                            f"{FINNHUB_BASE_URL}/quote",
                            params=quote_params,
                            timeout=5
                        )
                        quote_data = quote_response.json() if quote_response.status_code == 200 else {}
                        
                        # Get logo URL
                        logo_url = get_crypto_logo(symbol_upper)
                        
                        result_item = {
                            'symbol': symbol_upper,
                            'name': value['name'],
                            'type': 'Crypto',
                            'region': 'Global',
                            'currency': 'USD',
                            'price': quote_data.get('c', 0),
                            'change': quote_data.get('d', 0),
                            'change_percent': quote_data.get('dp', 0),
                            'match_score': 1.0
                        }
                        
                        if logo_url:
                            result_item['logo_url'] = logo_url
                        
                        results.append(result_item)
                    except Exception:
                        # Get logo URL even if quote fails
                        logo_url = get_crypto_logo(symbol_upper)
                        
                        result_item = {
                            'symbol': symbol_upper,
                            'name': value['name'],
                            'type': 'Crypto',
                            'region': 'Global',
                            'currency': 'USD',
                            'match_score': 0.9
                        }
                        
                        if logo_url:
                            result_item['logo_url'] = logo_url
                        
                        results.append(result_item)
                    
                    if len(results) >= 10:
                        break
        
        return results[:10]
        
    except Exception as e:
        logger.error(f"Error searching crypto for '{keywords}': {str(e)}")
        return []


def get_alpha_vantage_service() -> Optional[AlphaVantageService]:
    """Factory function to get Alpha Vantage service instance"""
    try:
        return AlphaVantageService()
    except ValueError:
        return None
