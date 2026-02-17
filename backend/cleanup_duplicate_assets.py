"""
Script to identify and cleanup duplicate assets (with and without exchange suffix)
"""
import os
import sys
import django

# Setup Django environment
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Asset
from django.db.models import Count, Q

def find_duplicates():
    """Find assets that are duplicates based on base symbol"""
    duplicates = []
    
    # Get all assets with alpha_vantage_symbol
    assets = Asset.objects.filter(alpha_vantage_symbol__isnull=False).exclude(alpha_vantage_symbol='')
    
    # Group by base symbol
    symbol_groups = {}
    for asset in assets:
        symbol = asset.alpha_vantage_symbol
        base_symbol = symbol.split('.')[0] if '.' in symbol else symbol
        
        if base_symbol not in symbol_groups:
            symbol_groups[base_symbol] = []
        symbol_groups[base_symbol].append(asset)
    
    # Find groups with multiple assets
    for base_symbol, assets_list in symbol_groups.items():
        if len(assets_list) > 1:
            duplicates.append({
                'base_symbol': base_symbol,
                'assets': assets_list
            })
    
    return duplicates

def display_duplicates(duplicates):
    """Display duplicate assets for review"""
    print(f"\n{'='*80}")
    print(f"Found {len(duplicates)} groups of duplicate assets")
    print(f"{'='*80}\n")
    
    for i, dup_group in enumerate(duplicates, 1):
        print(f"{i}. Base Symbol: {dup_group['base_symbol']}")
        print(f"   Assets found:")
        
        for asset in dup_group['assets']:
            exchange_info = f" (Exchange: {asset.exchange})" if asset.exchange else " (No exchange)"
            price_info = f" Price: {asset.last_price}" if asset.last_price else " No price"
            print(f"   - ID: {asset.id} | Symbol: {asset.alpha_vantage_symbol:15s}{exchange_info} |{price_info} | Name: {asset.name}")
        print()

def cleanup_duplicates(duplicates, keep_with_exchange=True, dry_run=True):
    """
    Cleanup duplicate assets
    
    Args:
        duplicates: List of duplicate groups
        keep_with_exchange: If True, keep assets with exchange suffix (.PA, .DE, etc.)
                           If False, keep assets without exchange suffix
        dry_run: If True, only show what would be deleted without actually deleting
    """
    deleted_count = 0
    
    print(f"\n{'='*80}")
    print(f"Cleanup Mode: {'DRY RUN' if dry_run else 'ACTUAL DELETION'}")
    print(f"Strategy: Keep assets {'WITH' if keep_with_exchange else 'WITHOUT'} exchange suffix")
    print(f"{'='*80}\n")
    
    for dup_group in duplicates:
        assets_list = dup_group['assets']
        
        # Separate assets with and without exchange suffix
        with_exchange = [a for a in assets_list if '.' in a.alpha_vantage_symbol]
        without_exchange = [a for a in assets_list if '.' not in a.alpha_vantage_symbol]
        
        # Determine which to keep and which to delete
        if keep_with_exchange:
            to_keep = with_exchange if with_exchange else without_exchange
            to_delete = without_exchange if with_exchange else []
        else:
            to_keep = without_exchange if without_exchange else with_exchange
            to_delete = with_exchange if without_exchange else []
        
        # Keep only the first one from to_keep list
        if len(to_keep) > 1:
            to_delete.extend(to_keep[1:])
            to_keep = [to_keep[0]]
        
        # Delete duplicates
        for asset in to_delete:
            print(f"{'[DRY RUN] ' if dry_run else ''}Deleting: ID={asset.id} | Symbol={asset.alpha_vantage_symbol} | Name={asset.name}")
            if not dry_run:
                asset.delete()
                deleted_count += 1
    
    print(f"\n{'Would delete' if dry_run else 'Deleted'} {deleted_count if not dry_run else len([a for dup in duplicates for a in dup['assets'][1:]])} duplicate assets")
    
    return deleted_count

if __name__ == "__main__":
    print("\n" + "="*80)
    print("Asset Duplicate Cleanup Tool")
    print("="*80)
    
    # Find duplicates
    duplicates = find_duplicates()
    
    if not duplicates:
        print("\nNo duplicates found! Your database is clean.")
        sys.exit(0)
    
    # Display duplicates
    display_duplicates(duplicates)
    
    # Ask user what to do
    print("\nWhat would you like to do?")
    print("1. Dry run - Show what would be deleted (keep assets WITH exchange suffix like .PA)")
    print("2. Dry run - Show what would be deleted (keep assets WITHOUT exchange suffix)")
    print("3. Actually delete duplicates (keep assets WITH exchange suffix like .PA)")
    print("4. Actually delete duplicates (keep assets WITHOUT exchange suffix)")
    print("5. Exit without doing anything")
    
    choice = input("\nEnter your choice (1-5): ").strip()
    
    if choice == '1':
        cleanup_duplicates(duplicates, keep_with_exchange=True, dry_run=True)
    elif choice == '2':
        cleanup_duplicates(duplicates, keep_with_exchange=False, dry_run=True)
    elif choice == '3':
        confirm = input("\n⚠️  This will ACTUALLY DELETE assets. Are you sure? (yes/no): ").strip().lower()
        if confirm == 'yes':
            cleanup_duplicates(duplicates, keep_with_exchange=True, dry_run=False)
            print("\n✅ Cleanup completed!")
        else:
            print("\nCancelled.")
    elif choice == '4':
        confirm = input("\n⚠️  This will ACTUALLY DELETE assets. Are you sure? (yes/no): ").strip().lower()
        if confirm == 'yes':
            cleanup_duplicates(duplicates, keep_with_exchange=False, dry_run=False)
            print("\n✅ Cleanup completed!")
        else:
            print("\nCancelled.")
    else:
        print("\nExiting without changes.")
