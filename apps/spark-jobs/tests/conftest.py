"""Test helpers for apps/spark-jobs tests.

Ensures the local `apps/spark-jobs` directory is on `sys.path`
so tests can import the `jobs` package as `jobs.*`.
"""
import os
import sys


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
