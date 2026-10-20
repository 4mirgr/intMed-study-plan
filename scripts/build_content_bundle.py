#!/usr/bin/env python3
"""Compatibility entry point; the site now uses per-topic payloads."""

import argparse

from content_pipeline import cmd_build


if __name__ == "__main__":
    raise SystemExit(cmd_build(argparse.Namespace()))
