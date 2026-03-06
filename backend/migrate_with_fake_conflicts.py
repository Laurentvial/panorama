#!/usr/bin/env python
"""
Run migrate, automatically faking any migration that fails with
DuplicateColumn or DuplicateTable (for preserved api_asset/api_appsettings).
Repeat until migrate succeeds.
"""
import os
import re
import subprocess
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

def main():
    max_attempts = 50
    for attempt in range(max_attempts):
        result = subprocess.run(
            [sys.executable, "manage.py", "migrate"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )
        if result.returncode == 0:
            print(result.stdout)
            print("Migrations completed successfully.")
            return 0

        # Check for DuplicateColumn or DuplicateTable
        err = result.stdout + result.stderr
        dup_col = re.search(r"column \"(\w+)\" of relation \"(\w+)\" already exists", err)
        dup_table = re.search(r"relation \"(\w+)\" already exists", err)

        # Find the migration that failed (e.g. "Applying api.0055_add_trading_view_symbol...")
        mig_match = re.search(r"Applying (api\.\d+_\w+)\.\.\.", err)
        if not mig_match:
            print(err)
            return 1

        mig = mig_match.group(1)
        app, name = mig.split(".", 1)

        if dup_col or dup_table:
            print(f"Conflict detected. Faking migration: {mig}")
            fake_result = subprocess.run(
                [sys.executable, "manage.py", "migrate", app, name, "--fake"],
                capture_output=True,
                text=True,
                cwd=os.path.dirname(os.path.abspath(__file__)),
            )
            if fake_result.returncode != 0:
                print(fake_result.stderr)
                return 1
            print(f"Faked {mig}. Retrying migrate...")
        else:
            print(err)
            return 1

    print("Max attempts reached.")
    return 1

if __name__ == "__main__":
    sys.exit(main())
