#!/usr/bin/env python3
"""Build one reviewable, additive SQL install for optional services and hardening."""
from pathlib import Path
import argparse
root=Path(__file__).resolve().parents[1]/'backend'/'supabase'
sources=['dashboard_upgrade.sql','automatic_access.sql','telegram_notifications.sql','newsletter.sql','calendar_events.sql','security_hardening.sql','recovery_support.sql']
expected='-- Generated with scripts/build_services_setup.py. No credentials or owner rename.\n\n'+'\n\n'.join('-- SOURCE: '+name+'\n'+(root/name).read_text().strip() for name in sources)+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args();target=root/'setup_services.sql'
if args.check:
 if not target.exists() or target.read_text()!=expected:raise SystemExit('Regenerate setup_services.sql')
 print('Services setup SQL is current.')
else:target.write_text(expected);print('Built setup_services.sql')
