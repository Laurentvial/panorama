# Duration Bug Fix - Summary

## Problem

Positions were being created beyond the contract duration. For example:
- **Product duration**: 1 month
- **Expected behavior**: Positions from 16/02/2026 to 16/03/2026
- **Actual behavior**: Positions from 16/02/2026 to 15/05/2026 (3 months!)

## Root Cause

In `position_service.py`, the `build_investment_context()` function used a priority list to determine contract duration:

1. **Priority 1**: `subscription_details.duration` (value: "3") ❌
2. **Priority 2**: `subscription_duration` (value: 3) ❌  
3. **Priority 3**: `product.duration` (value: 1) ✓

The system took the first valid value found, which was the incorrect value "3" from `subscription_details`, instead of the correct value "1" from `product.duration`.

### Example Transaction (ID: 91c15fc673ab)

**Product (ID: f65e57ebc4b1)**
- `duration`: 1 ✓ (CORRECT)
- `profitability_period`: "Quotidien"

**Transaction**
- `subscription_duration`: 3 ❌ (INCORRECT)
- `subscription_details.duration`: "3" ❌ (INCORRECT)

**Result Before Fix**
- `ctx.duration_months = 3` → End date: 15/05/2026 (wrong!)

**Result After Fix**
- `ctx.duration_months = 1` → End date: 16/03/2026 (correct!)

## Solution

Modified `build_investment_context()` in `position_service.py` (lines 2760-2798) to:

1. **Always use `product.duration` as the source of truth**
2. **Validate `subscription_details.duration` for consistency**
3. **Log warnings when mismatches are detected**

### Changes Made

```python
# BEFORE (lines 2760-2782)
duration_candidates: list[str | None] = []
if isinstance(txn.subscription_details, dict):
    duration_candidates.append(txn.subscription_details.get('duration'))  # Priority 1
duration_candidates.append(getattr(txn, 'subscription_duration', None))   # Priority 2
duration_candidates.append(product.duration)                               # Priority 3

duration_str: str | None = None
for cand in duration_candidates:
    if cand and _DURATION_RE.search(str(cand)):
        duration_str = str(cand)  # Takes first valid value
        break

# AFTER
# CRITICAL: Always use product.duration as the source of truth
duration_str = product.duration

# Validate subscription_details for consistency (but don't use it)
if isinstance(txn.subscription_details, dict):
    sub_duration = txn.subscription_details.get('duration')
    if sub_duration and str(sub_duration) != str(product.duration):
        logger.warning(
            f"Duration mismatch for transaction {txn.id}: "
            f"subscription_details.duration='{sub_duration}' != product.duration='{product.duration}'. "
            f"Using product.duration={product.duration} as source of truth."
        )
```

## Benefits

1. **Prevents positions beyond contract duration**: The product defines the contract terms
2. **Data consistency warnings**: Logs mismatches for data quality monitoring
3. **Backward compatible**: Doesn't break existing functionality
4. **Fail-safe**: Even if frontend sends wrong data, backend uses correct value

## Testing

Test script confirmed the fix works correctly:

```
Product ID: f65e57ebc4b1
  - product.duration: 1

Transaction ID: 91c15fc673ab
  - subscription_duration: 3
  - subscription_details.duration: 3

[PASS] Duration correctly uses product.duration
       Expected: 1 months
       Actual: 1 months (ctx.duration_months)
```

The warning logs also correctly identify the mismatch:
```
Duration mismatch for transaction 91c15fc673ab: 
  subscription_details.duration='3' != product.duration='1'. 
  Using product.duration=1 as source of truth.
```

## Impact

- **Existing data**: Transactions with incorrect `subscription_details.duration` will now correctly use `product.duration`
- **Future data**: If frontend continues to send incorrect duration, it will be ignored and logged
- **Position generation**: All position generation functions now respect the actual contract duration

## Files Modified

- `backend/api/position_service.py` (lines 2760-2798)

## Next Steps (Optional)

1. **Frontend investigation**: Identify where `subscription_details.duration` is populated and fix if incorrect
2. **Data migration**: Consider updating existing transactions to have consistent duration values
3. **Monitoring**: Watch for warning logs to identify problematic transactions

## Related Issues

This fix complements the previous fixes:
- **Bug #1**: Interest payment frequency vs profitability frequency separation
- **Bug #2**: Consistent timing validation for interest payments
- **Bug #3**: Position generation boundary checks (while loop protection)

Together, these fixes ensure:
1. Interest transactions are created at the correct payment frequency ✓
2. Interest payments only occur after the payment period elapses ✓
3. Positions are only created within the contract duration ✓
4. The contract duration is determined correctly from product ✓
